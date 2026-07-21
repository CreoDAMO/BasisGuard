import { pgTable, text, uuid, timestamp, boolean } from "drizzle-orm/pg-core";
import { usersTable } from "./users";
import { positionRecordsTable } from "./position_records";

/**
 * Per-user notification inbox.
 *
 * Notifications are generated on-demand when the frontend polls
 * POST /notifications/generate (stale positions, review queue backlog,
 * sync errors). Auto-generated notifications of the same type are
 * idempotent — the generate endpoint upserts rather than duplicates.
 */
export const notificationsTable = pgTable("notifications", {
  id: uuid("id").primaryKey().defaultRandom(),

  userId: uuid("user_id")
    .notNull()
    .references(() => usersTable.id, { onDelete: "cascade" }),

  /**
   * stale_positions | review_queue | sync_error | general
   * Auto-generated types are regenerated on each generate() call.
   */
  type: text("type").notNull(),
  title: text("title").notNull(),
  body: text("body").notNull(),

  /** Link to a specific position, when relevant. */
  positionId: uuid("position_id").references(() => positionRecordsTable.id, {
    onDelete: "set null",
  }),

  read: boolean("read").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Notification = typeof notificationsTable.$inferSelect;

/**
 * Per-user notification preferences (JSON-encoded, one row per user).
 * Created on first access, updated on PUT /notifications/preferences.
 */
export const notificationPreferencesTable = pgTable("notification_preferences", {
  id: uuid("id").primaryKey().defaultRandom(),

  userId: uuid("user_id")
    .notNull()
    .unique()
    .references(() => usersTable.id, { onDelete: "cascade" }),

  /** Receive stale-position alerts. Default: true. */
  staleAlerts: boolean("stale_alerts").notNull().default(true),
  /** Receive review-queue backlog alerts. Default: true. */
  reviewQueueAlerts: boolean("review_queue_alerts").notNull().default(true),
  /** Receive sync error alerts from exchange connections. Default: true. */
  syncErrorAlerts: boolean("sync_error_alerts").notNull().default(true),

  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type NotificationPreferences = typeof notificationPreferencesTable.$inferSelect;
