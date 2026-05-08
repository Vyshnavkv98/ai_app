import { Request, Response } from "express";
import { integrationService } from "../services/integration.service";

export class IntegrationController {
  async list(_req: Request, res: Response): Promise<void> {
    const integrations = await integrationService.list(res.locals.workspaceId);
    res.json(integrations);
  }

  async connectSlack(req: Request, res: Response): Promise<void> {
    const authUrl = await integrationService.initiateSlackOAuth(
      res.locals.workspaceId,
      res.locals.user.id
    );
    res.json({ authUrl });
  }

  async slackCallback(req: Request, res: Response): Promise<void> {
    const { code, state } = req.query as { code: string; state: string };
    if (!code || !state) {
      res.status(400).json({ error: "Missing code or state" });
      return;
    }
    const result = await integrationService.handleSlackCallback(code, state);
    // Redirect to frontend integrations page
    res.redirect(`${process.env.WEB_URL}/integrations?connected=slack`);
  }

  async connectGmail(req: Request, res: Response): Promise<void> {
    const authUrl = await integrationService.initiateGmailOAuth(
      res.locals.workspaceId,
      res.locals.user.id
    );
    res.json({ authUrl });
  }

  async gmailCallback(req: Request, res: Response): Promise<void> {
    const { code, state } = req.query as { code: string; state: string };
    if (!code || !state) {
      res.status(400).json({ error: "Missing code or state" });
      return;
    }
    await integrationService.handleGmailCallback(code, state);
    res.redirect(`${process.env.WEB_URL}/integrations?connected=gmail`);
  }

  async connectMcp(_req: Request, res: Response): Promise<void> {
    // Implemented in Task 22
    res.status(501).json({ error: "MCP integration coming in Task 22" });
  }

  async remove(req: Request, res: Response): Promise<void> {
    await integrationService.disconnect(
      req.params.integrationId,
      res.locals.user.id,
      res.locals.workspaceId,
      req.ip
    );
    res.status(204).send();
  }
}

export const integrationController = new IntegrationController();
