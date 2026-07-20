import { Router, type IRouter } from "express";
import { eq, and } from "drizzle-orm";
import {
  db,
  positionRecordsTable,
  positionCitationsTable,
  authorityCitationsTable,
  treatmentProfilesTable,
} from "@workspace/db";
import { GetAuditPackageQueryParams } from "@workspace/api-zod";
import { OPEN_GAP_EVENT_TYPES } from "./positions.js";
import { isStale, STALE_THRESHOLD_DAYS } from "../core/reviewRules.js";

const router: IRouter = Router();

// ── Open-gap comment-letter metadata ─────────────────────────────────────────
// Must stay in sync with the six IRS-guidance-gap entries in OPEN_GAP_EVENT_TYPES
// (core/reviewRules.ts). aave_withdraw and aave_liquidation are intentionally
// absent — those force review for fact-pattern reasons, not regulatory gaps.
const OPEN_GAP_EVENTS: Record<string, { pending_notices: string[]; summary: string }> = {
  lp_deposit: {
    pending_notices: ["Notice 2024-57"],
    summary:
      "Liquidity pool deposits present an unresolved question regarding whether contributing tokens to an AMM pool constitutes a taxable exchange under IRC §1001. IRS guidance in Notice 2024-57 acknowledges this gap and defers definitive treatment. Practitioners currently apply reasonable basis positions supported by economic substance analysis.",
  },
  lp_withdrawal: {
    pending_notices: ["Notice 2024-57"],
    summary:
      "LP withdrawals raise parallel questions to deposits: whether the return of underlying assets upon pool exit constitutes a taxable disposition of LP tokens. The Cottage Savings realization doctrine is the primary analytical framework in the absence of direct IRS guidance.",
  },
  defi_yield: {
    pending_notices: ["Notice 2024-57"],
    summary:
      "DeFi yield farming distributions lack specific IRS guidance. Practitioners are split between immediate ordinary income recognition (Glenshaw Glass accession-to-wealth) and deferred recognition. Notice 2024-57 identifies this as a priority guidance area.",
  },
  bridge_transfer: {
    pending_notices: ["Notice 2024-57"],
    summary:
      "Bridge transfers and cross-chain transactions are identified as an open-gap area in Notice 2024-57. The IRS has not addressed whether a bridge transfer constitutes a realization event; the most defensible position is non-recognition with basis carryover, treating the taxpayer as retaining beneficial ownership throughout. Form 8275 disclosure is recommended pending further guidance.",
  },
  staking_reward: {
    pending_notices: ["Rev. Rul. 2023-14"],
    summary:
      "While Rev. Rul. 2023-14 clarified staking rewards for cash-basis taxpayers, open questions remain for accrual-basis filers, locked/illiquid staking periods, and liquid staking derivatives (e.g., stETH).",
  },
  nft_sale: {
    pending_notices: ["Notice 2023-27"],
    summary:
      "NFT sales involve unresolved questions on collectible status under IRC §408(m), applicable holding period rules for fractionalized NFTs, and basis allocation for bundle purchases. Notice 2023-27 provides a look-through framework but leaves many practical questions open.",
  },
};

// ── Shared helpers ────────────────────────────────────────────────────────────

async function enrichPosition(
  pos: typeof positionRecordsTable.$inferSelect,
  redact = false,
) {
  const citationRows = await db
    .select({ citation: authorityCitationsTable })
    .from(positionCitationsTable)
    .innerJoin(
      authorityCitationsTable,
      eq(positionCitationsTable.citationId, authorityCitationsTable.id),
    )
    .where(eq(positionCitationsTable.positionId, pos.id));

  let profile = null;
  if (pos.profileId) {
    const [prof] = await db
      .select()
      .from(treatmentProfilesTable)
      .where(eq(treatmentProfilesTable.id, pos.profileId));
    if (prof) {
      profile = {
        id: prof.id,
        name: prof.name,
        status: prof.status,
        rules: (prof.rules as unknown[]) ?? [],
        changelog: prof.changelog ?? null,
        created_at: prof.createdAt.toISOString(),
      };
    }
  }

  return {
    id: pos.id,
    tx_id: redact ? "[REDACTED]" : (pos.txId ?? null),
    tx_date: pos.txDate?.toISOString() ?? null,
    wallet_id: redact ? "[REDACTED]" : (pos.walletId ?? null),
    event_type: pos.eventType,
    classification: pos.classification,
    tier: pos.tier,
    rationale: pos.rationale,
    profile_id: pos.profileId ?? null,
    profile_version: pos.profileVersion ?? null,
    requires_review: pos.requiresReview,
    reviewer_id: pos.reviewerId ?? null,
    reviewer_name: pos.reviewerName ?? null,
    reviewer_credential: pos.reviewerCredential ?? null,
    reviewer_signoff_at: pos.reviewerSignoffAt?.toISOString() ?? null,
    superseded_by: pos.supersededBy ?? null,
    amount_usd: pos.amountUsd ?? null,
    created_at: pos.createdAt.toISOString(),
    is_stale: isStale(pos),
    citations: citationRows.map((r) => ({
      id: r.citation.id,
      type: r.citation.type,
      reference: r.citation.reference,
      summary: r.citation.summary,
      url: r.citation.url ?? null,
      authority_strength: r.citation.authorityStrength,
      created_at: r.citation.createdAt.toISOString(),
    })),
    profile,
  };
}

