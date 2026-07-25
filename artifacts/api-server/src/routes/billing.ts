/**
 * Billing routes — Coinbase Commerce USDC subscriptions.
 *
 * Public (no auth):
 *   POST /billing/webhook   — Commerce webhook; verified by HMAC signature.
 *
 * Protected (requireAuth + attachSubscription):
 *   GET  /billing/status    — current plan, status, payment history.
 *   POST /billing/checkout  — create a Commerce charge and return hosted_url.
 *   POST /billing/cancel    — cancel active subscription.
 *   POST /billing/contact   — Enterprise contact form.
 */
import { Router, type Request, type Response } from "express";
import { eq, desc } from "drizzle-orm";
import { db, subscriptionsTable, paymentsTable } from "@workspace/db";
import { createCharge, verifyWebhookSignature, type CommerceWebhookEvent } from "../lib/coinbaseCommerce.js";
import { PLAN_PRICES, PERIOD_DAYS, SUPER_ADMIN_EMAIL } from "../lib/planLimits.js";
import { logger } from "../lib/logger.js";

const router = Router();

// ── Webhook (public — no auth) ────────────────────────────────────────────────

/**
 * Named export so routes/index.ts can mount it before requireAuth.
 * Requires raw body — app.ts must enable the rawBody capture on express.json().
 */
export async function webhookHandler(req: Request, res: Response): Promise<void> {
  const signature = req.headers["x-cc-webhook-signature"] as string | undefined;
  const rawBody = (req as Request & { rawBody?: string }).rawBody ?? "";

  if (!signature) {
    res.status(400).json({ error: "Missing signature" });
    return;
  }

  let verified = false;
  try {
    verified = verifyWebhookSignature(rawBody, signature);
  } catch (err) {
    logger.warn({ err }, "Webhook secret not configured");
    res.status(500).json({ error: "Webhook secret not configured" });
    return;
  }

  if (!verified) {
    res.status(401).json({ error: "Invalid signature" });
    return;
  }

  let event: CommerceWebhookEvent;
  try {
    event = JSON.parse(rawBody) as CommerceWebhookEvent;
  } catch {
    res.status(400).json({ error: "Invalid JSON payload" });
    return;
  }
  logger.info({ type: event.type, chargeId: event.data?.id }, "Commerce webhook received");

  if (event.type === "charge:confirmed") {
    await handleChargeConfirmed(event.data.id, event.data.metadata);
  }

  // Always 200 — Commerce retries on non-2xx
  res.status(200).json({ received: true });
}

async function handleChargeConfirmed(
  chargeId: string,
  metadata: Record<string, string>,
): Promise<void> {
  const userId = metadata.user_id;
  const plan = metadata.plan as "pro" | "firm";
  const billingPeriod = metadata.billing_period as "monthly" | "annual";

  if (!userId || !plan || !billingPeriod) {
    logger.warn({ chargeId, metadata }, "Webhook missing required metadata — skipping");
    return;
  }

  // Find the pending payment record
  const [payment] = await db
    .select()
    .from(paymentsTable)
    .where(eq(paymentsTable.coinbaseChargeId, chargeId))
    .limit(1);

  if (!payment) {
    logger.warn({ chargeId }, "No payment record found for confirmed charge");
    return;
  }

  // Mark payment confirmed
  await db
    .update(paymentsTable)
    .set({ status: "confirmed", confirmedAt: new Date() })
    .where(eq(paymentsTable.coinbaseChargeId, chargeId));

  // Advance subscription period
  const periodDays = PERIOD_DAYS[billingPeriod] ?? 30;
  const now = new Date();
  const periodEnd = new Date(now.getTime() + periodDays * 24 * 60 * 60 * 1000);

  const [existing] = await db
    .select()
    .from(subscriptionsTable)
    .where(eq(subscriptionsTable.userId, payment.userId))
    .limit(1);

  if (existing) {
    await db
      .update(subscriptionsTable)
      .set({
        plan,
        billingPeriod,
        status: "active",
        upgradePromptCount: 0, // Reset prompts on upgrade
        currentPeriodStart: now,
        currentPeriodEnd: periodEnd,
        updatedAt: now,
      })
      .where(eq(subscriptionsTable.userId, payment.userId));
  } else {
    await db.insert(subscriptionsTable).values({
      userId: payment.userId,
      plan,
      billingPeriod,
      status: "active",
      currentPeriodStart: now,
      currentPeriodEnd: periodEnd,
    });
  }

  // Link payment → subscription
  const [sub] = await db
    .select()
    .from(subscriptionsTable)
    .where(eq(subscriptionsTable.userId, payment.userId))
    .limit(1);

  if (sub) {
    await db
      .update(paymentsTable)
      .set({ subscriptionId: sub.id })
      .where(eq(paymentsTable.coinbaseChargeId, chargeId));
  }

  logger.info({ userId, plan, billingPeriod, periodEnd }, "Subscription activated");
}

