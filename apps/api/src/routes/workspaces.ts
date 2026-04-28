import { Router } from "express";
import { workspaceController } from "../controllers/workspace.controller";
import { requireRole, injectWorkspace } from "../middleware/roles";

const router = Router();

router.get("/", injectWorkspace, (req, res) => workspaceController.list(req, res));
router.post("/", (req, res) => workspaceController.create(req, res));
router.get("/:workspaceId", requireRole("VIEWER"), (req, res) => workspaceController.getById(req, res));
router.patch("/:workspaceId", requireRole("ADMIN"), (req, res) => workspaceController.update(req, res));
router.delete("/:workspaceId", requireRole("OWNER"), (req, res) => workspaceController.remove(req, res));

export default router;
