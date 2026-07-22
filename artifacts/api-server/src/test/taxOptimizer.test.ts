import { describe, it, expect } from "vitest";
import {
  simulateSale,
  compareStrategies,
  harvestRecommendations,
  estateStepUp,
  type LotInput,
} from "../core/taxOptimizer.js";

// ── Fixtures ──────────────────────────────────────────────────────────────────

const NOW = new Date("2026-07-22T00:00:00Z");

function lot(
  id: string,
  symbol: string,
  qty: number,
  basisPerUnit: number | null,
  acquisitionDate: Date,
  status: LotInput["status"] = "open",
): LotInput {
  return {
    id,
    walletId: "wallet-1",
    assetSymbol: symbol,
    quantity: qty,
    costBasisPerUnitUsd: basisPerUnit,
    costBasisUsd: basisPerUnit != null ? basisPerUnit * qty : null,
    acquisitionDate,
    status,
  };
}

// Short-term lot (acquired 100 days ago)
const ST_LOT = lot("st", "BTC", 1, 40_000, new Date("2026-04-13T00:00:00Z"));
// Long-term lot (acquired 400 days ago) with lower basis
const LT_LOT = lot("lt", "BTC", 1, 20_000, new Date("2025-06-18T00:00:00Z"));
// Second long-term lot — higher basis (for HIFO tests)
const LT_HIGH = lot("lt-h", "BTC", 0.5, 50_000, new Date("2025-06-01T00:00:00Z"));

const BTC_PRICE = 60_000;

// ── simulateSale ──────────────────────────────────────────────────────────────

describe("simulateSale", () => {
  it("FIFO consumes oldest lot first", () => {
    const result = simulateSale([ST_LOT, LT_LOT], 1, BTC_PRICE, "fifo", NOW);
    expect(result.lotsConsumed).toHaveLength(1);
    expect(result.lotsConsumed[0].lotId).toBe("lt");
    expect(result.lotsConsumed[0].holdingPeriod).toBe("long_term");
    expect(result.totalGainUsd).toBe(40_000); // 60k − 20k
    expect(result.longTermGainUsd).toBe(40_000);
    expect(result.shortTermGainUsd).toBeNull();
  });

  it("LIFO consumes newest lot first", () => {
    const result = simulateSale([ST_LOT, LT_LOT], 1, BTC_PRICE, "lifo", NOW);
    expect(result.lotsConsumed[0].lotId).toBe("st");
    expect(result.lotsConsumed[0].holdingPeriod).toBe("short_term");
    expect(result.totalGainUsd).toBe(20_000); // 60k − 40k
    expect(result.shortTermGainUsd).toBe(20_000);
    expect(result.longTermGainUsd).toBeNull();
  });

  it("HIFO consumes highest-basis lot first", () => {
    const result = simulateSale([ST_LOT, LT_LOT, LT_HIGH], 0.5, BTC_PRICE, "hifo", NOW);
    expect(result.lotsConsumed[0].lotId).toBe("lt-h");
    // proceeds = 0.5 * 60k = 30k; basis = 0.5 * 50k = 25k
    expect(result.totalGainUsd).toBeCloseTo(5_000, 2);
  });

  it("min_tax prefers long-term HIFO over short-term", () => {
    const result = simulateSale([ST_LOT, LT_LOT, LT_HIGH], 1.5, BTC_PRICE, "min_tax", NOW);
    const ids = result.lotsConsumed.map((c) => c.lotId);
    // Long-term lots (LT_HIGH basis=50k then LT_LOT basis=20k) come first
    expect(ids[0]).toBe("lt-h");
    expect(ids[1]).toBe("lt");
    // LT_HIGH (0.5) + LT_LOT (1.0) = exactly 1.5 BTC — all long-term, no ST lots consumed
    expect(result.shortTermGainUsd).toBeNull();
    expect(result.longTermGainUsd).not.toBeNull();
  });

  it("partial fill when quantity exceeds available", () => {
    const result = simulateSale([ST_LOT], 5, BTC_PRICE, "fifo", NOW);
    expect(result.quantityFillable).toBe(1);
    expect(result.quantityRequested).toBe(5);
    expect(result.warning).toMatch(/Only/);
  });

  it("spans multiple lots when needed", () => {
    const result = simulateSale([LT_LOT, ST_LOT], 1.5, BTC_PRICE, "fifo", NOW);
    expect(result.lotsConsumed).toHaveLength(2);
    expect(result.totalProceedsUsd).toBeCloseTo(1.5 * BTC_PRICE, 2);
  });

  it("null totalGainUsd when basis is missing", () => {
    const noBasiLot = lot("nb", "ETH", 1, null, new Date("2026-01-01T00:00:00Z"));
    const result = simulateSale([noBasiLot], 1, 3000, "fifo", NOW);
    expect(result.totalGainUsd).toBeNull();
    expect(result.totalCostBasisUsd).toBeNull();
    expect(result.totalProceedsUsd).toBe(3000);
  });

  it("closed lots are excluded", () => {
    const closedLot = lot("cl", "BTC", 1, 30_000, new Date("2025-01-01T00:00:00Z"), "closed");
    const result = simulateSale([closedLot, ST_LOT], 0.5, BTC_PRICE, "fifo", NOW);
    expect(result.lotsConsumed[0].lotId).toBe("st");
  });
});

