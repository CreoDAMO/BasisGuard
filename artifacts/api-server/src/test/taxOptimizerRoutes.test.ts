/**
 * taxOptimizerRoutes.test.ts
 *
 * Supertest integration tests for the Tax Optimizer HTTP routes.
 *
 * Auth is bypassed — the router is mounted directly on a test Express app
 * without Clerk middleware. The DB and price-oracle modules are mocked so
 * the tests run without a live database or network.
 *
 * Key assertions: every response must use snake_case keys throughout
 * (including nested objects) — the core algorithms return camelCase, so
 * these tests catch any missing serialization step.
 */

import { vi, describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import express from "express";

// ── Fixtures ──────────────────────────────────────────────────────────────────

const ACQUISITION_DATE = new Date("2025-01-01T00:00:00Z");

const MOCK_LOT_ROW = {
  id: "lot-aaa",
  walletId: "wallet-1",
  assetSymbol: "BTC",
  quantity: 1,
  costBasisUsd: 40_000,
  costBasisPerUnitUsd: 40_000,
  acquisitionDate: ACQUISITION_DATE,   // 540+ days ago → long-term
  status: "open",
  positionRecordId: null,
  assetIdentifier: null,
  chainId: null,
  acquisitionTxId: null,
  disposalPositionId: null,
  disposalDate: null,
  disposalProceedsUsd: null,
  realizedGainLossUsd: null,
  notes: null,
  createdAt: ACQUISITION_DATE,
};

// Loss lot: ETH purchased at $3 000, now worth $2 000 → unrealized loss $1 000
const MOCK_ETH_LOT_ROW = {
  ...MOCK_LOT_ROW,
  id: "lot-bbb",
  assetSymbol: "ETH",
  quantity: 1,
  costBasisUsd: 3_000,
  costBasisPerUnitUsd: 3_000,
};

// ── Module mocks (hoisted by vitest before imports) ───────────────────────────

// The query chain: db.select().from(lotsTable).where(...) → returns mock rows.
// We default to BTC lots; individual tests can override via the exported setter.
let mockDbRows: typeof MOCK_LOT_ROW[] = [MOCK_LOT_ROW];

vi.mock("@workspace/db", () => {
  // lotsTable columns must be non-null objects so that drizzle operators
  // (eq, inArray) can accept them without throwing at construction time.
  const columnStub = () => ({ _: "stub" });
  const lotsTable = new Proxy({} as Record<string, unknown>, {
    get: (_, prop) => columnStub(),
  });

  return {
    lotsTable,
    db: {
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => Promise.resolve(mockDbRows)),
        })),
      })),
    },
  };
});

vi.mock("../core/priceOracle.js", () => ({
  getBatchPrices: vi.fn().mockResolvedValue({ BTC: 60_000, ETH: 2_000 }),
  getHistoricalBatchPrices: vi.fn().mockResolvedValue({ BTC: 65_000, ETH: 2_500 }),
}));

// ── Test app (no Clerk, no rate-limiter, no pino) ─────────────────────────────

// Import AFTER mocks are declared so vi.mock hoisting applies.
import taxOptimizerRouter from "../routes/tax-optimizer.js";

