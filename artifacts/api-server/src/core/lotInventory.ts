/**
 * Pure lot-inventory math. No database.
 *
 * Remaining-basis identity: when per-unit is known,
 *   costBasisUsd === costBasisPerUnitUsd × quantity
 *
 * FIFO is the default consumption order (Treas. Reg. §1.1012-1(j)).
 * A contemporaneous specific-identification record (identified_at ≤ sale)
 * takes those lots first. Ranked HIFO/LIFO/min-tax is not an identification.
 */

export interface LotBasisSlice {
  id?: string;
  quantity: number;
  costBasisUsd: number | null;
  costBasisPerUnitUsd: number | null;
}

export interface IdentificationSlice {
  id: string;
  lotId: string;
  quantity: number;
  identifiedAt: Date;
}

export interface ConsumptionUpdate {
  index: number;
  status: "closed" | "partial";
  remainingQuantity: number;
  remainingCostBasisUsd: number | null;
  consumedQty: number;
  lotProceeds: number | null;
  lotBasis: number | null;
  lotGainLoss: number | null;
  viaIdentification: boolean;
}

export interface ConsumptionPlan {
  lotsMatched: number;
  totalGainLoss: number | null;
  unfilledQty: number;
  updates: ConsumptionUpdate[];
  identifiedLotsConsumed: number;
  lateIdentificationsIgnored: number;
}

export function remainingCostBasisUsd(lot: LotBasisSlice): number | null {
  if (lot.costBasisPerUnitUsd != null) {
    return lot.costBasisPerUnitUsd * lot.quantity;
  }
  return lot.costBasisUsd;
}

function isLotClosedAfterTake(lotQty: number, consumedQty: number): boolean {
  return consumedQty >= lotQty - 1e-10;
}

/**
 * Pure consumption planner. `lots` must already be in FIFO order (oldest first).
 * Identifications dated on or before the disposal take those lots first;
 * identifications dated after the sale are ignored (they would not survive exam).
 */
export function planLotConsumption(
  lots: LotBasisSlice[],
  disposalQty: number,
  proceedsPerUnit: number | null,
  identifications: IdentificationSlice[] = [],
  disposalDate: Date = new Date(),
): ConsumptionPlan {
  const lateIdentificationsIgnored = identifications.filter(
    (i) => i.identifiedAt.getTime() > disposalDate.getTime(),
  ).length;

  if (disposalQty <= 0 || lots.length === 0) {
    return {
      lotsMatched: 0,
      totalGainLoss: null,
      unfilledQty: Math.max(0, disposalQty),
      updates: [],
      identifiedLotsConsumed: 0,
      lateIdentificationsIgnored,
    };
  }

  const validIds = identifications.filter((i) => i.identifiedAt.getTime() <= disposalDate.getTime());
  const identifiedOrder: LotBasisSlice[] = [];
  const seen = new Set<string>();
  for (const ident of validIds) {
    const lot = lots.find((l) => l.id === ident.lotId);
    if (!lot || seen.has(ident.lotId)) continue;
    identifiedOrder.push(lot);
    seen.add(ident.lotId);
  }
  const rest = lots.filter((l) => !l.id || !seen.has(l.id));
  const ordered = [...identifiedOrder, ...rest];

  let remainingQty = disposalQty;
  let totalGainLoss: number | null = null;
  const updates: ConsumptionUpdate[] = [];
  let identifiedLotsConsumed = 0;

  for (const lot of ordered) {
    if (remainingQty <= 0) break;
    const lotQty = lot.quantity;
    if (lotQty <= 0) continue;

    const consumedQty = Math.min(lotQty, remainingQty);
    remainingQty -= consumedQty;
    const viaIdentification = Boolean(lot.id && seen.has(lot.id));
    if (viaIdentification) identifiedLotsConsumed++;

    const lotProceeds = proceedsPerUnit != null ? proceedsPerUnit * consumedQty : null;
    const lotBasis =
      lot.costBasisPerUnitUsd != null ? lot.costBasisPerUnitUsd * consumedQty : null;
    const lotGainLoss =
      lotProceeds != null && lotBasis != null ? lotProceeds - lotBasis : null;
    if (lotGainLoss != null) {
      totalGainLoss = (totalGainLoss ?? 0) + lotGainLoss;
    }

    const fullyClosed = isLotClosedAfterTake(lotQty, consumedQty);
    const remainingQuantity = fullyClosed ? lotQty : lotQty - consumedQty;
    const remainingCost = remainingCostBasisUsd({
      quantity: remainingQuantity,
      costBasisUsd: lot.costBasisUsd,
      costBasisPerUnitUsd: lot.costBasisPerUnitUsd,
    });

    updates.push({
      index: lots.indexOf(lot),
      status: fullyClosed ? "closed" : "partial",
      remainingQuantity,
      remainingCostBasisUsd: remainingCost,
      consumedQty,
      lotProceeds,
      lotBasis,
      lotGainLoss,
      viaIdentification,
    });
  }

  return {
    lotsMatched: updates.length,
    totalGainLoss,
    unfilledQty: remainingQty,
    updates,
    identifiedLotsConsumed,
    lateIdentificationsIgnored,
  };
}

/**
 * defi_borrow is not an acquisition: borrowed coins are generally loan
 * proceeds, not a purchased lot. gift_out is not an ordinary FIFO disposal
 * with proceeds: gifts are §1015, not §1001. Both stay on the Evidence Log;
 * they do not touch inventory until they have their own Code path.
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
]);

export const DEFERRED_LOT_EVENT_TYPES: Record<string, string> = {
  defi_borrow: "Loan proceeds are not a purchased lot. Do not invent basis.",
  gift_out: "Gifts are IRC §1015, not a §1001 proceeds disposal.",
  gift_in: "Gifts received take the donor's basis under §1015 — not auto-created here.",
};