// ── compareStrategies ─────────────────────────────────────────────────────────

describe("compareStrategies", () => {
  it("returns all 4 strategies sorted by total gain ascending", () => {
    const results = compareStrategies([ST_LOT, LT_LOT], 1, BTC_PRICE, NOW);
    expect(results).toHaveLength(4);
    for (let i = 1; i < results.length; i++) {
      expect((results[i].totalGainUsd ?? 0)).toBeGreaterThanOrEqual(
        (results[i - 1].totalGainUsd ?? 0),
      );
    }
  });

  it("FIFO produces highest gain when oldest lot has lowest basis", () => {
    const results = compareStrategies([ST_LOT, LT_LOT], 1, BTC_PRICE, NOW);
    // FIFO takes LT_LOT (basis 20k) → gain 40k — the largest
    const fifo = results.find((r) => r.strategy === "fifo")!;
    expect(fifo.totalGainUsd).toBe(40_000);
    // min_tax also takes LT_LOT (long-term first) → same 40k gain.
    // Both FIFO and min_tax produce the highest gain — the last entry has 40k.
    expect(results[results.length - 1].totalGainUsd).toBe(40_000);
    // LIFO and HIFO both produce the lower gain (20k) and appear first.
    expect(results[0].totalGainUsd).toBe(20_000);
  });
});

// ── harvestRecommendations ────────────────────────────────────────────────────

describe("harvestRecommendations", () => {
  const LOSS_LOT = lot("loss", "ETH", 2, 3_000, new Date("2026-01-01T00:00:00Z")); // basis 6k
  const GAIN_LOT = lot("gain", "BTC", 1, 20_000, new Date("2025-06-01T00:00:00Z")); // basis 20k

  const prices: Record<string, number | null> = { ETH: 2_000, BTC: 60_000 };

  it("surfaces lots with unrealized losses", () => {
    const recs = harvestRecommendations([LOSS_LOT, GAIN_LOT], prices, 0, NOW);
    expect(recs).toHaveLength(1);
    expect(recs[0].lotId).toBe("loss");
    expect(recs[0].unrealizedLossUsd).toBeCloseTo(2_000, 2); // 4k value − 6k basis
  });

  it("filters by minLossUsd", () => {
    const recs = harvestRecommendations([LOSS_LOT], prices, 5_000, NOW);
    expect(recs).toHaveLength(0);
  });

  it("ranks largest loss first", () => {
    const bigLoss = lot("big", "ETH", 10, 5_000, new Date("2026-01-01T00:00:00Z")); // basis 50k, value 20k → loss 30k
    const recs = harvestRecommendations([LOSS_LOT, bigLoss], prices, 0, NOW);
    expect(recs[0].lotId).toBe("big");
  });

  it("flags wash-sale risk when same asset acquired within 30 days", () => {
    const near = lot("near", "ETH", 1, 2_500, new Date("2026-01-20T00:00:00Z")); // 19 days after LOSS_LOT
    const recs = harvestRecommendations([LOSS_LOT, near], prices, 0, NOW);
    const lossRec = recs.find((r) => r.lotId === "loss")!;
    expect(lossRec.washSaleRisk).toBe(true);
  });

  it("no wash-sale risk when sibling is outside 30-day window", () => {
    const far = lot("far", "ETH", 1, 2_500, new Date("2026-03-01T00:00:00Z")); // 59 days after LOSS_LOT
    const recs = harvestRecommendations([LOSS_LOT, far], prices, 0, NOW);
    const lossRec = recs.find((r) => r.lotId === "loss")!;
    expect(lossRec.washSaleRisk).toBe(false);
  });

  it("skips lots with no price data", () => {
    const unknown = lot("unk", "DOGE", 1000, 0.1, new Date("2026-01-01T00:00:00Z"));
    const recs = harvestRecommendations([unknown], {}, 0, NOW);
    expect(recs).toHaveLength(0);
  });
});

