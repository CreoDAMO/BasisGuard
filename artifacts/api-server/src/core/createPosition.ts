import { db, positionRecordsTable, positionCitationsTable } from "@workspace/db";
import { computeRequiresReview } from "./reviewRules.js";

export interface CreatePositionInput {
  eventType: string;
  classification: string;
  tier: "will" | "should" | "more_likely_than_not" | "substantial_authority" | "reasonable_basis";
  rationale: string;
  walletId?: string | null;
  txId?: string | null;
  txDate?: Date | null;
  chainId?: string | null;
  profileId?: string | null;
  citationIds?: string[];
  /**
   * Realized gain/loss in USD at the time of the transaction (positive = gain,
   * negative = loss). Optional — set by adapters or ingest routes that have
   * price data; null if unknown. Used by the loss-harvesting scanner.
   */
  amountUsd?: number | null;
  /** Consulted only when the event type isn't open-gap and citations exist — see computeRequiresReview. */
  requiresReviewOverride?: boolean;
}

/**
 * Single, shared path for creating a Position Record.
 *
 * Both POST /transactions/ingest and every protocol adapter call this instead
 * of re-deriving requires_review or duplicating the insert — one rule, one
 * insert shape, no drift between call sites.
 */
export async function createPositionFromClassification(
  input: CreatePositionInput,
): Promise<typeof positionRecordsTable.$inferSelect> {
  const citationIds = input.citationIds ?? [];
  const requiresReview = computeRequiresReview(
    input.eventType,
    citationIds,
    input.requiresReviewOverride,
  );

  const [position] = await db
    .insert(positionRecordsTable)
    .values({
      txId: input.txId ?? null,
      txDate: input.txDate ?? null,
      walletId: input.walletId ?? null,
      eventType: input.eventType,
      classification: input.classification,
      tier: input.tier,
      rationale: input.rationale,
      profileId: input.profileId ?? null,
      chainId: input.chainId ?? null,
      amountUsd: input.amountUsd ?? null,
      requiresReview,
    })
    .returning();

  if (citationIds.length > 0) {
    await db.insert(positionCitationsTable).values(
      citationIds.map((citationId) => ({ positionId: position.id, citationId })),
    );
  }

  return position;
}
