import { z } from "zod";

export const AIModelSchema = z.enum([
  "gpt-4o",
  "gpt-4o-mini",
  "claude-3-5-sonnet-20241022",
  "gemini-1.5-pro",
]);

export const AgentToolSchema = z.object({
  name: z.string().min(1),
  type: z.enum(["builtin", "mcp", "webhook"]),
  config: z.record(z.unknown()).optional(),
});

export const CreateAgentSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  systemPrompt: z.string().min(1).max(10000),
  model: AIModelSchema,
  tools: z.array(AgentToolSchema).default([]),
  memoryEnabled: z.boolean().default(true),
  ragEnabled: z.boolean().default(false),
  maxTokens: z.number().int().min(100).max(128000).default(4096),
  temperature: z.number().min(0).max(2).default(0.7),
  outputSchema: z.record(z.unknown()).optional(),
  isPublic: z.boolean().default(false),
  isDraft: z.boolean().default(false),
});

export const UpdateAgentSchema = CreateAgentSchema.partial();

export const SendMessageSchema = z.object({
  content: z.string().min(1).max(100000),
  agentId: z.string().optional(),
  attachmentIds: z.array(z.string()).optional(),
});

export const CreateWorkspaceSchema = z.object({
  name: z.string().min(1).max(100),
  slug: z
    .string()
    .min(1)
    .max(50)
    .regex(/^[a-z0-9-]+$/, "Slug must be lowercase alphanumeric with hyphens"),
});

export const CreateWorkflowSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  trigger: z.enum([
    "MANUAL",
    "SCHEDULE",
    "WEBHOOK",
    "SLACK_MESSAGE",
    "EMAIL_RECEIVED",
  ]),
  triggerConfig: z.record(z.unknown()).default({}),
  steps: z.array(z.record(z.unknown())).default([]),
  agentId: z.string().optional(),
  isActive: z.boolean().default(true),
});

export const CreateSessionSchema = z.object({
  agentId: z.string().optional(),
  title: z.string().max(200).optional(),
});

export type CreateAgentInput = z.infer<typeof CreateAgentSchema>;
export type UpdateAgentInput = z.infer<typeof UpdateAgentSchema>;
export type SendMessageInput = z.infer<typeof SendMessageSchema>;
export type CreateWorkspaceInput = z.infer<typeof CreateWorkspaceSchema>;
export type CreateWorkflowInput = z.infer<typeof CreateWorkflowSchema>;
export type CreateSessionInput = z.infer<typeof CreateSessionSchema>;
