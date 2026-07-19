import { pgTable, text, uuid, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

/**
 * Local user record — JIT-provisioned on first authenticated request.
 * The clerk_id links to Clerk's user store; role is managed here.
 * Roles: super_admin | reviewer | cpa_partner (default)
 */
export const usersTable = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  clerkId: text("clerk_id").notNull().unique(),
  email: text("email").notNull(),
  displayName: text("display_name"),
  role: text("role").notNull().default("cpa_partner"), // super_admin | reviewer | cpa_partner
  credential: text("credential"), // CPA license number or partner verification ID
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertUserSchema = createInsertSchema(usersTable).omit({ id: true, createdAt: true });
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof usersTable.$inferSelect;
