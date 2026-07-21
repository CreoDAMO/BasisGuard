import { pgTable, text, uuid, timestamp, integer } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

/**
 * Stores an encrypted Coinbase legacy API key + secret per user.
 * One connection per user (unique on user_id).
 * API secret is encrypted at rest using AES-256-GCM.
 */
export const coinbaseConnectionsTable = pgTable("coinbase_connections", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .unique()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  apiKey: text("api_key").notNull(),
  encryptedSecret: text("encrypted_secret").notNull(),
  secretIv: text("secret_iv").notNull(),
  secretAuthTag: text("secret_auth_tag").notNull(),
  lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),
  txCount: integer("tx_count").notNull().default(0),
  status: text("status").notNull().default("active"), // active | error
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type CoinbaseConnection = typeof coinbaseConnectionsTable.$inferSelect;
