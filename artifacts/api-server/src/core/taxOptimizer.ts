/**
 * Tier 3 — Tax Optimizer core algorithms.
 *
 * All functions are pure (no DB calls) so they can be tested in isolation.
 * The route layer fetches lots + prices and feeds them in.
 *
 * Lot-selection strategies:
 *  - fifo     : First In, First Out (IRS default for most taxpayers)
 *  - lifo     : Last In, First Out
 *  - hifo     : Highest Cost First (maximises basis consumed → minimises gain)
 *  - min_tax  : Minimise short-term gains: sell long-term lots first (HIFO
 *               within long-term), then short-term (HIFO within short-term)
 */

export const LONG_TERM_DAYS = 365;
export const STRATEGIES = ["fifo", "lifo", "hifo", "min_tax"] as const;
export type Strategy = (typeof STRATEGIES)[number];

// ── Shared types ──────────────────────────────────────────────────────────────

export interface LotInput {
  id: string;
  walletId: string;
  assetSymbol: string;
  quantity: number;
  costBasisUsd: number | null;
  costBasisPerUnitUsd: number | null;
  acquisitionDate: Date;
  status: "open" | "partial" | "closed";
}

// ── simulateSale ─────────────────────────────────────────────────────────────

export interface ConsumedLot {
  lotId: string;
  quantityConsumed: number;
  costBasisUsd: number | null;
  proceedsUsd: number;
  gainLossUsd: number | null;
  holdingDays: number;
  holdingPeriod: "short_term" | "long_term";
}

export interface SimulationResult {
  assetSymbol: string;
  quantityRequested: number;
  quantityAvailable: number;
  quantityFillable: number;
  currentPriceUsd: number;
  strategy: Strategy;
  lotsConsumed: ConsumedLot[];
  totalProceedsUsd: number;
  totalCostBasisUsd: number | null;
  shortTermGainUsd: number | null;
  longTermGainUsd: number | null;
  totalGainUsd: number | null;
  warning: string | null;
}

function holdingDays(acquisitionDate: Date, now: Date): number {
  return Math.floor((now.getTime() - acquisitionDate.getTime()) / 86_400_000);
}

function sortLots(lots: LotInput[], strategy: Strategy, now: Date): LotInput[] {
  const copy = [...lots];
  switch (strategy) {
    case "fifo":
      return copy.sort((a, b) => a.acquisitionDate.getTime() - b.acquisitionDate.getTime());
    case "lifo":
      return copy.sort((a, b) => b.acquisitionDate.getTime() - a.acquisitionDate.getTime());
    case "hifo":
      return copy.sort((a, b) => (b.costBasisPerUnitUsd ?? 0) - (a.costBasisPerUnitUsd ?? 0));
    case "min_tax": {
      // Long-term lots first (HIFO within), then short-term (HIFO within)
      const isLong = (l: LotInput) => holdingDays(l.acquisitionDate, now) > LONG_TERM_DAYS;
      return copy.sort((a, b) => {
        const aLong = isLong(a) ? 0 : 1;
        const bLong = isLong(b) ? 0 : 1;
        if (aLong !== bLong) return aLong - bLong;
        return (b.costBasisPerUnitUsd ?? 0) - (a.costBasisPerUnitUsd ?? 0);
      });
    }
  }
}

