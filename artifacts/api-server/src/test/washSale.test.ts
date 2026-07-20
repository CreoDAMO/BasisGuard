import { describe, it, expect } from "vitest";
import {
  daysBetweenDates,
  detectWashSalePairs,
  buildHarvestCandidates,
  WASH_SALE_WINDOW_DAYS,
  type HarvestPosition,
} from "../core/washSaleDetector.js";

// ── helpers ───────────────────────────────────────────────────────────────────

function pos(overrides: Partial<HarvestPosition> & { id: string }): HarvestPosition {
  return {
    walletId: "wallet-A",
    eventType: "taxable_disposition",
    txDate: new Date("2024-06-01"),
    amountUsd: -1000,
    classification: "taxable_disposition",
    tier: "should",
    requiresReview: false,
    reviewerSignoffAt: null,
    ...overrides,
  };
}

// ── daysBetweenDates ──────────────────────────────────────────────────────────

describe("daysBetweenDates", () => {
  it("returns 0 for identical dates", () => {
    const d = new Date("2024-06-01");
    expect(daysBetweenDates(d, d)).toBe(0);
  });

  it("returns the absolute number of days", () => {
    const a = new Date("2024-06-01");
    const b = new Date("2024-07-01"); // 30 days later
    expect(daysBetweenDates(a, b)).toBeCloseTo(30, 0);
    expect(daysBetweenDates(b, a)).toBeCloseTo(30, 0); // symmetric
  });
});

// ── detectWashSalePairs ───────────────────────────────────────────────────────

describe("detectWashSalePairs", () => {
  it("returns empty for a single position", () => {
    expect(detectWashSalePairs([pos({ id: "a" })])).toHaveLength(0);
  });

  it("pairs two loss positions of the same event_type + wallet within the window", () => {
    const a = pos({ id: "a", txDate: new Date("2024-06-01"), amountUsd: -1000 });
    const b = pos({ id: "b", txDate: new Date("2024-06-15"), amountUsd: -500 });
    const pairs = detectWashSalePairs([a, b]);
    expect(pairs).toHaveLength(1);
    expect(pairs[0].lossPositionId).toBe("a"); // a has lower amount_usd
    expect(pairs[0].gainPositionId).toBe("b");
    expect(pairs[0].daysBetween).toBe(14);
  });

  it("does NOT pair positions outside the 30-day window", () => {
    const a = pos({ id: "a", txDate: new Date("2024-06-01") });
    const b = pos({ id: "b", txDate: new Date("2024-08-01") }); // 61 days
    expect(detectWashSalePairs([a, b])).toHaveLength(0);
  });

  it("does NOT pair positions from different wallets", () => {
    const a = pos({ id: "a", walletId: "wallet-A" });
    const b = pos({ id: "b", walletId: "wallet-B" });
    expect(detectWashSalePairs([a, b])).toHaveLength(0);
  });

  it("does NOT pair positions with different event_types", () => {
    const a = pos({ id: "a", eventType: "taxable_disposition" });
    const b = pos({ id: "b", eventType: "crypto_swap" });
    expect(detectWashSalePairs([a, b])).toHaveLength(0);
  });

  it("does NOT pair two positions when both are gains (amount_usd > 0)", () => {
    const a = pos({ id: "a", amountUsd: 500 });
    const b = pos({ id: "b", amountUsd: 300 });
    expect(detectWashSalePairs([a, b])).toHaveLength(0);
  });

  it("pairs a loss with a gain within the window", () => {
    const loss = pos({ id: "loss", amountUsd: -800, txDate: new Date("2024-06-01") });
    const gain = pos({ id: "gain", amountUsd: 200, txDate: new Date("2024-06-20") });
    const pairs = detectWashSalePairs([loss, gain]);
    expect(pairs).toHaveLength(1);
    expect(pairs[0].lossPositionId).toBe("loss");
    expect(pairs[0].gainPositionId).toBe("gain");
  });

  it("treats null amount_usd as a potential loss", () => {
    const unknown = pos({ id: "unk", amountUsd: null });
    const gain = pos({ id: "gain", amountUsd: 200 });
    expect(detectWashSalePairs([unknown, gain])).toHaveLength(1);
  });

  it("does NOT pair positions with null walletId", () => {
    const a = pos({ id: "a", walletId: null });
    const b = pos({ id: "b", walletId: null });
    expect(detectWashSalePairs([a, b])).toHaveLength(0);
  });

  it("does NOT pair positions with null txDate", () => {
    const a = pos({ id: "a", txDate: null });
    const b = pos({ id: "b", txDate: null });
    expect(detectWashSalePairs([a, b])).toHaveLength(0);
  });

  it("respects the exact boundary: exactly 30 days is within window", () => {
    const a = pos({ id: "a", txDate: new Date("2024-06-01"), amountUsd: -500 });
    const b = pos({ id: "b", txDate: new Date("2024-07-01"), amountUsd: 100 }); // exactly 30 days
    const pairs = detectWashSalePairs([a, b]);
    expect(pairs).toHaveLength(1);
  });

  it("31 days is outside the window", () => {
    const a = pos({ id: "a", txDate: new Date("2024-06-01"), amountUsd: -500 });
    const b = pos({ id: "b", txDate: new Date("2024-07-02"), amountUsd: 100 }); // 31 days
    expect(detectWashSalePairs([a, b])).toHaveLength(0);
  });
});

// ── buildHarvestCandidates ────────────────────────────────────────────────────

describe("buildHarvestCandidates", () => {
  it("returns one candidate per input position", () => {
    const positions = [pos({ id: "a" }), pos({ id: "b", amountUsd: 100 })];
    expect(buildHarvestCandidates(positions)).toHaveLength(2);
  });

  it("marks positions with wash-sale risk", () => {
    const a = pos({ id: "a", amountUsd: -1000, txDate: new Date("2024-06-01") });
    const b = pos({ id: "b", amountUsd: 200, txDate: new Date("2024-06-10") });
    const candidates = buildHarvestCandidates([a, b]);
    const ca = candidates.find((c) => c.position.id === "a")!;
    const cb = candidates.find((c) => c.position.id === "b")!;
    expect(ca.washSaleRisk).toBe(true);
    expect(cb.washSaleRisk).toBe(true);
  });

  it("sorts by amount_usd ascending (most negative first)", () => {
    const positions = [
      pos({ id: "a", amountUsd: -100 }),
      pos({ id: "b", amountUsd: -5000 }),
      pos({ id: "c", amountUsd: 200 }),
      pos({ id: "d", amountUsd: null }),
    ];
    const candidates = buildHarvestCandidates(positions);
    const amounts = candidates.map((c) => c.position.amountUsd);
    expect(amounts[0]).toBe(-5000);
    expect(amounts[1]).toBe(-100);
    expect(amounts[2]).toBe(200);
    expect(amounts[3]).toBe(null); // null last
  });

  it("attaches the correct wash-sale pairs to each candidate", () => {
    const a = pos({ id: "a", amountUsd: -800, txDate: new Date("2024-06-01") });
    const b = pos({ id: "b", amountUsd: 200, txDate: new Date("2024-06-15") });
    const candidates = buildHarvestCandidates([a, b]);
    const ca = candidates.find((c) => c.position.id === "a")!;
    expect(ca.washSalePairs).toHaveLength(1);
    expect(ca.washSalePairs[0].lossPositionId).toBe("a");
    expect(ca.washSalePairs[0].gainPositionId).toBe("b");
  });

  it("WASH_SALE_WINDOW_DAYS constant is 30", () => {
    expect(WASH_SALE_WINDOW_DAYS).toBe(30);
  });
});
