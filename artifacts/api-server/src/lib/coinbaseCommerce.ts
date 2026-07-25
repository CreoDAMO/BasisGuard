/**
 * Coinbase Commerce API client — used for accepting USDC subscription payments.
 *
 * Separate from coinbaseClient.ts (which is for syncing the *user's* exchange
 * transactions via CDP). Commerce is the merchant checkout product.
 *
 * Docs: https://docs.cloud.coinbase.com/commerce/reference/
 */
import crypto from "node:crypto";

const COMMERCE_API_BASE = "https://api.commerce.coinbase.com";
const COMMERCE_API_VERSION = "2018-03-22";

function commerceHeaders(extraHeaders?: Record<string, string>): Record<string, string> {
  const apiKey = process.env.COINBASE_COMMERCE_API_KEY;
  if (!apiKey) throw new Error("COINBASE_COMMERCE_API_KEY is not set");
  return {
    "X-CC-Api-Key": apiKey,
    "X-CC-Version": COMMERCE_API_VERSION,
    "Content-Type": "application/json",
    ...extraHeaders,
  };
}

export interface CommerceCharge {
  id: string;
  code: string;
  hosted_url: string;
  expires_at: string;
  metadata: Record<string, string>;
}

export interface CommerceWebhookEvent {
  id: string;
  type: string; // "charge:confirmed" | "charge:failed" | "charge:expired" | "charge:pending" | "charge:delayed"
  data: {
    id: string;
    code: string;
    metadata: Record<string, string>;
  };
}

/** Create a hosted Commerce checkout page for a subscription plan. */
export async function createCharge(params: {
  name: string;
  description: string;
  amountUsdc: string;
  metadata: Record<string, string>;
}): Promise<CommerceCharge> {
  const res = await fetch(`${COMMERCE_API_BASE}/charges`, {
    method: "POST",
    headers: commerceHeaders(),
    body: JSON.stringify({
      name: params.name,
      description: params.description,
      pricing_type: "fixed_price",
      local_price: { amount: params.amountUsdc, currency: "USD" },
      metadata: params.metadata,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Coinbase Commerce createCharge ${res.status}: ${text}`);
  }

  const body = (await res.json()) as { data: CommerceCharge };
  return body.data;
}

/** Fetch a charge by ID to check its current state. */
export async function getCharge(chargeId: string): Promise<CommerceCharge> {
  const res = await fetch(`${COMMERCE_API_BASE}/charges/${chargeId}`, {
    headers: commerceHeaders(),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Coinbase Commerce getCharge ${res.status}: ${text}`);
  }

  const body = (await res.json()) as { data: CommerceCharge };
  return body.data;
}

/**
 * Verify the X-CC-Webhook-Signature header against the raw request body.
 * Returns true only if the signatures match.
 */
export function verifyWebhookSignature(rawBody: string, signature: string): boolean {
  const secret = process.env.COINBASE_COMMERCE_WEBHOOK_SECRET;
  if (!secret) {
    throw new Error("COINBASE_COMMERCE_WEBHOOK_SECRET is not set");
  }
  const computed = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
  return crypto.timingSafeEqual(Buffer.from(computed, "hex"), Buffer.from(signature, "hex"));
}
