/**
 * exchanges.test.ts
 *
 * Tests for exchange connector logic: credential masking, key-type detection,
 * event-type mapping, and connection serialization.
 *
 * HTTP-layer tests (POST /kraken/sync, POST /gemini/sync, etc.) require
 * Clerk mocks and network stubs — those are marked as todos.
 */

import { describe, it, expect, beforeAll } from "vitest";

// SESSION_SECRET must be set before importing encrypt
beforeAll(() => {
  process.env["SESSION_SECRET"] = "test-secret-exchanges-32chars-ok!";
});

import { encrypt, decrypt } from "../lib/encrypt.js";
import { isCdpKey, mapEventType } from "../lib/coinbaseClient.js";

// ── Credential masking ────────────────────────────────────────────────────────

/**
 * Mirrors the maskKey helper in routes/exchanges.ts and maskApiKey in
 * routes/coinbase.ts — both use the same pattern.
 */
function maskKey(key: string): string {
  if (key.length <= 8) return "****" + key.slice(-4);
  return key.slice(0, 4) + "****" + key.slice(-4);
}

describe("credential masking", () => {
  it("masks a normal-length key", () => {
    expect(maskKey("ABCDEFGHIJ1234")).toBe("ABCD****1234");
  });

  it("masks a short key (≤8 chars) by showing only last 4", () => {
    expect(maskKey("A1B2C3D4")).toBe("****C3D4");
    expect(maskKey("SHORT")).toBe("****HORT");
  });

  it("does not expose the middle of the key", () => {
    const key = "SUPERSECRETAPIKEY123456";
    const masked = maskKey(key);
    expect(masked).not.toContain("SECRETAPIKEY");
    expect(masked.startsWith("SUPE")).toBe(true);
    expect(masked.endsWith("3456")).toBe(true);
  });

  it("preserves exactly 4 leading + 4 trailing chars for long keys", () => {
    const key = "ABCD_middle_section_EFGH";
    const masked = maskKey(key);
    expect(masked).toBe("ABCD****EFGH");
  });
});

// ── CDP key detection ─────────────────────────────────────────────────────────

describe("isCdpKey detection", () => {
  it("detects a CDP key by org path in api_key", () => {
    expect(
      isCdpKey("organizations/abc123/apiKeys/def456", "anySecret"),
    ).toBe(true);
  });

  it("detects a CDP key by PEM header in api_secret", () => {
    expect(
      isCdpKey("any-key-name", "-----BEGIN EC PRIVATE KEY-----\nMHQCAQ..."),
    ).toBe(true);
  });

  it("detects PKCS#8 PEM format too", () => {
    expect(
      isCdpKey("any-key-name", "-----BEGIN PRIVATE KEY-----\nMIGH..."),
    ).toBe(true);
  });

  it("does NOT flag a legacy short key as CDP", () => {
    expect(isCdpKey("LEGACYKEY123", "LEGACYSECRET456")).toBe(false);
  });
});

// ── Coinbase event type mapping ───────────────────────────────────────────────

describe("mapEventType — Coinbase V2 type mapping", () => {
  const KNOWN_MAPPINGS: [string, string][] = [
    ["buy", "taxable_acquisition"],
    ["sell", "taxable_disposition"],
    ["send", "taxable_disposition"],
    ["receive", "taxable_acquisition"],
    ["trade", "crypto_swap"],
    ["staking_transfer", "staking_reward"],
    ["earn_payout", "staking_reward"],
    ["inflation_reward", "staking_reward"],
    ["wrap_asset", "bridge_transfer"],
    ["unwrap_asset", "bridge_transfer"],
    ["exchange_deposit", "non_taxable_transfer"],
    ["exchange_withdrawal", "non_taxable_transfer"],
    ["fiat_deposit", "fiat_deposit"],
    ["fiat_withdrawal", "fiat_withdrawal"],
  ];

  for (const [input, expected] of KNOWN_MAPPINGS) {
    it(`maps Coinbase "${input}" → BasisGuard "${expected}"`, () => {
      expect(mapEventType(input)).toBe(expected);
    });
  }

  it('unknown types get "coinbase_" prefix', () => {
    expect(mapEventType("some_new_type")).toBe("coinbase_some_new_type");
    expect(mapEventType("card_purchase")).toBe("coinbase_card_purchase");
  });

  it("unknown type with empty string prefix becomes coinbase_", () => {
    expect(mapEventType("")).toBe("coinbase_");
  });
});

