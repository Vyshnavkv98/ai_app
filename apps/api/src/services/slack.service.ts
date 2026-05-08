/**
 * Slack event processing service.
 * Handles incoming Slack events and runs the summarizer workflow.
 */
import { prisma } from "../lib/prisma";
import { integrationService } from "./integration.service";
import { aiServiceClient } from "../lib/ai-service";
import { logger } from "../lib/logger";

export class SlackService {
  /**
   * Fetch recent messages from a Slack channel and post an AI summary.
   */
  async summarizeChannel(
    workspaceId: string,
    channelId: string,
    agentId: string,
    targetChannelId?: string
  ): Promise<void> {
    const token = await integrationService.getSlackToken(workspaceId);

    // Fetch last 50 messages from channel
    const historyRes = await fetch(
      `https://slack.com/api/conversations.history?channel=${channelId}&limit=50`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    const history = await historyRes.json() as any;
    if (!history.ok) {
      logger.error("Slack history fetch failed", { error: history.error });
      return;
    }

    const messages = (history.messages as any[])
      .filter((m) => m.type === "message" && !m.subtype)
      .map((m) => m.text)
      .reverse()
      .join("\n");

    if (!messages.trim()) return;

    // Invoke AI agent to summarize
    const agent = await prisma.agent.findFirst({ where: { id: agentId, workspaceId } });
    if (!agent) return;

    const result = await aiServiceClient.invokeAgent({
      message: `Please summarize the following Slack channel messages:\n\n${messages}`,
      session_id: `slack-summary-${channelId}-${Date.now()}`,
      workspace_id: workspaceId,
      agent_config: {
        id: agent.id,
        name: agent.name,
        system_prompt: agent.systemPrompt,
        model: agent.model,
        max_tokens: 1024,
        temperature: 0.3,
        memory_enabled: false,
        rag_enabled: false,
      },
    });

    const summary = (result as any).response;

    // Post summary back to Slack
    const postChannel = targetChannelId ?? channelId;
    await fetch("https://slack.com/api/chat.postMessage", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        channel: postChannel,
        text: `*AI Summary*\n${summary}`,
      }),
    });

    logger.info("Slack summary posted", { workspaceId, channelId: postChannel });
  }

  /**
   * Process a Slack event payload.
   */
  async processEvent(workspaceId: string, event: any): Promise<void> {
    logger.info("Processing Slack event", { type: event.type, workspaceId });
    // Additional event handling (reactions, mentions, etc.) added in future tasks
  }
}

export const slackService = new SlackService();
