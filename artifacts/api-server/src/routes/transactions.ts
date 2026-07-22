import { Router, type IRouter } from "express";
import { eq, and, desc } from "drizzle-orm";
import { db, rawTransactionsTable, chainsTable, protocolsTable } from "@workspace/db";
import { requireAuth, requireRole, ADMIN_ROLES } from "../middlewares/auth.js";
import { strictLimiter } from "../middlewares/rateLimit.js";
import {
  createPositionFromClassification,
  type CreatePositionInput,
} from "../core/createPosition.js";
import { registry } from "../core/protocolRegistry.js";

const router: IRouter = Router();

// GET /transactions — list ingested raw transactions for the current user
router.get("/transactions", requireAuth, async (req, res): Promise<void> => {
  const rows = await db
    .select()
    .from(rawTransactionsTable)
    .orderBy(desc(rawTransactionsTable.createdAt))
    .limit(100);

  res.json(rows.map(serialize));
});

/**
 * POST /transactions/ingest
 *
 * Accepts a decoded on-chain event and records it. If the caller also supplies
 * classification data (classification + tier + rationale) a Position Record is
 * created immediately with requires_review enforcement applied. Otherwise the
 * raw transaction is stored with processed=false for future adapter processing
 * via POST /transactions/classify.
 *
 * Required fields: chain_id, wallet_address, event_type
 * Optional: tx_hash, tx_date, protocol_id, raw_data
 * Position auto-creation (all required together): classification, tier, rationale
 *   Optional with position: citation_ids[], profile_id
 */
router.post("/transactions/ingest", requireAuth, async (req, res): Promise<void> => {
  const {
    chain_id,
    wallet_address,
    tx_hash,
    tx_date,
    protocol_id,
    event_type,
    raw_data,
    // Optional position auto-creation fields
    classification,
    tier,
    rationale,
    citation_ids,
    profile_id,
  } = req.body as Record<string, unknown>;

  if (!chain_id || !wallet_address || !event_type) {
    res.status(400).json({ error: "chain_id, wallet_address, and event_type are required" });
    return;
  }

  // Verify chain exists
  const chains = await db
    .select()
    .from(chainsTable)
    .where(eq(chainsTable.id, chain_id as string))
    .limit(1);
  if (chains.length === 0) {
    res.status(400).json({ error: "chain_id does not reference a known chain" });
    return;
  }

  // Verify protocol if provided
  if (protocol_id) {
    const protos = await db
      .select()
      .from(protocolsTable)
      .where(eq(protocolsTable.id, protocol_id as string))
      .limit(1);
    if (protos.length === 0) {
      res.status(400).json({ error: "protocol_id does not reference a known protocol" });
      return;
    }
  }

  // Insert raw transaction record
  const [rawTx] = await db
    .insert(rawTransactionsTable)
    .values({
      chainId: chain_id as string,
      walletAddress: wallet_address as string,
      txHash: (tx_hash as string) ?? null,
      txDate: tx_date ? new Date(tx_date as string) : null,
      protocolId: (protocol_id as string) ?? null,
      eventType: event_type as string,
      rawData: (raw_data as Record<string, unknown>) ?? {},
      ingestedBy: req.user!.clerkId,
    })
    .returning();

  // If classification data is present, auto-create a Position Record via the
  // shared helper — same computeRequiresReview rules the adapters and the
  // /positions route use, no separately maintained copy of the logic here.
  let position: Record<string, unknown> | null = null;
  if (classification && tier && rationale) {
    const citationIds = Array.isArray(citation_ids) ? (citation_ids as string[]) : [];

    const pos = await createPositionFromClassification({
      eventType: event_type as string,
      classification: classification as string,
      tier: tier as CreatePositionInput["tier"],
      rationale: rationale as string,
      walletId: wallet_address as string,
      txId: (tx_hash as string) ?? null,
      txDate: tx_date ? new Date(tx_date as string) : null,
      chainId: chain_id as string,
      profileId: (profile_id as string) ?? null,
      citationIds,
    });

    await db
      .update(rawTransactionsTable)
      .set({ processed: true, positionRecordId: pos.id })
      .where(eq(rawTransactionsTable.id, rawTx.id));

    position = {
      id: pos.id,
      event_type: pos.eventType,
      classification: pos.classification,
      tier: pos.tier,
      requires_review: pos.requiresReview,
      chain_id: pos.chainId,
      created_at: pos.createdAt.toISOString(),
    };
  }

  res.status(201).json({
    raw_transaction: {
      ...serialize(rawTx),
      processed: position !== null,
      position_record_id: position ? (position.id as string) : null,
    },
    position,
  });
});

/**
 * POST /transactions/classify
 *
 * Walks raw_transactions where processed=false and runs each through the
 * ProtocolRegistry. Transactions without a registered protocol adapter are
 * skipped (left unprocessed). Returns a summary of what was classified.
 *
 * Query params:
 *   - limit   Max transactions to process in one call (default 50, max 200).
 *   - protocol_id   If supplied, only classify transactions for this protocol.
 */
router.post("/transactions/classify", requireAuth, strictLimiter, async (req, res): Promise<void> => {
  const rawLimit = parseInt((req.query.limit as string) ?? "50", 10);
  const limit = isNaN(rawLimit) ? 50 : Math.min(Math.max(rawLimit, 1), 200);
  const protocolId = req.query.protocol_id as string | undefined;

  const txs = await db
    .select()
    .from(rawTransactionsTable)
    .where(
      and(
        eq(rawTransactionsTable.processed, false),
        protocolId ? eq(rawTransactionsTable.protocolId, protocolId) : undefined,
      ),
    )
    .orderBy(rawTransactionsTable.createdAt)
    .limit(limit);

  let classified = 0;
  let skipped = 0;
  const errors: Array<{ txId: string; error: string }> = [];

  for (const tx of txs) {
    try {
      const events = await registry.parseTransaction(tx);

      if (events.length === 0) {
        skipped++;
        continue;
      }

      // Use the first event to set positionRecordId on the raw tx.
      // A transaction can emit multiple classifiable events (e.g. multi-hop swaps);
      // each gets its own Position Record.
      let firstPositionId: string | null = null;

      for (const event of events) {
        const position = await createPositionFromClassification({
          eventType: event.eventType,
          classification: event.classification,
          tier: event.tier,
          rationale: event.rationale,
          walletId: tx.walletAddress,
          txId: tx.txHash,
          txDate: tx.txDate,
          chainId: tx.chainId,
          citationIds: event.citationIds,
          requiresReviewOverride: event.requiresReviewOverride,
        });
        firstPositionId ??= position.id;
        classified++;
      }

      await db
        .update(rawTransactionsTable)
        .set({ processed: true, positionRecordId: firstPositionId })
        .where(eq(rawTransactionsTable.id, tx.id));
    } catch (err) {
      errors.push({
        txId: tx.id,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  res.json({
    total_fetched: txs.length,
    classified,
    skipped,
    errors,
  });
});

function serialize(tx: typeof rawTransactionsTable.$inferSelect) {
  return {
    id: tx.id,
    chain_id: tx.chainId,
    wallet_address: tx.walletAddress,
    tx_hash: tx.txHash ?? null,
    tx_date: tx.txDate?.toISOString() ?? null,
    protocol_id: tx.protocolId ?? null,
    event_type: tx.eventType,
    raw_data: tx.rawData ?? {},
    processed: tx.processed,
    position_record_id: tx.positionRecordId ?? null,
    ingested_by: tx.ingestedBy ?? null,
    created_at: tx.createdAt.toISOString(),
  };
}

export default router;
