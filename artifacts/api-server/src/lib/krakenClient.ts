/**
 * Kraken Exchange REST API v2 client.
 *
 * Authentication: HMAC-SHA512 over (path + nonce + body), signed with the
 * private key (base64-decoded).  Nonce = current timestamp in milliseconds.
 *
 * Ref: https://docs.kraken.com/api/docs/guides/spot-rest-auth
 */

import crypto from "node:crypto";

const BASE_URL = "https://api.kraken.com";

export interface KrakenTrade {
  txid: string;
  pair: string;
  time: number;       // Unix timestamp
  type: "buy" | "sell";
  ordertype: string;
  price: string;
  vol: string;        // volume (quantity)
  cost: string;       // total cost in quote currency
  fee: string;
  asset: string;      // derived from pair
}

export interface KrakenLedgerEntry {
  refid: string;
  time: number;
  type: string;       // trade | withdrawal | deposit | staking | etc.
  asset: string;
  amount: string;
  fee: string;
  balance: string;
}

/** Signs a private Kraken API request and returns the API-Sign header value. */
function sign(path: string, nonce: number, postData: string, secret: string): string {
  const message = nonce + postData;
  const secretBuffer = Buffer.from(secret, "base64");
  const hash = crypto.createHash("sha256").update(nonce + postData).digest();
  const hmac = crypto.createHmac("sha512", secretBuffer);
  hmac.update(path);
  hmac.update(hash);
  return hmac.digest("base64");
}

async function privateRequest<T>(
  apiKey: string,
  apiSecret: string,
  endpoint: string,
  params: Record<string, string | number> = {},
): Promise<T> {
  const nonce = Date.now();
  const body = new URLSearchParams({ nonce: String(nonce), ...Object.fromEntries(
    Object.entries(params).map(([k, v]) => [k, String(v)])
  )}).toString();

  const path = `/0/private/${endpoint}`;
  const signature = sign(path, nonce, body, apiSecret);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);

  try {
    const resp = await fetch(`${BASE_URL}${path}`, {
      method: "POST",
      headers: {
        "API-Key": apiKey,
        "API-Sign": signature,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body,
      signal: controller.signal,
    });

    if (!resp.ok) throw new Error(`Kraken API error: HTTP ${resp.status}`);
    const json = (await resp.json()) as { error: string[]; result: T };
    if (json.error && json.error.length > 0) throw new Error(`Kraken: ${json.error.join(", ")}`);
    return json.result;
  } finally {
    clearTimeout(timeout);
  }
}

/** Validate credentials by calling the Balance endpoint (cheapest private call). */
export async function validateCredentials(apiKey: string, apiSecret: string): Promise<boolean> {
  try {
    await privateRequest(apiKey, apiSecret, "Balance");
    return true;
  } catch {
    return false;
  }
}

/**
 * Fetch ledger entries (deposits, withdrawals, staking rewards, etc.)
 * from Kraken.  Pagination handled internally — returns all entries.
 */
export async function fetchLedger(
  apiKey: string,
  apiSecret: string,
  since?: number,
): Promise<KrakenLedgerEntry[]> {
  type LedgerResult = { ledger: Record<string, KrakenLedgerEntry>; count: number };

  const allEntries: KrakenLedgerEntry[] = [];
  let offset = 0;

  while (true) {
    const params: Record<string, string | number> = { ofs: offset };
    if (since) params.start = since;

    const result = await privateRequest<LedgerResult>(apiKey, apiSecret, "Ledgers", params);
    const entries = Object.values(result.ledger ?? {});
    allEntries.push(...entries);

    if (entries.length < 50) break; // Kraken returns max 50 per page
    offset += 50;
  }

  return allEntries;
}

/** Map Kraken ledger type → BasisGuard event type. */
export function mapKrakenEventType(krakenType: string): string {
  const map: Record<string, string> = {
    trade: "taxable_disposition",
    deposit: "receive",
    withdrawal: "send",
    staking: "staking_reward",
    dividend: "staking_reward",
    transfer: "receive",
    spend: "send",
    receive: "receive",
    settled: "taxable_disposition",
  };
  return map[krakenType] ?? "receive";
}
