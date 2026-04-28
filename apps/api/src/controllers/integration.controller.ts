import { Request, Response } from "express";

// Implemented in Tasks 12, 13, 22
export class IntegrationController {
  async list(_req: Request, res: Response): Promise<void> {
    res.status(501).json({ error: "Not implemented" });
  }
  async connectSlack(_req: Request, res: Response): Promise<void> {
    res.status(501).json({ error: "Not implemented" });
  }
  async connectGmail(_req: Request, res: Response): Promise<void> {
    res.status(501).json({ error: "Not implemented" });
  }
  async connectMcp(_req: Request, res: Response): Promise<void> {
    res.status(501).json({ error: "Not implemented" });
  }
  async remove(_req: Request, res: Response): Promise<void> {
    res.status(501).json({ error: "Not implemented" });
  }
}

export const integrationController = new IntegrationController();
