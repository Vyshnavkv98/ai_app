export type AIModel =
  | "gpt-4o"
  | "gpt-4o-mini"
  | "claude-3-5-sonnet-20241022"
  | "gemini-1.5-pro";

export type IntegrationType =
  | "SLACK"
  | "GMAIL"
  | "NOTION"
  | "HUBSPOT"
  | "POSTGRES"
  | "WEBHOOK"
  | "MCP";

export type WorkflowTrigger =
  | "MANUAL"
  | "SCHEDULE"
  | "WEBHOOK"
  | "SLACK_MESSAGE"
  | "EMAIL_RECEIVED";

export type UserRole = "OWNER" | "ADMIN" | "MEMBER" | "VIEWER";

export type IndexStatus = "PENDING" | "INDEXING" | "INDEXED" | "FAILED";

export type ExecutionStatus = "RUNNING" | "SUCCESS" | "FAILED" | "CANCELLED";

export type Plan = "FREE" | "STARTER" | "PRO" | "ENTERPRISE";

export interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system" | "tool";
  content: string;
  toolCalls?: unknown[];
  createdAt: Date;
}

export interface AgentTool {
  name: string;
  type: "builtin" | "mcp" | "webhook";
  config?: Record<string, unknown>;
}

export interface AgentConfig {
  id: string;
  name: string;
  description?: string;
  systemPrompt: string;
  model: AIModel;
  tools: AgentTool[];
  memoryEnabled: boolean;
  ragEnabled: boolean;
  maxTokens: number;
  temperature: number;
  outputSchema?: Record<string, unknown>;
}

export interface Integration {
  id: string;
  type: IntegrationType;
  status: "connected" | "disconnected" | "error";
  config: Record<string, unknown>;
  workspaceId: string;
  createdAt: Date;
}

export interface WorkflowStep {
  id: string;
  type: "agent_invoke" | "webhook" | "slack_message" | "gmail_send" | "condition";
  config: Record<string, unknown>;
  order: number;
}

export interface WorkflowResult {
  status: ExecutionStatus;
  output?: unknown;
  error?: string;
  executionId: string;
  startedAt: Date;
  completedAt?: Date;
}
