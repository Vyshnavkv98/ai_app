import { z } from "zod";
import { prisma } from "../lib/prisma";
import { aiServiceClient } from "../lib/ai-service";
import { writeAuditLog } from "../lib/audit";
import { NotFoundError, AppError } from "../middleware/error";

// ── Validation schemas ──────────────────────────────────────────────────────

const AgentToolSchema = z.object({
  name: z.string().min(1),
  type: z.enum(["builtin", "mcp", "webhook"]),
  config: z.record(z.unknown()).optional(),
});

export const CreateAgentSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  systemPrompt: z.string().min(1).max(10_000),
  model: z.enum(["gpt-4o", "gpt-4o-mini", "claude-3-5-sonnet-20241022", "gemini-1.5-pro"]),
  tools: z.array(AgentToolSchema).default([]),
  memoryEnabled: z.boolean().default(true),
  ragEnabled: z.boolean().default(false),
  maxTokens: z.number().int().min(100).max(128_000).default(4096),
  temperature: z.number().min(0).max(2).default(0.7),
  outputSchema: z.record(z.unknown()).optional(),
  isPublic: z.boolean().default(false),
  isDraft: z.boolean().default(false),
});

export const UpdateAgentSchema = CreateAgentSchema.partial();

export type CreateAgentInput = z.infer<typeof CreateAgentSchema>;
export type UpdateAgentInput = z.infer<typeof UpdateAgentSchema>;

// ── Service ─────────────────────────────────────────────────────────────────

export class AgentService {
  async list(workspaceId: string) {
    return prisma.agent.findMany({
      where: { workspaceId },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        name: true,
        description: true,
        model: true,
        memoryEnabled: true,
        ragEnabled: true,
        isPublic: true,
        isDraft: true,
        createdAt: true,
        updatedAt: true,
        _count: { select: { chatSessions: true } },
      },
    });
  }

  async findById(agentId: string, workspaceId: string) {
    const agent = await prisma.agent.findFirst({
      where: { id: agentId, workspaceId },
    });
    if (!agent) throw new NotFoundError("Agent not found");
    return agent;
  }

  async create(input: CreateAgentInput, userId: string, workspaceId: string, ipAddress?: string) {
    const agent = await prisma.agent.create({
      data: {
        name: input.name,
        description: input.description ?? null,
        systemPrompt: input.systemPrompt,
        model: input.model,
        tools: input.tools,
        memoryEnabled: input.memoryEnabled,
        ragEnabled: input.ragEnabled,
        maxTokens: input.maxTokens,
        temperature: input.temperature,
        outputSchema: input.outputSchema ?? null,
        isPublic: input.isPublic,
        isDraft: input.isDraft,
        workspaceId,
        createdById: userId,
      },
    });

    await writeAuditLog({
      action: "agent.created",
      resourceType: "agent",
      resourceId: agent.id,
      userId,
      workspaceId,
      metadata: { name: agent.name, model: agent.model },
      ipAddress,
    });

    return agent;
  }

  async update(
    agentId: string,
    input: UpdateAgentInput,
    userId: string,
    workspaceId: string,
    ipAddress?: string
  ) {
    // Verify ownership
    const existing = await prisma.agent.findFirst({
      where: { id: agentId, workspaceId },
    });
    if (!existing) throw new NotFoundError("Agent not found");

    // workspaceId is immutable
    const { ...updateData } = input;

    const agent = await prisma.agent.update({
      where: { id: agentId },
      data: {
        ...(updateData.name !== undefined && { name: updateData.name }),
        ...(updateData.description !== undefined && { description: updateData.description }),
        ...(updateData.systemPrompt !== undefined && { systemPrompt: updateData.systemPrompt }),
        ...(updateData.model !== undefined && { model: updateData.model }),
        ...(updateData.tools !== undefined && { tools: updateData.tools }),
        ...(updateData.memoryEnabled !== undefined && { memoryEnabled: updateData.memoryEnabled }),
        ...(updateData.ragEnabled !== undefined && { ragEnabled: updateData.ragEnabled }),
        ...(updateData.maxTokens !== undefined && { maxTokens: updateData.maxTokens }),
        ...(updateData.temperature !== undefined && { temperature: updateData.temperature }),
        ...(updateData.outputSchema !== undefined && { outputSchema: updateData.outputSchema }),
        ...(updateData.isPublic !== undefined && { isPublic: updateData.isPublic }),
        ...(updateData.isDraft !== undefined && { isDraft: updateData.isDraft }),
      },
    });

    await writeAuditLog({
      action: "agent.updated",
      resourceType: "agent",
      resourceId: agentId,
      userId,
      workspaceId,
      metadata: updateData,
      ipAddress,
    });

    return agent;
  }

  async delete(agentId: string, userId: string, workspaceId: string, ipAddress?: string) {
    const agent = await prisma.agent.findFirst({
      where: { id: agentId, workspaceId },
    });
    if (!agent) throw new NotFoundError("Agent not found");

    // Disassociate from active workflows
    await prisma.workflow.updateMany({
      where: { agentId, workspaceId },
      data: { agentId: null },
    });

    await prisma.agent.delete({ where: { id: agentId } });

    await writeAuditLog({
      action: "agent.deleted",
      resourceType: "agent",
      resourceId: agentId,
      userId,
      workspaceId,
      metadata: { name: agent.name },
      ipAddress,
    });
  }

  async invoke(
    agentId: string,
    message: string,
    workspaceId: string,
    sessionId?: string
  ) {
    const agent = await prisma.agent.findFirst({
      where: { id: agentId, workspaceId },
    });
    if (!agent) throw new NotFoundError("Agent not found");

    const result = await aiServiceClient.invokeAgent({
      message,
      session_id: sessionId ?? `test-${agentId}`,
      workspace_id: workspaceId,
      agent_config: {
        id: agent.id,
        name: agent.name,
        system_prompt: agent.systemPrompt,
        model: agent.model,
        max_tokens: agent.maxTokens,
        temperature: agent.temperature,
        memory_enabled: false, // test invocations don't persist memory
        rag_enabled: agent.ragEnabled,
      },
    });

    return result;
  }
}

export const agentService = new AgentService();
