import { Router } from "express";
import { adminController } from "../controllers/admin.controller";
import { requireRole, injectWorkspace } from "../middleware/roles";

const router = Router();

// All admin routes require workspace context + ADMIN role minimum
router.use(injectWorkspace);
router.use(requireRole("ADMIN"));

router.get("/users", (req, res) => adminController.listUsers(req, res));
router.patch("/users/:userId/role", requireRole("OWNER"), (req, res) => adminController.updateRole(req, res));
router.delete("/users/:userId", requireRole("OWNER"), (req, res) => adminController.removeUser(req, res));
router.get("/audit-logs", (req, res) => adminController.auditLogs(req, res));

export default router;