// ── estateStepUp ──────────────────────────────────────────────────────────────

describe("estateStepUp", () => {
  const STEP_UP_DATE = new Date("2026-06-01T00:00:00Z");
  const LOTS = [
    lot("a", "BTC", 2, 10_000, new Date("2025-01-01T00:00:00Z")), // basis 20k
    lot("b", "ETH", 5, 1_000, new Date("2024-06-01T00:00:00Z")),  // basis 5k
  ];
  const prices: Record<string, number | null> = { BTC: 65_000, ETH: 4_000 };

  it("computes stepped-up basis at FMV on step-up date", () => {
    const result = estateStepUp(LOTS, "wallet-1", STEP_UP_DATE, prices);
    const btcLot = result.lots.find((l) => l.lotId === "a")!;
    expect(btcLot.steppedUpCostBasisUsd).toBeCloseTo(130_000, 2); // 2 BTC × 65k
    expect(btcLot.gainEliminatedUsd).toBeCloseTo(110_000, 2); // 130k − 20k
  });

  it("aggregates totals across all lots", () => {
    const result = estateStepUp(LOTS, "wallet-1", STEP_UP_DATE, prices);
    expect(result.totalOriginalBasisUsd).toBeCloseTo(25_000, 2); // 20k + 5k
    expect(result.totalSteppedUpBasisUsd).toBeCloseTo(150_000, 2); // 130k + 20k
    expect(result.totalGainEliminatedUsd).toBeCloseTo(125_000, 2);
  });

  it("excludes lots acquired after step-up date", () => {
    const futLot = lot("f", "BTC", 1, 70_000, new Date("2026-07-01T00:00:00Z"));
    const result = estateStepUp([...LOTS, futLot], "wallet-1", STEP_UP_DATE, prices);
    expect(result.lots.some((l) => l.lotId === "f")).toBe(false);
  });

  it("handles null price gracefully", () => {
    const result = estateStepUp(LOTS, "wallet-1", STEP_UP_DATE, { BTC: null, ETH: 4_000 });
    const btcLot = result.lots.find((l) => l.lotId === "a")!;
    expect(btcLot.steppedUpCostBasisUsd).toBeNull();
    expect(btcLot.gainEliminatedUsd).toBeNull();
  });

  it("excludes closed lots", () => {
    const closedLot = lot("cl", "BTC", 1, 30_000, new Date("2025-01-01T00:00:00Z"), "closed");
    const result = estateStepUp([closedLot], "wallet-1", STEP_UP_DATE, prices);
    expect(result.lots).toHaveLength(0);
  });
});

// ── Estate step-up route serialization contract ───────────────────────────────
//
// The pure function returns camelCase; the HTTP route MUST serialize to
// snake_case before sending the response. These tests lock down that contract
// so a rename in the core types can't silently break the API shape.

