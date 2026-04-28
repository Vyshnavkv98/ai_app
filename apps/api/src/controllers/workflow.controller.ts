import { Request, Response } from "express";

// Implemented in Task 14
export class WorkflowController {
  async list(_req: Request, res: Response): Promise<void> {
    res.status(501).json({ error: "Not implemented" });
  }
  async create(_req: Request, res: Response): Promise<void> {
    res.status(501).json({ error: "Not implemented" });
  }
  async update(_req: Request, res: Response): Promise<void> {
    res.status(501).json({ error: "Not implemented" });
  }
  async trigger(_req: Request, res: Response): Promise<void> {
    res.status(501).json({ error: "Not implemented" });
  }
}

export const workflowController = new WorkflowController();
