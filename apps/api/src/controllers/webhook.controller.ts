import { Request, Response } from "express";

// Implemented in Tasks 12, 13
export class WebhookController {
  async handleSlack(_req: Request, res: Response): Promise<void> {
    res.status(501).json({ error: "Not implemented" });
  }
  async handleGmail(_req: Request, res: Response): Promise<void> {
    res.status(501).json({ error: "Not implemented" });
  }
}

export const webhookController = new WebhookController();
