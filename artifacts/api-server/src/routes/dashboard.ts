import { Router, type IRouter } from "express";
import { eq, count, desc, and, isNotNull } from "drizzle-orm";
import { db, positionRecordsTable, authorityCitationsTable, treatmentProfilesTable } from "@workspace/db";
import { GetRecentActivityQueryParams } from "@workspace/api-zod";

const router: IRouter = Router();

const TIER_LABELS: Record<string, string> = {
  will: "Will Prevail",
  should: "Should Prevail",
  more_likely_than_not: "More Likely Than Not",
  substantial_authority: "Substantial Authority",
  reasonable_basis: "Reasonable Basis",
};

const OPEN_GAP_EVENT_TYPES = [
  "lp_deposit",
  "lp_withdrawal",
  "defi_yield",
  "bridge_transfer",
  "nft_sale",
  "staking_reward",
];

// GET /dashboard/summary
router.get("/dashboard/summary", async (_req, res): Promise<void> => {
  const [
    totalRows,
    pendingRows,
    signedOffRows,
    autoAppliedRows,
    citationRows,
    profileRows,
    allPositions,
  ] = await Promise.all([
    db.select({ count: count() }).from(positionRecordsTable),
    db.select({ count: count() }).from(positionRecordsTable).where(
      and(eq(positionRecordsTable.requiresReview, true), eq(positionRecordsTable.reviewerSignoffAt, null as unknown as Date))
    ),
    db.select({ count: count() }).from(positionRecordsTable).where(isNotNull(positionRecordsTable.reviewerSignoffAt)),
    db.select({ count: count() }).from(positionRecordsTable).where(eq(positionRecordsTable.requiresReview, false)),
    db.select({ count: count() }).from(authorityCitationsTable),
    db.select({ count: count() }).from(treatmentProfilesTable).where(eq(treatmentProfilesTable.status, "active")),
    db.select({ tier: positionRecordsTable.tier, eventType: positionRecordsTable.eventType }).from(positionRecordsTable),
  ]);

  // Tier breakdown
  const tierCounts: Record<string, number> = {};
  let openGapEvents = 0;
  for (const p of allPositions) {
    tierCounts[p.tier] = (tierCounts[p.tier] ?? 0) + 1;
    if (OPEN_GAP_EVENT_TYPES.includes(p.eventType)) openGapEvents++;
  }

  const tierOrder = ["will", "should", "more_likely_than_not", "substantial_authority", "reasonable_basis"];
  const tierBreakdown = tierOrder.map((tier) => ({
    tier,
    count: tierCounts[tier] ?? 0,
    label: TIER_LABELS[tier] ?? tier,
  }));

  res.json({
    total_positions: Number(totalRows[0].count),
    pending_review: Number(pendingRows[0].count),
    signed_off: Number(signedOffRows[0].count),
    auto_applied: Number(autoAppliedRows[0].count),
    tier_breakdown: tierBreakdown,
    active_profiles: Number(profileRows[0].count),
    total_citations: Number(citationRows[0].count),
    open_gap_events: openGapEvents,
  });
});

// GET /dashboard/recent-activity
router.get("/dashboard/recent-activity", async (req, res): Promise<void> => {
  const parsed = GetRecentActivityQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const limit = parsed.data.limit ?? 10;
  const items = await db.select().from(positionRecordsTable)
    .orderBy(desc(positionRecordsTable.createdAt))
    .limit(limit);

  res.json(items.map((p) => ({
    id: p.id,
    tx_id: p.txId ?? null,
    wallet_id: p.walletId ?? null,
    event_type: p.eventType,
    classification: p.classification,
    tier: p.tier,
    rationale: p.rationale,
    profile_id: p.profileId ?? null,
    profile_version: p.profileVersion ?? null,
    requires_review: p.requiresReview,
    reviewer_id: p.reviewerId ?? null,
    reviewer_name: p.reviewerName ?? null,
    reviewer_credential: p.reviewerCredential ?? null,
    reviewer_signoff_at: p.reviewerSignoffAt?.toISOString() ?? null,
    superseded_by: p.supersededBy ?? null,
    created_at: p.createdAt.toISOString(),
  })));
});

export default router;
