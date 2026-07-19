import { Router, type IRouter } from "express";
import { eq, and } from "drizzle-orm";
import { db, positionRecordsTable, positionCitationsTable, authorityCitationsTable, treatmentProfilesTable } from "@workspace/db";
import { GetAuditPackageQueryParams } from "@workspace/api-zod";

const router: IRouter = Router();

const STALE_THRESHOLD_DAYS = 180;

function isStale(pos: typeof positionRecordsTable.$inferSelect): boolean {
  if (pos.tier !== "reasonable_basis") return false;
  if (pos.supersededBy) return false;
  return Date.now() - pos.createdAt.getTime() > STALE_THRESHOLD_DAYS * 86400000;
}

async function enrichPosition(pos: typeof positionRecordsTable.$inferSelect, redact = false) {
  const citationRows = await db
    .select({ citation: authorityCitationsTable })
    .from(positionCitationsTable)
    .innerJoin(authorityCitationsTable, eq(positionCitationsTable.citationId, authorityCitationsTable.id))
    .where(eq(positionCitationsTable.positionId, pos.id));

  let profile = null;
  if (pos.profileId) {
    const [prof] = await db.select().from(treatmentProfilesTable).where(eq(treatmentProfilesTable.id, pos.profileId));
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

// GET /export/audit-package
router.get("/export/audit-package", async (req, res): Promise<void> => {
  const parsed = GetAuditPackageQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { tax_year, wallet_id } = parsed.data;
  const redact = req.query.redact_pii === "true";

  const yearStart = new Date(`${tax_year}-01-01T00:00:00Z`);
  const yearEnd = new Date(`${tax_year + 1}-01-01T00:00:00Z`);

  const conditions = [];
  if (wallet_id) conditions.push(eq(positionRecordsTable.walletId, wallet_id));

  const allPositions = await db.select().from(positionRecordsTable)
    .where(conditions.length > 0 ? and(...conditions) : undefined);

  const yearPositions = allPositions.filter(
    (p) => p.createdAt >= yearStart && p.createdAt < yearEnd
  );

  const enriched = await Promise.all(yearPositions.map((pos) => enrichPosition(pos, redact)));
  const requiresReviewCount = enriched.filter((p) => p.requires_review && !p.reviewer_signoff_at).length;

  res.json({
    tax_year,
    wallet_id: redact ? "[REDACTED]" : (wallet_id ?? null),
    generated_at: new Date().toISOString(),
    positions: enriched,
    total_positions: enriched.length,
    requires_review_count: requiresReviewCount,
  });
});

// GET /export/pattern-report
router.get("/export/pattern-report", async (_req, res): Promise<void> => {
  const positions = await db.select({
    eventType: positionRecordsTable.eventType,
    tier: positionRecordsTable.tier,
  }).from(positionRecordsTable);

  const OPEN_GAP_EVENT_TYPES = new Set([
    "lp_deposit", "lp_withdrawal", "defi_yield",
    "bridge_transfer", "nft_sale", "staking_reward",
  ]);

  const byEventType: Record<string, { count: number; tiers: Record<string, number>; open_gap: boolean }> = {};

  for (const pos of positions) {
    if (!byEventType[pos.eventType]) {
      byEventType[pos.eventType] = { count: 0, tiers: {}, open_gap: OPEN_GAP_EVENT_TYPES.has(pos.eventType) };
    }
    byEventType[pos.eventType].count++;
    byEventType[pos.eventType].tiers[pos.tier] = (byEventType[pos.eventType].tiers[pos.tier] ?? 0) + 1;
  }

  const entries = Object.entries(byEventType).map(([event_type, data]) => ({
    event_type,
    count: data.count,
    tier_distribution: data.tiers,
    open_gap: data.open_gap,
  }));

  res.json({
    generated_at: new Date().toISOString(),
    total_positions: positions.length,
    entries,
  });
});

// GET /export/comment-letter
// Anonymized aggregate view suitable for submitting IRS comments on open guidance gaps
router.get("/export/comment-letter", async (_req, res): Promise<void> => {
  const positions = await db.select().from(positionRecordsTable);

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

  const byEventType: Record<string, { count: number; tiers: Record<string, number> }> = {};
  for (const pos of positions) {
    if (!byEventType[pos.eventType]) byEventType[pos.eventType] = { count: 0, tiers: {} };
    byEventType[pos.eventType].count++;
    byEventType[pos.eventType].tiers[pos.tier] = (byEventType[pos.eventType].tiers[pos.tier] ?? 0) + 1;
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

  res.json({
    generated_at: new Date().toISOString(),
    total_open_gap_positions: totalOpenGap,
    entries: openGapEntries,
    disclaimer:
      "This report contains anonymized aggregate data only. No personally identifiable information or individual taxpayer data is included. This report is intended solely for practitioner use in preparing IRS comment letters regarding open guidance gaps under Notice 2024-57 and related authorities.",
  });
});

// GET /export/cpa-handoff
router.get("/export/cpa-handoff", async (req, res): Promise<void> => {
  const taxYear = parseInt(req.query.tax_year as string);
  if (isNaN(taxYear)) {
    res.status(400).json({ error: "tax_year is required and must be an integer" });
    return;
  }

  const yearStart = new Date(`${taxYear}-01-01T00:00:00Z`);
  const yearEnd = new Date(`${taxYear + 1}-01-01T00:00:00Z`);

  const allPositions = await db.select().from(positionRecordsTable);
  const yearPositions = allPositions.filter(
    (p) => p.createdAt >= yearStart && p.createdAt < yearEnd
  );

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
    openActionItems.push(`${staleRB.length} Reasonable Basis position(s) are over ${180} days old and should be reviewed for supersession or upgraded authority.`);
  const reasonableBasisCount = yearPositions.filter((p) => p.tier === "reasonable_basis").length;
  if (reasonableBasisCount > 0)
    openActionItems.push(`${reasonableBasisCount} Reasonable Basis position(s) require Form 8275 disclosure.`);
  if (openActionItems.length === 0)
    openActionItems.push("All positions are signed off. Evidence log is fully attested for this tax year.");

  const enriched = await Promise.all(yearPositions.map((pos) => enrichPosition(pos, false)));

  const checklist = [
    "Verify all positions with requires_review=true have been signed off before submission.",
    "Confirm Form 8275 disclosures are prepared for all Reasonable Basis and below positions.",
    "Review stale Reasonable Basis positions (>180 days) — new guidance may have issued.",
    "Confirm broker 1099-DA reconciliation is complete for custodial accounts (T.D. 10000).",
    "Retain this package for a minimum of 7 years per IRC §6501 limitations period.",
    "If any open-gap event types are present, confirm Comment Letter prep is on file.",
  ];

  res.json({
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
  });
});

export default router;
