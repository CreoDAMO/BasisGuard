/**
 * Price Oracle — cached spot-price lookup via CoinGecko's free public API.
 *
 * Prices are cached in-memory for CACHE_TTL_MS (5 minutes) to avoid
 * hammering the free tier. The cache is keyed by CoinGecko asset ID.
 *
 * Asset symbols (BTC, ETH …) are mapped to CoinGecko IDs via SYMBOL_MAP.
 * Symbols not present in the map are looked up by their lowercase symbol,
 * which works for many assets on CoinGecko's free endpoint.
 *
 * Returns null for any symbol that can't be resolved or if the API is down.
 */

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

/** Maps common ticker symbols → CoinGecko IDs */
const SYMBOL_MAP: Record<string, string> = {
  BTC: "bitcoin",
  ETH: "ethereum",
  SOL: "solana",
  USDC: "usd-coin",
  USDT: "tether",
  DAI: "dai",
  MATIC: "matic-network",
  POL: "matic-network",
  AVAX: "avalanche-2",
  BNB: "binancecoin",
  LINK: "chainlink",
  UNI: "uniswap",
  AAVE: "aave",
  CRV: "curve-dao-token",
  MKR: "maker",
  COMP: "compound-governance-token",
  SNX: "havven",
  YFI: "yearn-finance",
  SUSHI: "sushi",
  LTC: "litecoin",
  BCH: "bitcoin-cash",
  XRP: "ripple",
  ADA: "cardano",
  DOT: "polkadot",
  ATOM: "cosmos",
  DOGE: "dogecoin",
  SHIB: "shiba-inu",
  ARB: "arbitrum",
  OP: "optimism",
  stETH: "staked-ether",
  wBTC: "wrapped-bitcoin",
  wETH: "weth",
};

interface CacheEntry {
  priceUsd: number;
  expiresAt: number;
}

const cache = new Map<string, CacheEntry>();

function symbolToId(symbol: string): string {
  return SYMBOL_MAP[symbol.toUpperCase()] ?? symbol.toLowerCase();
}

/** Fetch prices for multiple CoinGecko IDs in one request. */
async function fetchPrices(ids: string[]): Promise<Map<string, number>> {
  if (ids.length === 0) return new Map();

  const url = `https://api.coingecko.com/api/v3/simple/price?ids=${ids.join(",")}&vs_currencies=usd`;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8_000);
    const resp = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);

    if (!resp.ok) return new Map();

    const data = (await resp.json()) as Record<string, { usd?: number }>;
    const result = new Map<string, number>();
    for (const [id, pricing] of Object.entries(data)) {
      if (typeof pricing.usd === "number") result.set(id, pricing.usd);
    }
    return result;
  } catch {
    return new Map(); // Network error — return empty, callers handle null
  }
}

/**
 * Returns the current USD spot price for `symbol`, or null if unavailable.
 * Prices are served from cache when fresh (< 5 min old).
 */
export async function getSpotPrice(symbol: string): Promise<number | null> {
  const id = symbolToId(symbol);
  const entry = cache.get(id);
  if (entry && entry.expiresAt > Date.now()) return entry.priceUsd;

  const prices = await fetchPrices([id]);
  const price = prices.get(id) ?? null;
  if (price !== null) {
    cache.set(id, { priceUsd: price, expiresAt: Date.now() + CACHE_TTL_MS });
  }
  return price;
}

/**
 * Batch price lookup. Returns a map from symbol → USD price (null = unknown).
 * Shares a single CoinGecko request for all uncached symbols.
 */
export async function getBatchPrices(
  symbols: string[],
): Promise<Record<string, number | null>> {
  const unique = [...new Set(symbols.map((s) => s.toUpperCase()))];
  const result: Record<string, number | null> = {};
  const toFetch: string[] = [];

  const now = Date.now();
  for (const sym of unique) {
    const id = symbolToId(sym);
    const entry = cache.get(id);
    if (entry && entry.expiresAt > now) {
      result[sym] = entry.priceUsd;
    } else {
      toFetch.push(id);
      result[sym] = null; // placeholder
    }
  }

  if (toFetch.length > 0) {
    const prices = await fetchPrices(toFetch);
    for (const sym of unique) {
      const id = symbolToId(sym);
      const price = prices.get(id) ?? null;
      if (price !== null) {
        cache.set(id, { priceUsd: price, expiresAt: now + CACHE_TTL_MS });
      }
      if (result[sym] === null) result[sym] = price;
    }
  }

  return result;
}