// ── Data builders — extracted so the dossier route can call them in parallel ──

async function buildAuditPackageData(
  taxYear: number,
  walletId?: string,
  redact = false,
) {
  const yearStart = new Date(`${taxYear}-01-01T00:00:00Z`);
  const yearEnd = new Date(`${taxYear + 1}-01-01T00:00:00Z`);

  const conditions = [];
  if (walletId) conditions.push(eq(positionRecordsTable.walletId, walletId));

  const allPositions = await db
    .select()
    .from(positionRecordsTable)
    .where(conditions.length > 0 ? and(...conditions) : undefined);

  const yearPositions = allPositions.filter((p) => {
    const taxDate = p.txDate ?? p.createdAt;
    return taxDate >= yearStart && taxDate < yearEnd;
  });

  const enriched = await Promise.all(
    yearPositions.map((pos) => enrichPosition(pos, redact)),
  );
  const requiresReviewCount = enriched.filter(
    (p) => p.requires_review && !p.reviewer_signoff_at,
  ).length;

  return {
    tax_year: taxYear,
    wallet_id: redact ? "[REDACTED]" : (walletId ?? null),
    generated_at: new Date().toISOString(),
    positions: enriched,
    total_positions: enriched.length,
    requires_review_count: requiresReviewCount,
  };
}

async function buildPatternReportData() {
  const positions = await db
    .select({ eventType: positionRecordsTable.eventType, tier: positionRecordsTable.tier })
    .from(positionRecordsTable);

  const byEventType: Record<
    string,
    { count: number; tiers: Record<string, number>; open_gap: boolean }
  > = {};

  for (const pos of positions) {
    if (!byEventType[pos.eventType]) {
      byEventType[pos.eventType] = {
        count: 0,
        tiers: {},
        open_gap: OPEN_GAP_EVENT_TYPES.has(pos.eventType),
      };
    }
    byEventType[pos.eventType].count++;
    byEventType[pos.eventType].tiers[pos.tier] =
      (byEventType[pos.eventType].tiers[pos.tier] ?? 0) + 1;
  }

  const entries = Object.entries(byEventType).map(([event_type, data]) => ({
    event_type,
    count: data.count,
    tier_distribution: data.tiers,
    open_gap: data.open_gap,
  }));

  return {
    generated_at: new Date().toISOString(),
    total_positions: positions.length,
    entries,
  };
}

async function buildCommentLetterData() {
  const positions = await db.select().from(positionRecordsTable);

  const byEventType: Record<string, { count: number; tiers: Record<string, number> }> = {};
  for (const pos of positions) {
    if (!byEventType[pos.eventType]) byEventType[pos.eventType] = { count: 0, tiers: {} };
    byEventType[pos.eventType].count++;
    byEventType[pos.eventType].tiers[pos.tier] =
      (byEventType[pos.eventType].tiers[pos.tier] ?? 0) + 1;
  }

  const openGapEntries = Object.entries(byEventType)
    .filter(([eventType]) => eventType in OPEN_GAP_EVENTS)
    .map(([event_type, data]) => ({
      event_type,
      position_count: data.count,
      tier_distribution: data.tiers,
      guidance_gap: true,
      pending_irs_notices: OPEN_GAP_EVENTS[event_type]?.pending_notices ?? [],
      practitioner_summary: OPEN_GAP_EVENTS[event_type]?.summary ?? "",
    }));

  const totalOpenGap = openGapEntries.reduce((sum, e) => sum + e.position_count, 0);

  return {
    generated_at: new Date().toISOString(),
    total_open_gap_positions: totalOpenGap,
    entries: openGapEntries,
    disclaimer:
      "This report contains anonymized aggregate data only. No personally identifiable information or individual taxpayer data is included. This report is intended solely for practitioner use in preparing IRS comment letters regarding open guidance gaps under Notice 2024-57 and related authorities.",
  };
}

