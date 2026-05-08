/**
 * Gmail event processing service.
 * Handles incoming Gmail push notifications and generates AI draft replies.
 */
import { prisma } from "../lib/prisma";
import { integrationService } from "./integration.service";
import { aiServiceClient } from "../lib/ai-service";
import { logger } from "../lib/logger";

export class GmailService {
  /**
   * Fetch a Gmail message by ID.
   */
  async fetchEmail(accessToken: string, messageId: string): Promise<{ subject: string; from: string; body: string }> {
    const res = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}?format=full`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    const data = await res.json() as any;

    const headers = data.payload?.headers ?? [];
    const subject = headers.find((h: any) => h.name === "Subject")?.value ?? "(no subject)";
    const from = headers.find((h: any) => h.name === "From")?.value ?? "";

    // Extract plain text body
    let body = "";
    const parts = data.payload?.parts ?? [data.payload];
    for (const part of parts) {
      if (part?.mimeType === "text/plain" && part?.body?.data) {
        body = Buffer.from(part.body.data, "base64").toString("utf-8");
        break;
      }
    }

    return { subject, from, body };
  }

  /**
   * Generate a draft reply using AI and optionally send it.
   */
  async processIncomingEmail(
    workspaceId: string,
    messageId: string,
    agentId?: string
  ): Promise<void> {
    const { access_token } = await integrationService.getGmailTokens(workspaceId);
    const email = await this.fetchEmail(access_token, messageId);

    logger.info("Processing Gmail message", { workspaceId, subject: email.subject });

    // Find an agent to handle email replies
    const agent = agentId
      ? await prisma.agent.findFirst({ where: { id: agentId, workspaceId } })
      : await prisma.agent.findFirst({ where: { workspaceId, isDraft: false } });

    if (!agent) {
      logger.warn("No agent found for Gmail auto-reply", { workspaceId });
      return;
    }

    const prompt = `You received an email. Generate a professional reply.

From: ${email.from}
Subject: ${email.subject}

Email body:
${email.body}

Respond with a JSON object: {"reply": "...", "confidence": 0.0-1.0}
confidence should reflect how certain you are this reply is appropriate.`;

    const result = await aiServiceClient.invokeAgent({
      message: prompt,
      session_id: `gmail-${messageId}`,
      workspace_id: workspaceId,
      agent_config: {
        id: agent.id,
        name: agent.name,
        system_prompt: agent.systemPrompt,
        model: agent.model,
        max_tokens: 1024,
        temperature: 0.3,
        memory_enabled: false,
        rag_enabled: agent.ragEnabled,
      },
    });

    let reply = "";
    let confidence = 0;

    try {
      const parsed = JSON.parse((result as any).response);
      reply = parsed.reply ?? "";
      confidence = parsed.confidence ?? 0;
    } catch {
      reply = (result as any).response;
      confidence = 0.5;
    }

    logger.info("Gmail draft generated", { workspaceId, confidence, subject: email.subject });

    // Auto-send if confidence >= 0.85, otherwise save as draft for review
    if (confidence >= 0.85) {
      await this.sendReply(access_token, messageId, email.from, email.subject, reply);
      logger.info("Gmail auto-reply sent", { workspaceId, subject: email.subject });
    } else {
      // Save draft to DB for human review (notification system in Task 19)
      await prisma.message.create({
        data: {
          sessionId: `gmail-draft-${messageId}`,
          role: "assistant",
          content: reply,
          toolResults: { type: "gmail_draft", messageId, subject: email.subject, confidence, requiresApproval: true },
        },
      }).catch(() => {}); // non-fatal
      logger.info("Gmail draft saved for review", { workspaceId, confidence });
    }
  }

  private async sendReply(
    accessToken: string,
    originalMessageId: string,
    to: string,
    subject: string,
    body: string
  ): Promise<void> {
    const email = [
      `To: ${to}`,
      `Subject: Re: ${subject}`,
      "Content-Type: text/plain; charset=utf-8",
      "",
      body,
    ].join("\n");

    const encoded = Buffer.from(email).toString("base64url");

    await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ raw: encoded, threadId: originalMessageId }),
    });
  }
}

export const gmailService = new GmailService();