// ── Credential encryption round-trip ─────────────────────────────────────────

describe("exchange credential encryption (AES-256-GCM)", () => {
  it("round-trips a Kraken API secret", () => {
    const secret = "kQd7nJw5XpLmFzT0eR3bVaYgUhI9Cs1oNiM8OkPq2HjE4lWA6yDvuBXtGcRfSZ";
    const { encrypted, iv, authTag } = encrypt(secret);
    expect(decrypt(encrypted, iv, authTag)).toBe(secret);
  });

  it("round-trips a Gemini API secret", () => {
    const secret = "5mK9nJpQxzYv2TcWfDbR8eAhNgL0HsOtUVXiCr1BkFlP4jEuSaGwZdMoYqI6T3";
    const { encrypted, iv, authTag } = encrypt(secret);
    expect(decrypt(encrypted, iv, authTag)).toBe(secret);
  });

  it("round-trips a multi-line CDP EC private key", () => {
    // Simulated PEM key (not a real key)
    const pem = [
      "-----BEGIN EC PRIVATE KEY-----",
      "MHQCAQEEIOFkJmXqEKBP3WsMrHb2cAr0SEnHe+o4FIqBOdPX1BsooAoGCCqGSM49",
      "AwEHoWQDYgAEJexmfxm7TIe4vAMxQ2MRaYjG+GkEHfYQsVzS6KJL0oHAYZKT4qIl",
      "-----END EC PRIVATE KEY-----",
    ].join("\n");
    const { encrypted, iv, authTag } = encrypt(pem);
    expect(decrypt(encrypted, iv, authTag)).toBe(pem);
  });

  it("each encryption call produces a unique IV", () => {
    const secret = "same-secret";
    const r1 = encrypt(secret);
    const r2 = encrypt(secret);
    expect(r1.iv).not.toBe(r2.iv);
  });
});

// ── Exchange chain UUIDs ──────────────────────────────────────────────────────

describe("virtual chain UUIDs for CEX exchanges", () => {
  /**
   * These UUIDs are deterministic and must never change — any existing
   * raw_transactions rows are keyed on them.
   */
  const CHAIN_UUIDS: Record<string, string> = {
    kraken: "00000000-0000-0000-0000-e00000000001",
    gemini: "00000000-0000-0000-0000-e00000000002",
  };

  it("Kraken chain UUID is a valid UUID v4-like string", () => {
    expect(CHAIN_UUIDS["kraken"]).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
  });

  it("Gemini chain UUID is a valid UUID v4-like string", () => {
    expect(CHAIN_UUIDS["gemini"]).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
  });

  it("Kraken and Gemini UUIDs are distinct", () => {
    expect(CHAIN_UUIDS["kraken"]).not.toBe(CHAIN_UUIDS["gemini"]);
  });

  it("Coinbase CEX UUID is distinct from Kraken and Gemini", () => {
    const COINBASE_CHAIN_UUID = "00000000-0000-0000-0000-c01bba5e0000";
    expect(COINBASE_CHAIN_UUID).not.toBe(CHAIN_UUIDS["kraken"]);
    expect(COINBASE_CHAIN_UUID).not.toBe(CHAIN_UUIDS["gemini"]);
  });
});

// ── HTTP-layer tests (todo — requires Clerk + DB mocks) ───────────────────────

describe("exchanges HTTP-layer (blocked on Clerk/DB mocking)", () => {
  it.todo("GET /kraken/connection returns { connected: false } when no row exists");
  it.todo("POST /kraken/connection saves encrypted credentials and returns masked key");
  it.todo("DELETE /kraken/connection removes the row");
  it.todo("POST /kraken/sync returns 400 when no connection is configured");
  it.todo("POST /kraken/sync updates last_synced_at and tx_count on success");
  it.todo("POST /kraken/sync sets status=error when Kraken API returns 401");
  it.todo("GET /gemini/connection returns { connected: false } when no row exists");
  it.todo("POST /gemini/connection saves encrypted credentials and returns masked key");
  it.todo("POST /gemini/sync returns 400 when no connection is configured");
  it.todo("POST /kraken/sync is rate-limited to 10 req/min by strictLimiter");
  it.todo("POST /gemini/sync is rate-limited to 10 req/min by strictLimiter");
});
