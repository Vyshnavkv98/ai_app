import { Request, Response } from "express";
import {
  workflowService,
  CreateWorkflowSchema,
  UpdateWorkflowSchema,
} from "../services/workflow.service";

export class WorkflowController {
  async list(_req: Request, res: Response): Promise<void> {
    const workflows = await workflowService.list(res.locals.workspaceId);
    res.json(workflows);
  }

  async getById(req: Request, res: Response): Promise<void> {
    const workflow = await workflowService.findById(
      req.params.workflowId,
      res.locals.workspaceId
    );
    res.json(workflow);
  }

  async create(req: Request, res: Response): Promise<void> {
    const input = CreateWorkflowSchema.parse(req.body);
    const workflow = await workflowService.create(
      input,
      res.locals.user.id,
      res.locals.workspaceId,
      req.ip
    );
    res.status(201).json(workflow);
  }

  async update(req: Request, res: Response): Promise<void> {
    const input = UpdateWorkflowSchema.parse(req.body);
    const workflow = await workflowService.update(
      req.params.workflowId,
      input,
      res.locals.user.id,
      res.locals.workspaceId,
      req.ip
    );
    res.json(workflow);
  }

  async trigger(req: Request, res: Response): Promise<void> {
    const execution = await workflowService.trigger(
      req.params.workflowId,
      req.body,
      "manual",
      res.locals.workspaceId
    );
    res.status(202).json(execution);
  }

  async listExecutions(req: Request, res: Response): Promise<void> {
    const executions = await workflowService.listExecutions(
      req.params.workflowId,
      res.locals.workspaceId
    );
    res.json(executions);
  }
}

export const workflowController = new WorkflowController();
