/**
 * Multi-exchange connector routes: Kraken + Gemini.
 *
 * Follows the same pattern as coinbase.ts:
 *   GET  /{exchange}/connection   — status (no secret)
 *   POST /{exchange}/connection   — save/replace credentials
 *   DELETE /{exchange}/connection — remove credentials
 *   POST /{exchange}/sync         — pull transactions → raw_transactions
 *
 * Credentials are encrypted at rest (same AES-256-GCM as Coinbase).
 * The exchange_connections table is keyed on (userId, exchange).
 */

import { Router, type IRouter } from "express";
import { eq, and } from "drizzle-orm";
import {
  db,
  exchangeConnectionsTable,
  rawTransactionsTable,
  chainsTable,
} from "@workspace/db";
import { encrypt, decrypt } from "../lib/encrypt.js";
import {
  fetchLedger,
  mapKrakenEventType,
  validateCredentials as validateKraken,
} from "../lib/krakenClient.js";
import {
  fetchTrades,
  fetchTransfers,
  mapGeminiEventType,
  symbolFromPair,
  validateCredentials as validateGemini,
} from "../lib/geminiClient.js";
import { strictLimiter } from "../middlewares/rateLimit.js";

const router: IRouter = Router();

// ── Virtual chain UUIDs for CEX exchanges ────────────────────────────────────
const CHAIN_UUIDS: Record<string, string> = {
  kraken: "00000000-0000-0000-0000-e00000000001",
  gemini: "00000000-0000-0000-0000-e00000000002",
};

const CHAIN_META: Record<string, { name: string; slug: string }> = {
  kraken: { name: "Kraken CEX", slug: "kraken-cex" },
  gemini: { name: "Gemini CEX", slug: "gemini-cex" },
};

function maskKey(key: string): string {
  if (key.length <= 8) return "****" + key.slice(-4);
  return key.slice(0, 4) + "****" + key.slice(-4);
}

async function ensureChain(exchange: string): Promise<void> {
  const meta = CHAIN_META[exchange];
  if (!meta) return;
  await db
    .insert(chainsTable)
    .values({
      id: CHAIN_UUIDS[exchange],
      name: meta.name,
      slug: meta.slug,
      isL2: false,
      metadata: { exchange, type: "cex" },
    })
    .onConflictDoNothing();
}

// ── Generic helpers ───────────────────────────────────────────────────────────

async function getConnection(userId: string, exchange: string) {
  const [row] = await db
    .select()
    .from(exchangeConnectionsTable)
    .where(
      and(
        eq(exchangeConnectionsTable.userId, userId),
        eq(exchangeConnectionsTable.exchange, exchange),
      ),
    )
    .limit(1);
  return row ?? null;
}

// ── Connection routes (GET / POST / DELETE) ───────────────────────────────────

function mountConnectionRoutes(exchange: string): void {
  const prefix = `/${exchange}`;

  // GET /{exchange}/connection
  router.get(`${prefix}/connection`, async (req, res): Promise<void> => {
    const conn = await getConnection(req.user!.id, exchange);
    if (!conn) { res.json({ connected: false }); return; }
    res.json({
      connected: true,
      exchange,
      api_key: maskKey(conn.apiKey),
      last_synced_at: conn.lastSyncedAt?.toISOString() ?? null,
      tx_count: conn.txCount,
      status: conn.status,
      error_message: conn.status === "error" ? conn.errorMessage : null,
    });
  });

  // POST /{exchange}/connection
  router.post(`${prefix}/connection`, async (req, res): Promise<void> => {
    const { api_key, api_secret } = req.body as { api_key?: string; api_secret?: string };
    if (!api_key || !api_secret) {
      res.status(400).json({ error: "api_key and api_secret are required" });
      return;
    }

    const { encrypted, iv, authTag } = encrypt(api_secret.trim());

    await db
      .insert(exchangeConnectionsTable)
      .values({
        userId: req.user!.id,
        exchange,
        apiKey: api_key.trim(),
        encryptedSecret: encrypted,
        secretIv: iv,
        secretAuthTag: authTag,
        status: "active",
      })
      .onConflictDoUpdate({
        target: [exchangeConnectionsTable.userId, exchangeConnectionsTable.exchange],
        set: {
          apiKey: api_key.trim(),
          encryptedSecret: encrypted,
          secretIv: iv,
          secretAuthTag: authTag,
          status: "active",
          errorMessage: null,
          updatedAt: new Date(),
        },
      });

    res.json({ connected: true, exchange, api_key: maskKey(api_key.trim()) });
  });

  // DELETE /{exchange}/connection
  router.delete(`${prefix}/connection`, async (req, res): Promise<void> => {
    await db
      .delete(exchangeConnectionsTable)
      .where(
        and(
          eq(exchangeConnectionsTable.userId, req.user!.id),
          eq(exchangeConnectionsTable.exchange, exchange),
        ),
      );
    res.json({ disconnected: true, exchange });
  });
}

