import { Router, type IRouter } from "express";
import { eq, and, desc, count, isNull, inArray } from "drizzle-orm";
import { db, positionRecordsTable, positionCitationsTable, authorityCitationsTable, treatmentProfilesTable } from "@workspace/db";
import { requireAuth, requireRole, ADMIN_ROLES } from "../middlewares/auth.js";
import {
  OPEN_GAP_EVENT_TYPES,
  computeRequiresReview,
  isStale,
  STALE_THRESHOLD_DAYS,
} from "../core/reviewRules.js";
export { OPEN_GAP_EVENT_TYPES, computeRequiresReview };
import { buildHarvestCandidates, type HarvestPosition } from "../core/washSaleDetector.js";
import { computeTierCeiling, exceedsCeiling, TIER_ORDER } from "../core/tierCeiling.js";
import {
  CreatePositionBody,
  UpdatePositionBody,
  SignOffPositionBody,
  SupersedePositionBody,
  GetPositionParams,
  UpdatePositionParams,
  SignOffPositionParams,
  SupersedePositionParams,
  ListPositionsQueryParams,
  GetRecentActivityQueryParams,
} from "@workspace/api-zod";

const router: IRouter = Router();

// Helper: fetch citations for a position
async function getCitationsForPosition(positionId: string) {
  const rows = await db
    .select({ citation: authorityCitationsTable })
    .from(positionCitationsTable)
    .innerJoin(authorityCitationsTable, eq(positionCitationsTable.citationId, authorityCitationsTable.id))
    .where(eq(positionCitationsTable.positionId, positionId));
  return rows.map((r) => ({
    ...r.citation,
    url: r.citation.url ?? null,
    created_at: r.citation.createdAt.toISOString(),
    authority_strength: r.citation.authorityStrength,
  }));
}

// Helper: fetch only the citation IDs for a position (cheaper than full join)
async function getCitationIdsForPosition(positionId: string): Promise<string[]> {
  const rows = await db
    .select({ citationId: positionCitationsTable.citationId })
    .from(positionCitationsTable)
    .where(eq(positionCitationsTable.positionId, positionId));
  return rows.map((r) => r.citationId);
}

function serializePosition(p: typeof positionRecordsTable.$inferSelect) {
  return {
    id: p.id,
    tx_id: p.txId ?? null,
    tx_date: p.txDate?.toISOString() ?? null,
    wallet_id: p.walletId ?? null,
    event_type: p.eventType,
    classification: p.classification,
    tier: p.tier,
    rationale: p.rationale,
    profile_id: p.profileId ?? null,
    profile_version: p.profileVersion ?? null,
    chain_id: p.chainId ?? null,
    requires_review: p.requiresReview,
    reviewer_id: p.reviewerId ?? null,
    reviewer_name: p.reviewerName ?? null,
    reviewer_credential: p.reviewerCredential ?? null,
    reviewer_signoff_at: p.reviewerSignoffAt?.toISOString() ?? null,
    superseded_by: p.supersededBy ?? null,
    amount_usd: p.amountUsd ?? null,
    created_at: p.createdAt.toISOString(),
    is_stale: isStale(p),
  };
}

// GET /positions
router.get("/positions", async (req, res): Promise<void> => {
  const parsed = ListPositionsQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { tier, requires_review, event_type, classification, profile_id, limit = 50, offset = 0 } = parsed.data;
  const chain_id = req.query.chain_id as string | undefined;

  const conditions = [];
  if (tier) conditions.push(eq(positionRecordsTable.tier, tier));
  if (requires_review !== undefined) conditions.push(eq(positionRecordsTable.requiresReview, requires_review));
  if (event_type) conditions.push(eq(positionRecordsTable.eventType, event_type));
  if (classification) conditions.push(eq(positionRecordsTable.classification, classification));
  if (profile_id) conditions.push(eq(positionRecordsTable.profileId, profile_id));
  if (chain_id) conditions.push(eq(positionRecordsTable.chainId, chain_id));

  const [items, totalRows] = await Promise.all([
    db.select().from(positionRecordsTable)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(positionRecordsTable.createdAt))
      .limit(limit)
      .offset(offset),
    db.select({ count: count() }).from(positionRecordsTable)
      .where(conditions.length > 0 ? and(...conditions) : undefined),
  ]);

  res.json({
    items: items.map(serializePosition),
    total: Number(totalRows[0].count),
    limit,
    offset,
  });
});

