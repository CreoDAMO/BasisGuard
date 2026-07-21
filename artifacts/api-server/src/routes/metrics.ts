import { Router, type IRouter } from "express";
import { requireRole, ADMIN_ROLES } from "../middlewares/auth.js";
import { metrics } from "../core/metrics.js";

const router: IRouter = Router();

/**
 * GET /metrics — internal observability endpoint.
 *
 * Admin-only: exposes uptime, request counters, and response-time
 * aggregates accumulated since the last process start.
 *
 * For production Prometheus scraping, replace with prom-client; this
 * simple JSON format is intentionally lightweight for early-stage use.
 */
router.get("/metrics", requireRole(ADMIN_ROLES), (_req, res): void => {
  res.json(metrics.snapshot());
});

export default router;
