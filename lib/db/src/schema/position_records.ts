import { pgTable, text, uuid, timestamp, boolean, doublePrecision } from "drizzle-orm/pg-core";
import { treatmentProfilesTable } from "./treatment_profiles";
import { chainsTable } from "./chains";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const positionRecordsTable = pgTable("position_records", {
  id: uuid("id").primaryKey().defaultRandom(),
  txId: text("tx_id"),
  txDate: timestamp("tx_date", { withTimezone: true }), // actual date of the underlying transaction (for tax-year bucketing)
  walletId: text("wallet_id"),
  eventType: text("event_type").notNull(),
  classification: text("classification").notNull(),
  tier: text("tier").notNull(), // will | should | more_likely_than_not | substantial_authority | reasonable_basis
  rationale: text("rationale").notNull(),
  profileId: uuid("profile_id").references(() => treatmentProfilesTable.id),
  profileVersion: text("profile_version"),
  chainId: uuid("chain_id").references(() => chainsTable.id), // nullable — legacy records have no chain
  requiresReview: boolean("requires_review").notNull().default(false),
  reviewerId: text("reviewer_id"),
  reviewerName: text("reviewer_name"),
  reviewerCredential: text("reviewer_credential"),
  reviewerSignoffAt: timestamp("reviewer_signoff_at", { withTimezone: true }),
  supersededBy: uuid("superseded_by"), // self-reference, handled at app layer
  /**
   * Realized gain/loss in USD at the time of the transaction (positive = gain,
   * negative = loss). Set by adapters or ingest routes that have price data;
   * null for positions created before this field existed or without price data.
   * Used by the loss-harvesting scanner.
   */
  amountUsd: doublePrecision("amount_usd"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertPositionRecordSchema = createInsertSchema(
  positionRecordsTable
).omit({ id: true, createdAt: true });

export type InsertPositionRecord = z.infer<typeof insertPositionRecordSchema>;
export type PositionRecord = typeof positionRecordsTable.$inferSelect;