// POST /positions
router.post("/positions", async (req, res): Promise<void> => {
  const parsed = CreatePositionBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { citation_ids, ...rest } = parsed.data as typeof parsed.data & { citation_ids?: string[] };

  // 0g — enforce tier ceiling at write time.
  // The ceiling is computed from the citations being linked.  Reject if the
  // caller supplies a tier that is more optimistic than the citations support.
  if (rest.tier) {
    const effectiveCitationIds = citation_ids ?? [];
    const ceiling = await computeTierCeiling(effectiveCitationIds);
    if (exceedsCeiling(rest.tier, ceiling)) {
      res.status(422).json({
        error: `Tier "${rest.tier}" exceeds the citation-computed ceiling of "${ceiling}". ` +
          `Add stronger authority citations or lower the tier to "${ceiling}" or below.`,
        ceiling_tier: ceiling,
        requested_tier: rest.tier,
      });
      return;
    }
  }

  // 0h — wrap the position insert + citation insert in a single transaction so
  // a citation insert failure cannot leave an orphaned position record.
  const position = await db.transaction(async (tx) => {
    const [pos] = await tx.insert(positionRecordsTable).values({
      txId: rest.tx_id ?? null,
      txDate: rest.tx_date ? new Date(rest.tx_date as unknown as string) : null,
      walletId: rest.wallet_id ?? null,
      eventType: rest.event_type,
      classification: rest.classification,
      tier: rest.tier,
      rationale: rest.rationale,
      profileId: rest.profile_id ?? null,
      profileVersion: rest.profile_version ?? null,
      requiresReview: computeRequiresReview(rest.event_type, citation_ids, rest.requires_review),
    }).returning();

    if (citation_ids && citation_ids.length > 0) {
      await tx.insert(positionCitationsTable).values(
        citation_ids.map((cid) => ({ positionId: pos.id, citationId: cid }))
      );
    }

    return pos;
  });

  res.status(201).json(serializePosition(position));
});

// POST /positions/batch-signoff  — must be before /:id
router.post("/positions/batch-signoff", requireRole(ADMIN_ROLES), async (req, res): Promise<void> => {
  const body = req.body as {
    position_ids: string[];
    reviewer_id: string;
    reviewer_name: string;
    reviewer_credential: string;
    note?: string;
  };

  if (!Array.isArray(body.position_ids) || body.position_ids.length === 0) {
    res.status(400).json({ error: "position_ids must be a non-empty array" });
    return;
  }
  if (!body.reviewer_id || !body.reviewer_name || !body.reviewer_credential) {
    res.status(400).json({ error: "reviewer_id, reviewer_name, reviewer_credential are required" });
    return;
  }

  // Fetch all positions in the batch
  const positions = await db.select().from(positionRecordsTable)
    .where(inArray(positionRecordsTable.id, body.position_ids));

  const alreadySigned = positions.filter((p) => p.reviewerSignoffAt !== null).map((p) => p.id);
  const toSign = positions.filter((p) => p.reviewerSignoffAt === null).map((p) => p.id);

  if (toSign.length > 0) {
    await db.update(positionRecordsTable)
      .set({
        reviewerId: body.reviewer_id,
        reviewerName: body.reviewer_name,
        reviewerCredential: body.reviewer_credential,
        reviewerSignoffAt: new Date(),
      })
      .where(inArray(positionRecordsTable.id, toSign));
  }

  res.json({
    signed_count: toSign.length,
    skipped_count: alreadySigned.length,
    signed_ids: toSign,
    skipped_ids: alreadySigned,
  });
});

