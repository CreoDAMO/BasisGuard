import { Router, type IRouter } from "express";
import { eq, and, desc, count, isNull, inArray } from "drizzle-orm";
import { db, positionRecordsTable, positionCitationsTable, authorityCitationsTable, treatmentProfilesTable } from "@workspace/db";
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

const STALE_THRESHOLD_DAYS = 180;

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

function isStale(p: typeof positionRecordsTable.$inferSelect): boolean {
  if (p.tier !== "reasonable_basis") return false;
  if (p.supersededBy) return false; // superseded records are not flagged
  const ageMs = Date.now() - p.createdAt.getTime();
  return ageMs > STALE_THRESHOLD_DAYS * 24 * 60 * 60 * 1000;
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

  const [position] = await db.insert(positionRecordsTable).values({
    txId: rest.tx_id ?? null,
    txDate: rest.tx_date ? new Date(rest.tx_date as string) : null,
    walletId: rest.wallet_id ?? null,
    eventType: rest.event_type,
    classification: rest.classification,
    tier: rest.tier,
    rationale: rest.rationale,
    profileId: rest.profile_id ?? null,
    profileVersion: rest.profile_version ?? null,
    requiresReview: rest.requires_review ?? false,
  }).returning();

  if (citation_ids && citation_ids.length > 0) {
    await db.insert(positionCitationsTable).values(
      citation_ids.map((cid) => ({ positionId: position.id, citationId: cid }))
    );
  }

  res.status(201).json(serializePosition(position));
});

// POST /positions/batch-signoff  — must be before /:id
router.post("/positions/batch-signoff", async (req, res): Promise<void> => {
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

  // Fetch citations to evaluate authority strength
  let citations: Array<typeof authorityCitationsTable.$inferSelect> = [];
  if (citationIds.length > 0) {
    citations = await db.select().from(authorityCitationsTable)
      .where(inArray(authorityCitationsTable.id, citationIds));
  }

  // Determine ceiling tier from citation authority strengths
  const TIER_ORDER = ["will", "should", "more_likely_than_not", "substantial_authority", "reasonable_basis"] as const;
  type Tier = typeof TIER_ORDER[number];

  const bindingOnCourts = citations.filter((c) => c.authorityStrength === "binding_on_courts");
  const bindingOnIrs = citations.filter((c) => c.authorityStrength === "binding_on_irs_only");
  const nonBinding = citations.filter((c) => c.authorityStrength === "non_binding_persuasive");

  let ceilingTier: Tier;
  let reasoning: string;
  let strongestAuthority: string | null = null;

  if (bindingOnCourts.length >= 2) {
    ceilingTier = "will";
    reasoning = `${bindingOnCourts.length} court-binding authorities directly support this position. "Will prevail" is defensible.`;
    strongestAuthority = bindingOnCourts[0].reference;
  } else if (bindingOnCourts.length === 1) {
    ceilingTier = "should";
    reasoning = `One court-binding authority (${bindingOnCourts[0].reference}) supports this position. "Should prevail" is appropriate.`;
    strongestAuthority = bindingOnCourts[0].reference;
  } else if (bindingOnIrs.length >= 2) {
    ceilingTier = "more_likely_than_not";
    reasoning = `${bindingOnIrs.length} IRS-binding authorities (Notices, Rev. Ruls.) support this position. "More likely than not" is defensible.`;
    strongestAuthority = bindingOnIrs[0].reference;
  } else if (bindingOnIrs.length === 1) {
    ceilingTier = "more_likely_than_not";
    reasoning = `One IRS-binding authority (${bindingOnIrs[0].reference}) supports this position.`;
    strongestAuthority = bindingOnIrs[0].reference;
  } else if (nonBinding.length > 0) {
    ceilingTier = "substantial_authority";
    reasoning = `Only non-binding persuasive authority found. Position may reach substantial authority with ${nonBinding.length} source(s), but not higher.`;
    strongestAuthority = nonBinding[0].reference;
  } else {
    ceilingTier = "reasonable_basis";
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

  // Suggested tier = ceiling (we don't auto-downgrade; flag if profile disagrees)
  const suggestedTier = ceilingTier;
  const ceilingIdx = TIER_ORDER.indexOf(ceilingTier);
  const profileIdx = profileRuleMatch ? TIER_ORDER.indexOf(profileRuleMatch as Tier) : -1;
  const flagDowngrade = profileIdx > ceilingIdx; // profile says lower confidence than citations support

  res.json({
    suggested_tier: suggestedTier,
    ceiling_tier: ceilingTier,
    reasoning,
    citation_count: citations.length,
    strongest_authority: strongestAuthority,
    profile_rule_match: profileRuleMatch,
    flag_downgrade: flagDowngrade,
  });
});

// GET /positions/review-queue  — must be before /:id
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

  const [position] = await db.update(positionRecordsTable)
    .set({
      ...(rest.rationale !== undefined && { rationale: rest.rationale }),
      ...(rest.requires_review !== undefined && { requiresReview: rest.requires_review }),
    })
    .where(eq(positionRecordsTable.id, params.data.id))
    .returning();

  if (!position) {
    res.status(404).json({ error: "Position not found" });
    return;
  }

  if (citation_ids !== undefined) {
    await db.delete(positionCitationsTable).where(eq(positionCitationsTable.positionId, position.id));
    if (citation_ids.length > 0) {
      await db.insert(positionCitationsTable).values(
        citation_ids.map((cid) => ({ positionId: position.id, citationId: cid }))
      );
    }
  }

  res.json(serializePosition(position));
});

