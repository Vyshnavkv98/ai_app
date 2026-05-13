import { Request, Response } from "express";
import { adminService, UpdateRoleSchema } from "../services/admin.service";

export class AdminController {
  async listUsers(_req: Request, res: Response): Promise<void> {
    const users = await adminService.listUsers(res.locals.workspaceId);
    res.json(users);
  }

  async updateRole(req: Request, res: Response): Promise<void> {
    const { role } = UpdateRoleSchema.parse(req.body);
    const result = await adminService.updateRole(
      req.params.userId,
      role,
      res.locals.user.id,
      res.locals.workspaceId,
      req.ip
    );
    res.json(result);
  }

  async removeUser(req: Request, res: Response): Promise<void> {
    await adminService.removeUser(
      req.params.userId,
      res.locals.user.id,
      res.locals.workspaceId,
      req.ip
    );
    res.status(204).send();
  }

  async auditLogs(req: Request, res: Response): Promise<void> {
    const { page, limit, action } = req.query as {
      page?: string;
      limit?: string;
      action?: string;
    };
    const result = await adminService.getAuditLogs(res.locals.workspaceId, {
      page: page ? parseInt(page) : undefined,
      limit: limit ? parseInt(limit) : undefined,
      action,
    });
    res.json(result);
  }
}

export const adminController = new AdminController();
