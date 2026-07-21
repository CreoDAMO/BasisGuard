import { pgTable, text, uuid, timestamp, doublePrecision } from "drizzle-orm/pg-core";
import { positionRecordsTable } from "./position_records";
import { chainsTable } from "./chains";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

/**
 * Lot Inventory — tracks individual tax lots (acquisitions) and their disposal state.
 *
 * A "lot" is a discrete acquisition event: a specific quantity of an asset purchased
 * or received at a specific date and cost basis. Each lot has a holding period and
 * can be open (still held), partially disposed, or fully closed.
 *
 * This table is the prerequisite for forward-looking harvest analysis (which open
 * lots are underwater, holding period, basis vs. current market value). It is
 * distinct from position_records, which tracks already-realized disposal events.
 */
export const lotsTable = pgTable("lots", {
  id: uuid("id").primaryKey().defaultRandom(),

  /** FK to the position record representing the acquisition event (if classified). */
  positionRecordId: uuid("position_record_id").references(() => positionRecordsTable.id),

  walletId: text("wallet_id").notNull(),
  assetSymbol: text("asset_symbol").notNull(),
  /** Contract address, coingecko id, or other canonical identifier. */
  assetIdentifier: text("asset_identifier"),
  chainId: uuid("chain_id").references(() => chainsTable.id),

  /** Number of units acquired. */
  quantity: doublePrecision("quantity").notNull(),
  /** Total cost basis in USD at acquisition (quantity × per-unit price). */
  costBasisUsd: doublePrecision("cost_basis_usd"),
  /** Cost basis per unit in USD at acquisition. */
  costBasisPerUnitUsd: doublePrecision("cost_basis_per_unit_usd"),

  acquisitionDate: timestamp("acquisition_date", { withTimezone: true }).notNull(),
  acquisitionTxId: text("acquisition_tx_id"),

  /** FK to the position record for the disposal event that closed this lot. */
  disposalPositionId: uuid("disposal_position_id").references(() => positionRecordsTable.id),
  disposalDate: timestamp("disposal_date", { withTimezone: true }),
  /** Gross proceeds in USD at disposal. */
  disposalProceedsUsd: doublePrecision("disposal_proceeds_usd"),
  /** Realized gain (positive) or loss (negative) in USD: proceeds − basis. */
  realizedGainLossUsd: doublePrecision("realized_gain_loss_usd"),

  /** open | closed | partial */
  status: text("status").notNull().default("open"),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertLotSchema = createInsertSchema(lotsTable).omit({ id: true, createdAt: true });
export type InsertLot = z.infer<typeof insertLotSchema>;
export type Lot = typeof lotsTable.$inferSelect;
