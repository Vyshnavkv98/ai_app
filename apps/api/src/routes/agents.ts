import { Router } from "express";
import { agentController } from "../controllers/agent.controller";
import { injectWorkspace, requireRole } from "../middleware/roles";

const router = Router();

router.use(injectWorkspace);

router.get("/", (req, res) => agentController.list(req, res));
router.post("/", requireRole("MEMBER"), (req, res) => agentController.create(req, res));
router.get("/:agentId", (req, res) => agentController.getById(req, res));
router.patch("/:agentId", requireRole("MEMBER"), (req, res) => agentController.update(req, res));
router.delete("/:agentId", requireRole("ADMIN"), (req, res) => agentController.remove(req, res));
router.post("/:agentId/invoke", (req, res) => agentController.invoke(req, res));

export default router;