// GET /positions/tier-suggestion  — must be before /:id
router.get("/positions/tier-suggestion", async (req, res): Promise<void> => {
  const eventType = req.query.event_type as string;
  if (!eventType) {
    res.status(400).json({ error: "event_type is required" });
    return;
  }

  const rawCitationIds = req.query.citation_ids;
  const citationIds: string[] = Array.isArray(rawCitationIds)
    ? rawCitationIds as string[]
    : typeof rawCitationIds === "string"
    ? [rawCitationIds]
    : [];

  // Fetch citations to evaluate authority strength and build the detailed reasoning.
  let citations: Array<typeof authorityCitationsTable.$inferSelect> = [];
  if (citationIds.length > 0) {
    citations = await db.select().from(authorityCitationsTable)
      .where(inArray(authorityCitationsTable.id, citationIds));
  }

  // Compute ceiling using the shared utility (single source of truth with write-time enforcement).
  const ceilingTier = await computeTierCeiling(citationIds);

  // Build human-readable reasoning.
  const bindingOnCourts = citations.filter((c) => c.authorityStrength === "binding_on_courts");
  const bindingOnIrs = citations.filter((c) => c.authorityStrength === "binding_on_irs_only");
  const nonBinding = citations.filter((c) => c.authorityStrength === "non_binding_persuasive");

  let reasoning: string;
  let strongestAuthority: string | null = null;

  if (bindingOnCourts.length >= 2) {
    reasoning = `${bindingOnCourts.length} court-binding authorities directly support this position. "Will prevail" is defensible.`;
    strongestAuthority = bindingOnCourts[0].reference;
  } else if (bindingOnCourts.length === 1) {
    reasoning = `One court-binding authority (${bindingOnCourts[0].reference}) supports this position. "Should prevail" is appropriate.`;
    strongestAuthority = bindingOnCourts[0].reference;
  } else if (bindingOnIrs.length >= 2) {
    reasoning = `${bindingOnIrs.length} IRS-binding authorities (Notices, Rev. Ruls.) support this position. "More likely than not" is defensible.`;
    strongestAuthority = bindingOnIrs[0].reference;
  } else if (bindingOnIrs.length === 1) {
    reasoning = `One IRS-binding authority (${bindingOnIrs[0].reference}) supports this position.`;
    strongestAuthority = bindingOnIrs[0].reference;
  } else if (nonBinding.length > 0) {
    reasoning = `Only non-binding persuasive authority found. Position may reach substantial authority with ${nonBinding.length} source(s), but not higher.`;
    strongestAuthority = nonBinding[0].reference;
  } else {
    reasoning = "No authority citations linked. Maximum defensible tier is reasonable_basis. Form 8275 disclosure recommended.";
  }

  // Check for a matching active profile rule
  const activeProfiles = await db.select().from(treatmentProfilesTable)
    .where(eq(treatmentProfilesTable.status, "active"));

  let profileRuleMatch: string | null = null;
  for (const profile of activeProfiles) {
    const rules = profile.rules as Array<{ event_type: string; tier: string }>;
    const match = rules.find((r) => r.event_type === eventType);
    if (match) {
      profileRuleMatch = match.tier;
      break;
    }
  }

  const ceilingIdx = TIER_ORDER.indexOf(ceilingTier);
  const profileIdx = profileRuleMatch ? TIER_ORDER.indexOf(profileRuleMatch as typeof TIER_ORDER[number]) : -1;
  const flagDowngrade = profileIdx > ceilingIdx;

  res.json({
    suggested_tier: ceilingTier,
    ceiling_tier: ceilingTier,
    reasoning,
    citation_count: citations.length,
    strongest_authority: strongestAuthority,
    profile_rule_match: profileRuleMatch,
    flag_downgrade: flagDowngrade,
  });
});