mountConnectionRoutes("kraken");
mountConnectionRoutes("gemini");

// ── Kraken sync ───────────────────────────────────────────────────────────────

router.post("/kraken/sync", strictLimiter, async (req, res): Promise<void> => {
  const user = req.user!;
  const conn = await getConnection(user.id, "kraken");
  if (!conn) {
    res.status(400).json({ error: "No Kraken connection configured" });
    return;
  }

  let apiKey: string;
  let apiSecret: string;
  try {
    apiKey = conn.apiKey;
    apiSecret = decrypt(conn.encryptedSecret, conn.secretIv, conn.secretAuthTag);
  } catch {
    res.status(500).json({ error: "Failed to decrypt stored Kraken credentials" });
    return;
  }

  await ensureChain("kraken");
  const chainId = CHAIN_UUIDS["kraken"];
  const since = conn.lastSyncedAt ? Math.floor(conn.lastSyncedAt.getTime() / 1000) : undefined;

  let synced = 0;
  let skipped = 0;
  const errors: string[] = [];

  try {
    const entries = await fetchLedger(apiKey, apiSecret, since);

    for (const entry of entries) {
      const txHash = entry.refid;
      const existing = await db
        .select({ txHash: rawTransactionsTable.txHash })
        .from(rawTransactionsTable)
        .where(
          and(
            eq(rawTransactionsTable.chainId, chainId),
            eq(rawTransactionsTable.txHash, txHash),
          ),
        )
        .limit(1);

      if (existing.length > 0) { skipped++; continue; }

      await db.insert(rawTransactionsTable).values({
        chainId,
        walletAddress: `kraken:${user.clerkId}`,
        txHash,
        txDate: entry.time ? new Date(entry.time * 1000) : null,
        eventType: mapKrakenEventType(entry.type),
        rawData: {
          kraken_refid: entry.refid,
          kraken_type: entry.type,
          asset: entry.asset,
          amount: entry.amount,
          fee: entry.fee,
          balance: entry.balance,
        },
        ingestedBy: user.clerkId,
      });
      synced++;
    }

    await db
      .update(exchangeConnectionsTable)
      .set({
        lastSyncedAt: new Date(),
        txCount: conn.txCount + synced,
        status: errors.length > 0 && synced === 0 ? "error" : "active",
        errorMessage: errors.length > 0 && synced === 0 ? errors[0] : null,
        updatedAt: new Date(),
      })
      .where(eq(exchangeConnectionsTable.id, conn.id));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await db
      .update(exchangeConnectionsTable)
      .set({ status: "error", errorMessage: message, updatedAt: new Date() })
      .where(eq(exchangeConnectionsTable.id, conn.id));
    res.status(502).json({ error: message });
    return;
  }

  res.json({ exchange: "kraken", synced, skipped, errors });
});

// ── Gemini sync ───────────────────────────────────────────────────────────────

// Common Gemini symbols to poll trades for. In production this list could
// be fetched dynamically from GET /v1/symbols; hard-coded here to avoid
// an extra round-trip on every sync.
const GEMINI_SYMBOLS = [
  "BTCUSD", "ETHUSD", "SOLUSD", "MATICUSD", "LINKUSD",
  "UNIUSD", "AAVEUSD", "DAIUSD", "USDCUSD",
];

