import { Router } from "express";
import { chatController } from "../controllers/chat.controller";
import { injectWorkspace } from "../middleware/roles";

const router = Router();

router.use(injectWorkspace);

router.post("/sessions", (req, res) => chatController.createSession(req, res));
router.get("/sessions", (req, res) => chatController.listSessions(req, res));
router.post("/sessions/:sessionId/messages", (req, res) => chatController.sendMessage(req, res));
router.get("/sessions/:sessionId/messages", (req, res) => chatController.getMessages(req, res));

export default router;
