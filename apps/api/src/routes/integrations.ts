import { Router } from "express";
import { integrationController } from "../controllers/integration.controller";
import { injectWorkspace, requireRole } from "../middleware/roles";
import { requireAuth } from "../middleware/auth";

const router = Router();

// OAuth callbacks are public (no JWT — browser redirect from OAuth provider)
// but state token is verified inside the handler
router.get("/slack/callback", (req, res) => integrationController.slackCallback(req, res));
router.get("/gmail/callback", (req, res) => integrationController.gmailCallback(req, res));

// All other routes require auth + workspace
router.use(requireAuth);
router.use(injectWorkspace);

router.get("/", (req, res) => integrationController.list(req, res));
router.post("/slack/connect", requireRole("ADMIN"), (req, res) => integrationController.connectSlack(req, res));
router.post("/gmail/connect", requireRole("ADMIN"), (req, res) => integrationController.connectGmail(req, res));
router.post("/mcp", requireRole("ADMIN"), (req, res) => integrationController.connectMcp(req, res));
router.delete("/:integrationId", requireRole("ADMIN"), (req, res) => integrationController.remove(req, res));

export default router;
