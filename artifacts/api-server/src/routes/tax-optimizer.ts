/**
 * Tier 3 — Tax Optimizer routes.
 *
 * GET  /tax-optimizer/simulate      — what-if sale simulation (all 4 strategies)
 * GET  /tax-optimizer/harvest       — ranked unrealized-loss harvest candidates
 * POST /tax-optimizer/estate-step-up — IRC §1014 basis step-up at date-of-death
 *
 * All HTTP responses use snake_case keys.
 * Core algorithm types (camelCase) are serialized via the helpers below before
 * being sent — this keeps the pure-function domain model clean while
 * guaranteeing a consistent API contract.
 */

import { Router, type IRouter } from "express";
import { eq, and, inArray } from "drizzle-orm";
import { db, lotsTable } from "@workspace/db";
import { z } from "zod";
import { getBatchPrices, getHistoricalBatchPrices } from "../core/priceOracle.js";
import {
  simulateSale,
  compareStrategies,
  harvestRecommendations,
  estateStepUp,
  STRATEGIES,
  type LotInput,
  type ConsumedLot,
  type SimulationResult,
  type StrategyComparison,
  type HarvestRecommendation,
  type StepUpLot,
  type EstateStepUpResult,
} from "../core/taxOptimizer.js";

const router: IRouter = Router();

// ── DB → core mapper ──────────────────────────────────────────────────────────

/** Map a DB lot row to the pure-function LotInput shape. */
function toLotInput(row: typeof lotsTable.$inferSelect): LotInput {
  return {
    id: row.id,
    walletId: row.walletId,
    assetSymbol: row.assetSymbol,
    quantity: Number(row.quantity),
    costBasisUsd: row.costBasisUsd != null ? Number(row.costBasisUsd) : null,
    costBasisPerUnitUsd:
      row.costBasisPerUnitUsd != null ? Number(row.costBasisPerUnitUsd) : null,
    acquisitionDate: row.acquisitionDate,
    status: row.status as LotInput["status"],
  };
}

// ── Response serializers (camelCase core → snake_case HTTP) ───────────────────

/** Exported for contract tests — mirrors the actual HTTP serialization. */
export function serializeConsumedLot(c: ConsumedLot) {
  return {
    lot_id: c.lotId,
    quantity_consumed: c.quantityConsumed,
    cost_basis_usd: c.costBasisUsd,
    proceeds_usd: c.proceedsUsd,
    gain_loss_usd: c.gainLossUsd,
    holding_days: c.holdingDays,
    holding_period: c.holdingPeriod,
  };
}

export function serializeSimulation(r: SimulationResult) {
  return {
    asset_symbol: r.assetSymbol,
    quantity_requested: r.quantityRequested,
    quantity_available: r.quantityAvailable,
    quantity_fillable: r.quantityFillable,
    current_price_usd: r.currentPriceUsd,
    strategy: r.strategy,
    lots_consumed: r.lotsConsumed.map(serializeConsumedLot),
    total_proceeds_usd: r.totalProceedsUsd,
    total_cost_basis_usd: r.totalCostBasisUsd,
    short_term_gain_usd: r.shortTermGainUsd,
    long_term_gain_usd: r.longTermGainUsd,
    total_gain_usd: r.totalGainUsd,
    warning: r.warning,
  };
}

export function serializeStrategyComparison(r: StrategyComparison) {
  return {
    strategy: r.strategy,
    total_gain_usd: r.totalGainUsd,
    short_term_gain_usd: r.shortTermGainUsd,
    long_term_gain_usd: r.longTermGainUsd,
    total_proceeds_usd: r.totalProceedsUsd,
  };
}

export function serializeHarvestRecommendation(r: HarvestRecommendation) {
  return {
    lot_id: r.lotId,
    wallet_id: r.walletId,
    asset_symbol: r.assetSymbol,
    quantity: r.quantity,
    cost_basis_usd: r.costBasisUsd,
    cost_basis_per_unit_usd: r.costBasisPerUnitUsd,
    current_price_usd: r.currentPriceUsd,
    current_value_usd: r.currentValueUsd,
    unrealized_loss_usd: r.unrealizedLossUsd,
    holding_days: r.holdingDays,
    holding_period: r.holdingPeriod,
    proceeds_if_sold_usd: r.proceedsIfSoldUsd,
    wash_sale_risk: r.washSaleRisk,
  };
}