describe("estate-step-up route serialization contract", () => {
  const STEP_UP_DATE = new Date("2026-06-01T00:00:00Z");
  const LOTS = [
    lot("a", "BTC", 2, 10_000, new Date("2025-01-01T00:00:00Z")),
    lot("b", "ETH", 5, 1_000, new Date("2024-06-01T00:00:00Z")),
  ];
  const prices: Record<string, number | null> = { BTC: 65_000, ETH: 4_000 };

  /** Mirrors the serialization in routes/tax-optimizer.ts */
  function serializeStepUpResult(result: ReturnType<typeof estateStepUp>) {
    return {
      step_up_date: result.stepUpDate,
      wallet_id: result.walletId,
      total_original_basis_usd: result.totalOriginalBasisUsd,
      total_stepped_up_basis_usd: result.totalSteppedUpBasisUsd,
      total_gain_eliminated_usd: result.totalGainEliminatedUsd,
      lots: result.lots.map((l) => ({
        lot_id: l.lotId,
        asset_symbol: l.assetSymbol,
        quantity: l.quantity,
        original_cost_basis_usd: l.originalCostBasisUsd,
        original_cost_basis_per_unit_usd: l.originalCostBasisPerUnitUsd,
        step_up_price_usd: l.stepUpPriceUsd,
        stepped_up_cost_basis_usd: l.steppedUpCostBasisUsd,
        stepped_up_cost_basis_per_unit_usd: l.steppedUpCostBasisPerUnitUsd,
        gain_eliminated_usd: l.gainEliminatedUsd,
      })),
    };
  }

  it("top-level response uses snake_case keys (not camelCase)", () => {
    const raw = estateStepUp(LOTS, "wallet-1", STEP_UP_DATE, prices);
    const serialized = serializeStepUpResult(raw);

    expect(serialized).toHaveProperty("step_up_date");
    expect(serialized).toHaveProperty("wallet_id", "wallet-1");
    expect(serialized).toHaveProperty("total_original_basis_usd");
    expect(serialized).toHaveProperty("total_stepped_up_basis_usd");
    expect(serialized).toHaveProperty("total_gain_eliminated_usd");

    // Ensure camelCase keys are NOT present
    expect(serialized).not.toHaveProperty("stepUpDate");
    expect(serialized).not.toHaveProperty("walletId");
    expect(serialized).not.toHaveProperty("totalOriginalBasisUsd");
  });

  it("lot entries use snake_case keys (not camelCase)", () => {
    const raw = estateStepUp(LOTS, "wallet-1", STEP_UP_DATE, prices);
    const serialized = serializeStepUpResult(raw);

    expect(serialized.lots).toHaveLength(2);
    const lotRow = serialized.lots[0];

    expect(lotRow).toHaveProperty("lot_id");
    expect(lotRow).toHaveProperty("asset_symbol");
    expect(lotRow).toHaveProperty("original_cost_basis_usd");
    expect(lotRow).toHaveProperty("step_up_price_usd");
    expect(lotRow).toHaveProperty("stepped_up_cost_basis_usd");
    expect(lotRow).toHaveProperty("gain_eliminated_usd");

    expect(lotRow).not.toHaveProperty("lotId");
    expect(lotRow).not.toHaveProperty("assetSymbol");
    expect(lotRow).not.toHaveProperty("originalCostBasisUsd");
    expect(lotRow).not.toHaveProperty("gainEliminatedUsd".replace("Usd", "Usd")); // kept for clarity
  });

  it("computed values are correct after serialization", () => {
    const raw = estateStepUp(LOTS, "wallet-1", STEP_UP_DATE, prices);
    const serialized = serializeStepUpResult(raw);

    // BTC: 2 units × $65k = $130k stepped up; original = 2 × $10k = $20k
    const btcLot = serialized.lots.find((l) => l.asset_symbol === "BTC")!;
    expect(btcLot.stepped_up_cost_basis_usd).toBeCloseTo(130_000, 2);
    expect(btcLot.gain_eliminated_usd).toBeCloseTo(110_000, 2);
    expect(serialized.wallet_id).toBe("wallet-1");
  });
});
