import { pgTable, text, uuid, jsonb, timestamp } from "drizzle-orm/pg-core";
import { chainsTable } from "./chains";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const protocolsTable = pgTable("protocols", {
  id: uuid("id").primaryKey().defaultRandom(),
  chainId: uuid("chain_id").notNull().references(() => chainsTable.id),
  name: text("name").notNull(),
  slug: text("slug").notNull(),
  contractAddresses: jsonb("contract_addresses").default({}),
  adapterVersion: text("adapter_version"),
  metadata: jsonb("metadata").default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertProtocolSchema = createInsertSchema(protocolsTable).omit({ id: true, createdAt: true });

export type InsertProtocol = z.infer<typeof insertProtocolSchema>;
export type Protocol = typeof protocolsTable.$inferSelect;
