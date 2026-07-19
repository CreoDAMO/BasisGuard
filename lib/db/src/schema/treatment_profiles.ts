import { pgTable, text, uuid, timestamp, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const treatmentProfilesTable = pgTable("treatment_profiles", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  status: text("status").notNull(), // active | deprecated | opt_in_only
  rules: jsonb("rules").notNull().default([]),
  changelog: text("changelog"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertTreatmentProfileSchema = createInsertSchema(
  treatmentProfilesTable
).omit({ id: true, createdAt: true });

export type InsertTreatmentProfile = z.infer<
  typeof insertTreatmentProfileSchema
>;
export type TreatmentProfile = typeof treatmentProfilesTable.$inferSelect;