async function buildCpaHandoffData(taxYear: number) {
  const yearStart = new Date(`${taxYear}-01-01T00:00:00Z`);
  const yearEnd = new Date(`${taxYear + 1}-01-01T00:00:00Z`);

  const allPositions = await db.select().from(positionRecordsTable);
  const yearPositions = allPositions.filter((p) => {
    const taxDate = p.txDate ?? p.createdAt;
    return taxDate >= yearStart && taxDate < yearEnd;
  });

  const signed = yearPositions.filter((p) => p.reviewerSignoffAt !== null);
  const pending = yearPositions.filter((p) => p.requiresReview && !p.reviewerSignoffAt);
  const staleRB = yearPositions.filter((p) => isStale(p));

  const tierBreakdown: Record<string, number> = {};
  for (const p of yearPositions) {
    tierBreakdown[p.tier] = (tierBreakdown[p.tier] ?? 0) + 1;
  }

  const openActionItems: string[] = [];
  if (pending.length > 0)
    openActionItems.push(`${pending.length} position(s) require preparer sign-off before filing.`);
  if (staleRB.length > 0)
    openActionItems.push(
      `${staleRB.length} Reasonable Basis position(s) are over ${STALE_THRESHOLD_DAYS} days old and should be reviewed for supersession or upgraded authority.`,
    );
  const reasonableBasisCount = yearPositions.filter((p) => p.tier === "reasonable_basis").length;
  if (reasonableBasisCount > 0)
    openActionItems.push(
      `${reasonableBasisCount} Reasonable Basis position(s) require Form 8275 disclosure.`,
    );
  if (openActionItems.length === 0)
    openActionItems.push(
      "All positions are signed off. Evidence log is fully attested for this tax year.",
    );

  const enriched = await Promise.all(yearPositions.map((pos) => enrichPosition(pos, false)));

  const checklist = [
    "Verify all positions with requires_review=true have been signed off before submission.",
    "Confirm Form 8275 disclosures are prepared for all Reasonable Basis and below positions.",
    "Review stale Reasonable Basis positions (>180 days) — new guidance may have issued.",
    "Confirm broker 1099-DA reconciliation is complete for custodial accounts (T.D. 10000).",
    "Retain this package for a minimum of 7 years (IRC §6501 sets 3 years generally, 6 years for >25% income omission; unlimited for fraud or non-filing — 7 years is the recommended practical buffer covering the 6-year window plus one year).",
    "If any open-gap event types are present, confirm Comment Letter prep is on file.",
  ];

  return {
    generated_at: new Date().toISOString(),
    summary: {
      tax_year: taxYear,
      total_positions: yearPositions.length,
      signed_off: signed.length,
      pending_signoff: pending.length,
      stale_reasonable_basis: staleRB.length,
      tier_breakdown: tierBreakdown,
      open_action_items: openActionItems,
    },
    positions: enriched,
    preparer_checklist: checklist,
  };
}

// ── Routes ────────────────────────────────────────────────────────────────────

// GET /export/audit-package
router.get("/export/audit-package", async (req, res): Promise<void> => {
  const parsed = GetAuditPackageQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { tax_year, wallet_id } = parsed.data;
  const redact = req.query.redact_pii === "true";
  res.json(await buildAuditPackageData(tax_year, wallet_id, redact));
});

// GET /export/pattern-report
router.get("/export/pattern-report", async (_req, res): Promise<void> => {
  res.json(await buildPatternReportData());
});

// GET /export/comment-letter
router.get("/export/comment-letter", async (_req, res): Promise<void> => {
  res.json(await buildCommentLetterData());
});

// GET /export/cpa-handoff
router.get("/export/cpa-handoff", async (req, res): Promise<void> => {
  const taxYear = parseInt(req.query.tax_year as string);
  if (isNaN(taxYear)) {
    res.status(400).json({ error: "tax_year is required and must be an integer" });
    return;
  }
  res.json(await buildCpaHandoffData(taxYear));
});

/**
 * GET /export/dossier
 *
 * One-click IRS-ready dossier — all four export views combined into a single
 * envelope. Runs the four data builders in parallel so total latency is bounded
 * by the slowest individual query rather than their sum.
 *
 * Required: tax_year
 * Optional: wallet_id, redact_pii
 */
router.get("/export/dossier", async (req, res): Promise<void> => {
  const parsed = GetAuditPackageQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { tax_year, wallet_id } = parsed.data;
  const redact = req.query.redact_pii === "true";

  const [auditPackage, patternReport, commentLetter, cpaHandoff] = await Promise.all([
    buildAuditPackageData(tax_year, wallet_id, redact),
    buildPatternReportData(),
    buildCommentLetterData(),
    buildCpaHandoffData(tax_year),
  ]);

  res.json({
    generated_at: new Date().toISOString(),
    dossier_version: "1.0",
    tax_year,
    wallet_id: redact ? "[REDACTED]" : (wallet_id ?? null),
    disclaimer:
      "This dossier is generated by BasisGuard for practitioner use only. It does not constitute legal, tax, or accounting advice. Retain for a minimum of 7 years. All positions reflect the classification and authority tier at time of generation; positions may be superseded by subsequent guidance.",
    audit_package: auditPackage,
    pattern_report: patternReport,
    comment_letter: commentLetter,
    cpa_handoff: cpaHandoff,
  });
});

export default router;
