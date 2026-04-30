import { Request, Response } from "express";
import {
  chatService,
  CreateSessionSchema,
  SendMessageSchema,
} from "../services/chat.service";

export class ChatController {
  async createSession(req: Request, res: Response): Promise<void> {
    const input = CreateSessionSchema.parse(req.body);
    const session = await chatService.createSession(
      input,
      res.locals.user.id,
      res.locals.workspaceId
    );
    res.status(201).json(session);
  }

  async listSessions(_req: Request, res: Response): Promise<void> {
    const sessions = await chatService.listSessions(
      res.locals.user.id,
      res.locals.workspaceId
    );
    res.json(sessions);
  }

  async getMessages(req: Request, res: Response): Promise<void> {
    const messages = await chatService.getMessages(
      req.params.sessionId,
      res.locals.workspaceId
    );
    res.json(messages);
  }

  async sendMessage(req: Request, res: Response): Promise<void> {
    const input = SendMessageSchema.parse(req.body);
    // sendMessage manages the response directly (SSE streaming)
    await chatService.sendMessage(
      req.params.sessionId,
      input,
      res.locals.user.id,
      res.locals.workspaceId,
      res
    );
  }
}

export const chatController = new ChatController();