// GET /positions/harvest-candidates — must sit before /positions/:id
router.get("/positions/harvest-candidates", requireAuth, async (req, res): Promise<void> => {
  const rawYear = req.query.tax_year as string | undefined;
  const walletId = req.query.wallet_id as string | undefined;

  let taxYear: number | null = null;
  if (rawYear) {
    taxYear = parseInt(rawYear, 10);
    if (isNaN(taxYear)) {
      res.status(400).json({ error: "tax_year must be an integer" });
      return;
    }
  }

  const rows = await db
    .select()
    .from(positionRecordsTable)
    .where(eq(positionRecordsTable.classification, "taxable_disposition"));

  const filtered = rows.filter((p) => {
    const taxDate = p.txDate ?? p.createdAt;
    if (taxYear !== null) {
      const yearStart = new Date(`${taxYear}-01-01T00:00:00Z`);
      const yearEnd = new Date(`${taxYear + 1}-01-01T00:00:00Z`);
      if (taxDate < yearStart || taxDate >= yearEnd) return false;
    }
    if (walletId && p.walletId !== walletId) return false;
    return true;
  });

  const harvestPositions: HarvestPosition[] = filtered.map((p) => ({
    id: p.id,
    walletId: p.walletId,
    eventType: p.eventType,
    txDate: p.txDate,
    amountUsd: p.amountUsd,
    classification: p.classification,
    tier: p.tier,
    requiresReview: p.requiresReview,
    reviewerSignoffAt: p.reviewerSignoffAt,
  }));

  const candidates = buildHarvestCandidates(harvestPositions);

  res.json({
    generated_at: new Date().toISOString(),
    tax_year: taxYear,
    wallet_id: walletId ?? null,
    total_candidates: candidates.length,
    wash_sale_risk_count: candidates.filter((c) => c.washSaleRisk).length,
    disclaimer:
      "This scanner identifies positions classified as taxable dispositions that may benefit from " +
      "loss-harvesting strategies. Wash-sale risk flags are conservative practitioner markers: " +
      "IRC §1091 applies to stocks and securities; the IRS has not officially extended wash-sale " +
      "rules to cryptocurrency. Consult qualified tax counsel before acting on these results.",
    candidates: candidates.map((c) => ({
      position_id: c.position.id,
      wallet_id: c.position.walletId ?? null,
      event_type: c.position.eventType,
      classification: c.position.classification,
      tier: c.position.tier,
      tx_date: c.position.txDate?.toISOString() ?? null,
      amount_usd: c.position.amountUsd ?? null,
      requires_review: c.position.requiresReview,
      reviewer_signoff_at: c.position.reviewerSignoffAt?.toISOString() ?? null,
      wash_sale_risk: c.washSaleRisk,
      wash_sale_pairs: c.washSalePairs.map((pair) => ({
        loss_position_id: pair.lossPositionId,
        gain_position_id: pair.gainPositionId,
        days_between: pair.daysBetween,
      })),
    })),
  });
});

// GET /positions/review-queue — must be before /:id
router.get("/positions/review-queue", async (_req, res): Promise<void> => {
  const items = await db.select().from(positionRecordsTable)
    .where(and(eq(positionRecordsTable.requiresReview, true), isNull(positionRecordsTable.reviewerSignoffAt)))
    .orderBy(desc(positionRecordsTable.createdAt));
  res.json(items.map(serializePosition));
});

// GET /positions/:id
router.get("/positions/:id", async (req, res): Promise<void> => {
  const params = GetPositionParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [position] = await db.select().from(positionRecordsTable).where(eq(positionRecordsTable.id, params.data.id));
  if (!position) {
    res.status(404).json({ error: "Position not found" });
    return;
  }

  const citations = await getCitationsForPosition(position.id);

  let profile = null;
  if (position.profileId) {
    const [prof] = await db.select().from(treatmentProfilesTable).where(eq(treatmentProfilesTable.id, position.profileId));
    if (prof) {
      profile = {
        id: prof.id,
        name: prof.name,
        status: prof.status,
        rules: prof.rules as unknown[],
        changelog: prof.changelog ?? null,
        created_at: prof.createdAt.toISOString(),
      };
    }
  }

  res.json({ ...serializePosition(position), citations, profile });
});

