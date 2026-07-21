/**
 * Coinbase API client — supports two authentication methods:
 *
 *   CDP keys (recommended):
 *     api_key    = the CDP key name (e.g. "organizations/xxx/apiKeys/yyy")
 *     api_secret = the EC private key in PEM format ("-----BEGIN EC PRIVATE KEY-----…")
 *     auth       = JWT signed with ES256; calls the Advanced Trade v3 API
 *
 *   Legacy keys (deprecated by Coinbase):
 *     api_key    = short alphanumeric key
 *     api_secret = short alphanumeric secret
 *     auth       = HMAC-SHA256; calls the V2 retail API
 *
 * The key type is detected automatically: if api_key looks like an org/apiKeys
 * path or api_secret looks like a PEM block, CDP mode is used.
 */

import crypto from "node:crypto";

const COINBASE_API_BASE = "https://api.coinbase.com";

// ── Auth type detection ───────────────────────────────────────────────────────

export function isCdpKey(apiKey: string, apiSecret: string): boolean {
  return (
    apiKey.includes("/apiKeys/") ||
    apiSecret.includes("BEGIN EC PRIVATE KEY") ||
    apiSecret.includes("BEGIN PRIVATE KEY")
  );
}

// ── CDP JWT auth (ES256) ──────────────────────────────────────────────────────

function buildCdpJwt(
  keyName: string,
  privateKeyPem: string,
  method: string,
  path: string,
): string {
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
      uri: `${method.toUpperCase()} api.coinbase.com${path}`,
    }),
  ).toString("base64url");

  const signingInput = `${header}.${payload}`;
  const sign = crypto.createSign("SHA256");
  sign.update(signingInput);

  // CDP private keys arrive as PEM; ensure correct line breaks
  const pem = privateKeyPem.replace(/\\n/g, "\n").trim();
  const signature = sign
    .sign({ key: pem, dsaEncoding: "ieee-p1363" })
    .toString("base64url");

  return `${signingInput}.${signature}`;
}

// ── Legacy HMAC-SHA256 auth ───────────────────────────────────────────────────

