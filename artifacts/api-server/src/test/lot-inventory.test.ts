/**
 * lot-inventory.test.ts
 *
 * Unit tests for the FIFO lot matching algorithm and the lot serialization
 * logic, including the price-oracle-powered unrealized G/L computation.
 *
 * DB-level and HTTP-layer tests require a real Postgres connection and a
 * mocked Clerk session; they are noted as todos below.
 */

import { describe, it, expect } from "vitest";
import {
  remainingCostBasisUsd,
  planLotConsumption,
  ACQUISITION_EVENT_TYPES,
  DISPOSITION_EVENT_TYPES,
  DEFERRED_LOT_EVENT_TYPES,
} from "../core/lotInventory.js";

// ── Inline mirror of serializeLot (avoids importing the full route file) ──────

const MS_PER_DAY = 86_400_000;
const LONG_TERM_DAYS = 365;

function holdingDays(acquisitionDate: Date, disposalDate?: Date | null): number {
  const to = disposalDate ?? new Date();
  return Math.floor((to.getTime() - acquisitionDate.getTime()) / MS_PER_DAY);
}

interface LotLike {
  id: string;
  positionRecordId: string | null;
  walletId: string;
  assetSymbol: string;
  assetIdentifier: string | null;
  chainId: string | null;
  quantity: number;
  costBasisUsd: number | null;
  costBasisPerUnitUsd: number | null;
  acquisitionDate: Date;
  acquisitionTxId: string | null;
  disposalPositionId: string | null;
  disposalDate: Date | null;
  disposalProceedsUsd: number | null;
  realizedGainLossUsd: number | null;
  status: "open" | "partial" | "closed";
  notes: string | null;
  createdAt: Date;
}

function serializeLot(lot: LotLike, currentPriceUsd: number | null = null) {
  const isOpen = lot.status === "open" || lot.status === "partial";
  const days = holdingDays(lot.acquisitionDate, isOpen ? null : lot.disposalDate);
  const remainingBasis =
    lot.costBasisPerUnitUsd != null ? lot.costBasisPerUnitUsd * lot.quantity : lot.costBasisUsd;
  const unrealizedGainLossUsd =
    isOpen && remainingBasis != null && currentPriceUsd != null
      ? currentPriceUsd * lot.quantity - remainingBasis
      : null;
  return {
    id: lot.id,
    position_record_id: lot.positionRecordId ?? null,
    wallet_id: lot.walletId,
    asset_symbol: lot.assetSymbol,
    asset_identifier: lot.assetIdentifier ?? null,
    chain_id: lot.chainId ?? null,
    quantity: lot.quantity,
    cost_basis_usd: remainingBasis ?? null,
    cost_basis_per_unit_usd: lot.costBasisPerUnitUsd ?? null,
    acquisition_date: lot.acquisitionDate.toISOString(),
    acquisition_tx_id: lot.acquisitionTxId ?? null,
    disposal_position_id: lot.disposalPositionId ?? null,
    disposal_date: lot.disposalDate?.toISOString() ?? null,
    disposal_proceeds_usd: lot.disposalProceedsUsd ?? null,
    realized_gain_loss_usd: lot.realizedGainLossUsd ?? null,
    status: lot.status,
    notes: lot.notes ?? null,
    created_at: lot.createdAt.toISOString(),
    holding_days: days,
    holding_period_type: days > LONG_TERM_DAYS ? "long_term" : "short_term",
    current_price_usd: isOpen ? currentPriceUsd : null,
    unrealized_gain_loss_usd: unrealizedGainLossUsd,
  };
}

function makeLot(overrides: Partial<LotLike> = {}): LotLike {
  return {
    id: "lot-uuid-1",
    positionRecordId: null,
    walletId: "wallet-A",
    assetSymbol: "ETH",
    assetIdentifier: null,
    chainId: null,
    quantity: 1,
    costBasisUsd: 2000,
    costBasisPerUnitUsd: 2000,
    acquisitionDate: new Date("2023-01-01T00:00:00Z"),
    acquisitionTxId: null,
    disposalPositionId: null,
    disposalDate: null,
    disposalProceedsUsd: null,
    realizedGainLossUsd: null,
    status: "open",
    notes: null,
    createdAt: new Date("2023-01-01T00:00:00Z"),
    ...overrides,
  };
}

// ── serializeLot output shape ─────────────────────────────────────────────────

