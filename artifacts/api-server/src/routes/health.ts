import { Router, type IRouter } from "express";
import { HealthCheckResponse } from "@workspace/api-zod";

const router: IRouter = Router();

function health(_req: unknown, res: { json: (body: unknown) => void }) {
  const data = HealthCheckResponse.parse({ status: "ok" });
  res.json(data);
}

// Public JSON. `/health` is the name the live host must actually serve;
// `/healthz` is kept for Render's existing healthCheckPath.
router.get("/health", health);
router.get("/healthz", health);

export default router;
