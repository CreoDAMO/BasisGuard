import { Router, type IRouter } from "express";
import { requireAuth } from "../middlewares/auth.js";
import { attachSubscription } from "../middlewares/planGate.js";
import healthRouter from "./health";
import meRouter from "./me";
import dashboardRouter from "./dashboard";
import positionsRouter from "./positions";
import citationsRouter from "./citations";
import profilesRouter from "./profiles";
import exportRouter from "./export";
import chainsRouter from "./chains";
import submissionsRouter from "./submissions";
import intelligenceRouter from "./intelligence";
import transactionsRouter from "./transactions";
import lotsRouter from "./lots";
import coinbaseRouter from "./coinbase";
import notificationsRouter from "./notifications";
import exchangesRouter from "./exchanges";
import metricsRouter from "./metrics";
import taxOptimizerRouter from "./tax-optimizer";
import billingRouter, { webhookHandler } from "./billing.js";
import deskRouter from "./desk.js";

const router: IRouter = Router();

// Health check is public — monitoring tools must not need auth
router.use(healthRouter);

// Coinbase Business checkouts must be reachable without a Clerk session.
// The handler authenticates with the X-Hook0-Signature webhook HMAC instead.
router.post("/billing/webhook", webhookHandler);

// Operator desk: phone wire for webhook secret. Gated by DESK_KEY when set.
router.use(deskRouter);

// All subsequent routes require a valid Clerk session.
// requireAuth also JIT-provisions a local user row on first visit.
router.use(requireAuth);
router.use(attachSubscription);

router.use(meRouter);
router.use(dashboardRouter);
router.use(intelligenceRouter);
router.use(positionsRouter);
router.use(citationsRouter);
router.use(profilesRouter);
router.use(exportRouter);
router.use(chainsRouter);
router.use(submissionsRouter);
router.use(transactionsRouter);
router.use(lotsRouter);
router.use(coinbaseRouter);
router.use(notificationsRouter);
router.use(exchangesRouter);
router.use(metricsRouter);
router.use(taxOptimizerRouter);
router.use(billingRouter);

export default router;