export function serializeStepUpLot(l: StepUpLot) {
  return {
    lot_id: l.lotId,
    asset_symbol: l.assetSymbol,
    quantity: l.quantity,
    original_cost_basis_usd: l.originalCostBasisUsd,
    original_cost_basis_per_unit_usd: l.originalCostBasisPerUnitUsd,
    step_up_price_usd: l.stepUpPriceUsd,
    stepped_up_cost_basis_usd: l.steppedUpCostBasisUsd,
    stepped_up_cost_basis_per_unit_usd: l.steppedUpCostBasisPerUnitUsd,
    gain_eliminated_usd: l.gainEliminatedUsd,
  };
}

export function serializeEstateStepUpResult(
  r: EstateStepUpResult,
  extras: {
    generated_at: string;
    price_source: string;
    unavailable_prices?: string[];
    disclaimer: string;
  },
) {
  return {
    generated_at: extras.generated_at,
    step_up_date: r.stepUpDate,
    wallet_id: r.walletId,
    lots: r.lots.map(serializeStepUpLot),
    total_original_basis_usd: r.totalOriginalBasisUsd,
    total_stepped_up_basis_usd: r.totalSteppedUpBasisUsd,
    total_gain_eliminated_usd: r.totalGainEliminatedUsd,
    price_source: extras.price_source,
    ...(extras.unavailable_prices ? { unavailable_prices: extras.unavailable_prices } : {}),
    disclaimer: extras.disclaimer,
  };
}

// ── GET /tax-optimizer/simulate ───────────────────────────────────────────────

const SimulateQuery = z.object({
  asset_symbol: z.string().min(1),
  quantity: z.coerce.number().positive(),
  strategy: z.enum(STRATEGIES).optional(),
  wallet_id: z.string().optional(),
});

router.get("/tax-optimizer/simulate", async (req, res): Promise<void> => {
  const parsed = SimulateQuery.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { asset_symbol, quantity, strategy, wallet_id } = parsed.data;
  const symbol = asset_symbol.toUpperCase();

  // Load all open/partial lots for this asset (optionally scoped to wallet)
  const conditions = [
    eq(lotsTable.assetSymbol, symbol),
    inArray(lotsTable.status, ["open", "partial"]),
  ];
  if (wallet_id) conditions.push(eq(lotsTable.walletId, wallet_id));

  const rows = await db
    .select()
    .from(lotsTable)
    .where(and(...conditions));

  const lots = rows.map(toLotInput);

  if (lots.length === 0) {
    res.status(404).json({
      error: `No open lots found for ${symbol}${wallet_id ? ` in wallet ${wallet_id}` : ""}`,
    });
    return;
  }

  const prices = await getBatchPrices([symbol]);
  const currentPriceUsd = prices[symbol] ?? null;

  if (currentPriceUsd == null) {
    res.status(502).json({
      error: `Could not fetch current price for ${symbol}. Price oracle unavailable.`,
    });
    return;
  }

  const now = new Date();
  const disclaimer =
    "This simulation is illustrative only and does not constitute tax advice. Consult a qualified tax professional before executing any transaction.";

  if (strategy) {
    // Single-strategy simulation
    const result = simulateSale(lots, quantity, currentPriceUsd, strategy, now);
    res.json({
      generated_at: now.toISOString(),
      simulation: serializeSimulation(result),
      disclaimer,
    });
  } else {
    // Return all 4 strategies ranked
    const comparison = compareStrategies(lots, quantity, currentPriceUsd, now);
    const simulations = STRATEGIES.map((s) =>
      simulateSale(lots, quantity, currentPriceUsd, s, now),
    );
    res.json({
      generated_at: now.toISOString(),
      asset_symbol: symbol,
      quantity_requested: quantity,
      current_price_usd: currentPriceUsd,
      ranked_strategies: comparison.map(serializeStrategyComparison),
      simulations: simulations.map(serializeSimulation),
      disclaimer,
    });
  }
});

