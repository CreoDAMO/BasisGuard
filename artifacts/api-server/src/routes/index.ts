import { Router, type IRouter } from "express";
import { requireAuth } from "../middlewares/auth.js";
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

const router: IRouter = Router();

// Health check is public — monitoring tools must not need auth
router.use(healthRouter);

// All subsequent routes require a valid Clerk session.
// requireAuth also JIT-provisions a local user row on first visit.
router.use(requireAuth);

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

export default router;
