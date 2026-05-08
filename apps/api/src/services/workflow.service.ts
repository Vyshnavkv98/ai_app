import { randomBytes, createHmac } from "crypto";
import { z } from "zod";
import { Queue, Worker, Job } from "bullmq";
import { prisma } from "../lib/prisma";
import { redis } from "../lib/redis";
import { aiServiceClient } from "../lib/ai-service";
import { writeAuditLog } from "../lib/audit";
import { NotFoundError, AppError } from "../middleware/error";
import { logger } from "../lib/logger";

// ── Validation schemas ──────────────────────────────────────────────────────

const WorkflowStepSchema = z.object({
  id: z.string(),
  type: z.enum(["agent_invoke", "webhook", "slack_message", "gmail_send", "condition"]),
  config: z.record(z.unknown()),
  order: z.number().int().min(0),
});

export const CreateWorkflowSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  trigger: z.enum(["MANUAL", "SCHEDULE", "WEBHOOK", "SLACK_MESSAGE", "EMAIL_RECEIVED"]),
  triggerConfig: z.record(z.unknown()).default({}),
  steps: z.array(WorkflowStepSchema).default([]),
  agentId: z.string().optional(),
  isActive: z.boolean().default(true),
});

export const UpdateWorkflowSchema = CreateWorkflowSchema.partial();

export type CreateWorkflowInput = z.infer<typeof CreateWorkflowSchema>;
export type UpdateWorkflowInput = z.infer<typeof UpdateWorkflowSchema>;

// ── BullMQ workflow execution queue ─────────────────────────────────────────

const connection = {
  host: new URL(process.env.REDIS_URL ?? "redis://localhost:6379").hostname,
  port: parseInt(new URL(process.env.REDIS_URL ?? "redis://localhost:6379").port || "6379"),
};

export const workflowQueue = new Queue<{ workflowId: string; input: unknown; triggeredBy: string }>(
  "workflow-execution",
  {
    connection,
    defaultJobOptions: { attempts: 1, removeOnComplete: 100, removeOnFail: 200 },
  }
);

// ── Service ─────────────────────────────────────────────────────────────────

export class WorkflowService {
  async list(workspaceId: string) {
    return prisma.workflow.findMany({
      where: { workspaceId },
      orderBy: { createdAt: "desc" },
      select: {
        id: true, name: true, description: true, trigger: true,
        isActive: true, createdAt: true, updatedAt: true,
        agent: { select: { id: true, name: true } },
        _count: { select: { executions: true } },
      },
    });
  }

  async findById(workflowId: string, workspaceId: string) {
    const wf = await prisma.workflow.findFirst({
      where: { id: workflowId, workspaceId },
      include: { executions: { orderBy: { startedAt: "desc" }, take: 10 } },
    });
    if (!wf) throw new NotFoundError("Workflow not found");
    return wf;
  }

  async create(input: CreateWorkflowInput, userId: string, workspaceId: string, ipAddress?: string) {
    // Generate webhook secret for WEBHOOK trigger
    const webhookSecret = input.trigger === "WEBHOOK" ? randomBytes(32).toString("hex") : null;

    const workflow = await prisma.workflow.create({
      data: {
        name: input.name,
        description: input.description ?? null,
        trigger: input.trigger,
        triggerConfig: input.triggerConfig,
        steps: input.steps,
        agentId: input.agentId ?? null,
        isActive: input.isActive,
        webhookSecret,
        workspaceId,
        createdById: userId,
      },
    });

    await writeAuditLog({ action: "workflow.created", resourceType: "workflow", resourceId: workflow.id, userId, workspaceId, metadata: { name: workflow.name, trigger: workflow.trigger }, ipAddress });

    return {
      ...workflow,
      webhookUrl: webhookSecret
        ? `${process.env.API_BASE_URL}/webhooks/workflow/${workflow.id}`
        : null,
    };
  }

  async update(workflowId: string, input: UpdateWorkflowInput, userId: string, workspaceId: string, ipAddress?: string) {
    const existing = await prisma.workflow.findFirst({ where: { id: workflowId, workspaceId } });
    if (!existing) throw new NotFoundError("Workflow not found");

    const workflow = await prisma.workflow.update({
      where: { id: workflowId },
      data: {
        ...(input.name !== undefined && { name: input.name }),
        ...(input.description !== undefined && { description: input.description }),
        ...(input.trigger !== undefined && { trigger: input.trigger }),
        ...(input.triggerConfig !== undefined && { triggerConfig: input.triggerConfig }),
        ...(input.steps !== undefined && { steps: input.steps }),
        ...(input.agentId !== undefined && { agentId: input.agentId }),
        ...(input.isActive !== undefined && { isActive: input.isActive }),
      },
    });

    await writeAuditLog({ action: "workflow.updated", resourceType: "workflow", resourceId: workflowId, userId, workspaceId, metadata: input, ipAddress });
    return workflow;
  }