router.post("/gemini/sync", strictLimiter, async (req, res): Promise<void> => {
  const user = req.user!;
  const conn = await getConnection(user.id, "gemini");
  if (!conn) {
    res.status(400).json({ error: "No Gemini connection configured" });
    return;
  }

  let apiKey: string;
  let apiSecret: string;
  try {
    apiKey = conn.apiKey;
    apiSecret = decrypt(conn.encryptedSecret, conn.secretIv, conn.secretAuthTag);
  } catch {
    res.status(500).json({ error: "Failed to decrypt stored Gemini credentials" });
    return;
  }

  await ensureChain("gemini");
  const chainId = CHAIN_UUIDS["gemini"];
  const sinceMs = conn.lastSyncedAt?.getTime();

  let synced = 0;
  let skipped = 0;
  const errors: string[] = [];

  try {
    // Fetch trades for each symbol, then transfers
    const tradeArrays = await Promise.allSettled(
      GEMINI_SYMBOLS.map((sym) => fetchTrades(apiKey, apiSecret, sym, sinceMs)),
    );
    const allTrades = tradeArrays.flatMap((r) => (r.status === "fulfilled" ? r.value : []));
    const transfers = await fetchTransfers(apiKey, apiSecret, sinceMs).catch(() => []);

    for (const trade of allTrades) {
      const txHash = `gemini-trade-${trade.trade_id}`;
      const existing = await db
        .select({ txHash: rawTransactionsTable.txHash })
        .from(rawTransactionsTable)
        .where(and(eq(rawTransactionsTable.chainId, chainId), eq(rawTransactionsTable.txHash, txHash)))
        .limit(1);
      if (existing.length > 0) { skipped++; continue; }

      await db.insert(rawTransactionsTable).values({
        chainId,
        walletAddress: `gemini:${user.clerkId}`,
        txHash,
        txDate: new Date(trade.timestampms),
        eventType: mapGeminiEventType(trade.type),
        rawData: {
          gemini_trade_id: trade.trade_id,
          symbol: trade.symbol,
          asset: symbolFromPair(trade.symbol),
          type: trade.type,
          price: trade.price,
          amount: trade.amount,
          fee_currency: trade.fee_currency,
          fee_amount: trade.fee_amount,
        },
        ingestedBy: user.clerkId,
      });
      synced++;
    }

    for (const transfer of transfers) {
      const txHash = `gemini-transfer-${transfer.eid}`;
      const existing = await db
        .select({ txHash: rawTransactionsTable.txHash })
        .from(rawTransactionsTable)
        .where(and(eq(rawTransactionsTable.chainId, chainId), eq(rawTransactionsTable.txHash, txHash)))
        .limit(1);
      if (existing.length > 0) { skipped++; continue; }

      await db.insert(rawTransactionsTable).values({
        chainId,
        walletAddress: `gemini:${user.clerkId}`,
        txHash,
        txDate: new Date(transfer.timestampms),
        eventType: mapGeminiEventType(transfer.type),
        rawData: {
          gemini_eid: transfer.eid,
          currency: transfer.currency,
          amount: transfer.amount,
          type: transfer.type,
          method: transfer.method ?? null,
          destination: transfer.destination ?? null,
        },
        ingestedBy: user.clerkId,
      });
      synced++;
    }

    await db
      .update(exchangeConnectionsTable)
      .set({
        lastSyncedAt: new Date(),
        txCount: conn.txCount + synced,
        status: "active",
        errorMessage: null,
        updatedAt: new Date(),
      })
      .where(eq(exchangeConnectionsTable.id, conn.id));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await db
      .update(exchangeConnectionsTable)
      .set({ status: "error", errorMessage: message, updatedAt: new Date() })
      .where(eq(exchangeConnectionsTable.id, conn.id));
    res.status(502).json({ error: message });
    return;
  }

  res.json({ exchange: "gemini", synced, skipped, errors });
});

export default router;