describe("serializeLot — output shape", () => {
  it("includes all expected keys", () => {
    const out = serializeLot(makeLot());
    const expectedKeys = [
      "id", "position_record_id", "wallet_id", "asset_symbol", "asset_identifier",
      "chain_id", "quantity", "cost_basis_usd", "cost_basis_per_unit_usd",
      "acquisition_date", "acquisition_tx_id", "disposal_position_id",
      "disposal_date", "disposal_proceeds_usd", "realized_gain_loss_usd",
      "status", "notes", "created_at", "holding_days", "holding_period_type",
      "current_price_usd", "unrealized_gain_loss_usd",
    ];
    for (const key of expectedKeys) {
      expect(out).toHaveProperty(key);
    }
  });

  it("serializes dates to ISO strings", () => {
    const lot = makeLot({ acquisitionDate: new Date("2022-06-15T12:00:00Z") });
    const out = serializeLot(lot);
    expect(out.acquisition_date).toBe("2022-06-15T12:00:00.000Z");
  });
});

// ── Holding period classification ─────────────────────────────────────────────

describe("serializeLot — holding period", () => {
  it("classifies < 365 days as short_term", () => {
    const acq = new Date(Date.now() - 100 * MS_PER_DAY);
    const out = serializeLot(makeLot({ acquisitionDate: acq }));
    expect(out.holding_period_type).toBe("short_term");
    expect(out.holding_days).toBeGreaterThanOrEqual(100);
  });

  it("classifies > 365 days as long_term", () => {
    const acq = new Date(Date.now() - 400 * MS_PER_DAY);
    const out = serializeLot(makeLot({ acquisitionDate: acq }));
    expect(out.holding_period_type).toBe("long_term");
    expect(out.holding_days).toBeGreaterThanOrEqual(400);
  });

  it("uses disposal date for closed lots (not today)", () => {
    const acq = new Date("2020-01-01T00:00:00Z");
    const disp = new Date("2020-06-01T00:00:00Z"); // 152 days after acq
    const out = serializeLot(
      makeLot({ acquisitionDate: acq, disposalDate: disp, status: "closed" }),
    );
    expect(out.holding_period_type).toBe("short_term");
    expect(out.holding_days).toBeGreaterThanOrEqual(151);
    expect(out.holding_days).toBeLessThanOrEqual(153);
  });
});

// ── Unrealized G/L with price oracle ─────────────────────────────────────────

describe("serializeLot — unrealized_gain_loss_usd", () => {
  it("is null when no price is supplied", () => {
    const out = serializeLot(makeLot({ costBasisPerUnitUsd: 2000 }));
    expect(out.unrealized_gain_loss_usd).toBeNull();
    expect(out.current_price_usd).toBeNull();
  });

  it("computes gain when current price > cost basis", () => {
    const lot = makeLot({ costBasisPerUnitUsd: 2000, quantity: 2, status: "open" });
    const out = serializeLot(lot, 3000); // +$1000/unit × 2 = +$2000
    expect(out.unrealized_gain_loss_usd).toBeCloseTo(2000);
    expect(out.current_price_usd).toBe(3000);
  });

  it("computes loss when current price < cost basis", () => {
    const lot = makeLot({ costBasisPerUnitUsd: 3000, quantity: 0.5, status: "open" });
    const out = serializeLot(lot, 2000); // −$1000/unit × 0.5 = −$500
    expect(out.unrealized_gain_loss_usd).toBeCloseTo(-500);
  });

  it("is zero when current price equals cost basis", () => {
    const lot = makeLot({ costBasisPerUnitUsd: 2500, quantity: 1, status: "open" });
    const out = serializeLot(lot, 2500);
    expect(out.unrealized_gain_loss_usd).toBeCloseTo(0);
  });

  it("is null for closed lots even when price is supplied", () => {
    const lot = makeLot({
      costBasisPerUnitUsd: 2000,
      quantity: 1,
      status: "closed",
      disposalDate: new Date("2024-01-01"),
      realizedGainLossUsd: 500,
    });
    const out = serializeLot(lot, 4000); // price supplied but should be ignored
    expect(out.unrealized_gain_loss_usd).toBeNull();
    expect(out.current_price_usd).toBeNull();
  });

  it("is null for partial lots when cost basis per unit is unknown", () => {
    const lot = makeLot({ costBasisPerUnitUsd: null, quantity: 1.5, status: "partial" });
    const out = serializeLot(lot, 2000);
    expect(out.unrealized_gain_loss_usd).toBeNull();
    // current_price_usd IS set — oracle returned data, we just can't compute G/L
    expect(out.current_price_usd).toBe(2000);
  });

  it("handles partial lots correctly", () => {
    const lot = makeLot({ costBasisPerUnitUsd: 1000, quantity: 0.75, status: "partial" });
    const out = serializeLot(lot, 2000); // +$1000 × 0.75 = +$750
    expect(out.unrealized_gain_loss_usd).toBeCloseTo(750);
  });
});

// ── Remaining-basis identity ──────────────────────────────────────────────────

