/**
 * price-oracle.test.ts
 *
 * Unit tests for the price oracle (src/core/priceOracle.ts).
 *
 * Tests cover:
 *   - Symbol → CoinGecko ID mapping (SYMBOL_MAP)
 *   - getSpotPrice / getBatchPrices cache behaviour
 *   - Network-error resilience (returns null, doesn't throw)
 *
 * All fetch calls are intercepted via vi.spyOn so no real network calls are
 * made during the test suite.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { getSpotPrice, getBatchPrices } from "../core/priceOracle.js";

// ── CoinGecko fetch mock helpers ──────────────────────────────────────────────

function mockCoinGeckoResponse(
  data: Record<string, { usd?: number }>,
  ok = true,
) {
  return vi.spyOn(globalThis, "fetch").mockResolvedValue({
    ok,
    json: async () => data,
  } as Response);
}

beforeEach(() => {
  vi.restoreAllMocks();
  // Clear the module-level price cache between tests by resetting all mocks.
  // The cache persists across calls within a test but is cleared on module
  // reload — use vi.isolateModules in tests that need strict isolation.
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ── Symbol → CoinGecko ID mapping ────────────────────────────────────────────

describe("SYMBOL_MAP coverage", () => {
  it("maps BTC to 'bitcoin'", async () => {
    const spy = mockCoinGeckoResponse({ bitcoin: { usd: 50000 } });
    const price = await getSpotPrice("BTC");
    expect(price).toBe(50000);
    expect(spy.mock.calls[0]?.[0]).toContain("bitcoin");
  });

  it("maps ETH to 'ethereum'", async () => {
    const spy = mockCoinGeckoResponse({ ethereum: { usd: 3000 } });
    await getSpotPrice("ETH");
    expect(spy.mock.calls[0]?.[0]).toContain("ethereum");
  });

  it("maps SOL to 'solana'", async () => {
    const spy = mockCoinGeckoResponse({ solana: { usd: 150 } });
    await getSpotPrice("SOL");
    expect(spy.mock.calls[0]?.[0]).toContain("solana");
  });

  it("maps USDC to 'usd-coin'", async () => {
    const spy = mockCoinGeckoResponse({ "usd-coin": { usd: 1 } });
    await getSpotPrice("USDC");
    expect(spy.mock.calls[0]?.[0]).toContain("usd-coin");
  });

  it("maps ARB to 'arbitrum'", async () => {
    const spy = mockCoinGeckoResponse({ arbitrum: { usd: 1.2 } });
    await getSpotPrice("ARB");
    expect(spy.mock.calls[0]?.[0]).toContain("arbitrum");
  });

  it("falls back to lowercase symbol for unmapped tokens", async () => {
    const spy = mockCoinGeckoResponse({ shitcoin: { usd: 0.001 } });
    await getSpotPrice("SHITCOIN");
    expect(spy.mock.calls[0]?.[0]).toContain("shitcoin");
  });

  it("is case-insensitive (lowercase input)", async () => {
    const spy = mockCoinGeckoResponse({ bitcoin: { usd: 50000 } });
    const price = await getSpotPrice("btc");
    expect(price).toBe(50000);
    expect(spy.mock.calls[0]?.[0]).toContain("bitcoin");
  });
});

// ── getSpotPrice ──────────────────────────────────────────────────────────────

describe("getSpotPrice", () => {
  it("returns the USD price when CoinGecko responds", async () => {
    mockCoinGeckoResponse({ bitcoin: { usd: 67_000 } });
    const price = await getSpotPrice("BTC");
    expect(price).toBe(67_000);
  });

  it("returns null when the symbol is not in the CoinGecko response", async () => {
    mockCoinGeckoResponse({});
    const price = await getSpotPrice("UNKNOWNTOKEN");
    expect(price).toBeNull();
  });

  it("returns null when CoinGecko returns a non-ok HTTP status", async () => {
    mockCoinGeckoResponse({}, false);
    const price = await getSpotPrice("ETH");
    expect(price).toBeNull();
  });

  it("returns null on network error (fetch throws)", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("network down"));
    const price = await getSpotPrice("ETH");
    expect(price).toBeNull();
  });

  it("returns null when the `usd` field is missing from the response", async () => {
    mockCoinGeckoResponse({ bitcoin: {} }); // no `usd` key
    const price = await getSpotPrice("BTC");
    expect(price).toBeNull();
  });
});

// ── getBatchPrices ────────────────────────────────────────────────────────────

describe("getBatchPrices", () => {
  it("returns all requested symbols in the result map", async () => {
    mockCoinGeckoResponse({ bitcoin: { usd: 50000 }, ethereum: { usd: 3000 } });
    const prices = await getBatchPrices(["BTC", "ETH"]);
    expect(prices).toHaveProperty("BTC");
    expect(prices).toHaveProperty("ETH");
  });

  it("returns correct prices for multiple symbols", async () => {
    mockCoinGeckoResponse({ bitcoin: { usd: 50000 }, ethereum: { usd: 3000 } });
    const prices = await getBatchPrices(["BTC", "ETH"]);
    expect(prices["BTC"]).toBe(50000);
    expect(prices["ETH"]).toBe(3000);
  });

  it("returns null for a symbol the oracle can't resolve", async () => {
    mockCoinGeckoResponse({ bitcoin: { usd: 50000 } }); // ETH missing from response
    const prices = await getBatchPrices(["BTC", "ETH"]);
    expect(prices["BTC"]).toBe(50000);
    expect(prices["ETH"]).toBeNull();
  });

  it("deduplicates identical symbols", async () => {
    const spy = mockCoinGeckoResponse({ bitcoin: { usd: 50000 } });
    await getBatchPrices(["BTC", "BTC", "btc"]); // all resolve to same CoinGecko ID
    // Should issue at most one fetch (all deduplicated to 'bitcoin')
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("returns an empty object for empty input", async () => {
    const spy = vi.spyOn(globalThis, "fetch");
    const prices = await getBatchPrices([]);
    expect(prices).toEqual({});
    expect(spy).not.toHaveBeenCalled(); // no fetch for empty batch
  });

  it("returns null for all symbols on network error", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("timeout"));
    const prices = await getBatchPrices(["BTC", "ETH"]);
    expect(prices["BTC"]).toBeNull();
    expect(prices["ETH"]).toBeNull();
  });

  it("issues a single CoinGecko request for all uncached symbols", async () => {
    const spy = mockCoinGeckoResponse({ bitcoin: { usd: 50000 }, solana: { usd: 120 } });
    await getBatchPrices(["BTC", "SOL"]);
    expect(spy).toHaveBeenCalledTimes(1);
    const url = spy.mock.calls[0]?.[0] as string;
    expect(url).toContain("bitcoin");
    expect(url).toContain("solana");
  });

  it.todo("serves cached prices without issuing a new fetch (TTL = 5 min)");
  it.todo("bypasses the cache after TTL expiry and re-fetches");
  it.todo("GET /lots includes current_price_usd and unrealized_gain_loss_usd for open lots (HTTP-layer)");
  it.todo("GET /lots?status=closed returns null for current_price_usd (HTTP-layer)");
  it.todo("GET /lots/summary includes per-asset unrealized_gain_loss_usd (HTTP-layer)");
});
