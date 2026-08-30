/**
 * Coinbase Business Checkouts API client — USDC subscription payments.
 *
 * Replaces the discontinued Coinbase Commerce product (X-CC-Api-Key / charges).
 * Auth is a CDP JWT (ES256) minted from Business-scoped keys.
 *
 * This file is the *merchant* rail. Customer Coinbase tx import still lives in
 * coinbaseClient.ts and must keep using the user's own read-only keys.
 *
 * Docs:
 *   https://docs.cdp.coinbase.com/coinbase-business/checkout-apis/overview
 *   https://docs.cdp.coinbase.com/api-reference/business-api/rest-api/checkouts/create-checkout
 */
import crypto from "node:crypto";
import type { IncomingHttpHeaders } from "node:http";

const BUSINESS_API_HOST = "business.coinbase.com";
const BUSINESS_API_BASE = `https://${BUSINESS_API_HOST}`;

export interface BusinessCheckout {
  id: string;
  url: string;
  amount: string;
  currency: string;
  status: string;
  expiresAt?: string;
  metadata?: Record<string, string>;
  eventType?: string;
  transactionHash?: string;
}

export interface CheckoutWebhookPayload extends BusinessCheckout {
  eventType: string;
}

function businessCredentials(): { keyName: string; privateKeyPem: string } {
  const keyName = process.env.COINBASE_BUSINESS_KEY_NAME;
  const privateKeyPem = process.env.COINBASE_BUSINESS_PRIVATE_KEY;
  if (!keyName || !privateKeyPem) {
    throw new Error(
      "COINBASE_BUSINESS_KEY_NAME and COINBASE_BUSINESS_PRIVATE_KEY must be set (CDP JWT keys — not old X-CC-Api-Key Commerce credentials)",
    );
  }
  return { keyName, privateKeyPem };
}

/**
 * CDP ES256 JWT for a single Business API request.
 * `uri` is `METHOD host path` matching the request, e.g.
 * `POST business.coinbase.com/api/v1/checkouts`.
 */
export function buildBusinessJwt(method: string, path: string): string {
  const { keyName, privateKeyPem } = businessCredentials();
  const now = Math.floor(Date.now() / 1000);
  const nonce = crypto.randomBytes(16).toString("hex");

  const header = Buffer.from(
    JSON.stringify({ alg: "ES256", kid: keyName, nonce }),
  ).toString("base64url");

  const payload = Buffer.from(
    JSON.stringify({
      sub: keyName,
      iss: "cdp",
      nbf: now,
      exp: now + 120,
      uri: `${method.toUpperCase()} ${BUSINESS_API_HOST}${path}`,
    }),
  ).toString("base64url");

  const signingInput = `${header}.${payload}`;
  const pem = privateKeyPem.replace(/\\n/g, "\n").trim();
  // ES256 JWT signing with an EC private key — not password hashing.
  // codeql[js/insufficient-password-hash]
  const signer = crypto.createSign("SHA256");
  signer.update(signingInput);
  const signature = signer
    .sign({ key: pem, dsaEncoding: "ieee-p1363" })
    .toString("base64url");

  return `${signingInput}.${signature}`;
}

async function businessFetch<T>(method: string, path: string, body?: unknown): Promise<T> {
  const jwt = buildBusinessJwt(method, path);
  const headers: Record<string, string> = {
    Authorization: `Bearer ${jwt}`,
    "Content-Type": "application/json",
  };
  if (method !== "GET") {
    headers["X-Idempotency-Key"] = crypto.randomUUID();
  }

  const res = await fetch(`${BUSINESS_API_BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Coinbase Business ${method} ${path} → ${res.status}: ${text}`);
  }

  return res.json() as Promise<T>;
}

function httpsRedirects(): {
  successRedirectUrl?: string;
  failRedirectUrl?: string;
} {
  const raw = process.env.PUBLIC_APP_URL ?? process.env.APP_URL ?? "";
  const appUrl = raw.replace(/\/$/, "");
  if (!appUrl.startsWith("https://")) return {};
  return {
    successRedirectUrl: `${appUrl}/billing?checkout=success`,
    failRedirectUrl: `${appUrl}/billing?checkout=failed`,
  };
}

/** Create a single-use hosted checkout for a subscription plan. */
export async function createCheckout(params: {
  description: string;
  amountUsdc: string;
  metadata: Record<string, string>;
}): Promise<BusinessCheckout> {
  return businessFetch<BusinessCheckout>("POST", "/api/v1/checkouts", {
    amount: params.amountUsdc,
    currency: "USDC",
    description: params.description,
    metadata: params.metadata,
    ...httpsRedirects(),
  });
}

/** Fetch a checkout by ID (poll until COMPLETED — do not trust the redirect alone). */
export async function getCheckout(checkoutId: string): Promise<BusinessCheckout> {
  return businessFetch<BusinessCheckout>("GET", `/api/v1/checkouts/${encodeURIComponent(checkoutId)}`);
}

function headerValue(headers: IncomingHttpHeaders, name: string): string {
  const v = headers[name.toLowerCase()];
  if (Array.isArray(v)) return v[0] ?? "";
  return v ?? "";
}

/**
 * Verify the X-Hook0-Signature header (Coinbase Business / Hook0).
 * Header format: `t=<unix>,h=<header names>,v1=<hex hmac-sha256>`
 * Signed payload: `timestamp.headerNames.headerValues.rawBody`
 *
 * Returns false on a malformed header or mismatch. Throws only if the
 * webhook secret env var is missing.
 */
export function verifyWebhookSignature(
  rawBody: string,
  signatureHeader: string,
  requestHeaders: IncomingHttpHeaders,
  maxAgeMinutes = 5,
): boolean {
  const secret = process.env.COINBASE_BUSINESS_WEBHOOK_SECRET;
  if (!secret) {
    throw new Error("COINBASE_BUSINESS_WEBHOOK_SECRET is not set");
  }

  const parts = Object.fromEntries(
    signatureHeader
      .split(",")
      .map((el) => el.trim().split("="))
      .filter((kv): kv is [string, string] => kv.length >= 2)
      .map(([k, ...rest]) => [k, rest.join("=")]),
  );

  const timestamp = parts["t"];
  const headerNames = parts["h"] ?? "";
  const provided = (parts["v1"] ?? "").trim().toLowerCase();
  if (!timestamp || !/^[a-f0-9]{64}$/.test(provided)) return false;

  const tsSec = Number(timestamp);
  if (!Number.isFinite(tsSec)) return false;
  const ageMinutes = (Date.now() - tsSec * 1000) / (1000 * 60);
  if (ageMinutes > maxAgeMinutes || ageMinutes < -1) return false;

  const headerValues = headerNames
    .split(" ")
    .filter(Boolean)
    .map((name) => headerValue(requestHeaders, name))
    .join(".");

  const signedPayload = `${timestamp}.${headerNames}.${headerValues}.${rawBody}`;
  const computed = crypto.createHmac("sha256", secret).update(signedPayload, "utf8").digest("hex");

  try {
    return crypto.timingSafeEqual(Buffer.from(computed, "hex"), Buffer.from(provided, "hex"));
  } catch {
    return false;
  }
}