// ── GET /tax-optimizer/harvest ────────────────────────────────────────────────

const HarvestQuery = z.object({
  wallet_id: z.string().optional(),
  min_loss_usd: z.coerce.number().min(0).default(0),
});

router.get("/tax-optimizer/harvest", async (req, res): Promise<void> => {
  const parsed = HarvestQuery.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { wallet_id, min_loss_usd } = parsed.data;

  const conditions = [inArray(lotsTable.status, ["open", "partial"])];
  if (wallet_id) conditions.push(eq(lotsTable.walletId, wallet_id));

  const rows = await db
    .select()
    .from(lotsTable)
    .where(and(...conditions));

  const lots = rows.map(toLotInput);
  const symbols = [...new Set(lots.map((l) => l.assetSymbol))];
  const prices = symbols.length > 0 ? await getBatchPrices(symbols) : {};

  const now = new Date();
  const recommendations = harvestRecommendations(lots, prices, min_loss_usd, now);

  const totalUnrealizedLossUsd = recommendations.reduce(
    (sum, r) => sum + r.unrealizedLossUsd,
    0,
  );

  res.json({
    generated_at: now.toISOString(),
    wallet_id: wallet_id ?? null,
    min_loss_usd_filter: min_loss_usd,
    total_candidates: recommendations.length,
    wash_sale_risk_count: recommendations.filter((r) => r.washSaleRisk).length,
    total_unrealized_loss_usd: totalUnrealizedLossUsd,
    candidates: recommendations.map(serializeHarvestRecommendation),
    disclaimer:
      "IRC §1091 wash-sale rules apply to stocks and securities. The IRS has not officially extended them to cryptocurrency. Wash-sale risk flags are conservative practitioner markers, not legal determinations.",
  });
});

// ── POST /tax-optimizer/estate-step-up ───────────────────────────────────────

const EstateStepUpBody = z.object({
  wallet_id: z.string().min(1),
  step_up_date: z.string().datetime({ message: "step_up_date must be an ISO 8601 datetime string" }),
  asset_symbols: z.array(z.string().min(1)).optional(),
});

router.post("/tax-optimizer/estate-step-up", async (req, res): Promise<void> => {
  const parsed = EstateStepUpBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { wallet_id, step_up_date, asset_symbols } = parsed.data;
  const stepUpDate = new Date(step_up_date);

  const conditions = [
    eq(lotsTable.walletId, wallet_id),
    inArray(lotsTable.status, ["open", "partial"]),
  ];
  if (asset_symbols && asset_symbols.length > 0) {
    conditions.push(
      inArray(
        lotsTable.assetSymbol,
        asset_symbols.map((s) => s.toUpperCase()),
      ),
    );
  }

  const rows = await db
    .select()
    .from(lotsTable)
    .where(and(...conditions));

  const lots = rows.map(toLotInput);
  const symbols = [...new Set(lots.map((l) => l.assetSymbol))];

  const disclaimer =
    "IRC §1014 step-up in basis applies to inherited assets. FMV at date-of-death must be substantiated with qualified appraisal or contemporaneous market data. This calculation is illustrative only. Consult a qualified estate tax attorney before making any filings.";

  if (symbols.length === 0) {
    res.json({
      generated_at: new Date().toISOString(),
      step_up_date: stepUpDate.toISOString(),
      wallet_id,
      lots: [],
      total_original_basis_usd: null,
      total_stepped_up_basis_usd: null,
      total_gain_eliminated_usd: null,
      price_source: "coingecko_historical",
      disclaimer,
    });
    return;
  }

  // Fetch historical prices at the step-up date
  const prices = await getHistoricalBatchPrices(symbols, stepUpDate);
  const result = estateStepUp(lots, wallet_id, stepUpDate, prices);

  const pricesWithNulls = Object.entries(prices)
    .filter(([, v]) => v == null)
    .map(([k]) => k);

  res.json(
    serializeEstateStepUpResult(result, {
      generated_at: new Date().toISOString(),
      price_source: "coingecko_historical",
      unavailable_prices: pricesWithNulls.length > 0 ? pricesWithNulls : undefined,
      disclaimer,
    }),
  );
});

export default router;
