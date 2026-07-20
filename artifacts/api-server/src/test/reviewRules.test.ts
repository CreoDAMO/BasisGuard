import { describe, it, expect } from "vitest";
import {
  computeRequiresReview,
  OPEN_GAP_EVENT_TYPES,
  isStale,
  STALE_THRESHOLD_DAYS,
} from "../core/reviewRules.js";

// ── OPEN_GAP_EVENT_TYPES ──────────────────────────────────────────────────────

describe("OPEN_GAP_EVENT_TYPES", () => {
  const IRS_GUIDANCE_GAP = [
    "lp_deposit",
    "lp_withdrawal",
    "defi_yield",
    "bridge_transfer",
    "staking_reward",
    "nft_sale",
  ];

  it("contains all six IRS guidance-gap categories (Notice 2024-57)", () => {
    for (const e of IRS_GUIDANCE_GAP) {
      expect(OPEN_GAP_EVENT_TYPES.has(e), `expected ${e} in OPEN_GAP_EVENT_TYPES`).toBe(true);
    }
  });

  it("contains the two Aave fact-pattern-gap categories", () => {
    expect(OPEN_GAP_EVENT_TYPES.has("aave_withdraw")).toBe(true);
    expect(OPEN_GAP_EVENT_TYPES.has("aave_liquidation")).toBe(true);
  });

  it("does NOT contain well-settled event types", () => {
    const settled = ["crypto_swap", "taxable_disposition", "aave_supply", "aave_borrow", "aave_repay"];
    for (const e of settled) {
      expect(OPEN_GAP_EVENT_TYPES.has(e), `did not expect ${e} in OPEN_GAP_EVENT_TYPES`).toBe(false);
    }
  });
});

// ── computeRequiresReview ─────────────────────────────────────────────────────

describe("computeRequiresReview", () => {
  describe("open-gap event types", () => {
    it("always returns true regardless of citations or caller value", () => {
      expect(computeRequiresReview("lp_deposit", ["cit-1", "cit-2"], false)).toBe(true);
      expect(computeRequiresReview("aave_liquidation", ["cit-1"], false)).toBe(true);
      expect(computeRequiresReview("bridge_transfer", undefined, false)).toBe(true);
      expect(computeRequiresReview("staking_reward", [], false)).toBe(true);
    });
  });

  describe("settled event types — no citations", () => {
    it("returns true when citationIds is empty", () => {
      expect(computeRequiresReview("crypto_swap", [], false)).toBe(true);
      expect(computeRequiresReview("crypto_swap", [], true)).toBe(true);
    });

    it("returns true when citationIds is undefined", () => {
      expect(computeRequiresReview("crypto_swap", undefined, false)).toBe(true);
    });
  });

  describe("settled event types — citations present", () => {
    it("honours false caller value", () => {
      expect(computeRequiresReview("crypto_swap", ["cit-1"], false)).toBe(false);
    });

    it("honours true caller value", () => {
      expect(computeRequiresReview("crypto_swap", ["cit-1"], true)).toBe(true);
    });

    it("defaults to false when caller value is undefined", () => {
      expect(computeRequiresReview("crypto_swap", ["cit-1"], undefined)).toBe(false);
    });

    it("defaults to false when caller value is null", () => {
      expect(computeRequiresReview("crypto_swap", ["cit-1"], null)).toBe(false);
    });
  });
});

// ── isStale ───────────────────────────────────────────────────────────────────

describe("isStale", () => {
  const daysAgo = (n: number) => new Date(Date.now() - n * 86400000);

  it("returns false for non-reasonable_basis tiers", () => {
    expect(isStale({ tier: "will", supersededBy: null, createdAt: daysAgo(200) })).toBe(false);
    expect(isStale({ tier: "should", supersededBy: null, createdAt: daysAgo(200) })).toBe(false);
    expect(isStale({ tier: "substantial_authority", supersededBy: null, createdAt: daysAgo(200) })).toBe(false);
  });

  it("returns false for superseded positions regardless of age", () => {
    expect(
      isStale({ tier: "reasonable_basis", supersededBy: "some-uuid", createdAt: daysAgo(500) }),
    ).toBe(false);
  });

  it("returns false for reasonable_basis positions within the threshold", () => {
    expect(
      isStale({ tier: "reasonable_basis", supersededBy: null, createdAt: daysAgo(STALE_THRESHOLD_DAYS - 1) }),
    ).toBe(false);
  });

  it("returns true for reasonable_basis positions past the threshold", () => {
    expect(
      isStale({ tier: "reasonable_basis", supersededBy: null, createdAt: daysAgo(STALE_THRESHOLD_DAYS + 1) }),
    ).toBe(true);
  });
});
