import { Router } from "express";
import { adminController } from "../controllers/admin.controller";
import { requireRole } from "../middleware/roles";

const router = Router();

// All admin routes require ADMIN role minimum
router.use(requireRole("ADMIN"));

router.get("/users", (req, res) => adminController.listUsers(req, res));
router.patch("/users/:userId/role", requireRole("OWNER"), (req, res) => adminController.updateRole(req, res));
router.get("/audit-logs", (req, res) => adminController.auditLogs(req, res));

export default router;
