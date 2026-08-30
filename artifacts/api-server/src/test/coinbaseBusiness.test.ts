import { describe, it, expect, beforeAll } from "vitest";
import crypto from "node:crypto";
import { verifyWebhookSignature } from "../lib/coinbaseBusiness.js";

const SECRET = "test-webhook-secret-basisguard";

beforeAll(() => {
  process.env["COINBASE_BUSINESS_WEBHOOK_SECRET"] = SECRET;
});

function sign(rawBody: string, timestamp: number, headerNames = "", extraHeaders: Record<string, string> = {}) {
  const headerValues = headerNames
    .split(" ")
    .filter(Boolean)
    .map((name) => extraHeaders[name.toLowerCase()] ?? "")
    .join(".");
  const signedPayload = `${timestamp}.${headerNames}.${headerValues}.${rawBody}`;
  const v1 = crypto.createHmac("sha256", SECRET).update(signedPayload, "utf8").digest("hex");
  const header = headerNames
    ? `t=${timestamp},h=${headerNames},v1=${v1}`
    : `t=${timestamp},v1=${v1}`;
  return { header, headers: extraHeaders };
}

describe("Coinbase Business webhook signatures", () => {
  const body = JSON.stringify({
    id: "68f7a946db0529ea9b6d3a12",
    eventType: "checkout.payment.success",
    status: "COMPLETED",
    metadata: { user_id: "u1", plan: "pro", billing_period: "monthly" },
  });

  it("accepts a valid current signature", () => {
    const ts = Math.floor(Date.now() / 1000);
    const { header, headers } = sign(body, ts);
    expect(verifyWebhookSignature(body, header, headers)).toBe(true);
  });

  it("accepts a valid signature that covers extra headers", () => {
    const ts = Math.floor(Date.now() / 1000);
    const extra = { "content-type": "application/json" };
    const { header, headers } = sign(body, ts, "content-type", extra);
    expect(verifyWebhookSignature(body, header, headers)).toBe(true);
  });

  it("rejects a tampered body", () => {
    const ts = Math.floor(Date.now() / 1000);
    const { header, headers } = sign(body, ts);
    expect(verifyWebhookSignature(body + " ", header, headers)).toBe(false);
  });

  it("rejects a wrong signature hex", () => {
    const ts = Math.floor(Date.now() / 1000);
    const header = `t=${ts},v1=${"ab".repeat(32)}`;
    expect(verifyWebhookSignature(body, header, {})).toBe(false);
  });

  it("rejects a replay older than the max age", () => {
    const ts = Math.floor(Date.now() / 1000) - 10 * 60;
    const { header, headers } = sign(body, ts);
    expect(verifyWebhookSignature(body, header, headers)).toBe(false);
  });

  it("rejects a malformed header", () => {
    expect(verifyWebhookSignature(body, "not-a-signature", {})).toBe(false);
  });
});
