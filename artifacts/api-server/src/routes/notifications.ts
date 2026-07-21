/**
 * Notifications API.
 *
 * Notifications are generated on-demand by POST /notifications/generate,
 * which scans for stale positions and review-queue backlog and upserts
 * summary notifications for the current user. This avoids a background
 * worker and keeps the notification set always fresh.
 *
 * Routes:
 *   GET  /notifications           — list (newest first, optional ?unread_only=true)
 *   GET  /notifications/count     — { unread: N } — drives the bell badge
 *   POST /notifications/generate  — refresh auto-generated notifications
 *   POST /notifications/read-all  — mark all as read
 *   POST /notifications/:id/read  — mark one as read
 *   GET  /notifications/preferences         — fetch preferences
 *   PUT  /notifications/preferences         — update preferences
 */

import { Router, type IRouter } from "express";
import { eq, and, isNull, desc, count as drizzleCount } from "drizzle-orm";
import {
  db,
  notificationsTable,
  notificationPreferencesTable,
  positionRecordsTable,
} from "@workspace/db";
import { isStale } from "../core/reviewRules.js";

const router: IRouter = Router();

// ── Serializers ───────────────────────────────────────────────────────────────

function serializeNotification(n: typeof notificationsTable.$inferSelect) {
  return {
    id: n.id,
    type: n.type,
    title: n.title,
    body: n.body,
    position_id: n.positionId ?? null,
    read: n.read,
    created_at: n.createdAt.toISOString(),
  };
}

// ── GET /notifications ────────────────────────────────────────────────────────

router.get("/notifications", async (req, res): Promise<void> => {
  const unreadOnly = req.query.unread_only === "true";
  const limit = Math.min(Number(req.query.limit ?? 50), 100);

  const conditions = [eq(notificationsTable.userId, req.user!.id)];
  if (unreadOnly) conditions.push(eq(notificationsTable.read, false));

  const items = await db
    .select()
    .from(notificationsTable)
    .where(and(...conditions))
    .orderBy(desc(notificationsTable.createdAt))
    .limit(limit);

  res.json(items.map(serializeNotification));
});

// ── GET /notifications/count ──────────────────────────────────────────────────

router.get("/notifications/count", async (req, res): Promise<void> => {
  const [row] = await db
    .select({ unread: drizzleCount() })
    .from(notificationsTable)
    .where(
      and(
        eq(notificationsTable.userId, req.user!.id),
        eq(notificationsTable.read, false),
      ),
    );
  res.json({ unread: Number(row?.unread ?? 0) });
});

// ── POST /notifications/generate ──────────────────────────────────────────────

router.post("/notifications/generate", async (req, res): Promise<void> => {
  const user = req.user!;

  // Fetch user preferences (create defaults on first visit)
  let [prefs] = await db
    .select()
    .from(notificationPreferencesTable)
    .where(eq(notificationPreferencesTable.userId, user.id))
    .limit(1);

  if (!prefs) {
    [prefs] = await db
      .insert(notificationPreferencesTable)
      .values({ userId: user.id })
      .returning();
  }

  const created: string[] = [];

  // ── Stale positions ──────────────────────────────────────────────────────
  if (prefs.staleAlerts) {
    // Delete old auto-generated stale notification so we regenerate fresh
    await db
      .delete(notificationsTable)
      .where(
        and(
          eq(notificationsTable.userId, user.id),
          eq(notificationsTable.type, "stale_positions"),
        ),
      );

    const positions = await db.select().from(positionRecordsTable);
    const staleCount = positions.filter(
      (p) => isStale(p) && p.supersededBy === null,
    ).length;

    if (staleCount > 0) {
      await db.insert(notificationsTable).values({
        userId: user.id,
        type: "stale_positions",
        title: `${staleCount} stale position${staleCount > 1 ? "s" : ""} need attention`,
        body:
          `${staleCount} position${staleCount > 1 ? "s have" : " has"} not been updated in ` +
          `over 180 days and may require re-evaluation. ` +
          `Review the Intelligence › Stale Positions report.`,
        read: false,
      });
      created.push("stale_positions");
    }
  }

  // ── Review queue backlog ──────────────────────────────────────────────────
  if (prefs.reviewQueueAlerts) {
    await db
      .delete(notificationsTable)
      .where(
        and(
          eq(notificationsTable.userId, user.id),
          eq(notificationsTable.type, "review_queue"),
        ),
      );

    const [queueRow] = await db
      .select({ total: drizzleCount() })
      .from(positionRecordsTable)
      .where(
        and(
          eq(positionRecordsTable.requiresReview, true),
          isNull(positionRecordsTable.reviewerSignoffAt),
        ),
      );

    const queueCount = Number(queueRow?.total ?? 0);
    if (queueCount > 0) {
      await db.insert(notificationsTable).values({
        userId: user.id,
        type: "review_queue",
        title: `${queueCount} position${queueCount > 1 ? "s" : ""} pending review`,
        body:
          `${queueCount} position${queueCount > 1 ? "s require" : " requires"} reviewer ` +
          `sign-off before they can be considered audit-ready. ` +
          `Visit the Review Queue to take action.`,
        read: false,
      });
      created.push("review_queue");
    }
  }

  res.json({ generated: created });
});

