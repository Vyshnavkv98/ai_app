import { Router } from "express";
import { workflowController } from "../controllers/workflow.controller";
import { injectWorkspace } from "../middleware/roles";

const router = Router();

router.use(injectWorkspace);

router.get("/", (req, res) => workflowController.list(req, res));
router.post("/", (req, res) => workflowController.create(req, res));
router.get("/:workflowId", (req, res) => workflowController.getById(req, res));
router.patch("/:workflowId", (req, res) => workflowController.update(req, res));
router.post("/:workflowId/trigger", (req, res) => workflowController.trigger(req, res));
router.get("/:workflowId/executions", (req, res) => workflowController.listExecutions(req, res));

export default router;
