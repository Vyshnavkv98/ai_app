import { Request, Response } from "express";
import { z } from "zod";
import {
  agentService,
  CreateAgentSchema,
  UpdateAgentSchema,
} from "../services/agent.service";

export class AgentController {
  async list(_req: Request, res: Response): Promise<void> {
    const agents = await agentService.list(res.locals.workspaceId);
    res.json(agents);
  }

  async getById(req: Request, res: Response): Promise<void> {
    const agent = await agentService.findById(
      req.params.agentId,
      res.locals.workspaceId
    );
    res.json(agent);
  }

  async create(req: Request, res: Response): Promise<void> {
    const input = CreateAgentSchema.parse(req.body);
    const agent = await agentService.create(
      input,
      res.locals.user.id,
      res.locals.workspaceId,
      req.ip
    );
    res.status(201).json(agent);
  }

  async update(req: Request, res: Response): Promise<void> {
    const input = UpdateAgentSchema.parse(req.body);
    const agent = await agentService.update(
      req.params.agentId,
      input,
      res.locals.user.id,
      res.locals.workspaceId,
      req.ip
    );
    res.json(agent);
  }

  async remove(req: Request, res: Response): Promise<void> {
    await agentService.delete(
      req.params.agentId,
      res.locals.user.id,
      res.locals.workspaceId,
      req.ip
    );
    res.status(204).send();
  }

  async invoke(req: Request, res: Response): Promise<void> {
    const { message, sessionId } = z
      .object({
        message: z.string().min(1).max(10_000),
        sessionId: z.string().optional(),
      })
      .parse(req.body);

    const result = await agentService.invoke(
      req.params.agentId,
      message,
      res.locals.workspaceId,
      sessionId
    );
    res.json(result);
  }
}

export const agentController = new AgentController();