  async trigger(
    workflowId: string,
    input: unknown,
    triggeredBy: "manual" | "schedule" | "webhook",
    workspaceId: string
  ) {
    const workflow = await prisma.workflow.findFirst({ where: { id: workflowId, workspaceId } });
    if (!workflow) throw new NotFoundError("Workflow not found");
    if (!workflow.isActive) throw new AppError(400, "Workflow is not active", "WORKFLOW_INACTIVE");

    // Enforce single-concurrent-execution via Redis mutex
    const lockKey = `lock:workflow:${workflowId}`;
    const locked = await redis.set(lockKey, "1", "EX", 300, "NX"); // 5-min TTL
    if (!locked) {
      throw new AppError(409, "Workflow is already running", "WORKFLOW_RUNNING");
    }

    // Create execution record
    const execution = await prisma.workflowExecution.create({
      data: { workflowId, status: "RUNNING", input: input as any },
    });

    // Enqueue async execution
    await workflowQueue.add("execute", { workflowId, input, triggeredBy });

    logger.info("Workflow triggered", { workflowId, executionId: execution.id, triggeredBy });
    return execution;
  }

  async listExecutions(workflowId: string, workspaceId: string) {
    const workflow = await prisma.workflow.findFirst({ where: { id: workflowId, workspaceId } });
    if (!workflow) throw new NotFoundError("Workflow not found");

    return prisma.workflowExecution.findMany({
      where: { workflowId },
      orderBy: { startedAt: "desc" },
      take: 50,
    });
  }
}

export const workflowService = new WorkflowService();

// ── Workflow execution worker ─────────────────────────────────────────────────

export function startWorkflowWorker(): Worker {
  const worker = new Worker(
    "workflow-execution",
    async (job: Job<{ workflowId: string; input: unknown; triggeredBy: string }>) => {
      const { workflowId, input } = job.data;
      const lockKey = `lock:workflow:${workflowId}`;

      try {
        const workflow = await prisma.workflow.findUnique({
          where: { id: workflowId },
          include: { agent: true },
        });
        if (!workflow) throw new Error("Workflow not found");

        const steps = (workflow.steps as any[]) ?? [];
        const output: unknown[] = [];

        // Execute steps sequentially with 5-minute total timeout
        await Promise.race([
          (async () => {
            for (const step of steps) {
              const stepResult = await executeStep(step, workflow, input);
              output.push(stepResult);
            }
          })(),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error("Execution timeout")), 300_000)
          ),
        ]);

        // Mark SUCCESS
        await prisma.workflowExecution.updateMany({
          where: { workflowId, status: "RUNNING" },
          data: { status: "SUCCESS", output: output as any, completedAt: new Date() },
        });

        logger.info("Workflow execution completed", { workflowId });
      } catch (err) {
        const error = (err as Error).message;
        await prisma.workflowExecution.updateMany({
          where: { workflowId, status: "RUNNING" },
          data: { status: "FAILED", error, completedAt: new Date() },
        });
        logger.error("Workflow execution failed", { workflowId, error });
      } finally {
        await redis.del(lockKey);
      }
    },
    { connection, concurrency: 5 }
  );

  worker.on("failed", (job, err) => {
    logger.error("Workflow job failed", { jobId: job?.id, error: err.message });
  });

  return worker;
}

// ── Step executor ─────────────────────────────────────────────────────────────

async function executeStep(step: any, workflow: any, input: unknown): Promise<unknown> {
  switch (step.type) {
    case "agent_invoke": {
      if (!workflow.agent) return { error: "No agent configured" };
      const message = step.config.message ?? JSON.stringify(input);
      return aiServiceClient.invokeAgent({
        message,
        session_id: `workflow-${workflow.id}-${Date.now()}`,
        workspace_id: workflow.workspaceId,
        agent_config: {
          id: workflow.agent.id,
          name: workflow.agent.name,
          system_prompt: workflow.agent.systemPrompt,
          model: workflow.agent.model,
          max_tokens: workflow.agent.maxTokens,
          temperature: workflow.agent.temperature,
          memory_enabled: false,
          rag_enabled: workflow.agent.ragEnabled,
        },
      });
    }

    case "webhook": {
      const url = step.config.url as string;
      if (!url) return { error: "No webhook URL configured" };

      const secret = step.config.secret as string | undefined;
      const body = JSON.stringify({ workflowId: workflow.id, input, step: step.id });
      const headers: Record<string, string> = { "Content-Type": "application/json" };

      if (secret) {
        headers["X-Nexus-Signature"] = createHmac("sha256", secret).update(body).digest("hex");
      }

      // 3 retries with exponential backoff
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          const res = await fetch(url, { method: "POST", headers, body });
          if (res.ok) return { status: res.status };
          if (attempt < 2) await new Promise((r) => setTimeout(r, 1000 * Math.pow(2, attempt)));
        } catch {
          if (attempt < 2) await new Promise((r) => setTimeout(r, 1000 * Math.pow(2, attempt)));
        }
      }
      return { error: "Webhook failed after 3 attempts" };
    }

    default:
      return { skipped: true, type: step.type };
  }
}