export function simulateSale(
  lots: LotInput[],
  quantityToSell: number,
  currentPriceUsd: number,
  strategy: Strategy,
  now: Date = new Date(),
): SimulationResult {
  const assetSymbol = lots[0]?.assetSymbol ?? "";
  const openLots = lots.filter((l) => l.status === "open" || l.status === "partial");
  const totalAvailable = openLots.reduce((s, l) => s + l.quantity, 0);
  const quantityFillable = Math.min(quantityToSell, totalAvailable);

  const sorted = sortLots(openLots, strategy, now);
  const consumed: ConsumedLot[] = [];
  let remaining = quantityFillable;

  for (const lot of sorted) {
    if (remaining <= 0) break;
    const take = Math.min(remaining, lot.quantity);
    const days = holdingDays(lot.acquisitionDate, now);
    const period: "short_term" | "long_term" = days > LONG_TERM_DAYS ? "long_term" : "short_term";
    const proceedsUsd = take * currentPriceUsd;
    const basisUsd = lot.costBasisPerUnitUsd != null ? take * lot.costBasisPerUnitUsd : null;
    consumed.push({
      lotId: lot.id,
      quantityConsumed: take,
      costBasisUsd: basisUsd,
      proceedsUsd,
      gainLossUsd: basisUsd != null ? proceedsUsd - basisUsd : null,
      holdingDays: days,
      holdingPeriod: period,
    });
    remaining -= take;
  }

  const totalProceedsUsd = consumed.reduce((s, c) => s + c.proceedsUsd, 0);

  let totalCostBasisUsd: number | null = null;
  let shortTermGainUsd: number | null = null;
  let longTermGainUsd: number | null = null;

  for (const c of consumed) {
    if (c.costBasisUsd != null) {
      totalCostBasisUsd = (totalCostBasisUsd ?? 0) + c.costBasisUsd;
    }
    if (c.gainLossUsd != null) {
      if (c.holdingPeriod === "short_term") {
        shortTermGainUsd = (shortTermGainUsd ?? 0) + c.gainLossUsd;
      } else {
        longTermGainUsd = (longTermGainUsd ?? 0) + c.gainLossUsd;
      }
    }
  }

  const totalGainUsd =
    shortTermGainUsd != null || longTermGainUsd != null
      ? (shortTermGainUsd ?? 0) + (longTermGainUsd ?? 0)
      : null;

  return {
    assetSymbol,
    quantityRequested: quantityToSell,
    quantityAvailable: totalAvailable,
    quantityFillable,
    currentPriceUsd,
    strategy,
    lotsConsumed: consumed,
    totalProceedsUsd,
    totalCostBasisUsd,
    shortTermGainUsd,
    longTermGainUsd,
    totalGainUsd,
    warning:
      quantityFillable < quantityToSell
        ? `Only ${quantityFillable.toFixed(8)} of ${quantityToSell.toFixed(8)} ${assetSymbol} is available in open lots`
        : null,
  };
}

// ── compareStrategies ─────────────────────────────────────────────────────────

export interface StrategyComparison {
  strategy: Strategy;
  totalGainUsd: number | null;
  shortTermGainUsd: number | null;
  longTermGainUsd: number | null;
  totalProceedsUsd: number;
}

/**
 * Run simulateSale under all four strategies and return a ranked comparison
 * (lowest total gain first).
 */
export function compareStrategies(
  lots: LotInput[],
  quantityToSell: number,
  currentPriceUsd: number,
  now: Date = new Date(),
): StrategyComparison[] {
  return STRATEGIES
    .map((strategy): StrategyComparison => {
      const r = simulateSale(lots, quantityToSell, currentPriceUsd, strategy, now);
      return {
        strategy,
        totalGainUsd: r.totalGainUsd,
        shortTermGainUsd: r.shortTermGainUsd,
        longTermGainUsd: r.longTermGainUsd,
        totalProceedsUsd: r.totalProceedsUsd,
      };
    })
    .sort((a, b) => (a.totalGainUsd ?? 0) - (b.totalGainUsd ?? 0));
}

// ── harvestRecommendations ────────────────────────────────────────────────────

export interface HarvestRecommendation {
  lotId: string;
  walletId: string;
  assetSymbol: string;
  quantity: number;
  costBasisUsd: number | null;
  costBasisPerUnitUsd: number | null;
  currentPriceUsd: number;
  currentValueUsd: number;
  unrealizedLossUsd: number;
  holdingDays: number;
  holdingPeriod: "short_term" | "long_term";
  /** Proceeds if sold today at current price */
  proceedsIfSoldUsd: number;
  /**
   * Whether this lot is within the 30-day wash-sale window relative to any
   * OTHER lot acquisition of the same asset.  Only a conservative flag —
   * not a legal determination (IRS has not confirmed §1091 applies to crypto).
   */
  washSaleRisk: boolean;
}

/**
 * Find open lots with unrealized losses ranked by largest loss first.
 * `allLots` should be ALL open/partial lots for the wallet (used to compute
 * wash-sale risk across assets).
 * `prices` is a symbol → current USD price map.
 */
