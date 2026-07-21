/**
 * Lot Inventory — FIFO matching algorithm (Rev. Proc. 2024-28).
 *
 * Acquisition events create a lot; disposition events consume open lots
 * FIFO (oldest-first) within the same wallet + asset.  Partial disposals
 * leave the oldest lot in "partial" status with the remaining quantity.
 *
 * Both functions accept a Drizzle transaction object so callers can wrap
 * the position insert + lot mutation in a single atomic DB transaction.
 */

import { eq, and, asc, inArray } from "drizzle-orm";
import { db, lotsTable, positionRecordsTable } from "@workspace/db";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type * as schema from "@workspace/db";

type Tx = NodePgDatabase<typeof schema>;

/** Fields needed to auto-create a lot from an acquisition event. */
export interface LotAcquisitionInput {
  walletId: string;
  assetSymbol: string;
  assetIdentifier?: string | null;
  chainId?: string | null;
  quantity: number;
  costBasisUsd?: number | null;
  costBasisPerUnitUsd?: number | null;
  acquisitionDate: Date;
  acquisitionTxId?: string | null;
}

/** Fields needed to FIFO-match a disposition event against open lots. */
export interface LotDisposalInput {
  walletId: string;
  assetSymbol: string;
  quantity: number;
  proceedsUsd?: number | null;   // gross proceeds for the whole disposal
  disposalDate: Date;
}

export interface FifoResult {
  lotsMatched: number;
  totalRealizedGainLossUsd: number | null;
}

/**
 * ACQUISITION — insert a new lot record linked to the given position.
 *
 * Called inside the same DB transaction as the position insert.
 */
export async function autoCreateLot(
  tx: Tx,
  positionId: string,
  input: LotAcquisitionInput,
): Promise<typeof lotsTable.$inferSelect> {
  let perUnit = input.costBasisPerUnitUsd ?? null;
  let total = input.costBasisUsd ?? null;
  if (total != null && perUnit == null && input.quantity > 0) perUnit = total / input.quantity;
  if (perUnit != null && total == null) total = perUnit * input.quantity;

  const [lot] = await tx
    .insert(lotsTable)
    .values({
      positionRecordId: positionId,
      walletId: input.walletId,
      assetSymbol: input.assetSymbol.toUpperCase(),
      assetIdentifier: input.assetIdentifier ?? null,
      chainId: input.chainId ?? null,
      quantity: input.quantity,
      costBasisUsd: total,
      costBasisPerUnitUsd: perUnit,
      acquisitionDate: input.acquisitionDate,
      acquisitionTxId: input.acquisitionTxId ?? null,
      status: "open",
    })
    .returning();

  return lot;
}

/**
 * DISPOSITION — FIFO-match open lots and record realized gain/loss.
 *
 * Walks open lots for walletId + assetSymbol in acquisition-date order
 * (oldest first) and closes or partially closes each one until the
 * disposal quantity is consumed.
 *
 * Returns the number of lots touched and the total realized gain/loss USD
 * (null when no cost basis data is available).
 *
 * Called inside the same DB transaction as the position insert.
 */
export async function fifoMatchDisposition(
  tx: Tx,
  positionId: string,
  input: LotDisposalInput,
): Promise<FifoResult> {
  if (input.quantity <= 0) return { lotsMatched: 0, totalRealizedGainLossUsd: null };

  // Fetch open lots for this wallet+asset, oldest first.
  const openLots = await tx
    .select()
    .from(lotsTable)
    .where(
      and(
        eq(lotsTable.walletId, input.walletId),
        eq(lotsTable.assetSymbol, input.assetSymbol.toUpperCase()),
        inArray(lotsTable.status, ["open", "partial"]),
      ),
    )
    .orderBy(asc(lotsTable.acquisitionDate));

  let remainingQty = input.quantity;
  let totalGainLoss: number | null = null;
  let lotsMatched = 0;

  // proceedsPerUnit lets us allocate proceeds proportionally to each lot.
  const proceedsPerUnit =
    input.proceedsUsd != null && input.quantity > 0
      ? input.proceedsUsd / input.quantity
      : null;

  for (const lot of openLots) {
    if (remainingQty <= 0) break;

    const lotQty = lot.quantity;
    const consumedQty = Math.min(lotQty, remainingQty);
    remainingQty -= consumedQty;

    // Proceeds allocated to this lot (proportional to consumed quantity).
    const lotProceeds = proceedsPerUnit != null ? proceedsPerUnit * consumedQty : null;

    // Cost basis allocated to this lot (proportional to consumed quantity).
    const lotBasis =
      lot.costBasisPerUnitUsd != null ? lot.costBasisPerUnitUsd * consumedQty : null;

    const lotGainLoss =
      lotProceeds != null && lotBasis != null ? lotProceeds - lotBasis : null;

    if (lotGainLoss != null) {
      totalGainLoss = (totalGainLoss ?? 0) + lotGainLoss;
    }

    const isFullyClosed = remainingQty >= 0 && consumedQty >= lotQty - 1e-10;

    await tx
      .update(lotsTable)
      .set({
        status: isFullyClosed ? "closed" : "partial",
        quantity: isFullyClosed ? lot.quantity : lotQty - consumedQty,
        disposalPositionId: positionId,
        disposalDate: input.disposalDate,
        disposalProceedsUsd: lotProceeds,
        realizedGainLossUsd: lotGainLoss,
      })
      .where(eq(lotsTable.id, lot.id));

    lotsMatched++;
  }

  return { lotsMatched, totalRealizedGainLossUsd: totalGainLoss };
}

/**
 * Event-type classification helpers.
 *
 * These lists deliberately mirror the classifications used by the DeFi
 * adapters and the Coinbase/Kraken/Gemini mappers so the lot service
 * doesn't need separate configuration.
 */
export const ACQUISITION_EVENT_TYPES = new Set([
  "receive",
  "buy",
  "purchase",
  "staking_reward",
  "mining_reward",
  "airdrop",
  "fork_receipt",
  "defi_lp_acquisition",
  "defi_interest",
  "defi_borrow",
  "defi_collateral_deposit",
]);

export const DISPOSITION_EVENT_TYPES = new Set([
  "send",
  "sell",
  "taxable_disposition",
  "staking_withdrawal",
  "defi_lp_disposition",
  "defi_repay",
  "defi_collateral_withdrawal",
  "gift_out",
]);
