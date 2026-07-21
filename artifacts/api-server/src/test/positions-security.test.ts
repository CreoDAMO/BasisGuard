/**
 * positions-security.test.ts
 *
 * Tests the pure business-logic functions that drive security-sensitive
 * behaviour in the positions route.  HTTP-layer tests are skipped — the
 * project uses supertest but wiring the full app requires clerk + DB mocks
 * that are out of scope; the pure-function coverage is where the real
 * invariants live.
 */
import { describe, it, expect } from "vitest";
import {
  computeRequiresReview,
  OPEN_GAP_EVENT_TYPES,
  isStale,
  STALE_THRESHOLD_DAYS,
} from "../core/reviewRules.js";

// ── OPEN_GAP_EVENT_TYPES forces requires_review ───────────────────────────────

describe("positions security — open-gap event types always require review", () => {
  const openGapTypes = [
    "lp_deposit",
    "lp_withdrawal",
    "defi_yield",
    "bridge_transfer",
    "staking_reward",
    "nft_sale",
    "aave_withdraw",
    "aave_liquidation",
  ];

  for (const eventType of openGapTypes) {
    it(`computeRequiresReview is true for ${eventType} regardless of citations`, () => {
      expect(computeRequiresReview(eventType, ["cit-1", "cit-2"], false)).toBe(true);
      expect(computeRequiresReview(eventType, [], false)).toBe(true);
      expect(computeRequiresReview(eventType, undefined, false)).toBe(true);
    });
  }

  it("cannot be overridden to false even with citations and callerValue=false", () => {
    for (const eventType of openGapTypes) {
      expect(computeRequiresReview(eventType, ["cit-99"], false)).toBe(true);
    }
  });
});

// ── settled event types — no citations → requires review ──────────────────────

describe("positions security — no citations forces requires_review", () => {
  const settled = ["crypto_swap", "taxable_disposition", "aave_supply", "aave_borrow", "aave_repay"];

  it("returns true when citationIds is empty for settled types", () => {
    for (const et of settled) {
      expect(computeRequiresReview(et, [], false)).toBe(true);
    }
  });

  it("returns true when citationIds is undefined for settled types", () => {
    for (const et of settled) {
      expect(computeRequiresReview(et, undefined, false)).toBe(true);
    }
  });
});

// ── settled event types — citations present → honour caller ──────────────────

describe("positions security — callerValue honoured when citations present", () => {
  it("returns false when callerValue is false and citations present", () => {
    expect(computeRequiresReview("crypto_swap", ["cit-1"], false)).toBe(false);
  });

  it("returns true when callerValue is true and citations present", () => {
    expect(computeRequiresReview("crypto_swap", ["cit-1"], true)).toBe(true);
  });

  it("defaults to false when callerValue is undefined and citations present", () => {
    expect(computeRequiresReview("crypto_swap", ["cit-1"], undefined)).toBe(false);
  });

  it("defaults to false when callerValue is null and citations present", () => {
    expect(computeRequiresReview("crypto_swap", ["cit-1"], null)).toBe(false);
  });
});

// ── isStale — stale positions must surface for renewed review ─────────────────

describe("positions security — isStale staleness detection", () => {
  const daysAgo = (n: number) => new Date(Date.now() - n * 86400000);

  it("a reasonable_basis position older than threshold is stale", () => {
    expect(
      isStale({ tier: "reasonable_basis", supersededBy: null, createdAt: daysAgo(STALE_THRESHOLD_DAYS + 1) }),
    ).toBe(true);
  });

  it("a reasonable_basis position within threshold is NOT stale", () => {
    expect(
      isStale({ tier: "reasonable_basis", supersededBy: null, createdAt: daysAgo(STALE_THRESHOLD_DAYS - 1) }),
    ).toBe(false);
  });

  it("higher-confidence tiers are never stale, even if ancient", () => {
    const ancient = daysAgo(3650); // 10 years
    expect(isStale({ tier: "will", supersededBy: null, createdAt: ancient })).toBe(false);
    expect(isStale({ tier: "should", supersededBy: null, createdAt: ancient })).toBe(false);
    expect(isStale({ tier: "more_likely_than_not", supersededBy: null, createdAt: ancient })).toBe(false);
    expect(isStale({ tier: "substantial_authority", supersededBy: null, createdAt: ancient })).toBe(false);
  });

  it("a superseded reasonable_basis position is NOT stale regardless of age", () => {
    expect(
      isStale({
        tier: "reasonable_basis",
        supersededBy: "newer-position-uuid",
        createdAt: daysAgo(STALE_THRESHOLD_DAYS + 100),
      }),
    ).toBe(false);
  });

  it("STALE_THRESHOLD_DAYS is 180", () => {
    expect(STALE_THRESHOLD_DAYS).toBe(180);
  });
});

// ── OPEN_GAP_EVENT_TYPES set membership ───────────────────────────────────────

describe("positions security — OPEN_GAP_EVENT_TYPES set integrity", () => {
  it("contains exactly 8 event types", () => {
    expect(OPEN_GAP_EVENT_TYPES.size).toBe(8);
  });

  it("does not contain well-settled types that should NOT require forced review", () => {
    const settled = ["crypto_swap", "taxable_disposition", "aave_supply", "aave_borrow", "aave_repay"];
    for (const et of settled) {
      expect(OPEN_GAP_EVENT_TYPES.has(et)).toBe(false);
    }
  });
});
