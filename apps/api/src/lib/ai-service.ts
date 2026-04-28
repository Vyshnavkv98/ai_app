/**
 * AI Service HTTP Client — the ONLY way apps/api communicates with apps/ai-service.
 * All calls are plain HTTP to AI_SERVICE_URL. No shared code between the two processes.
 */

const AI_SERVICE_URL = process.env.AI_SERVICE_URL ?? "http://localhost:8000";

export class AiServiceError extends Error {
  constructor(
    public status: number,
    message: string
  ) {
    super(message);
    this.name = "AiServiceError";
  }
}

async function aiRequest<T>(
  method: "GET" | "POST" | "DELETE",
  path: string,
  body?: unknown
): Promise<T> {
  const res = await fetch(`${AI_SERVICE_URL}${path}`, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new AiServiceError(res.status, err.detail ?? res.statusText);
  }

  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

/**
 * Stream a chat response from the AI service as a raw Response (SSE).
 * The caller pipes this directly to the Express response.
 */
export async function streamChat(payload: {
  message: string;
  sessionId: string;
  agentConfig: unknown;
  workspaceId: string;
  memory: unknown[];
}): Promise<Response> {
  const res = await fetch(`${AI_SERVICE_URL}/ai/chat/stream`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "text/event-stream",
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new AiServiceError(res.status, err.detail ?? res.statusText);
  }

  return res;
}

export const aiServiceClient = {
  // Chat
  chat: (payload: unknown) =>
    aiRequest<{ response: string; usage: unknown }>("POST", "/ai/chat", payload),

  // RAG
  ragIndex: (payload: { fileId: string; s3Key: string; workspaceId: string }) =>
    aiRequest<{ jobId: string }>("POST", "/ai/rag/index", payload),

  ragQuery: (payload: { query: string; workspaceId: string; topK?: number }) =>
    aiRequest<{ chunks: Array<{ text: string; score: number; fileId: string }> }>(
      "POST", "/ai/rag/query", payload
    ),

  ragDeleteDocument: (fileId: string) =>
    aiRequest<void>("DELETE", `/ai/rag/documents/${fileId}`),

  // Agents
  invokeAgent: (payload: unknown) =>
    aiRequest<{ response: string; toolCalls: unknown[]; usage: unknown }>(
      "POST", "/ai/agents/invoke", payload
    ),

  invokeMultiAgent: (payload: unknown) =>
    aiRequest<{ status: string; output: unknown; executionId: string }>(
      "POST", "/ai/agents/multi", payload
    ),

  // Memory
  getMemory: (sessionId: string) =>
    aiRequest<{ messages: unknown[] }>("GET", `/ai/memory/${sessionId}`),

  updateMemory: (sessionId: string, payload: unknown) =>
    aiRequest<void>("POST", `/ai/memory/${sessionId}`, payload),

  clearMemory: (sessionId: string) =>
    aiRequest<void>("DELETE", `/ai/memory/${sessionId}`),

  // Models
  listModels: () =>
    aiRequest<Array<{ id: string; provider: string; available: boolean }>>(
      "GET", "/ai/models"
    ),

  // Embeddings
  embed: (texts: string[]) =>
    aiRequest<{ embeddings: number[][] }>("POST", "/ai/embeddings", { texts }),
};
