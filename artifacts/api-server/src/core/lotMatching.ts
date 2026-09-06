/**
 * Lot Inventory write path — FIFO matching (Rev. Proc. 2024-28).
 *
 * Pure math lives in lotInventory.ts so unit tests do not need a database.
 * This module applies the plan inside a Drizzle transaction.
 *
 * The tax optimizer is a simulator. It does not call these write functions,
 * and this module never reads optimizer rankings.
 */

import { eq, and, asc, inArray, isNull, lte } from "drizzle-orm";
import { db, lotsTable, lotIdentificationsTable } from "@workspace/db";
import { planLotConsumption } from "./lotInventory.js";

export {
  remainingCostBasisUsd,
  planLotConsumption,
  ACQUISITION_EVENT_TYPES,
  DISPOSITION_EVENT_TYPES,
  DEFERRED_LOT_EVENT_TYPES,
} from "./lotInventory.js";
export type {
  LotBasisSlice,
  IdentificationSlice,
  ConsumptionUpdate,
  ConsumptionPlan,
} from "./lotInventory.js";

type Tx = Parameters<Parameters<typeof db["transaction"]>[0]>[0];

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

export interface LotDisposalInput {
  walletId: string;
  assetSymbol: string;
  quantity: number;
  proceedsUsd?: number | null;
  disposalDate: Date;
}

export interface FifoResult {
  lotsMatched: number;
  totalRealizedGainLossUsd: number | null;
  identifiedLotsConsumed: number;
  lateIdentificationsIgnored: number;
}

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
 * Default: FIFO (oldest first) per wallet + asset.
 * If a contemporaneous specific-identification record exists (identified_at
 * ≤ disposal date, unconsumed), those lots are taken first.
 */
export async function fifoMatchDisposition(
  tx: Tx,
  positionId: string,
  input: LotDisposalInput,
): Promise<FifoResult> {
  if (input.quantity <= 0) {
    return { lotsMatched: 0, totalRealizedGainLossUsd: null, identifiedLotsConsumed: 0, lateIdentificationsIgnored: 0 };
  }

  const symbol = input.assetSymbol.toUpperCase();

  const openLots = await tx
    .select()
    .from(lotsTable)
    .where(
      and(
        eq(lotsTable.walletId, input.walletId),
        eq(lotsTable.assetSymbol, symbol),
        inArray(lotsTable.status, ["open", "partial"]),
      ),
    )
    .orderBy(asc(lotsTable.acquisitionDate));

  const identRows = await tx
    .select()
    .from(lotIdentificationsTable)
    .where(
      and(
        eq(lotIdentificationsTable.walletId, input.walletId),
        eq(lotIdentificationsTable.assetSymbol, symbol),
        isNull(lotIdentificationsTable.consumedAt),
      ),
    )
    .orderBy(asc(lotIdentificationsTable.identifiedAt));

  const proceedsPerUnit =
    input.proceedsUsd != null && input.quantity > 0
      ? input.proceedsUsd / input.quantity
      : null;

  const plan = planLotConsumption(
    openLots.map((lot) => ({
      id: lot.id,
      quantity: lot.quantity,
      costBasisUsd: lot.costBasisUsd,
      costBasisPerUnitUsd: lot.costBasisPerUnitUsd,
    })),
    input.quantity,
    proceedsPerUnit,
    identRows.map((row) => ({
      id: row.id,
      lotId: row.lotId,
      quantity: row.quantity,
      identifiedAt: row.identifiedAt,
    })),
    input.disposalDate,
  );

  for (const update of plan.updates) {
    const lot = openLots[update.index];
    if (!lot) continue;

    await tx
      .update(lotsTable)
      .set({
        status: update.status,
        quantity: update.remainingQuantity,
        costBasisUsd: update.remainingCostBasisUsd,
        disposalPositionId: positionId,
        disposalDate: input.disposalDate,
        disposalProceedsUsd: update.lotProceeds,
        realizedGainLossUsd: update.lotGainLoss,
      })
      .where(eq(lotsTable.id, lot.id));

    if (update.viaIdentification) {
      await tx
        .update(lotIdentificationsTable)
        .set({
          consumedAt: input.disposalDate,
          disposalPositionId: positionId,
        })
        .where(
          and(
            eq(lotIdentificationsTable.lotId, lot.id),
            isNull(lotIdentificationsTable.consumedAt),
            lte(lotIdentificationsTable.identifiedAt, input.disposalDate),
          ),
        );
    }
  }

  return {
    lotsMatched: plan.lotsMatched,
    totalRealizedGainLossUsd: plan.totalGainLoss,
    identifiedLotsConsumed: plan.identifiedLotsConsumed,
    lateIdentificationsIgnored: plan.lateIdentificationsIgnored,
  };
}
