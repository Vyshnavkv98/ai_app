import { Request, Response } from "express";
import {
  workspaceService,
  CreateWorkspaceSchema,
  UpdateWorkspaceSchema,
} from "../services/workspace.service";

export class WorkspaceController {
  async create(req: Request, res: Response): Promise<void> {
    const input = CreateWorkspaceSchema.parse(req.body);
    const workspace = await workspaceService.create(
      input,
      res.locals.user.id,
      req.ip
    );
    res.status(201).json({
      id: workspace.id,
      name: workspace.name,
      slug: workspace.slug,
      plan: workspace.plan,
      createdAt: workspace.createdAt,
    });
  }

  async getById(req: Request, res: Response): Promise<void> {
    const workspace = await workspaceService.findById(req.params.workspaceId);
    res.json({
      id: workspace.id,
      name: workspace.name,
      slug: workspace.slug,
      plan: workspace.plan,
      createdAt: workspace.createdAt,
      updatedAt: workspace.updatedAt,
      members: workspace.members.map((m) => ({
        id: m.id,
        role: m.role,
        joinedAt: m.joinedAt,
        user: m.user,
      })),
    });
  }

  async update(req: Request, res: Response): Promise<void> {
    const input = UpdateWorkspaceSchema.parse(req.body);
    const workspace = await workspaceService.update(
      req.params.workspaceId,
      input,
      res.locals.user.id,
      req.ip
    );
    res.json({
      id: workspace.id,
      name: workspace.name,
      slug: workspace.slug,
      plan: workspace.plan,
      updatedAt: workspace.updatedAt,
    });
  }

  async remove(req: Request, res: Response): Promise<void> {
    await workspaceService.delete(
      req.params.workspaceId,
      res.locals.user.id,
      req.ip
    );
    res.status(204).send();
  }

  async list(_req: Request, res: Response): Promise<void> {
    const workspaces = await workspaceService.listForUser(res.locals.user.id);
    res.json(workspaces);
  }
}

export const workspaceController = new WorkspaceController();