function buildLegacyHeaders(
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

// ── Generic fetch wrapper ─────────────────────────────────────────────────────

async function coinbaseFetch<T>(
  apiKey: string,
  apiSecret: string,
  method: string,
  path: string,
  body?: unknown,
): Promise<T> {
  const bodyStr = body ? JSON.stringify(body) : "";
  let headers: Record<string, string>;

  if (isCdpKey(apiKey, apiSecret)) {
    const jwt = buildCdpJwt(apiKey, apiSecret, method, path);
    headers = {
      Authorization: `Bearer ${jwt}`,
      "Content-Type": "application/json",
    };
  } else {
    headers = buildLegacyHeaders(apiKey, apiSecret, method, path, bodyStr);
  }

  const res = await fetch(`${COINBASE_API_BASE}${path}`, {
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

// ── CDP Advanced Trade v3 types ───────────────────────────────────────────────

interface CdpAccount {
  uuid: string;
  name: string;
  currency: string;
  available_balance: { value: string; currency: string };
  type: string;
  active: boolean;
}

interface CdpFill {
  entry_id: string;
  trade_id: string;
  order_id: string;
  trade_time: string;
  trade_type: string; // FILL | REVERSAL | CORRECTION | SYNTHETIC
  price: string;
  size: string;
  commission: string;
  product_id: string; // e.g. "BTC-USD"
  sequence_timestamp: string;
  liquidity_indicator: string;
  size_in_quote: boolean;
  user_id: string;
  side: string; // BUY | SELL
}

interface CdpTransfer {
  id: string;
  type: string; // DEPOSIT | WITHDRAW | COINBASE_DEPOSIT | COINBASE_WITHDRAWAL
  created_at: string;
  completed_at: string | null;
  amount: { amount: string; currency: string };
  subtotal: { amount: string; currency: string } | null;
  status: string;
  idem: string | null;
  from?: { resource: string; resource_path: string } | null;
  to?: { resource: string; resource_path: string } | null;
}

// ── V2 API types (legacy keys) ────────────────────────────────────────────────

export interface CoinbaseAccount {
  id: string;
  name: string;
  type: string;
  currency: { code: string };
  balance: { amount: string; currency: string };
}

export interface CoinbaseTransaction {
  id: string;
  type: string;
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

// ── CDP: list accounts ────────────────────────────────────────────────────────

async function listCdpAccounts(
  apiKey: string,
  apiSecret: string,
): Promise<CdpAccount[]> {
  const results: CdpAccount[] = [];
  let cursor: string | null = null;

  while (true) {
    const path: string =
      `/api/v3/brokerage/accounts?limit=250` +
      (cursor ? `&cursor=${cursor}` : "");

    const page: { accounts: CdpAccount[]; cursor: string; has_next: boolean } =
      await coinbaseFetch<{
        accounts: CdpAccount[];
        cursor: string;
        has_next: boolean;
      }>(apiKey, apiSecret, "GET", path);

    results.push(...(page.accounts ?? []));
    if (!page.has_next) break;
    cursor = page.cursor;
  }

  return results;
}

// ── CDP: list fills (executed orders) ────────────────────────────────────────

async function listCdpFills(
  apiKey: string,
  apiSecret: string,
  since?: Date,
): Promise<CdpFill[]> {
  const results: CdpFill[] = [];
  let cursor: string | null = null;
  const startTime = since ? since.toISOString() : undefined;

  while (true) {
    let path = `/api/v3/brokerage/orders/historical/fills?limit=100`;
    if (startTime) path += `&start_sequence_timestamp=${encodeURIComponent(startTime)}`;
    if (cursor) path += `&cursor=${cursor}`;

    const page = await coinbaseFetch<{
      fills: CdpFill[];
      cursor: string;
      has_next?: boolean;
    }>(apiKey, apiSecret, "GET", path);

    results.push(...(page.fills ?? []));
    if (!page.has_next || !page.cursor) break;
    cursor = page.cursor;
  }

  return results;
}

// ── V2 API: list accounts & transactions (legacy keys) ────────────────────────

async function listV2Accounts(
  apiKey: string,
  apiSecret: string,
): Promise<CoinbaseAccount[]> {
  const results: CoinbaseAccount[] = [];
  let nextPath: string = "/v2/accounts?limit=100";

  while (nextPath) {
    const page = await coinbaseFetch<V2ListResponse<CoinbaseAccount>>(
      apiKey, apiSecret, "GET", nextPath,
    );
    results.push(...page.data);
    nextPath = page.pagination?.next_uri ?? "";
  }

  return results;
}

async function listV2Transactions(
  apiKey: string,
  apiSecret: string,
  accountId: string,
  maxPages = 20,
): Promise<CoinbaseTransaction[]> {
  const results: CoinbaseTransaction[] = [];
  let nextPath: string = `/v2/accounts/${accountId}/transactions?limit=100&expand[]=trade`;
  let pages = 0;

  while (nextPath && pages < maxPages) {
    const page = await coinbaseFetch<V2ListResponse<CoinbaseTransaction>>(
      apiKey, apiSecret, "GET", nextPath,
    );
    results.push(...page.data);
    nextPath = page.pagination?.next_uri ?? "";
    pages++;
  }

  return results;
}

// ── Normalised result type ────────────────────────────────────────────────────

export interface NormalisedTransaction {
  txHash: string;
  txDate: Date | null;
  eventType: string;
  walletAddress: string;
  rawData: Record<string, unknown>;
}

/**
 * Pull all transactions for a user.  Automatically selects CDP v3 or legacy
 * V2 based on the key format.
 */
export async function fetchAllTransactions(
  apiKey: string,
  apiSecret: string,
  walletPrefix: string,
  since?: Date,
): Promise<NormalisedTransaction[]> {
  if (isCdpKey(apiKey, apiSecret)) {
    return fetchCdpTransactions(apiKey, apiSecret, walletPrefix, since);
  }
  return fetchLegacyTransactions(apiKey, apiSecret, walletPrefix);
}

async function fetchCdpTransactions(
  apiKey: string,
  apiSecret: string,
  walletPrefix: string,
  since?: Date,
): Promise<NormalisedTransaction[]> {
  const results: NormalisedTransaction[] = [];

  // Fills (executed buy/sell orders)
  const fills = await listCdpFills(apiKey, apiSecret, since);
  for (const fill of fills) {
    const asset: string = fill.product_id.split("-")[0] ?? fill.product_id;
    results.push({
      txHash: `cdp-fill-${fill.entry_id}`,
      txDate: fill.trade_time ? new Date(fill.trade_time) : null,
      eventType: fill.side === "BUY" ? "taxable_acquisition" : "taxable_disposition",
      walletAddress: `${walletPrefix}:trade`,
      rawData: {
        cdp_entry_id: fill.entry_id,
        cdp_trade_id: fill.trade_id,
        product_id: fill.product_id,
        asset,
        side: fill.side,
        price: fill.price,
        size: fill.size,
        commission: fill.commission,
        trade_type: fill.trade_type,
      },
    });
  }

  return results;
}

async function fetchLegacyTransactions(
  apiKey: string,
  apiSecret: string,
  walletPrefix: string,
): Promise<NormalisedTransaction[]> {
  const results: NormalisedTransaction[] = [];
  const accounts = await listV2Accounts(apiKey, apiSecret);
  const cryptoAccounts = accounts.filter(
    (a) => a.type === "ACCOUNT_TYPE_CRYPTO" || a.currency?.code !== "USD",
  );

  for (const account of cryptoAccounts) {
    const txs = await listV2Transactions(apiKey, apiSecret, account.id);
    for (const tx of txs) {
      const txHash = tx.network?.hash ?? tx.id;
      results.push({
        txHash,
        txDate: tx.created_at ? new Date(tx.created_at) : null,
        eventType: mapEventType(tx.type),
        walletAddress: `${walletPrefix}:${account.id}`,
        rawData: {
          coinbase_id: tx.id,
          coinbase_type: tx.type,
          amount: tx.amount,
          native_amount: tx.native_amount,
          status: tx.status,
          account_id: account.id,
          account_name: account.name,
          currency: account.currency?.code,
          description: tx.description ?? null,
        },
      });
    }
  }

  return results;
}

// ── Event type mapping ────────────────────────────────────────────────────────

const COINBASE_TYPE_MAP: Record<string, string> = {
  buy: "taxable_acquisition",
  sell: "taxable_disposition",
  send: "taxable_disposition",
  receive: "taxable_acquisition",
  trade: "crypto_swap",
  staking_transfer: "staking_reward",
  earn_payout: "staking_reward",
  inflation_reward: "staking_reward",
  wrap_asset: "bridge_transfer",
  unwrap_asset: "bridge_transfer",
  exchange_deposit: "non_taxable_transfer",
  exchange_withdrawal: "non_taxable_transfer",
  fiat_deposit: "fiat_deposit",
  fiat_withdrawal: "fiat_withdrawal",
};

export function mapEventType(coinbaseType: string): string {
  return COINBASE_TYPE_MAP[coinbaseType] ?? `coinbase_${coinbaseType}`;
}
