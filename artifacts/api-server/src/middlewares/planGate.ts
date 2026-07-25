/**
 * Plan enforcement middleware.
 *
 * Soft limits (first SOFT_LIMIT_MAX attempts): returns 402 with soft:true so
 * the frontend can show a dismissible upgrade modal and let the user continue.
 *
 * Hard limits (attempts beyond SOFT_LIMIT_MAX): returns 402 with soft:false,
 * no bypass.
 *
 * Usage in a router:
 *   router.get("/export", requirePlan("pro", "exports"), exportHandler);
 */
import type { Request, Response, NextFunction } from "express";
import { db, subscriptionsTable, type Subscription } from "@workspace/db";
import { eq } from "drizzle-orm";
import {
  meetsRequirement,
  SOFT_LIMIT_MAX,
  SUPER_ADMIN_EMAIL,
  type PlanName,
} from "../lib/planLimits.js";

// Augment Express Request to carry the resolved subscription
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      subscription?: Subscription;
    }
  }
}

/**
 * Fetch and attach the subscription to req.subscription.
 * Also auto-expires beta_trial subscriptions that have passed currentPeriodEnd.
 * Must run after requireAuth (which populates req.user).
 */
export async function attachSubscription(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  const user = req.user;
  if (!user) { next(); return; }

  const [sub] = await db
    .select()
    .from(subscriptionsTable)
    .where(eq(subscriptionsTable.userId, user.id))
    .limit(1);

  if (!sub) { next(); return; }

  // Auto-expire beta trials
  if (
    sub.status === "beta_trial" &&
    sub.currentPeriodEnd &&
    sub.currentPeriodEnd < new Date()
  ) {
    await db
      .update(subscriptionsTable)
      .set({ plan: "free", status: "active", updatedAt: new Date() })
      .where(eq(subscriptionsTable.id, sub.id));
    sub.plan = "free";
    sub.status = "active";
  }

  req.subscription = sub;
  next();
}

/**
 * Gate a route behind a plan requirement.
 * Super-admin email always bypasses.
 *
 * @param requiredPlan  Minimum plan needed.
 * @param feature       Optional human-readable feature name for error messages.
 */
export function requirePlan(requiredPlan: PlanName, feature?: string) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const user = req.user;
    const sub = req.subscription;

    // Super-admin is always unrestricted
    if (user?.email === SUPER_ADMIN_EMAIL) { next(); return; }

    const currentPlan = (sub?.plan ?? "free") as PlanName;

    if (meetsRequirement(currentPlan, requiredPlan)) { next(); return; }

    // User is below the required plan — apply soft/hard logic
    const promptCount = sub?.upgradePromptCount ?? 0;

    if (promptCount < SOFT_LIMIT_MAX) {
      // Soft prompt: increment count and return a dismissible 402
      if (sub) {
        await db
          .update(subscriptionsTable)
          .set({ upgradePromptCount: promptCount + 1, updatedAt: new Date() })
          .where(eq(subscriptionsTable.id, sub.id));
      }

      res.status(402).json({
        error: "plan_limit_soft",
        soft: true,
        prompt_count: promptCount + 1,
        prompts_remaining: SOFT_LIMIT_MAX - promptCount - 1,
        current_plan: currentPlan,
        required_plan: requiredPlan,
        feature: feature ?? null,
        upgrade_url: "/pricing",
      });
      return;
    }

    // Hard block
    res.status(402).json({
      error: "plan_limit_exceeded",
      soft: false,
      current_plan: currentPlan,
      required_plan: requiredPlan,
      feature: feature ?? null,
      upgrade_url: "/pricing",
    });
  };
}