function createTestApp() {
  const app = express();
  app.use(express.json());
  app.use("/api", taxOptimizerRouter);
  return app;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

beforeEach(() => {
  mockDbRows = [MOCK_LOT_ROW];
});

// ── GET /api/tax-optimizer/simulate ──────────────────────────────────────────

describe("GET /api/tax-optimizer/simulate", () => {
  it("returns 400 when asset_symbol is missing", async () => {
    const res = await request(createTestApp())
      .get("/api/tax-optimizer/simulate?quantity=0.5")
      .expect(400);
    expect(res.body).toHaveProperty("error");
  });

  it("returns 400 when quantity is missing", async () => {
    const res = await request(createTestApp())
      .get("/api/tax-optimizer/simulate?asset_symbol=BTC")
      .expect(400);
    expect(res.body).toHaveProperty("error");
  });

  it("returns 404 when no lots exist for the asset", async () => {
    mockDbRows = [];
    const res = await request(createTestApp())
      .get("/api/tax-optimizer/simulate?asset_symbol=BTC&quantity=0.5")
      .expect(404);
    expect(res.body).toHaveProperty("error");
  });

  it("all-strategy response uses snake_case top-level keys", async () => {
    const res = await request(createTestApp())
      .get("/api/tax-optimizer/simulate?asset_symbol=BTC&quantity=0.5")
      .expect(200);

    expect(res.body).toHaveProperty("generated_at");
    expect(res.body).toHaveProperty("asset_symbol", "BTC");
    expect(res.body).toHaveProperty("quantity_requested", 0.5);
    expect(res.body).toHaveProperty("current_price_usd", 60_000);
    expect(res.body).toHaveProperty("ranked_strategies");
    expect(res.body).toHaveProperty("simulations");
    expect(res.body).toHaveProperty("disclaimer");

    // Must NOT contain camelCase top-level keys
    expect(res.body).not.toHaveProperty("assetSymbol");
    expect(res.body).not.toHaveProperty("quantityRequested");
    expect(res.body).not.toHaveProperty("currentPriceUsd");
    expect(res.body).not.toHaveProperty("rankedStrategies");
  });

  it("ranked_strategies entries use snake_case keys", async () => {
    const res = await request(createTestApp())
      .get("/api/tax-optimizer/simulate?asset_symbol=BTC&quantity=0.5")
      .expect(200);

    const strat = res.body.ranked_strategies[0];
    expect(strat).toHaveProperty("strategy");
    expect(strat).toHaveProperty("total_gain_usd");
    expect(strat).toHaveProperty("short_term_gain_usd");
    expect(strat).toHaveProperty("long_term_gain_usd");
    expect(strat).toHaveProperty("total_proceeds_usd");

    expect(strat).not.toHaveProperty("totalGainUsd");
    expect(strat).not.toHaveProperty("shortTermGainUsd");
    expect(strat).not.toHaveProperty("longTermGainUsd");
    expect(strat).not.toHaveProperty("totalProceedsUsd");
  });

  it("simulations entries use snake_case keys including nested lots_consumed", async () => {
    const res = await request(createTestApp())
      .get("/api/tax-optimizer/simulate?asset_symbol=BTC&quantity=0.5")
      .expect(200);

    const sim = res.body.simulations[0];
    expect(sim).toHaveProperty("asset_symbol");
    expect(sim).toHaveProperty("quantity_requested");
    expect(sim).toHaveProperty("quantity_available");
    expect(sim).toHaveProperty("quantity_fillable");
    expect(sim).toHaveProperty("current_price_usd");
    expect(sim).toHaveProperty("lots_consumed");
    expect(sim).toHaveProperty("total_proceeds_usd");
    expect(sim).toHaveProperty("total_gain_usd");

    expect(sim).not.toHaveProperty("quantityRequested");
    expect(sim).not.toHaveProperty("lotsConsumed");
    expect(sim).not.toHaveProperty("totalGainUsd");

    // Nested lot entry must also be snake_case
    const consumed = sim.lots_consumed[0];
    expect(consumed).toHaveProperty("lot_id");
    expect(consumed).toHaveProperty("quantity_consumed");
    expect(consumed).toHaveProperty("cost_basis_usd");
    expect(consumed).toHaveProperty("proceeds_usd");
    expect(consumed).toHaveProperty("gain_loss_usd");
    expect(consumed).toHaveProperty("holding_days");
    expect(consumed).toHaveProperty("holding_period");

    expect(consumed).not.toHaveProperty("lotId");
    expect(consumed).not.toHaveProperty("quantityConsumed");
    expect(consumed).not.toHaveProperty("gainLossUsd");
  });

  it("single-strategy response nests under simulation key", async () => {
    const res = await request(createTestApp())
      .get("/api/tax-optimizer/simulate?asset_symbol=BTC&quantity=0.5&strategy=fifo")
      .expect(200);

    expect(res.body).toHaveProperty("simulation");
    expect(res.body.simulation).toHaveProperty("strategy", "fifo");
    expect(res.body.simulation).toHaveProperty("lots_consumed");
    expect(res.body.simulation).not.toHaveProperty("lotsConsumed");
    expect(res.body).not.toHaveProperty("ranked_strategies");
    expect(res.body).not.toHaveProperty("simulations");
  });

  it("returns correct gain values for a long-term lot at a gain", async () => {
    // BTC lot: basis $40k, sell 0.5 at $60k → proceeds $30k, basis $20k → gain $10k
    const res = await request(createTestApp())
      .get("/api/tax-optimizer/simulate?asset_symbol=BTC&quantity=0.5&strategy=fifo")
      .expect(200);

    const sim = res.body.simulation;
    expect(sim.total_proceeds_usd).toBeCloseTo(30_000, 2);
    expect(sim.total_cost_basis_usd).toBeCloseTo(20_000, 2);
    expect(sim.total_gain_usd).toBeCloseTo(10_000, 2);
    expect(sim.long_term_gain_usd).toBeCloseTo(10_000, 2);
    expect(sim.short_term_gain_usd).toBeNull();
  });
});

// ── GET /api/tax-optimizer/harvest ───────────────────────────────────────────

describe("GET /api/tax-optimizer/harvest", () => {
  it("returns 200 with empty candidates when no lots have losses", async () => {
    // BTC lot: basis $40k, current price $60k → gain, not a loss
    const res = await request(createTestApp())
      .get("/api/tax-optimizer/harvest")
      .expect(200);

    expect(res.body).toHaveProperty("total_candidates", 0);
    expect(res.body).toHaveProperty("candidates");
    expect(Array.isArray(res.body.candidates)).toBe(true);
  });

  it("surfaces ETH lot with unrealized loss using snake_case keys", async () => {
    // ETH lot: basis $3k, price $2k → unrealized loss $1k
    mockDbRows = [MOCK_ETH_LOT_ROW];
    const res = await request(createTestApp())
      .get("/api/tax-optimizer/harvest")
      .expect(200);

    expect(res.body).toHaveProperty("total_candidates", 1);
    expect(res.body.candidates).toHaveLength(1);

    const c = res.body.candidates[0];
    expect(c).toHaveProperty("lot_id", "lot-bbb");
    expect(c).toHaveProperty("wallet_id", "wallet-1");
    expect(c).toHaveProperty("asset_symbol", "ETH");
    expect(c).toHaveProperty("quantity", 1);
    expect(c).toHaveProperty("cost_basis_usd");
    expect(c).toHaveProperty("current_price_usd", 2_000);
    expect(c).toHaveProperty("current_value_usd");
    expect(c).toHaveProperty("unrealized_loss_usd");
    expect(c).toHaveProperty("holding_days");
    expect(c).toHaveProperty("holding_period");
    expect(c).toHaveProperty("proceeds_if_sold_usd");
    expect(c).toHaveProperty("wash_sale_risk");

    // Must NOT have camelCase keys
    expect(c).not.toHaveProperty("lotId");
    expect(c).not.toHaveProperty("walletId");
    expect(c).not.toHaveProperty("assetSymbol");
    expect(c).not.toHaveProperty("unrealizedLossUsd");
    expect(c).not.toHaveProperty("washSaleRisk");
    expect(c).not.toHaveProperty("proceedsIfSoldUsd");
  });

  it("top-level response shape uses snake_case keys", async () => {
    const res = await request(createTestApp())
      .get("/api/tax-optimizer/harvest")
      .expect(200);

    expect(res.body).toHaveProperty("generated_at");
    expect(res.body).toHaveProperty("wallet_id");
    expect(res.body).toHaveProperty("min_loss_usd_filter");
    expect(res.body).toHaveProperty("total_candidates");
    expect(res.body).toHaveProperty("wash_sale_risk_count");
    expect(res.body).toHaveProperty("total_unrealized_loss_usd");
    expect(res.body).toHaveProperty("disclaimer");
  });

  it("filters by min_loss_usd query param", async () => {
    mockDbRows = [MOCK_ETH_LOT_ROW]; // $1k loss
    const res = await request(createTestApp())
      .get("/api/tax-optimizer/harvest?min_loss_usd=2000")
      .expect(200);
    // $1k loss doesn't exceed $2k threshold
    expect(res.body).toHaveProperty("total_candidates", 0);
  });
});

// ── POST /api/tax-optimizer/estate-step-up ───────────────────────────────────

describe("POST /api/tax-optimizer/estate-step-up", () => {
  const VALID_BODY = {
    wallet_id: "wallet-1",
    step_up_date: "2026-06-01T00:00:00Z",
  };

  it("returns 400 when wallet_id is missing", async () => {
    const res = await request(createTestApp())
      .post("/api/tax-optimizer/estate-step-up")
      .send({ step_up_date: "2026-06-01T00:00:00Z" })
      .expect(400);
    expect(res.body).toHaveProperty("error");
  });

  it("returns 400 when step_up_date is not ISO 8601", async () => {
    const res = await request(createTestApp())
      .post("/api/tax-optimizer/estate-step-up")
      .send({ wallet_id: "wallet-1", step_up_date: "June 1 2026" })
      .expect(400);
    expect(res.body).toHaveProperty("error");
  });

  it("empty wallet returns snake_case empty response", async () => {
    mockDbRows = [];
    const res = await request(createTestApp())
      .post("/api/tax-optimizer/estate-step-up")
      .send(VALID_BODY)
      .expect(200);

    expect(res.body).toHaveProperty("step_up_date");
    expect(res.body).toHaveProperty("wallet_id", "wallet-1");
    expect(res.body.lots).toHaveLength(0);
    expect(res.body).toHaveProperty("total_original_basis_usd", null);
    expect(res.body).toHaveProperty("price_source", "coingecko_historical");
    expect(res.body).not.toHaveProperty("walletId");
    expect(res.body).not.toHaveProperty("stepUpDate");
  });

  it("non-empty response uses snake_case top-level and lot keys", async () => {
    const res = await request(createTestApp())
      .post("/api/tax-optimizer/estate-step-up")
      .send(VALID_BODY)
      .expect(200);

    // Top-level snake_case
    expect(res.body).toHaveProperty("step_up_date");
    expect(res.body).toHaveProperty("wallet_id", "wallet-1");
    expect(res.body).toHaveProperty("total_original_basis_usd");
    expect(res.body).toHaveProperty("total_stepped_up_basis_usd");
    expect(res.body).toHaveProperty("total_gain_eliminated_usd");
    expect(res.body).toHaveProperty("price_source");
    expect(res.body).toHaveProperty("disclaimer");

    // Must NOT have camelCase top-level keys
    expect(res.body).not.toHaveProperty("walletId");
    expect(res.body).not.toHaveProperty("stepUpDate");
    expect(res.body).not.toHaveProperty("totalOriginalBasisUsd");
    expect(res.body).not.toHaveProperty("totalSteppedUpBasisUsd");
    expect(res.body).not.toHaveProperty("totalGainEliminatedUsd");

    // Lot-level snake_case
    expect(res.body.lots).toHaveLength(1);
    const lot = res.body.lots[0];
    expect(lot).toHaveProperty("lot_id");
    expect(lot).toHaveProperty("asset_symbol", "BTC");
    expect(lot).toHaveProperty("quantity");
    expect(lot).toHaveProperty("original_cost_basis_usd");
    expect(lot).toHaveProperty("step_up_price_usd");
    expect(lot).toHaveProperty("stepped_up_cost_basis_usd");
    expect(lot).toHaveProperty("gain_eliminated_usd");

    // Must NOT have camelCase lot keys
    expect(lot).not.toHaveProperty("lotId");
    expect(lot).not.toHaveProperty("assetSymbol");
    expect(lot).not.toHaveProperty("originalCostBasisUsd");
    expect(lot).not.toHaveProperty("gainEliminatedUsd");
  });

  it("computes correct step-up values", async () => {
    // BTC lot: original basis $40k, historical price $65k × 1 unit = $65k stepped-up
    const res = await request(createTestApp())
      .post("/api/tax-optimizer/estate-step-up")
      .send(VALID_BODY)
      .expect(200);

    expect(res.body.total_original_basis_usd).toBeCloseTo(40_000, 2);
    expect(res.body.total_stepped_up_basis_usd).toBeCloseTo(65_000, 2);
    expect(res.body.total_gain_eliminated_usd).toBeCloseTo(25_000, 2);
  });
});