// PATCH /positions/:id
router.patch("/positions/:id", async (req, res): Promise<void> => {
  const params = UpdatePositionParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = UpdatePositionBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { citation_ids, ...rest } = parsed.data as typeof parsed.data & { citation_ids?: string[] };

  // 0a — enforce immutability: fetch before any write, reject if already signed.
  const [existing] = await db
    .select({
      id: positionRecordsTable.id,
      tier: positionRecordsTable.tier,
      reviewerSignoffAt: positionRecordsTable.reviewerSignoffAt,
    })
    .from(positionRecordsTable)
    .where(eq(positionRecordsTable.id, params.data.id));

  if (!existing) {
    res.status(404).json({ error: "Position not found" });
    return;
  }

  if (existing.reviewerSignoffAt !== null) {
    res.status(409).json({
      error:
        "Position is signed off and immutable. " +
        "Use POST /positions/:id/supersede to record a change.",
    });
    return;
  }

  // 0g — if citation_ids are being swapped, validate that the EXISTING tier
  // remains within the NEW citation ceiling.  The tier itself is not editable
  // via PATCH (only via supersede), so we guard against a citation swap that
  // would retroactively undermine the existing tier claim.
  if (citation_ids !== undefined) {
    const ceiling = await computeTierCeiling(citation_ids);
    if (exceedsCeiling(existing.tier, ceiling)) {
      res.status(422).json({
        error:
          `The current tier "${existing.tier}" would exceed the citation ceiling ` +
          `"${ceiling}" after replacing citations. ` +
          `Either keep citations that support "${existing.tier}" or supersede the position with a lower tier.`,
        ceiling_tier: ceiling,
        current_tier: existing.tier,
      });
      return;
    }
  }

  // 0h — wrap update + citation replacement in a transaction.
  const position = await db.transaction(async (tx) => {
    const [pos] = await tx.update(positionRecordsTable)
      .set({
        ...(rest.rationale !== undefined && { rationale: rest.rationale }),
        ...(rest.requires_review !== undefined && { requiresReview: rest.requires_review }),
      })
      .where(eq(positionRecordsTable.id, params.data.id))
      .returning();

    if (citation_ids !== undefined) {
      await tx.delete(positionCitationsTable).where(eq(positionCitationsTable.positionId, pos.id));
      if (citation_ids.length > 0) {
        await tx.insert(positionCitationsTable).values(
          citation_ids.map((cid) => ({ positionId: pos.id, citationId: cid }))
        );
      }
    }

    return pos;
  });

  res.json(serializePosition(position));
});

// POST /positions/:id/signoff
router.post("/positions/:id/signoff", requireRole(ADMIN_ROLES), async (req, res): Promise<void> => {
  const params = SignOffPositionParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = SignOffPositionBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [position] = await db.update(positionRecordsTable)
    .set({
      reviewerId: parsed.data.reviewer_id,
      reviewerName: parsed.data.reviewer_name,
      reviewerCredential: parsed.data.reviewer_credential,
      reviewerSignoffAt: new Date(),
    })
    .where(eq(positionRecordsTable.id, params.data.id))
    .returning();

  if (!position) {
    res.status(404).json({ error: "Position not found" });
    return;
  }

  res.json(serializePosition(position));
});

