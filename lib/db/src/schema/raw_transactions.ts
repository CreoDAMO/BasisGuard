import { pgTable, text, uuid, timestamp, boolean, jsonb } from "drizzle-orm/pg-core";
import { chainsTable } from "./chains";
import { protocolsTable } from "./protocols";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

/**
 * Raw on-chain events ingested via POST /transactions/ingest.
 * Each row represents one decoded event from a wallet's on-chain activity.
 * When the adapter layer is built, these rows feed into the ProtocolRegistry
 * for automatic Position Record generation. Until then, callers supply
 * pre-classified data and a Position Record is created immediately.
 */
export const rawTransactionsTable = pgTable("raw_transactions", {
  id: uuid("id").primaryKey().defaultRandom(),
  chainId: uuid("chain_id").notNull().references(() => chainsTable.id),
  walletAddress: text("wallet_address").notNull(),
  txHash: text("tx_hash"),
  txDate: timestamp("tx_date", { withTimezone: true }),
  protocolId: uuid("protocol_id").references(() => protocolsTable.id),
  eventType: text("event_type").notNull(),
  rawData: jsonb("raw_data").default({}),
  // Processing state — false until a Position Record has been created
  processed: boolean("processed").notNull().default(false),
  // Set to the generated position record's ID once processed
  positionRecordId: uuid("position_record_id"),
  ingestedBy: text("ingested_by"), // Clerk user ID of the submitter
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertRawTransactionSchema = createInsertSchema(rawTransactionsTable).omit({
  id: true,
  createdAt: true,
  processed: true,
  positionRecordId: true,
});
export type InsertRawTransaction = z.infer<typeof insertRawTransactionSchema>;
export type RawTransaction = typeof rawTransactionsTable.$inferSelect;
