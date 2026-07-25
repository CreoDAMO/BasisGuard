import { pgTable, uuid, text, integer, timestamp } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

/**
 * One subscription row per user — upserted on JIT provision and on payment
 * confirmation. status drives access: active | beta_trial | grandfathered |
 * cancelled | expired.
 *
 * upgradePromptCount tracks soft-limit prompts shown. At < 2 the API returns
 * 402 with soft:true (dismissible modal). At ≥ 2 it returns hard 402.
 */
export const subscriptionsTable = pgTable("subscriptions", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => usersTable.id, { onDelete: "cascade" })
    .unique(),
  plan: text("plan").notNull().default("free"),          // free | pro | firm | enterprise
  billingPeriod: text("billing_period").default("monthly"), // monthly | annual | lifetime
  status: text("status").notNull().default("active"),    // active | beta_trial | grandfathered | cancelled | expired
  upgradePromptCount: integer("upgrade_prompt_count").notNull().default(0),
  currentPeriodStart: timestamp("current_period_start", { withTimezone: true }).notNull().defaultNow(),
  currentPeriodEnd: timestamp("current_period_end", { withTimezone: true }), // null = no expiry (grandfathered/enterprise)
  cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Subscription = typeof subscriptionsTable.$inferSelect;
export type InsertSubscription = typeof subscriptionsTable.$inferInsert;
