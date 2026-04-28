import { Router } from "express";
import { webhookController } from "../controllers/webhook.controller";

const router = Router();

// Public routes — each handler verifies its own signature
router.post("/slack", (req, res) => webhookController.handleSlack(req, res));
router.post("/gmail", (req, res) => webhookController.handleGmail(req, res));

export default router;