// ── Protected routes (mounted after requireAuth + attachSubscription) ─────────

/** GET /billing/status */
router.get("/billing/status", async (req, res) => {
  const user = req.user!;
  const sub = req.subscription;

  const paymentHistory = await db
    .select()
    .from(paymentsTable)
    .where(eq(paymentsTable.userId, user.id))
    .orderBy(desc(paymentsTable.createdAt))
    .limit(20);

  res.json({
    plan: sub?.plan ?? "free",
    status: sub?.status ?? "active",
    billing_period: sub?.billingPeriod ?? null,
    current_period_end: sub?.currentPeriodEnd ?? null,
    upgrade_prompt_count: sub?.upgradePromptCount ?? 0,
    is_super_admin: user.email === SUPER_ADMIN_EMAIL,
    payments: paymentHistory.map((p) => ({
      id: p.id,
      plan: p.plan,
      billing_period: p.billingPeriod,
      amount_usdc: p.amountUsdc,
      status: p.status,
      created_at: p.createdAt,
      confirmed_at: p.confirmedAt,
    })),
  });
});

/** POST /billing/checkout */
router.post("/billing/checkout", async (req, res) => {
  const user = req.user!;
  const { plan, billing_period } = req.body as { plan?: string; billing_period?: string };

  if (!plan || !billing_period) {
    res.status(400).json({ error: "plan and billing_period are required" });
    return;
  }

  const prices = PLAN_PRICES[plan];
  const amountUsdc = prices?.[billing_period as "monthly" | "annual"];

  if (!amountUsdc) {
    res.status(400).json({ error: `No pricing found for ${plan}/${billing_period}` });
    return;
  }

  const planLabel = plan.charAt(0).toUpperCase() + plan.slice(1);
  const periodLabel = billing_period === "annual" ? "Annual" : "Monthly";

  let charge;
  try {
    charge = await createCharge({
      name: `BasisGuard ${planLabel} — ${periodLabel}`,
      description: `BasisGuard ${planLabel} subscription (${periodLabel}, paid in USDC)`,
      amountUsdc,
      metadata: {
        user_id: user.id,
        user_email: user.email,
        plan,
        billing_period,
      },
    });
  } catch (err) {
    logger.error({ err }, "Failed to create Commerce charge");
    res.status(502).json({ error: "Failed to create checkout session" });
    return;
  }

  // Record pending payment
  await db.insert(paymentsTable).values({
    userId: user.id,
    coinbaseChargeId: charge.id,
    coinbaseChargeCode: charge.code,
    plan,
    billingPeriod: billing_period,
    amountUsdc,
    status: "pending",
  });

  res.json({
    hosted_url: charge.hosted_url,
    charge_id: charge.id,
    charge_code: charge.code,
    expires_at: charge.expires_at,
  });
});

/** POST /billing/cancel */
router.post("/billing/cancel", async (req, res) => {
  const user = req.user!;
  const sub = req.subscription;

  if (!sub || sub.plan === "free") {
    res.status(400).json({ error: "No active paid subscription to cancel" });
    return;
  }

  if (user.email === SUPER_ADMIN_EMAIL) {
    res.status(403).json({ error: "Super-admin subscriptions cannot be cancelled" });
    return;
  }

  await db
    .update(subscriptionsTable)
    .set({ status: "cancelled", cancelledAt: new Date(), updatedAt: new Date() })
    .where(eq(subscriptionsTable.id, sub.id));

  res.json({ cancelled: true, access_until: sub.currentPeriodEnd });
});

/** POST /billing/contact — Enterprise inquiry */
router.post("/billing/contact", async (req, res) => {
  const user = req.user!;
  const { message, company, team_size } = req.body as {
    message?: string;
    company?: string;
    team_size?: string;
  };

  if (!message) {
    res.status(400).json({ error: "message is required" });
    return;
  }

  // Log the inquiry — extend with email sending (e.g. Resend/SendGrid) when ready
  logger.info(
    { userId: user.id, email: user.email, company, team_size, message },
    "Enterprise contact inquiry received",
  );

  res.json({
    received: true,
    message: "We'll be in touch within 1 business day.",
  });
});

export default router;