// ── POST /notifications/read-all ──────────────────────────────────────────────

router.post("/notifications/read-all", async (req, res): Promise<void> => {
  await db
    .update(notificationsTable)
    .set({ read: true, updatedAt: new Date() })
    .where(eq(notificationsTable.userId, req.user!.id));
  res.json({ ok: true });
});

// ── POST /notifications/:id/read ─────────────────────────────────────────────

router.post("/notifications/:id/read", async (req, res): Promise<void> => {
  const [updated] = await db
    .update(notificationsTable)
    .set({ read: true, updatedAt: new Date() })
    .where(
      and(
        eq(notificationsTable.id, req.params.id),
        eq(notificationsTable.userId, req.user!.id),
      ),
    )
    .returning();

  if (!updated) {
    res.status(404).json({ error: "Notification not found" });
    return;
  }
  res.json(serializeNotification(updated));
});

// ── GET /notifications/preferences ───────────────────────────────────────────

router.get("/notifications/preferences", async (req, res): Promise<void> => {
  let [prefs] = await db
    .select()
    .from(notificationPreferencesTable)
    .where(eq(notificationPreferencesTable.userId, req.user!.id))
    .limit(1);

  if (!prefs) {
    [prefs] = await db
      .insert(notificationPreferencesTable)
      .values({ userId: req.user!.id })
      .returning();
  }

  res.json({
    stale_alerts: prefs.staleAlerts,
    review_queue_alerts: prefs.reviewQueueAlerts,
    sync_error_alerts: prefs.syncErrorAlerts,
  });
});

// ── PUT /notifications/preferences ───────────────────────────────────────────

router.put("/notifications/preferences", async (req, res): Promise<void> => {
  const body = req.body as {
    stale_alerts?: boolean;
    review_queue_alerts?: boolean;
    sync_error_alerts?: boolean;
  };

  const updates: Partial<typeof notificationPreferencesTable.$inferInsert> = {};
  if (typeof body.stale_alerts === "boolean") updates.staleAlerts = body.stale_alerts;
  if (typeof body.review_queue_alerts === "boolean") updates.reviewQueueAlerts = body.review_queue_alerts;
  if (typeof body.sync_error_alerts === "boolean") updates.syncErrorAlerts = body.sync_error_alerts;
  updates.updatedAt = new Date();

  // Upsert — create row if it doesn't exist yet
  const existing = await db
    .select({ id: notificationPreferencesTable.id })
    .from(notificationPreferencesTable)
    .where(eq(notificationPreferencesTable.userId, req.user!.id))
    .limit(1);

  if (existing.length === 0) {
    const [created] = await db
      .insert(notificationPreferencesTable)
      .values({ userId: req.user!.id, ...updates })
      .returning();
    res.json({
      stale_alerts: created.staleAlerts,
      review_queue_alerts: created.reviewQueueAlerts,
      sync_error_alerts: created.syncErrorAlerts,
    });
  } else {
    const [updated] = await db
      .update(notificationPreferencesTable)
      .set(updates)
      .where(eq(notificationPreferencesTable.userId, req.user!.id))
      .returning();
    res.json({
      stale_alerts: updated.staleAlerts,
      review_queue_alerts: updated.reviewQueueAlerts,
      sync_error_alerts: updated.syncErrorAlerts,
    });
  }
});

export default router;
