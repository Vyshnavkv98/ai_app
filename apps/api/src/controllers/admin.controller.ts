import { Request, Response } from "express";

// Implemented in Task 19
export class AdminController {
  async listUsers(_req: Request, res: Response): Promise<void> {
    res.status(501).json({ error: "Not implemented" });
  }
  async updateRole(_req: Request, res: Response): Promise<void> {
    res.status(501).json({ error: "Not implemented" });
  }
  async auditLogs(_req: Request, res: Response): Promise<void> {
    res.status(501).json({ error: "Not implemented" });
  }
}

export const adminController = new AdminController();
