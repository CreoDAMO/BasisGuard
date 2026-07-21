import { describe, it, expect, beforeAll, afterEach } from "vitest";

// Set SESSION_SECRET before importing encrypt so getDerivedKey() can run
const TEST_SECRET = "test-secret-32chars-minimum-ok!!";

beforeAll(() => {
  process.env["SESSION_SECRET"] = TEST_SECRET;
});

import { encrypt, decrypt } from "../lib/encrypt.js";

// ── round-trip ────────────────────────────────────────────────────────────────

describe("encrypt / decrypt", () => {
  it("round-trips a plain ASCII string", () => {
    const plaintext = "hello world";
    const { encrypted, iv, authTag } = encrypt(plaintext);
    expect(decrypt(encrypted, iv, authTag)).toBe(plaintext);
  });

  it("round-trips an empty string", () => {
    const { encrypted, iv, authTag } = encrypt("");
    expect(decrypt(encrypted, iv, authTag)).toBe("");
  });

  it("round-trips a unicode / emoji string", () => {
    const plaintext = "¡Hola! 🎉 日本語";
    const { encrypted, iv, authTag } = encrypt(plaintext);
    expect(decrypt(encrypted, iv, authTag)).toBe(plaintext);
  });

  it("round-trips a long string (>256 bytes)", () => {
    const plaintext = "A".repeat(512);
    const { encrypted, iv, authTag } = encrypt(plaintext);
    expect(decrypt(encrypted, iv, authTag)).toBe(plaintext);
  });

  // ── output shape ──────────────────────────────────────────────────────────

  it("returns an object with encrypted, iv, and authTag fields", () => {
    const result = encrypt("test");
    expect(result).toHaveProperty("encrypted");
    expect(result).toHaveProperty("iv");
    expect(result).toHaveProperty("authTag");
  });

  it("encrypted field is a non-empty base64 string", () => {
    const { encrypted } = encrypt("test");
    expect(typeof encrypted).toBe("string");
    expect(encrypted.length).toBeGreaterThan(0);
    // base64 characters only
    expect(encrypted).toMatch(/^[A-Za-z0-9+/=]+$/);
  });

  it("iv field is a 24-char hex string (12 bytes = 24 hex chars)", () => {
    const { iv } = encrypt("test");
    expect(iv).toMatch(/^[0-9a-f]{24}$/);
  });

  it("authTag field is a 32-char hex string (16 bytes GCM tag)", () => {
    const { authTag } = encrypt("test");
    expect(authTag).toMatch(/^[0-9a-f]{32}$/);
  });

  // ── random IV ─────────────────────────────────────────────────────────────

  it("produces a different IV on each call (random IV)", () => {
    const r1 = encrypt("same plaintext");
    const r2 = encrypt("same plaintext");
    expect(r1.iv).not.toBe(r2.iv);
  });

  it("produces different ciphertext on each call even for the same plaintext", () => {
    const r1 = encrypt("same plaintext");
    const r2 = encrypt("same plaintext");
    expect(r1.encrypted).not.toBe(r2.encrypted);
  });

  // ── tamper detection ──────────────────────────────────────────────────────

  it("throws when authTag is tampered (GCM integrity check)", () => {
    const { encrypted, iv } = encrypt("sensitive data");
    const badTag = "00".repeat(16); // 32 hex chars of zeroes
    expect(() => decrypt(encrypted, iv, badTag)).toThrow();
  });

  it("throws when ciphertext is tampered", () => {
    const { iv, authTag } = encrypt("sensitive data");
    const badCipher = Buffer.from("garbage").toString("base64");
    expect(() => decrypt(badCipher, iv, authTag)).toThrow();
  });
});

// ── missing SESSION_SECRET ────────────────────────────────────────────────────

describe("getDerivedKey (via encrypt)", () => {
  afterEach(() => {
    // Restore the test secret after each test that unsets it
    process.env["SESSION_SECRET"] = TEST_SECRET;
  });

  it("throws a descriptive error when SESSION_SECRET is not set", () => {
    delete process.env["SESSION_SECRET"];
    expect(() => encrypt("any")).toThrow(
      "SESSION_SECRET environment variable is required but was not set",
    );
  });

  it("throws when SESSION_SECRET is an empty string", () => {
    process.env["SESSION_SECRET"] = "";
    expect(() => encrypt("any")).toThrow(
      "SESSION_SECRET environment variable is required but was not set",
    );
  });
});
