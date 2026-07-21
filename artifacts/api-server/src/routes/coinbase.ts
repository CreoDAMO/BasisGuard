import { Router, type IRouter } from "express";
import { eq, and, inArray } from "drizzle-orm";
import { db, coinbaseConnectionsTable, rawTransactionsTable, chainsTable } from "@workspace/db";
import { encrypt, decrypt } from "../lib/encrypt.js";
import { listAccounts, listTransactions, mapEventType } from "../lib/coinbaseClient.js";

const router: IRouter = Router();

// Fixed UUID for the virtual "Coinbase CEX" chain — deterministic across envs
const COINBASE_CHAIN_UUID = "00000000-0000-0000-0000-c01bba5e0000";

// ── GET /coinbase/connection ──────────────────────────────────────────────────
// Returns connection status without exposing the private key.

router.get("/coinbase/connection", async (req, res): Promise<void> => {
  const user = req.user!;

  const rows = await db
    .select()
    .from(coinbaseConnectionsTable)
    .where(eq(coinbaseConnectionsTable.userId, user.id))
    .limit(1);

  if (rows.length === 0) {
    res.json({ connected: false });
    return;
  }

  const conn = rows[0];
  res.json({
    connected: true,
    key_name: maskKeyName(conn.keyName),
    last_synced_at: conn.lastSyncedAt?.toISOString() ?? null,
    tx_count: conn.txCount,
    status: conn.status,
    error_message: conn.status === "error" ? conn.errorMessage : null,
  });
});

// ── POST /coinbase/connection ─────────────────────────────────────────────────
// Save (or replace) CDP API credentials for the current user.

router.post("/coinbase/connection", async (req, res): Promise<void> => {
  const user = req.user!;
  const { key_name, private_key } = req.body as {
    key_name?: string;
    private_key?: string;
  };

  if (!key_name || !private_key) {
    res.status(400).json({ error: "key_name and private_key are required" });
    return;
  }

  // Validate that the private key looks like a PEM EC key
  if (!private_key.includes("BEGIN EC PRIVATE KEY") && !private_key.includes("BEGIN PRIVATE KEY")) {
    res.status(400).json({
      error: "private_key must be a PEM-encoded EC private key (BEGIN EC PRIVATE KEY or BEGIN PRIVATE KEY)",
    });
    return;
  }

  const { encrypted, iv, authTag } = encrypt(private_key.trim());

  // Upsert — replace any existing connection for this user
  await db
    .insert(coinbaseConnectionsTable)
    .values({
      userId: user.id,
      keyName: key_name.trim(),
      encryptedKey: encrypted,
      keyIv: iv,
      keyAuthTag: authTag,
      status: "active",
    })
    .onConflictDoUpdate({
      target: coinbaseConnectionsTable.userId,
      set: {
        keyName: key_name.trim(),
        encryptedKey: encrypted,
        keyIv: iv,
        keyAuthTag: authTag,
        status: "active",
        errorMessage: null,
        updatedAt: new Date(),
      },
    });

  res.json({ connected: true, key_name: maskKeyName(key_name.trim()) });
});

// ── DELETE /coinbase/connection ───────────────────────────────────────────────

router.delete("/coinbase/connection", async (req, res): Promise<void> => {
  const user = req.user!;

  await db
    .delete(coinbaseConnectionsTable)
    .where(eq(coinbaseConnectionsTable.userId, user.id));

  res.json({ disconnected: true });
});

// ── POST /coinbase/sync ───────────────────────────────────────────────────────
// Pull accounts + transactions from Coinbase and ingest into raw_transactions.

router.post("/coinbase/sync", async (req, res): Promise<void> => {
  const user = req.user!;

  const rows = await db
    .select()
    .from(coinbaseConnectionsTable)
    .where(eq(coinbaseConnectionsTable.userId, user.id))
    .limit(1);

  if (rows.length === 0) {
    res.status(400).json({ error: "No Coinbase connection configured" });
    return;
  }

  const conn = rows[0];
  let privateKey: string;
  try {
    privateKey = decrypt(conn.encryptedKey, conn.keyIv, conn.keyAuthTag);
  } catch {
    res.status(500).json({ error: "Failed to decrypt stored credentials" });
    return;
  }

  // Ensure the virtual Coinbase CEX chain exists
  await db
    .insert(chainsTable)
    .values({
      id: COINBASE_CHAIN_UUID,
      name: "Coinbase CEX",
      slug: "coinbase-cex",
      isL2: false,
      metadata: { exchange: "coinbase", type: "cex" },
    })
    .onConflictDoNothing();

  let synced = 0;
  let skipped = 0;
  const errors: Array<{ account: string; error: string }> = [];

  try {
    const accounts = await listAccounts(conn.keyName, privateKey);

    // Filter to crypto accounts only (exclude fiat/vault)
    const cryptoAccounts = accounts.filter(
      (a) => a.type === "ACCOUNT_TYPE_CRYPTO" || a.currency?.code !== "USD",
    );

    for (const account of cryptoAccounts) {
      try {
        const txs = await listTransactions(conn.keyName, privateKey, account.id);

        // Collect tx IDs already ingested for this account to avoid duplicates
        const incomingHashes = txs
          .map((t) => t.network?.hash ?? t.id)
          .filter(Boolean) as string[];

        const existing = incomingHashes.length > 0
          ? await db
              .select({ txHash: rawTransactionsTable.txHash })
              .from(rawTransactionsTable)
              .where(
                and(
                  eq(rawTransactionsTable.chainId, COINBASE_CHAIN_UUID),
                  inArray(rawTransactionsTable.txHash, incomingHashes),
                ),
              )
          : [];

        const existingHashes = new Set(existing.map((r) => r.txHash));

        for (const tx of txs) {
          const txHash = tx.network?.hash ?? tx.id;

          if (existingHashes.has(txHash)) {
            skipped++;
            continue;
          }

          await db.insert(rawTransactionsTable).values({
            chainId: COINBASE_CHAIN_UUID,
            walletAddress: `coinbase:${account.id}`,
            txHash,
            txDate: tx.created_at ? new Date(tx.created_at) : null,
            eventType: mapEventType(tx.type),
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
            ingestedBy: user.clerkId,
          });

          synced++;
        }
      } catch (err) {
        errors.push({
          account: `${account.name} (${account.id})`,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    // Update connection status and counters
    await db
      .update(coinbaseConnectionsTable)
      .set({
        lastSyncedAt: new Date(),
        txCount: conn.txCount + synced,
        status: errors.length > 0 && synced === 0 ? "error" : "active",
        errorMessage:
          errors.length > 0 && synced === 0 ? errors[0].error : null,
        updatedAt: new Date(),
      })
      .where(eq(coinbaseConnectionsTable.userId, user.id));
  } catch (err) {
    // Top-level failure (e.g. listAccounts failed — likely bad credentials)
    const message = err instanceof Error ? err.message : String(err);
    await db
      .update(coinbaseConnectionsTable)
      .set({ status: "error", errorMessage: message, updatedAt: new Date() })
      .where(eq(coinbaseConnectionsTable.userId, user.id));

    res.status(502).json({ error: message });
    return;
  }

  res.json({ synced, skipped, errors });
});

// ── Helpers ───────────────────────────────────────────────────────────────────

function maskKeyName(keyName: string): string {
  // organizations/xxx/apiKeys/yyy → show last segment, mask the rest
  const parts = keyName.split("/");
  const last = parts[parts.length - 1];
  if (last.length <= 8) return `****${last}`;
  return `****${last.slice(-8)}`;
}

export default router;
