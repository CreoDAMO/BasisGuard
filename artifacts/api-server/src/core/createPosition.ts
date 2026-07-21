import { db, positionRecordsTable, positionCitationsTable } from "@workspace/db";
import { computeRequiresReview } from "./reviewRules.js";
import {
  autoCreateLot,
  fifoMatchDisposition,
  ACQUISITION_EVENT_TYPES,
  DISPOSITION_EVENT_TYPES,
  type LotAcquisitionInput,
  type LotDisposalInput,
} from "./lotMatching.js";

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

  // ── Lot inventory fields (Tier 1) ────────────────────────────────────────
  // When provided, createPositionFromClassification will auto-create a lot
  // (acquisition events) or FIFO-match open lots (disposition events).
  // All fields are optional for backward compatibility with existing callers.

  /** Ticker symbol of the asset (e.g. "BTC", "ETH"). Required for lot ops. */
  assetSymbol?: string | null;
  /** Asset identifier (contract address, CoinGecko ID, etc.). Optional. */
  assetIdentifier?: string | null;
  /** Quantity of the asset acquired or disposed of. Required for lot ops. */
  quantity?: number | null;
  /** Total cost basis in USD (acquisition). Derived from perUnit if missing. */
  costBasisUsd?: number | null;
  /** Cost basis per unit in USD (acquisition). Derived from total if missing. */
  costBasisPerUnitUsd?: number | null;
  /** Gross proceeds in USD for the whole disposal (disposition only). */
  disposalProceedsUsd?: number | null;
}

/**
 * Single, shared path for creating a Position Record.
 *
 * Both POST /transactions/ingest and every protocol adapter call this instead
 * of re-deriving requires_review or duplicating the insert — one rule, one
 * insert shape, no drift between call sites.
 *
 * When assetSymbol + quantity are provided:
 *   - Acquisition events auto-create a lot in lotsTable.
 *   - Disposition events FIFO-match and close open lots, computing realized G/L.
 *
 * All lot operations run inside the same DB transaction as the position insert
 * so a mid-write failure cannot leave orphaned or mismatched records.
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

  const canDoLotOps =
    input.walletId != null &&
    input.assetSymbol != null &&
    input.quantity != null &&
    input.quantity > 0;

  const isAcquisition = ACQUISITION_EVENT_TYPES.has(input.eventType);
  const isDisposition = DISPOSITION_EVENT_TYPES.has(input.eventType);

  const position = await db.transaction(async (tx) => {
    // ── Insert position record ──────────────────────────────────────────────
    const [pos] = await tx
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

    // ── Link citations ──────────────────────────────────────────────────────
    if (citationIds.length > 0) {
      await tx.insert(positionCitationsTable).values(
        citationIds.map((citationId) => ({ positionId: pos.id, citationId })),
      );
    }

    // ── Lot inventory operations ────────────────────────────────────────────
    if (canDoLotOps) {
      const txDate = input.txDate ?? new Date();

      if (isAcquisition) {
        const acqInput: LotAcquisitionInput = {
          walletId: input.walletId!,
          assetSymbol: input.assetSymbol!,
          assetIdentifier: input.assetIdentifier ?? null,
          chainId: input.chainId ?? null,
          quantity: input.quantity!,
          costBasisUsd: input.costBasisUsd ?? null,
          costBasisPerUnitUsd: input.costBasisPerUnitUsd ?? null,
          acquisitionDate: txDate,
          acquisitionTxId: input.txId ?? null,
        };
        await autoCreateLot(tx, pos.id, acqInput);
      } else if (isDisposition) {
        const dispInput: LotDisposalInput = {
          walletId: input.walletId!,
          assetSymbol: input.assetSymbol!,
          quantity: input.quantity!,
          proceedsUsd: input.disposalProceedsUsd ?? null,
          disposalDate: txDate,
        };
        await fifoMatchDisposition(tx, pos.id, dispInput);
      }
    }

    return pos;
  });

  return position;
}