describe("remainingCostBasisUsd", () => {
  it("uses per-unit × remaining qty, ignoring a stale original total", () => {
    // Original acquisition: 2 ETH at $2,000/unit = $4,000. After selling 1, qty=1
    // but a poisoned ledger still stores costBasisUsd=4000.
    const remaining = remainingCostBasisUsd({
      quantity: 1,
      costBasisUsd: 4000,
      costBasisPerUnitUsd: 2000,
    });
    expect(remaining).toBe(2000);
  });

  it("falls back to stored total only when per-unit is unknown", () => {
    expect(remainingCostBasisUsd({ quantity: 1, costBasisUsd: 500, costBasisPerUnitUsd: null })).toBe(500);
    expect(remainingCostBasisUsd({ quantity: 1, costBasisUsd: null, costBasisPerUnitUsd: null })).toBeNull();
  });
});

// ── FIFO matching pure-logic tests ────────────────────────────────────────────

describe("FIFO matching — planLotConsumption", () => {
  it("closes a single lot exactly", () => {
    const lots = [{ id: "a", quantity: 1, costBasisUsd: 2000, costBasisPerUnitUsd: 2000 }];
    const result = planLotConsumption(lots, 1, 3000);
    expect(result.lotsMatched).toBe(1);
    expect(result.totalGainLoss).toBeCloseTo(1000);
    expect(result.updates[0].status).toBe("closed");
  });

  it("closes oldest lot first (FIFO)", () => {
    const lots = [
      { id: "old", quantity: 1, costBasisUsd: 1000, costBasisPerUnitUsd: 1000 },
      { id: "new", quantity: 1, costBasisUsd: 3000, costBasisPerUnitUsd: 3000 },
    ];
    const result = planLotConsumption(lots, 1, 2000);
    expect(result.lotsMatched).toBe(1);
    expect(result.updates[0].index).toBe(0);
    expect(result.totalGainLoss).toBeCloseTo(1000);
  });

  it("spans multiple lots for large disposal", () => {
    const lots = [
      { id: "a", quantity: 1, costBasisUsd: 1000, costBasisPerUnitUsd: 1000 },
      { id: "b", quantity: 2, costBasisUsd: 4000, costBasisPerUnitUsd: 2000 },
    ];
    const result = planLotConsumption(lots, 3, 3000);
    expect(result.lotsMatched).toBe(2);
    expect(result.totalGainLoss).toBeCloseTo(4000);
  });

  it("records a loss when current price is below basis", () => {
    const lots = [{ id: "a", quantity: 1, costBasisUsd: 5000, costBasisPerUnitUsd: 5000 }];
    const result = planLotConsumption(lots, 1, 3000);
    expect(result.totalGainLoss).toBeCloseTo(-2000);
  });

  it("returns null G/L when no proceeds are provided", () => {
    const lots = [{ id: "a", quantity: 1, costBasisUsd: 2000, costBasisPerUnitUsd: 2000 }];
    const result = planLotConsumption(lots, 1, null);
    expect(result.lotsMatched).toBe(1);
    expect(result.totalGainLoss).toBeNull();
  });

  it("returns null G/L when cost basis is unknown", () => {
    const lots = [{ id: "a", quantity: 1, costBasisUsd: null, costBasisPerUnitUsd: null }];
    const result = planLotConsumption(lots, 1, 3000);
    expect(result.lotsMatched).toBe(1);
    expect(result.totalGainLoss).toBeNull();
  });

  it("handles zero-lot list (nothing to close)", () => {
    const result = planLotConsumption([], 1, 3000);
    expect(result.lotsMatched).toBe(0);
    expect(result.totalGainLoss).toBeNull();
  });

  it("partial disposal rewrites remaining total to per-unit × remaining qty", () => {
    const lots = [{ id: "a", quantity: 5, costBasisUsd: 5000, costBasisPerUnitUsd: 1000 }];
    const result = planLotConsumption(lots, 2, 1500);
    expect(result.lotsMatched).toBe(1);
    expect(result.totalGainLoss).toBeCloseTo(1000); // (1500−1000)×2
    expect(result.updates[0].status).toBe("partial");
    expect(result.updates[0].remainingQuantity).toBe(3);
    expect(result.updates[0].remainingCostBasisUsd).toBe(3000);
  });

  it("a 50% sale cannot leave the original total sitting against remaining qty", () => {
    const lots = [{ id: "eth", quantity: 2, costBasisUsd: 4000, costBasisPerUnitUsd: 2000 }];
    const result = planLotConsumption(lots, 1, 2500);
    const remaining = result.updates[0].remainingCostBasisUsd!;
    const fakeLossIfStale = 2500 * 1 - 4000; // −1500, the poison
    const honestUnrealized = 2500 * result.updates[0].remainingQuantity - remaining;
    expect(remaining).toBe(2000);
    expect(fakeLossIfStale).toBe(-1500);
    expect(honestUnrealized).toBe(500);
  });

  it("consumes a contemporaneous Spec ID lot first, not the oldest FIFO lot", () => {
    const lots = [
      { id: "old", quantity: 1, costBasisUsd: 1000, costBasisPerUnitUsd: 1000 },
      { id: "picked", quantity: 1, costBasisUsd: 3000, costBasisPerUnitUsd: 3000 },
    ];
    const sale = new Date("2026-06-01T12:00:00Z");
    const result = planLotConsumption(
      lots,
      1,
      4000,
      [{ id: "id-1", lotId: "picked", quantity: 1, identifiedAt: new Date("2026-06-01T11:00:00Z") }],
      sale,
    );
    expect(result.identifiedLotsConsumed).toBe(1);
    expect(result.updates[0].viaIdentification).toBe(true);
    expect(result.totalGainLoss).toBeCloseTo(1000); // 4000 − 3000, not 4000 − 1000
  });

  it("ignores an identification dated after the sale", () => {
    const lots = [
      { id: "old", quantity: 1, costBasisUsd: 1000, costBasisPerUnitUsd: 1000 },
      { id: "picked", quantity: 1, costBasisUsd: 3000, costBasisPerUnitUsd: 3000 },
    ];
    const sale = new Date("2026-06-01T12:00:00Z");
    const result = planLotConsumption(
      lots,
      1,
      4000,
      [{ id: "id-1", lotId: "picked", quantity: 1, identifiedAt: new Date("2026-06-01T13:00:00Z") }],
      sale,
    );
    expect(result.lateIdentificationsIgnored).toBe(1);
    expect(result.identifiedLotsConsumed).toBe(0);
    expect(result.totalGainLoss).toBeCloseTo(3000); // FIFO oldest
  });

  it.todo("autoCreateLot inserts a row in lotsTable linked to the position (DB-layer)");
  it.todo("fifoMatchDisposition updates lot.status to 'closed' after full consumption (DB-layer)");
  it.todo("fifoMatchDisposition sets lot.status to 'partial' when only consumed partially (DB-layer)");
  it.todo("two concurrent disposals of the same asset in the same wallet don't double-close a lot (transaction isolation)");
});

