import crypto from "node:crypto";

const COINBASE_API_BASE = "https://api.coinbase.com";

/**
 * Build the four Coinbase legacy API auth headers for a single request.
 * Uses HMAC-SHA256: sign(timestamp + METHOD + path + body, apiSecret).
 */
function buildAuthHeaders(
  apiKey: string,
  apiSecret: string,
  method: string,
  path: string,
  body = "",
): Record<string, string> {
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const message = timestamp + method.toUpperCase() + path + body;
  const signature = crypto
    .createHmac("sha256", apiSecret)
    .update(message)
    .digest("hex");

  return {
    "CB-ACCESS-KEY": apiKey,
    "CB-ACCESS-SIGN": signature,
    "CB-ACCESS-TIMESTAMP": timestamp,
    "CB-VERSION": "2016-02-18",
    "Content-Type": "application/json",
  };
}

async function coinbaseFetch<T>(
  apiKey: string,
  apiSecret: string,
  method: string,
  path: string,
  body?: unknown,
): Promise<T> {
  const bodyStr = body ? JSON.stringify(body) : "";
  const headers = buildAuthHeaders(apiKey, apiSecret, method, path, bodyStr);
  const url = `${COINBASE_API_BASE}${path}`;

  const res = await fetch(url, {
    method,
    headers,
    body: bodyStr || undefined,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Coinbase API ${method} ${path} → ${res.status}: ${text}`);
  }

  return res.json() as Promise<T>;
}

// ── V2 API types ──────────────────────────────────────────────────────────────

export interface CoinbaseAccount {
  id: string;
  name: string;
  type: string;
  currency: { code: string };
  balance: { amount: string; currency: string };
}

export interface CoinbaseTransaction {
  id: string;
  type: string; // buy | sell | send | receive | trade | staking_transfer | earn_payout | ...
  status: string;
  amount: { amount: string; currency: string };
  native_amount: { amount: string; currency: string };
  created_at: string;
  updated_at: string;
  network?: { hash?: string };
  trade?: { id: string };
  description?: string | null;
}

interface V2ListResponse<T> {
  data: T[];
  pagination?: { next_uri?: string | null };
}

/**
 * List all Coinbase accounts for the authenticated user.
 */
export async function listAccounts(
  apiKey: string,
  apiSecret: string,
): Promise<CoinbaseAccount[]> {
  const results: CoinbaseAccount[] = [];
  let path = "/v2/accounts?limit=100";

  while (path) {
    const page = await coinbaseFetch<V2ListResponse<CoinbaseAccount>>(
      apiKey,
      apiSecret,
      "GET",
      path,
    );
    results.push(...page.data);
    path = page.pagination?.next_uri ?? "";
  }

  return results;
}

/**
 * List transactions for a single Coinbase account, paginating until done.
 * Stops after maxPages to avoid runaway API calls.
 */
export async function listTransactions(
  apiKey: string,
  apiSecret: string,
  accountId: string,
  maxPages = 20,
): Promise<CoinbaseTransaction[]> {
  const results: CoinbaseTransaction[] = [];
  let path = `/v2/accounts/${accountId}/transactions?limit=100&expand[]=trade`;
  let pages = 0;

  while (path && pages < maxPages) {
    const page = await coinbaseFetch<V2ListResponse<CoinbaseTransaction>>(
      apiKey,
      apiSecret,
      "GET",
      path,
    );
    results.push(...page.data);
    path = page.pagination?.next_uri ?? "";
    pages++;
  }

  return results;
}

// ── Coinbase → BasisGuard event type mapping ─────────────────────────────────

/**
 * Maps Coinbase V2 transaction types to BasisGuard event_type strings.
 * Types not listed here fall back to the raw Coinbase type prefixed with
 * "coinbase_" so they land in the review queue automatically.
 */
const COINBASE_TYPE_MAP: Record<string, string> = {
  buy: "taxable_acquisition",
  sell: "taxable_disposition",
  send: "taxable_disposition", // outgoing disposal
  receive: "taxable_acquisition", // incoming acquisition
  trade: "crypto_swap", // exchange between two assets
  staking_transfer: "staking_reward", // Rev. Rul. 2023-14 open-gap
  earn_payout: "staking_reward", // Coinbase Earn / Rewards
  inflation_reward: "staking_reward", // network inflation rewards
  wrap_asset: "bridge_transfer", // L1↔L2 wrapping — open-gap
  unwrap_asset: "bridge_transfer",
  exchange_deposit: "non_taxable_transfer", // CEX internal move
  exchange_withdrawal: "non_taxable_transfer",
  fiat_deposit: "fiat_deposit",
  fiat_withdrawal: "fiat_withdrawal",
};

export function mapEventType(coinbaseType: string): string {
  return COINBASE_TYPE_MAP[coinbaseType] ?? `coinbase_${coinbaseType}`;
}
