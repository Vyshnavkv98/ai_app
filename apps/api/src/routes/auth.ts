import { Router, Request, Response } from "express";
import { authController } from "../controllers/auth.controller";

const router = Router();

// Public — signature-verified by controller
router.post("/webhook", (req: Request, res: Response) => authController.handleWebhook(req, res));

// Protected — requireAuth applied globally in index.ts
router.get("/me", (req: Request, res: Response) => authController.getMe(req, res));

export default router;
