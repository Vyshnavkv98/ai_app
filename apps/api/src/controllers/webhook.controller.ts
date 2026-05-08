import { Request, Response } from "express";
import { integrationService } from "../services/integration.service";
import { slackService } from "../services/slack.service";
import { gmailService } from "../services/gmail.service";
import { indexingQueue } from "../lib/queue";
import { prisma } from "../lib/prisma";
import { logger } from "../lib/logger";
import { AppError } from "../middleware/error";

export class WebhookController {
  /**
   * POST /webhooks/slack
   * Verifies Slack HMAC signature, acks immediately, processes async.
   */
  async handleSlack(req: Request, res: Response): Promise<void> {
    const timestamp = req.headers["x-slack-request-timestamp"] as string;
    const signature = req.headers["x-slack-signature"] as string;
    const rawBody = JSON.stringify(req.body);

    // Replay attack prevention — reject if timestamp > 5 min old
    if (Math.abs(Date.now() / 1000 - parseInt(timestamp)) > 300) {
      throw new AppError(400, "Request timestamp too old", "REPLAY_ATTACK");
    }

    if (!integrationService.verifySlackSignature(rawBody, timestamp, signature)) {
      throw new AppError(401, "Invalid Slack signature", "INVALID_SIGNATURE");
    }

    const body = req.body;

    // Slack URL verification challenge
    if (body.type === "url_verification") {
      res.json({ challenge: body.challenge });
      return;
    }

    // Acknowledge immediately — Slack requires < 3s response
    res.status(200).send();

    // Process event asynchronously
    if (body.type === "event_callback") {
      const event = body.event;
      const teamId = body.team_id;

      // Find workspace by Slack team ID
      const integration = await prisma.integration.findFirst({
        where: { type: "SLACK", config: { path: ["teamId"], equals: teamId } },
      });

      if (integration) {
        setImmediate(async () => {
          try {
            await slackService.processEvent(integration.workspaceId, event);
          } catch (err) {
            logger.error("Slack event processing failed", { error: (err as Error).message });
          }
        });
      }
    }
  }

  /**
   * POST /webhooks/gmail
   * Verifies Google Pub/Sub token, processes email notification async.
   */
  async handleGmail(req: Request, res: Response): Promise<void> {
    // Verify Google Pub/Sub push token
    const token = req.query.token as string;
    const expectedToken = process.env.GMAIL_PUBSUB_TOKEN;
    if (expectedToken && token !== expectedToken) {
      throw new AppError(401, "Invalid Pub/Sub token", "INVALID_TOKEN");
    }

    // Acknowledge immediately
    res.status(200).send();

    // Decode Pub/Sub message
    const message = req.body?.message;
    if (!message?.data) return;

    try {
      const decoded = JSON.parse(Buffer.from(message.data, "base64").toString("utf-8"));
      const emailAddress = decoded.emailAddress;
      const historyId = decoded.historyId;

      logger.info("Gmail push notification received", { emailAddress, historyId });

      // Find workspace by Gmail email
      const integration = await prisma.integration.findFirst({
        where: { type: "GMAIL", config: { path: ["email"], equals: emailAddress } },
      });

      if (integration) {
        setImmediate(async () => {
          try {
            // In a full implementation, fetch history to get new message IDs
            // For now, log the notification
            logger.info("Gmail notification queued for processing", {
              workspaceId: integration.workspaceId,
              historyId,
            });
          } catch (err) {
            logger.error("Gmail event processing failed", { error: (err as Error).message });
          }
        });
      }
    } catch (err) {
      logger.error("Gmail webhook decode failed", { error: (err as Error).message });
    }
  }
}

export const webhookController = new WebhookController();
