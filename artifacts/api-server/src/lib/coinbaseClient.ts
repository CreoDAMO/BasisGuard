import crypto from "node:crypto";

const COINBASE_API_HOST = "api.coinbase.com";
const COINBASE_API_BASE = `https://${COINBASE_API_HOST}`;

/**
 * Build a CDP JWT for a single request.
 * CDP uses ES256 (ECDSA P-256) with the key name in the `kid` header.
 * The `uri` claim must be "<METHOD> <host><path>" (no protocol).
 */
function buildJwt(keyName: string, privateKeyPem: string, method: string, path: string): string {
  const now = Math.floor(Date.now() / 1000);

  const header = { alg: "ES256", kid: keyName };
  const payload = {
    sub: keyName,
    iss: "cdp",
    nbf: now,
    exp: now + 120,
    uri: `${method} ${COINBASE_API_HOST}${path}`,
  };

  const headerB64 = Buffer.from(JSON.stringify(header)).toString("base64url");
  const payloadB64 = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signingInput = `${headerB64}.${payloadB64}`;

  const sign = crypto.createSign("SHA256");
  sign.update(signingInput);
  // ieee-p1363 gives us raw r‖s bytes (required for ES256 JWT), not DER
  const sig = sign.sign({ key: privateKeyPem, dsaEncoding: "ieee-p1363" });

  return `${signingInput}.${sig.toString("base64url")}`;
}

async function cdpFetch<T>(
  keyName: string,
  privateKeyPem: string,
  method: string,
  path: string,
  body?: unknown,
): Promise<T> {
  const jwt = buildJwt(keyName, privateKeyPem, method, path);
  const url = `${COINBASE_API_BASE}${path}`;

  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${jwt}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
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
  keyName: string,
  privateKeyPem: string,
): Promise<CoinbaseAccount[]> {
  const results: CoinbaseAccount[] = [];
  let path = "/v2/accounts?limit=100";

  while (path) {
    const page = await cdpFetch<V2ListResponse<CoinbaseAccount>>(keyName, privateKeyPem, "GET", path);
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
  keyName: string,
  privateKeyPem: string,
  accountId: string,
  maxPages = 20,
): Promise<CoinbaseTransaction[]> {
  const results: CoinbaseTransaction[] = [];
  let path = `/v2/accounts/${accountId}/transactions?limit=100&expand[]=trade`;
  let pages = 0;

  while (path && pages < maxPages) {
    const page = await cdpFetch<V2ListResponse<CoinbaseTransaction>>(
      keyName,
      privateKeyPem,
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
