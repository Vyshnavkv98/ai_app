import { Router } from "express";
import { integrationController } from "../controllers/integration.controller";
import { injectWorkspace, requireRole } from "../middleware/roles";

const router = Router();

router.use(injectWorkspace);

router.get("/", (req, res) => integrationController.list(req, res));
router.post("/slack/connect", requireRole("ADMIN"), (req, res) => integrationController.connectSlack(req, res));
router.post("/gmail/connect", requireRole("ADMIN"), (req, res) => integrationController.connectGmail(req, res));
router.post("/mcp", requireRole("ADMIN"), (req, res) => integrationController.connectMcp(req, res));
router.delete("/:integrationId", requireRole("ADMIN"), (req, res) => integrationController.remove(req, res));

export default router;
