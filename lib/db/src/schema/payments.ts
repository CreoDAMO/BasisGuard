import { pgTable, uuid, text, timestamp } from "drizzle-orm/pg-core";
import { subscriptionsTable } from "./subscriptions";
import { usersTable } from "./users";

/**
 * Immutable ledger of every Coinbase Business checkout attempt.
 * `coinbase_charge_id` stores the Business checkout id (column name kept to
 * avoid a destructive rename — Commerce never settled live payments).
 *
 * status mirrors Business webhook / Get Checkout states:
 *   pending → confirmed | failed | expired
 *
 * On checkout.payment.success (or Get Checkout status COMPLETED) the billing
 * route upgrades the linked subscription.
 */
export const paymentsTable = pgTable("payments", {
  id: uuid("id").primaryKey().defaultRandom(),
  subscriptionId: uuid("subscription_id").references(() => subscriptionsTable.id),
  userId: uuid("user_id")
    .notNull()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  coinbaseChargeId: text("coinbase_charge_id").notNull().unique(),
  coinbaseChargeCode: text("coinbase_charge_code"),
  plan: text("plan").notNull(),                          // pro | firm
  billingPeriod: text("billing_period").notNull(),       // monthly | annual
  amountUsdc: text("amount_usdc").notNull(),
  status: text("status").notNull().default("pending"),   // pending | confirmed | failed | expired
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
});

export type Payment = typeof paymentsTable.$inferSelect;
export type InsertPayment = typeof paymentsTable.$inferInsert;
