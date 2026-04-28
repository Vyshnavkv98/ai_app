import { Router } from "express";
import { analyticsController } from "../controllers/analytics.controller";
import { injectWorkspace } from "../middleware/roles";

const router = Router();

router.use(injectWorkspace);

router.get("/usage", (req, res) => analyticsController.usage(req, res));
router.get("/agents", (req, res) => analyticsController.agents(req, res));

export default router;