// ── Acquisition event type set ────────────────────────────────────────────────

describe("ACQUISITION_EVENT_TYPES / DISPOSITION_EVENT_TYPES", () => {
  it("acquisition set contains expected event types", () => {
    expect(ACQUISITION_EVENT_TYPES.has("buy")).toBe(true);
    expect(ACQUISITION_EVENT_TYPES.has("receive")).toBe(true);
    expect(ACQUISITION_EVENT_TYPES.has("staking_reward")).toBe(true);
    expect(ACQUISITION_EVENT_TYPES.has("airdrop")).toBe(true);
    expect(ACQUISITION_EVENT_TYPES.has("defi_lp_acquisition")).toBe(true);
    expect(ACQUISITION_EVENT_TYPES.size).toBe(10);
  });

  it("disposition set contains expected event types", () => {
    expect(DISPOSITION_EVENT_TYPES.has("sell")).toBe(true);
    expect(DISPOSITION_EVENT_TYPES.has("send")).toBe(true);
    expect(DISPOSITION_EVENT_TYPES.has("taxable_disposition")).toBe(true);
    expect(DISPOSITION_EVENT_TYPES.size).toBe(7);
  });

  it("defi_borrow is not an acquisition — loan proceeds do not invent basis", () => {
    expect(ACQUISITION_EVENT_TYPES.has("defi_borrow")).toBe(false);
    expect(DEFERRED_LOT_EVENT_TYPES.defi_borrow).toMatch(/Loan proceeds/);
  });

  it("gift_out is not a §1001 FIFO disposal", () => {
    expect(DISPOSITION_EVENT_TYPES.has("gift_out")).toBe(false);
    expect(DEFERRED_LOT_EVENT_TYPES.gift_out).toMatch(/§1015/);
  });

  it("acquisition and disposition sets are disjoint", () => {
    for (const type of ACQUISITION_EVENT_TYPES) {
      expect(DISPOSITION_EVENT_TYPES.has(type)).toBe(false);
    }
  });

  it("deferred types are on neither inventory set", () => {
    for (const type of Object.keys(DEFERRED_LOT_EVENT_TYPES)) {
      expect(ACQUISITION_EVENT_TYPES.has(type)).toBe(false);
      expect(DISPOSITION_EVENT_TYPES.has(type)).toBe(false);
    }
  });
});
