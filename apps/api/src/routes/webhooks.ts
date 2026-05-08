import { Router, Request, Response } from "express";
import { webhookController } from "../controllers/webhook.controller";
import { prisma } from "../lib/prisma";
import { workflowService } from "../services/workflow.service";
import { AppError } from "../middleware/error";

const router = Router();

// External webhooks — each handler verifies its own signature
router.post("/slack", (req: Request, res: Response) => webhookController.handleSlack(req, res));
router.post("/gmail", (req: Request, res: Response) => webhookController.handleGmail(req, res));

// Inbound workflow webhook trigger
router.post("/workflow/:workflowId", async (req: Request, res: Response) => {
  const { workflowId } = req.params;

  const workflow = await prisma.workflow.findUnique({
    where: { id: workflowId },
    select: { id: true, isActive: true, trigger: true, webhookSecret: true, workspaceId: true },
  });

  if (!workflow || workflow.trigger !== "WEBHOOK") {
    throw new AppError(404, "Workflow webhook not found", "NOT_FOUND");
  }

  if (!workflow.isActive) {
    throw new AppError(400, "Workflow is not active", "WORKFLOW_INACTIVE");
  }

  // Verify HMAC signature if secret is set
  if (workflow.webhookSecret) {
    const { createHmac } = await import("crypto");
    const signature = req.headers["x-nexus-signature"] as string;
    const expected = createHmac("sha256", workflow.webhookSecret)
      .update(JSON.stringify(req.body))
      .digest("hex");
    if (signature !== expected) {
      throw new AppError(401, "Invalid webhook signature", "INVALID_SIGNATURE");
    }
  }

  const execution = await workflowService.trigger(
    workflowId,
    req.body,
    "webhook",
    workflow.workspaceId
  );

  res.status(202).json({ executionId: execution.id });
});

export default router;
