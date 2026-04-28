import { Request, Response } from "express";

// Implemented in Task 18
export class AnalyticsController {
  async usage(_req: Request, res: Response): Promise<void> {
    res.status(501).json({ error: "Not implemented" });
  }
  async agents(_req: Request, res: Response): Promise<void> {
    res.status(501).json({ error: "Not implemented" });
  }
}

export const analyticsController = new AnalyticsController();
