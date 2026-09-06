import { pgTable, text, uuid, timestamp, doublePrecision } from "drizzle-orm/pg-core";
import { lotsTable } from "./lots";
import { positionRecordsTable } from "./position_records";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

/**
 * Contemporaneous specific-identification records (Treas. Reg. §1.1012-1(j)).
 *
 * LIFO / HIFO / min-tax are not standing orders. They become the method that
 * files only if the taxpayer identifies the lot no later than the sale.
 * Notice 2025-7 / 2026-20 relief is books-and-records — a ranked simulator
 * table after year-end is not an identification.
 *
 * identified_at must be ≤ the disposal date or the record is ignored by
 * inventory consumption. The tax optimizer never writes this table.
 */
export const lotIdentificationsTable = pgTable("lot_identifications", {
  id: uuid("id").primaryKey().defaultRandom(),
  lotId: uuid("lot_id").notNull().references(() => lotsTable.id),
  walletId: text("wallet_id").notNull(),
  assetSymbol: text("asset_symbol").notNull(),
  quantity: doublePrecision("quantity").notNull(),
  /** Always specific_identification — FIFO is the default, not an ID record. */
  method: text("method").notNull().default("specific_identification"),
  identifiedAt: timestamp("identified_at", { withTimezone: true }).notNull(),
  identifiedBy: text("identified_by"),
  disposalPositionId: uuid("disposal_position_id").references(() => positionRecordsTable.id),
  consumedAt: timestamp("consumed_at", { withTimezone: true }),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertLotIdentificationSchema = createInsertSchema(lotIdentificationsTable).omit({
  id: true,
  createdAt: true,
});
export type InsertLotIdentification = z.infer<typeof insertLotIdentificationSchema>;
export type LotIdentification = typeof lotIdentificationsTable.$inferSelect;