// POST /positions/:id/supersede
router.post("/positions/:id/supersede", async (req, res): Promise<void> => {
  const params = SupersedePositionParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = SupersedePositionBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [existing] = await db.select().from(positionRecordsTable).where(eq(positionRecordsTable.id, params.data.id));
  if (!existing) {
    res.status(404).json({ error: "Position not found" });
    return;
  }

  const body = parsed.data as typeof parsed.data & { citation_ids?: string[] };
  const { citation_ids, ...rest } = body;

  // 0g — enforce tier ceiling for the superseding position.
  const effectiveCitationIds = citation_ids ?? [];
  const ceiling = await computeTierCeiling(effectiveCitationIds);
  if (exceedsCeiling(rest.tier, ceiling)) {
    res.status(422).json({
      error:
        `Tier "${rest.tier}" exceeds the citation-computed ceiling of "${ceiling}". ` +
        `Add stronger authority citations or lower the tier to "${ceiling}" or below.`,
      ceiling_tier: ceiling,
      requested_tier: rest.tier,
    });
    return;
  }

  // 0h — wrap the three-step write (insert new, update old, insert citations)
  // in a single transaction.  Previously any mid-sequence failure would leave
  // the chain in an inconsistent state with no rollback.
  const newPosition = await db.transaction(async (tx) => {
    const [pos] = await tx.insert(positionRecordsTable).values({
      txId: rest.tx_id ?? existing.txId,
      txDate: rest.tx_date ? new Date(rest.tx_date as unknown as string) : existing.txDate,
      walletId: rest.wallet_id ?? existing.walletId,
      eventType: rest.event_type,
      classification: rest.classification,
      tier: rest.tier,
      rationale: rest.rationale,
      profileId: rest.profile_id ?? existing.profileId,
      profileVersion: rest.profile_version ?? existing.profileVersion,
      requiresReview: computeRequiresReview(rest.event_type, citation_ids, rest.requires_review),
    }).returning();

    // Mark old record as superseded
    await tx.update(positionRecordsTable)
      .set({ supersededBy: pos.id })
      .where(eq(positionRecordsTable.id, existing.id));

    if (citation_ids && citation_ids.length > 0) {
      await tx.insert(positionCitationsTable).values(
        citation_ids.map((cid) => ({ positionId: pos.id, citationId: cid }))
      );
    }

    return pos;
  });

  res.status(201).json(serializePosition(newPosition));
});

// GET /positions/:id/history
router.get("/positions/:id/history", async (req, res): Promise<void> => {
  const { id } = req.params;
  if (!id) {
    res.status(400).json({ error: "id is required" });
    return;
  }

  const [anchor] = await db.select().from(positionRecordsTable).where(eq(positionRecordsTable.id, id));
  if (!anchor) {
    res.status(404).json({ error: "Position not found" });
    return;
  }

  const allPositions = await db.select().from(positionRecordsTable);

  const bySupersededBy: Record<string, typeof positionRecordsTable.$inferSelect> = {};
  const byId: Record<string, typeof positionRecordsTable.$inferSelect> = {};
  for (const p of allPositions) {
    byId[p.id] = p;
    if (p.supersededBy) bySupersededBy[p.supersededBy] = p;
  }

  // Follow supersededBy forward to find newest in chain
  let newest = anchor;
  while (newest.supersededBy && byId[newest.supersededBy]) {
    newest = byId[newest.supersededBy]!;
  }

  // Walk backwards from newest to find oldest
  const chainForward: typeof positionRecordsTable.$inferSelect[] = [newest];
  let walker: typeof positionRecordsTable.$inferSelect | undefined = newest;
  while (walker) {
    const predecessor: typeof positionRecordsTable.$inferSelect | undefined = bySupersededBy[walker.id];
    if (predecessor) {
      chainForward.unshift(predecessor);
      walker = predecessor;
    } else {
      break;
    }
  }

  const currentRecord = chainForward[chainForward.length - 1];

  const entries = chainForward.map((p, idx) => ({
    ...serializePosition(p),
    is_current: p.id === currentRecord.id,
    generation: idx + 1,
  }));

  res.json({
    chain_length: entries.length,
    current_id: currentRecord.id,
    entries,
  });
});

export default router;
