import { Request, Response } from "express";
import { analyticsService } from "../services/analytics.service";

export class AnalyticsController {
  async usage(req: Request, res: Response): Promise<void> {
    const { from, to, groupBy } = req.query as {
      from?: string;
      to?: string;
      groupBy?: "user" | "agent" | "model";
    };
    const data = await analyticsService.getUsage(res.locals.workspaceId, { from, to, groupBy });
    res.json(data);
  }

  async agents(_req: Request, res: Response): Promise<void> {
    const data = await analyticsService.getAgentAnalytics(res.locals.workspaceId);
    res.json(data);
  }
}

export const analyticsController = new AnalyticsController();
