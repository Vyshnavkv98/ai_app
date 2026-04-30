import { z } from "zod";
import { Response } from "express";
import { prisma } from "../lib/prisma";
import { streamChat } from "../lib/ai-service";
import { redis } from "../lib/redis";
import { logger } from "../lib/logger";
import { NotFoundError, AppError } from "../middleware/error";

// ── Validation schemas ──────────────────────────────────────────────────────

export const CreateSessionSchema = z.object({
  agentId: z.string().optional(),
  title: z.string().max(200).optional(),
});

export const SendMessageSchema = z.object({
  content: z.string().min(1).max(100_000),
  agentId: z.string().optional(),
});

export type CreateSessionInput = z.infer<typeof CreateSessionSchema>;
export type SendMessageInput = z.infer<typeof SendMessageSchema>;

// ── Service ─────────────────────────────────────────────────────────────────

export class ChatService {
  async createSession(
    input: CreateSessionInput,
    userId: string,
    workspaceId: string
  ) {
    // Validate agentId belongs to workspace
    if (input.agentId) {
      const agent = await prisma.agent.findFirst({
        where: { id: input.agentId, workspaceId },
      });
      if (!agent) throw new NotFoundError("Agent not found");
    }

    return prisma.chatSession.create({
      data: {
        title: input.title ?? null,
        agentId: input.agentId ?? null,
        userId,
        workspaceId,
      },
      select: {
        id: true,
        title: true,
        agentId: true,
        createdAt: true,
        updatedAt: true,
        agent: { select: { id: true, name: true, model: true } },
      },
    });
  }

  async listSessions(userId: string, workspaceId: string) {
    return prisma.chatSession.findMany({
      where: { workspaceId, userId },
      orderBy: { updatedAt: "desc" },
      take: 50,
      select: {
        id: true,
        title: true,
        agentId: true,
        createdAt: true,
        updatedAt: true,
        agent: { select: { id: true, name: true } },
        _count: { select: { messages: true } },
      },
    });
  }

  async getMessages(sessionId: string, workspaceId: string) {
    // Verify session belongs to workspace
    const session = await prisma.chatSession.findFirst({
      where: { id: sessionId, workspaceId },
    });
    if (!session) throw new NotFoundError("Session not found");

    return prisma.message.findMany({
      where: { sessionId },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        role: true,
        content: true,
        toolCalls: true,
        tokenCount: true,
        cost: true,
        createdAt: true,
      },
    });
  }

  /**
   * sendMessage — persists the user message, streams the AI response via SSE,
   * then persists the assistant message + usage log.
   */
  async sendMessage(
    sessionId: string,
    input: SendMessageInput,
    userId: string,
    workspaceId: string,
    res: Response
  ): Promise<void> {
    // Verify session
    const session = await prisma.chatSession.findFirst({
      where: { id: sessionId, workspaceId },
      include: {
        agent: true,
      },
    });
    if (!session) throw new NotFoundError("Session not found");

    // Resolve agent config (session agent or override from body)
    const agentId = input.agentId ?? session.agentId;
    let agentConfig = null;
    if (agentId) {
      const agent = await prisma.agent.findFirst({
        where: { id: agentId, workspaceId },
      });
      if (agent) {
        agentConfig = {
          id: agent.id,
          name: agent.name,
          system_prompt: agent.systemPrompt,
          model: agent.model,
          max_tokens: agent.maxTokens,
          temperature: agent.temperature,
          memory_enabled: agent.memoryEnabled,
          rag_enabled: agent.ragEnabled,
        };
      }
    }

    // Persist user message
    const userMessage = await prisma.message.create({
      data: {
        sessionId,
        role: "user",
        content: input.content,
      },
    });

    // Load short-term memory from Redis
    const memoryKey = `memory:session:${sessionId}`;
    let memory: Array<{ role: string; content: string }> = [];
    try {
      const raw = await redis.get(memoryKey);
      if (raw) memory = JSON.parse(raw);
    } catch {
      // memory load failure is non-fatal
    }

    // Set SSE headers
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    res.flushHeaders();

    // Stream from AI service
    let fullResponse = "";
    let usageData: {
      prompt_tokens: number;
      completion_tokens: number;
      total_tokens: number;
      cost_usd: number;
      model: string;
    } | null = null;

    try {
      const aiRes = await streamChat({
        message: input.content,
        sessionId,
        agentConfig,
        workspaceId,
        memory,
      });

      if (!aiRes.body) throw new AppError(502, "No response body from AI service", "AI_ERROR");

      const reader = aiRes.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        // Forward raw SSE chunk to client
        res.write(chunk);

        // Parse events to collect full response + usage
        const lines = chunk.split("\n");
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const data = line.slice(6).trim();
          if (!data || data === "[DONE]") continue;
          try {
            const parsed = JSON.parse(data);
            if (parsed.token) fullResponse += parsed.token;
            if (parsed.done && parsed.usage) usageData = parsed.usage;
          } catch {
            // ignore parse errors on individual chunks
          }
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "AI service error";
      res.write(`data: ${JSON.stringify({ error: msg })}\n\n`);
      logger.error("Chat stream error", { error: msg, sessionId });
    }

    // Persist assistant message + usage log
    if (fullResponse) {
      await prisma.message.create({
        data: {
          sessionId,
          role: "assistant",
          content: fullResponse,
          tokenCount: usageData?.total_tokens ?? null,
          cost: usageData?.cost_usd ?? null,
        },
      });

      if (usageData) {
        await prisma.usageLog.create({
          data: {
            model: usageData.model,
            promptTokens: usageData.prompt_tokens,
            completionTokens: usageData.completion_tokens,
            totalTokens: usageData.total_tokens,
            costUsd: usageData.cost_usd,
            workspaceId,
            agentId: agentId ?? null,
            userId,
          },
        });
      }

      // Update session title from first message if not set
      if (!session.title) {
        const title = input.content.slice(0, 60) + (input.content.length > 60 ? "…" : "");
        await prisma.chatSession.update({
          where: { id: sessionId },
          data: { title, updatedAt: new Date() },
        });
      } else {
        await prisma.chatSession.update({
          where: { id: sessionId },
          data: { updatedAt: new Date() },
        });
      }

      // Update Redis memory
      const newMemory = [
        ...memory,
        { role: "user", content: input.content },
        { role: "assistant", content: fullResponse },
      ].slice(-20);
      await redis.setex(memoryKey, 7200, JSON.stringify(newMemory));
    }

    // Close SSE stream
    res.write("data: [DONE]\n\n");
    res.end();

    logger.info("Chat message processed", {
      sessionId,
      userId,
      tokens: usageData?.total_tokens,
      cost: usageData?.cost_usd,
    });

    // Suppress unused variable warning
    void userMessage;
  }
}

export const chatService = new ChatService();
