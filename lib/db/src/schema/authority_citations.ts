import { pgTable, text, uuid, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const authorityCitationsTable = pgTable("authority_citations", {
  id: uuid("id").primaryKey().defaultRandom(),
  type: text("type").notNull(), // Notice | Rev_Proc | Rev_Rul | Treasury_Decision | Case | Statute
  reference: text("reference").notNull(),
  summary: text("summary").notNull(),
  url: text("url"),
  authorityStrength: text("authority_strength").notNull(), // binding_on_courts | binding_on_irs_only | non_binding_persuasive
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertAuthorityCitationSchema = createInsertSchema(
  authorityCitationsTable
).omit({ id: true, createdAt: true });

export type InsertAuthorityCitation = z.infer<
  typeof insertAuthorityCitationSchema
>;
export type AuthorityCitation = typeof authorityCitationsTable.$inferSelect;