export function harvestRecommendations(
  allLots: LotInput[],
  prices: Record<string, number | null>,
  minLossUsd: number = 0,
  now: Date = new Date(),
): HarvestRecommendation[] {
  const openLots = allLots.filter((l) => l.status === "open" || l.status === "partial");

  // Build a map: assetSymbol → sorted acquisition dates (for wash-sale window)
  const acquisitionsBySymbol = new Map<string, Date[]>();
  for (const l of openLots) {
    const dates = acquisitionsBySymbol.get(l.assetSymbol) ?? [];
    dates.push(l.acquisitionDate);
    acquisitionsBySymbol.set(l.assetSymbol, dates);
  }

  const results: HarvestRecommendation[] = [];

  for (const lot of openLots) {
    const price = prices[lot.assetSymbol];
    if (price == null) continue;

    const currentValueUsd = price * lot.quantity;
    const gainLossUsd =
      lot.costBasisUsd != null ? currentValueUsd - lot.costBasisUsd : null;

    if (gainLossUsd == null || gainLossUsd >= 0) continue; // only losses
    const lossUsd = Math.abs(gainLossUsd);
    if (lossUsd < minLossUsd) continue;

    const days = holdingDays(lot.acquisitionDate, now);

    // Wash-sale risk: any OTHER lot of the same symbol acquired within ±30 days
    const WASH_DAYS = 30;
    const siblings = acquisitionsBySymbol.get(lot.assetSymbol) ?? [];
    const washSaleRisk = siblings.some((d) => {
      if (d.getTime() === lot.acquisitionDate.getTime()) return false;
      return Math.abs(d.getTime() - lot.acquisitionDate.getTime()) <= WASH_DAYS * 86_400_000;
    });

    results.push({
      lotId: lot.id,
      walletId: lot.walletId,
      assetSymbol: lot.assetSymbol,
      quantity: lot.quantity,
      costBasisUsd: lot.costBasisUsd,
      costBasisPerUnitUsd: lot.costBasisPerUnitUsd,
      currentPriceUsd: price,
      currentValueUsd,
      unrealizedLossUsd: lossUsd,
      holdingDays: days,
      holdingPeriod: days > LONG_TERM_DAYS ? "long_term" : "short_term",
      proceedsIfSoldUsd: currentValueUsd,
      washSaleRisk,
    });
  }

  // Rank: largest loss first
  return results.sort((a, b) => b.unrealizedLossUsd - a.unrealizedLossUsd);
}

// ── estateStepUp ──────────────────────────────────────────────────────────────

export interface StepUpLot {
  lotId: string;
  assetSymbol: string;
  quantity: number;
  originalCostBasisUsd: number | null;
  originalCostBasisPerUnitUsd: number | null;
  stepUpPriceUsd: number | null;
  steppedUpCostBasisUsd: number | null;
  steppedUpCostBasisPerUnitUsd: number | null;
  /** Positive = gain eliminated by step-up, negative = loss eliminated */
  gainEliminatedUsd: number | null;
}

export interface EstateStepUpResult {
  stepUpDate: string;
  walletId: string;
  lots: StepUpLot[];
  totalOriginalBasisUsd: number | null;
  totalSteppedUpBasisUsd: number | null;
  totalGainEliminatedUsd: number | null;
}

/**
 * Compute IRC §1014 step-up in basis for inherited lots.
 * `prices` is a symbol → FMV at date-of-death map (fetched by the caller
 * from the price oracle using historical data).
 */
export function estateStepUp(
  lots: LotInput[],
  walletId: string,
  stepUpDate: Date,
  prices: Record<string, number | null>,
): EstateStepUpResult {
  const openLots = lots.filter(
    (l) =>
      (l.status === "open" || l.status === "partial") &&
      l.acquisitionDate <= stepUpDate,
  );

  let totalOriginalBasisUsd: number | null = null;
  let totalSteppedUpBasisUsd: number | null = null;
  let totalGainEliminatedUsd: number | null = null;

  const stepUpLots: StepUpLot[] = openLots.map((lot) => {
    const stepUpPrice = prices[lot.assetSymbol] ?? null;
    const steppedUpPerUnit = stepUpPrice;
    const steppedUpTotal = steppedUpPerUnit != null ? steppedUpPerUnit * lot.quantity : null;
    const gainEliminated =
      steppedUpTotal != null && lot.costBasisUsd != null
        ? steppedUpTotal - lot.costBasisUsd
        : null;

    if (lot.costBasisUsd != null) {
      totalOriginalBasisUsd = (totalOriginalBasisUsd ?? 0) + lot.costBasisUsd;
    }
    if (steppedUpTotal != null) {
      totalSteppedUpBasisUsd = (totalSteppedUpBasisUsd ?? 0) + steppedUpTotal;
    }
    if (gainEliminated != null) {
      totalGainEliminatedUsd = (totalGainEliminatedUsd ?? 0) + gainEliminated;
    }

    return {
      lotId: lot.id,
      assetSymbol: lot.assetSymbol,
      quantity: lot.quantity,
      originalCostBasisUsd: lot.costBasisUsd,
      originalCostBasisPerUnitUsd: lot.costBasisPerUnitUsd,
      stepUpPriceUsd: stepUpPrice,
      steppedUpCostBasisUsd: steppedUpTotal,
      steppedUpCostBasisPerUnitUsd: steppedUpPerUnit,
      gainEliminatedUsd: gainEliminated,
    };
  });

  return {
    stepUpDate: stepUpDate.toISOString(),
    walletId,
    lots: stepUpLots,
    totalOriginalBasisUsd,
    totalSteppedUpBasisUsd,
    totalGainEliminatedUsd,
  };
}
