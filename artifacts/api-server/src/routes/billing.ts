/**
 * Billing routes — Coinbase Business Checkouts (USDC) subscriptions.
 *
 * Public (no auth):
 *   POST /billing/webhook   — Business webhook; verified by X-Hook0-Signature.
 *
 * Protected (requireAuth + attachSubscription):
 *   GET  /billing/status    — current plan, status, payment history.
 *   POST /billing/checkout  — create a Business checkout and return hosted_url.
 *   POST /billing/confirm   — poll Get Checkout after redirect; activate if COMPLETED.
 *   POST /billing/cancel    — cancel active subscription.
 *   POST /billing/contact   — Enterprise contact form.
 *
 * Fulfillment is from checkout.payment.success (webhook) or a COMPLETED
 * Get Checkout poll — never from the success redirect alone.
 */
import { Router, type Request, type Response } from "express";
import { eq, desc } from "drizzle-orm";
import { db, subscriptionsTable, paymentsTable } from "@workspace/db";
import {
  createCheckout,
  getCheckout,
  verifyWebhookSignature,
  type CheckoutWebhookPayload,
  type BusinessCheckout,
} from "../lib/coinbaseBusiness.js";
import { PLAN_PRICES, PERIOD_DAYS, SUPER_ADMIN_EMAIL } from "../lib/planLimits.js";
import { logger } from "../lib/logger.js";

const router = Router();

// ── Webhook (public — no auth) ────────────────────────────────────────────────

/**
 * Named export so routes/index.ts can mount it before requireAuth.
 * Requires raw body — app.ts must enable the rawBody capture on express.json().
 */
export async function webhookHandler(req: Request, res: Response): Promise<void> {
  const signature = req.headers["x-hook0-signature"] as string | undefined;
  const rawBody = (req as Request & { rawBody?: string }).rawBody ?? "";

  if (!signature) {
    res.status(400).json({ error: "Missing signature" });
    return;
  }

  let verified = false;
  try {
    verified = verifyWebhookSignature(rawBody, signature, req.headers);
  } catch (err) {
    logger.warn({ err }, "Webhook secret not configured");
    res.status(500).json({ error: "Webhook secret not configured" });
    return;
  }

  if (!verified) {
    res.status(401).json({ error: "Invalid signature" });
    return;
  }

  let event: CheckoutWebhookPayload;
  try {
    event = JSON.parse(rawBody) as CheckoutWebhookPayload;
  } catch {
    res.status(400).json({ error: "Invalid JSON payload" });
    return;
  }
  logger.info({ type: event.eventType, checkoutId: event.id, status: event.status }, "Business checkout webhook received");

  if (event.eventType === "checkout.payment.success" || event.status === "COMPLETED") {
    await handleCheckoutCompleted(event.id, event.metadata ?? {});
  } else if (event.eventType === "checkout.payment.failed" || event.status === "FAILED") {
    await markPaymentStatus(event.id, "failed");
  } else if (event.eventType === "checkout.payment.expired" || event.status === "EXPIRED") {
    await markPaymentStatus(event.id, "expired");
  }

  // Always 200 — Coinbase retries on non-2xx
  res.status(200).json({ received: true });
}

async function markPaymentStatus(checkoutId: string, status: "failed" | "expired"): Promise<void> {
  await db
    .update(paymentsTable)
    .set({ status })
    .where(eq(paymentsTable.coinbaseChargeId, checkoutId));
}

async function handleCheckoutCompleted(
  checkoutId: string,
  metadata: Record<string, string>,
): Promise<void> {
  const userId = metadata.user_id;
  const plan = metadata.plan as "pro" | "firm";
  const billingPeriod = metadata.billing_period as "monthly" | "annual";

  if (!userId || !plan || !billingPeriod) {
    logger.warn({ checkoutId, metadata }, "Webhook missing required metadata — skipping");
    return;
  }

  const [payment] = await db
    .select()
    .from(paymentsTable)
    .where(eq(paymentsTable.coinbaseChargeId, checkoutId))
    .limit(1);

  if (!payment) {
    logger.warn({ checkoutId }, "No payment record found for completed checkout");
    return;
  }

  if (payment.status === "confirmed") {
    logger.info({ checkoutId }, "Checkout already confirmed — idempotent skip");
    return;
  }

  await db
    .update(paymentsTable)
    .set({ status: "confirmed", confirmedAt: new Date() })
    .where(eq(paymentsTable.coinbaseChargeId, checkoutId));

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
        upgradePromptCount: 0,
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

  const [sub] = await db
    .select()
    .from(subscriptionsTable)
    .where(eq(subscriptionsTable.userId, payment.userId))
    .limit(1);

  if (sub) {
    await db
      .update(paymentsTable)
      .set({ subscriptionId: sub.id })
      .where(eq(paymentsTable.coinbaseChargeId, checkoutId));
  }

  logger.info({ userId, plan, billingPeriod, periodEnd }, "Subscription activated");
}

async function fulfillIfCompleted(checkout: BusinessCheckout): Promise<boolean> {
  if (checkout.status !== "COMPLETED") return false;
  await handleCheckoutCompleted(checkout.id, checkout.metadata ?? {});
  return true;
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

  let checkout: BusinessCheckout;
  try {
    checkout = await createCheckout({
      description: `BasisGuard ${planLabel} — ${periodLabel} (USDC via Coinbase Business)`,
      amountUsdc,
      metadata: {
        user_id: user.id,
        user_email: user.email,
        plan,
        billing_period,
      },
    });
  } catch (err) {
    logger.error({ err }, "Failed to create Coinbase Business checkout");
    res.status(502).json({ error: "Failed to create checkout session" });
    return;
  }

  await db.insert(paymentsTable).values({
    userId: user.id,
    coinbaseChargeId: checkout.id,
    coinbaseChargeCode: checkout.url,
    plan,
    billingPeriod: billing_period,
    amountUsdc,
    status: "pending",
  });

  res.json({
    hosted_url: checkout.url,
    checkout_id: checkout.id,
    charge_id: checkout.id,
    expires_at: checkout.expiresAt ?? null,
  });
});

/**
 * POST /billing/confirm
 * After Coinbase redirects back, poll Get Checkout. Activate only if COMPLETED.
 */
router.post("/billing/confirm", async (req, res) => {
  const user = req.user!;
  const { checkout_id } = req.body as { checkout_id?: string };

  if (!checkout_id) {
    res.status(400).json({ error: "checkout_id is required" });
    return;
  }

  const [payment] = await db
    .select()
    .from(paymentsTable)
    .where(eq(paymentsTable.coinbaseChargeId, checkout_id))
    .limit(1);

  if (!payment || payment.userId !== user.id) {
    res.status(404).json({ error: "Checkout not found" });
    return;
  }

  if (payment.status === "confirmed") {
    res.json({ confirmed: true, status: "COMPLETED" });
    return;
  }

  let checkout: BusinessCheckout;
  try {
    checkout = await getCheckout(checkout_id);
  } catch (err) {
    logger.error({ err, checkout_id }, "Failed to fetch Coinbase Business checkout");
    res.status(502).json({ error: "Failed to confirm checkout" });
    return;
  }

  const confirmed = await fulfillIfCompleted(checkout);
  if (checkout.status === "FAILED") await markPaymentStatus(checkout_id, "failed");
  if (checkout.status === "EXPIRED") await markPaymentStatus(checkout_id, "expired");

  res.json({ confirmed, status: checkout.status });
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