// POST /positions/:id/signoff
router.post("/positions/:id/signoff", async (req, res): Promise<void> => {
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

  const [newPosition] = await db.insert(positionRecordsTable).values({
    txId: rest.tx_id ?? existing.txId,
    txDate: rest.tx_date ? new Date(rest.tx_date as string) : existing.txDate,
    walletId: rest.wallet_id ?? existing.walletId,
    eventType: rest.event_type,
    classification: rest.classification,
    tier: rest.tier,
    rationale: rest.rationale,
    profileId: rest.profile_id ?? existing.profileId,
    profileVersion: rest.profile_version ?? existing.profileVersion,
    requiresReview: rest.requires_review ?? false,
  }).returning();

  // Mark old as superseded
  await db.update(positionRecordsTable)
    .set({ supersededBy: newPosition.id })
    .where(eq(positionRecordsTable.id, existing.id));

  if (citation_ids && citation_ids.length > 0) {
    await db.insert(positionCitationsTable).values(
      citation_ids.map((cid) => ({ positionId: newPosition.id, citationId: cid }))
    );
  }

  res.status(201).json(serializePosition(newPosition));
});

// GET /positions/:id/history
router.get("/positions/:id/history", async (req, res): Promise<void> => {
  const { id } = req.params;
  if (!id) {
    res.status(400).json({ error: "id is required" });
    return;
  }

  // Verify the anchor position exists
  const [anchor] = await db.select().from(positionRecordsTable).where(eq(positionRecordsTable.id, id));
  if (!anchor) {
    res.status(404).json({ error: "Position not found" });
    return;
  }

  // Walk backwards: find predecessors (where superseded_by = id)
  const allPositions = await db.select().from(positionRecordsTable);

  // Build a map from superseded_by -> record for quick lookup
  const bySupersededBy: Record<string, typeof positionRecordsTable.$inferSelect> = {};
  const byId: Record<string, typeof positionRecordsTable.$inferSelect> = {};
  for (const p of allPositions) {
    byId[p.id] = p;
    if (p.supersededBy) bySupersededBy[p.supersededBy] = p;
  }

  // Walk backwards from anchor to find the oldest predecessor
  const chain: typeof positionRecordsTable.$inferSelect[] = [];
  let current: typeof positionRecordsTable.$inferSelect | undefined = anchor;

  // Follow supersededBy forward to find newest in chain
  let newest = anchor;
  while (newest.supersededBy && byId[newest.supersededBy]) {
    newest = byId[newest.supersededBy]!;
  }

  // Now walk backwards from newest to find oldest
  const chainForward: typeof positionRecordsTable.$inferSelect[] = [newest];
  let walker: typeof positionRecordsTable.$inferSelect | undefined = newest;
  while (walker) {
    const predecessor = bySupersededBy[walker.id];
    if (predecessor) {
      chainForward.unshift(predecessor);
      walker = predecessor;
    } else {
      break;
    }
  }

  // Determine current (the last in the chain with no supersededBy)
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
