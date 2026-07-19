import { pgTable, text, uuid, boolean, jsonb, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const chainsTable = pgTable("chains", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  isL2: boolean("is_l2").notNull().default(false),
  parentChainId: uuid("parent_chain_id"), // self-reference for L2s → handled at app layer
  metadata: jsonb("metadata").default({}), // { rpc_url, explorer_url, native_token }
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertChainSchema = createInsertSchema(chainsTable).omit({ id: true, createdAt: true });

export type InsertChain = z.infer<typeof insertChainSchema>;
export type Chain = typeof chainsTable.$inferSelect;
