import { pgTable, text, uuid, timestamp, integer, unique } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

/**
 * Generic exchange connection store.
 *
 * Supports Kraken, Gemini, and any future CEX connectors.
 * API secrets are encrypted at rest with AES-256-GCM (same as Coinbase).
 * One row per (user, exchange) pair — enforced by the unique constraint.
 */
export const exchangeConnectionsTable = pgTable(
  "exchange_connections",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    userId: uuid("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),

    /** Exchange identifier: 'kraken' | 'gemini' */
    exchange: text("exchange").notNull(),

    apiKey: text("api_key").notNull(),
    encryptedSecret: text("encrypted_secret").notNull(),
    secretIv: text("secret_iv").notNull(),
    secretAuthTag: text("secret_auth_tag").notNull(),

    lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),
    txCount: integer("tx_count").notNull().default(0),

    /** active | error */
    status: text("status").notNull().default("active"),
    errorMessage: text("error_message"),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique("exchange_connections_user_exchange_unique").on(t.userId, t.exchange)],
);

export type ExchangeConnection = typeof exchangeConnectionsTable.$inferSelect;
