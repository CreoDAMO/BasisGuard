import { Router, type IRouter } from "express";
import { eq, desc } from "drizzle-orm";
import {
  db,
  rawTransactionsTable,
  chainsTable,
  protocolsTable,
  positionRecordsTable,
  positionCitationsTable,
} from "@workspace/db";
import { requireAuth } from "../middlewares/auth.js";
import { OPEN_GAP_EVENT_TYPES } from "./positions.js";

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
 * raw transaction is stored with processed=false for future adapter processing.
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

  // If classification data is present, auto-create a Position Record
  let position: Record<string, unknown> | null = null;
  if (classification && tier && rationale) {
    const citationIds = Array.isArray(citation_ids) ? (citation_ids as string[]) : [];
    const isOpenGap = OPEN_GAP_EVENT_TYPES.has(event_type as string);
    const requiresReview = isOpenGap || citationIds.length === 0;

    const [pos] = await db
      .insert(positionRecordsTable)
      .values({
        txId: (tx_hash as string) ?? null,
        txDate: tx_date ? new Date(tx_date as string) : null,
        walletId: wallet_address as string,
        eventType: event_type as string,
        classification: classification as string,
        tier: tier as string,
        rationale: rationale as string,
        profileId: (profile_id as string) ?? null,
        chainId: chain_id as string,
        requiresReview,
      })
      .returning();

    if (citationIds.length > 0) {
      await db.insert(positionCitationsTable).values(
        citationIds.map((cid) => ({ positionId: pos.id, citationId: cid }))
      );
    }

    // Link raw tx → position record
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
