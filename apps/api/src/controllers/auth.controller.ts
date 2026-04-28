import { Request, Response } from "express";
import { Webhook } from "svix";
import { authService, ClerkUserPayload } from "../services/auth.service";
import { AppError } from "../middleware/error";

export class AuthController {
  /**
   * POST /api/auth/webhook
   * Public — verifies Clerk/Svix signature before processing.
   */
  async handleWebhook(req: Request, res: Response): Promise<void> {
    const webhookSecret = process.env.CLERK_WEBHOOK_SECRET;
    if (!webhookSecret) {
      throw new AppError(500, "Webhook secret not configured", "CONFIG_ERROR");
    }

    const svixId = req.headers["svix-id"] as string;
    const svixTimestamp = req.headers["svix-timestamp"] as string;
    const svixSignature = req.headers["svix-signature"] as string;

    if (!svixId || !svixTimestamp || !svixSignature) {
      throw new AppError(400, "Missing Svix headers", "INVALID_WEBHOOK");
    }

    const wh = new Webhook(webhookSecret);
    let event: { type: string; data: ClerkUserPayload };

    try {
      event = wh.verify(JSON.stringify(req.body), {
        "svix-id": svixId,
        "svix-timestamp": svixTimestamp,
        "svix-signature": svixSignature,
      }) as { type: string; data: ClerkUserPayload };
    } catch {
      throw new AppError(400, "Invalid webhook signature", "INVALID_SIGNATURE");
    }

    const { type, data } = event;

    if (type === "user.created" || type === "user.updated") {
      await authService.syncUserFromClerk(type, data);
    }

    if (type === "user.deleted") {
      await authService.deleteUserByClerkId(data.id);
    }

    res.json({ received: true });
  }

  /**
   * GET /api/auth/me
   * Protected — requireAuth middleware runs before this.
   */
  async getMe(_req: Request, res: Response): Promise<void> {
    const result = await authService.getMe(res.locals.user.id);
    res.json(result);
  }
}

export const authController = new AuthController();
