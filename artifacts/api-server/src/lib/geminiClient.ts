/**
 * Gemini Exchange REST API client.
 *
 * Authentication: HMAC-SHA384 over base64-encoded JSON payload.
 * Ref: https://docs.gemini.com/rest-api/#private-api-invocation
 */

import crypto from "node:crypto";

const BASE_URL = "https://api.gemini.com";

export interface GeminiTrade {
  order_id: string;
  trade_id: string;
  timestamp: number;     // Unix seconds
  timestampms: number;   // Unix milliseconds
  type: "Buy" | "Sell";
  aggressor: boolean;
  fee_currency: string;
  fee_amount: string;
  symbol: string;        // e.g. "BTCUSD"
  price: string;
  amount: string;        // quantity
  is_auction_fill: boolean;
}

export interface GeminiTransfer {
  type: "Deposit" | "Withdrawal";
  status: string;
  timestampms: number;
  eid: string;
  currency: string;
  amount: string;
  method?: string;
  txHash?: string;
  outputIdx?: number;
  destination?: string;
  purpose?: string;
}

function sign(apiSecret: string, payload: string): string {
  return crypto.createHmac("sha384", apiSecret).update(payload).digest("hex");
}

async function privateRequest<T>(
  apiKey: string,
  apiSecret: string,
  endpoint: string,
  body: Record<string, unknown> = {},
): Promise<T> {
  const nonce = Date.now();
  const payload = Buffer.from(
    JSON.stringify({ request: endpoint, nonce, ...body }),
  ).toString("base64");
  const signature = sign(apiSecret, payload);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);

  try {
    const resp = await fetch(`${BASE_URL}${endpoint}`, {
      method: "POST",
      headers: {
        "Content-Type": "text/plain",
        "X-GEMINI-APIKEY": apiKey,
        "X-GEMINI-PAYLOAD": payload,
        "X-GEMINI-SIGNATURE": signature,
      },
      body: payload,
      signal: controller.signal,
    });

    if (!resp.ok) {
      const err = (await resp.json().catch(() => ({}))) as { message?: string };
      throw new Error(`Gemini API error: ${err.message ?? `HTTP ${resp.status}`}`);
    }

    return (await resp.json()) as T;
  } finally {
    clearTimeout(timeout);
  }
}

/** Validate credentials by fetching account balances. */
export async function validateCredentials(apiKey: string, apiSecret: string): Promise<boolean> {
  try {
    await privateRequest(apiKey, apiSecret, "/v1/balances");
    return true;
  } catch {
    return false;
  }
}

/** Fetch all past trades (up to 500 most recent per symbol). */
export async function fetchTrades(
  apiKey: string,
  apiSecret: string,
  symbol: string,
  timestampMs?: number,
): Promise<GeminiTrade[]> {
  const body: Record<string, unknown> = { symbol, limit_trades: 500 };
  if (timestampMs) body.timestamp = Math.floor(timestampMs / 1000);

  return privateRequest<GeminiTrade[]>(apiKey, apiSecret, "/v1/mytrades", body);
}

/** Fetch transfers (deposits + withdrawals). */
export async function fetchTransfers(
  apiKey: string,
  apiSecret: string,
  timestampMs?: number,
): Promise<GeminiTransfer[]> {
  const body: Record<string, unknown> = { limit_transfers: 500 };
  if (timestampMs) body.timestamp = Math.floor(timestampMs / 1000);

  return privateRequest<GeminiTransfer[]>(apiKey, apiSecret, "/v1/transfers", body);
}

/** Extract the asset symbol from a Gemini trading pair (e.g. "BTCUSD" → "BTC"). */
export function symbolFromPair(pair: string): string {
  // Gemini pairs are BASEQUOTE — quote is always 3 chars (USD, BTC, ETH)
  const known3 = ["USD", "BTC", "ETH", "DAI"];
  for (const quote of known3) {
    if (pair.endsWith(quote) && pair.length > quote.length) {
      return pair.slice(0, pair.length - quote.length);
    }
  }
  return pair;
}

/** Map Gemini event to BasisGuard event type. */
export function mapGeminiEventType(type: string): string {
  const map: Record<string, string> = {
    Buy: "buy",
    Sell: "taxable_disposition",
    Deposit: "receive",
    Withdrawal: "send",
  };
  return map[type] ?? "receive";
}
