import { Router, type IRouter } from "express";
import healthRouter from "./health";
import dashboardRouter from "./dashboard";
import positionsRouter from "./positions";
import citationsRouter from "./citations";
import profilesRouter from "./profiles";
import exportRouter from "./export";

const router: IRouter = Router();

router.use(healthRouter);
router.use(dashboardRouter);
router.use(positionsRouter);
router.use(citationsRouter);
router.use(profilesRouter);
router.use(exportRouter);

export default router;
