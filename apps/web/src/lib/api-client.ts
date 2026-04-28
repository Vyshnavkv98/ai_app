/**
 * REST API Client — the ONLY way the web app communicates with the backend.
 * All requests go through this module. No direct imports from apps/api ever.
 *
 * Convention:
 *  - GET    → read/list resources
 *  - POST   → create resources or trigger actions
 *  - PATCH  → partial update
 *  - DELETE → remove resources
 *
 * Every method returns typed data or throws an ApiError.
 */

import type {
  AgentConfig,
  ChatMessage,
  Integration,
  WorkflowResult,
} from "shared";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

// ---------------------------------------------------------------------------
// Core fetch wrapper
// ---------------------------------------------------------------------------

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function request<T>(
  method: "GET" | "POST" | "PATCH" | "DELETE",
  path: string,
  options: { body?: unknown; token?: string; signal?: AbortSignal } = {}
): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (options.token) {
    headers["Authorization"] = `Bearer ${options.token}`;
  }

  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    signal: options.signal,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText, code: "UNKNOWN" }));
    throw new ApiError(res.status, err.code ?? "UNKNOWN", err.error ?? res.statusText);
  }

  // 204 No Content
  if (res.status === 204) return undefined as T;

  return res.json() as Promise<T>;
}

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

export const authApi = {
  me: (token: string) =>
    request<{ user: { id: string; email: string; name: string | null }; workspace: { id: string; slug: string; role: string } | null }>(
      "GET", "/api/auth/me", { token }
    ),
};

// ---------------------------------------------------------------------------
// Workspaces
// ---------------------------------------------------------------------------

export const workspacesApi = {
  create: (token: string, body: { name: string; slug: string }) =>
    request<{ id: string; name: string; slug: string; plan: string }>(
      "POST", "/api/workspaces", { token, body }
    ),

  get: (token: string, id: string) =>
    request<{ id: string; name: string; slug: string; plan: string; members: unknown[] }>(
      "GET", `/api/workspaces/${id}`, { token }
    ),

  update: (token: string, id: string, body: Partial<{ name: string }>) =>
    request<{ id: string; name: string }>(
      "PATCH", `/api/workspaces/${id}`, { token, body }
    ),
};

// ---------------------------------------------------------------------------
// Chat
// ---------------------------------------------------------------------------

export const chatApi = {
  createSession: (token: string, body: { agentId?: string; title?: string }) =>
    request<{ id: string; title: string | null; agentId: string | null; createdAt: string }>(
      "POST", "/api/chat/sessions", { token, body }
    ),

  listSessions: (token: string) =>
    request<Array<{ id: string; title: string | null; updatedAt: string }>>(
      "GET", "/api/chat/sessions", { token }
    ),

  getMessages: (token: string, sessionId: string) =>
    request<ChatMessage[]>(
      "GET", `/api/chat/sessions/${sessionId}/messages`, { token }
    ),

  /**
   * Send a message and get back a ReadableStream of SSE tokens.
   * The caller is responsible for reading the stream.
   */
  sendMessage: async (
    token: string,
    sessionId: string,
    body: { content: string; agentId?: string },
    signal?: AbortSignal
  ): Promise<ReadableStream<Uint8Array>> => {
    const res = await fetch(`${API_BASE}/api/chat/sessions/${sessionId}/messages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        Accept: "text/event-stream",
      },
      body: JSON.stringify(body),
      signal,
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText, code: "UNKNOWN" }));
      throw new ApiError(res.status, err.code ?? "UNKNOWN", err.error ?? res.statusText);
    }

    if (!res.body) throw new ApiError(500, "NO_STREAM", "Response body is null");
    return res.body;
  },
};

// ---------------------------------------------------------------------------
// Agents
// ---------------------------------------------------------------------------

export const agentsApi = {
  list: (token: string) =>
    request<AgentConfig[]>("GET", "/api/agents", { token }),

  get: (token: string, id: string) =>
    request<AgentConfig>("GET", `/api/agents/${id}`, { token }),

  create: (token: string, body: Omit<AgentConfig, "id">) =>
    request<AgentConfig>("POST", "/api/agents", { token, body }),

  update: (token: string, id: string, body: Partial<Omit<AgentConfig, "id">>) =>
    request<AgentConfig>("PATCH", `/api/agents/${id}`, { token, body }),

  delete: (token: string, id: string) =>
    request<void>("DELETE", `/api/agents/${id}`, { token }),

  invoke: (token: string, id: string, body: { message: string }) =>
    request<{ response: string; usage: { promptTokens: number; completionTokens: number; costUsd: number } }>(
      "POST", `/api/agents/${id}/invoke`, { token, body }
    ),
};

// ---------------------------------------------------------------------------
// Files
// ---------------------------------------------------------------------------

export const filesApi = {
  list: (token: string) =>
    request<Array<{ id: string; name: string; mimeType: string; sizeBytes: number; indexStatus: string; chunkCount: number | null; createdAt: string }>>(
      "GET", "/api/files", { token }
    ),

  upload: async (token: string, file: File): Promise<{ fileId: string; indexJobId: string }> => {
    const form = new FormData();
    form.append("file", file);

    const res = await fetch(`${API_BASE}/api/files/upload`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: form,
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText, code: "UNKNOWN" }));
      throw new ApiError(res.status, err.code ?? "UNKNOWN", err.error ?? res.statusText);
    }
    return res.json();
  },

  delete: (token: string, id: string) =>
    request<void>("DELETE", `/api/files/${id}`, { token }),
};

// ---------------------------------------------------------------------------
// Integrations
// ---------------------------------------------------------------------------

export const integrationsApi = {
  list: (token: string) =>
    request<Integration[]>("GET", "/api/integrations", { token }),

  connectSlack: (token: string) =>
    request<{ authUrl: string }>("POST", "/api/integrations/slack/connect", { token }),

  connectGmail: (token: string) =>
    request<{ authUrl: string }>("POST", "/api/integrations/gmail/connect", { token }),

  disconnect: (token: string, id: string) =>
    request<void>("DELETE", `/api/integrations/${id}`, { token }),
};

// ---------------------------------------------------------------------------
// Workflows
// ---------------------------------------------------------------------------

export const workflowsApi = {
  list: (token: string) =>
    request<Array<{ id: string; name: string; trigger: string; isActive: boolean; updatedAt: string }>>(
      "GET", "/api/workflows", { token }
    ),

  create: (token: string, body: unknown) =>
    request<{ id: string }>("POST", "/api/workflows", { token, body }),

  update: (token: string, id: string, body: unknown) =>
    request<{ id: string }>("PATCH", `/api/workflows/${id}`, { token, body }),

  trigger: (token: string, id: string, input?: unknown) =>
    request<WorkflowResult>("POST", `/api/workflows/${id}/trigger`, { token, body: input ?? {} }),
};

// ---------------------------------------------------------------------------
// Analytics
// ---------------------------------------------------------------------------

export const analyticsApi = {
  usage: (token: string, params?: { from?: string; to?: string; groupBy?: "user" | "agent" }) => {
    const qs = new URLSearchParams(params as Record<string, string>).toString();
    return request<{
      totalTokens: number;
      totalCostUsd: number;
      requestCount: number;
      series: Array<{ date: string; tokens: number; costUsd: number }>;
    }>("GET", `/api/analytics/usage${qs ? `?${qs}` : ""}`, { token });
  },

  agents: (token: string) =>
    request<Array<{ agentId: string; agentName: string; totalTokens: number; totalCostUsd: number; requestCount: number }>>(
      "GET", "/api/analytics/agents", { token }
    ),
};

// ---------------------------------------------------------------------------
// Admin
// ---------------------------------------------------------------------------

export const adminApi = {
  listUsers: (token: string) =>
    request<Array<{ id: string; email: string; name: string | null; role: string; joinedAt: string }>>(
      "GET", "/api/admin/users", { token }
    ),

  updateRole: (token: string, userId: string, role: string) =>
    request<{ id: string; role: string }>(
      "PATCH", `/api/admin/users/${userId}/role`, { token, body: { role } }
    ),

  auditLogs: (token: string, params?: { page?: number; limit?: number }) => {
    const qs = new URLSearchParams(params as Record<string, string>).toString();
    return request<{
      data: Array<{ id: string; action: string; resourceType: string; resourceId: string; userId: string; createdAt: string }>;
      total: number;
      page: number;
    }>("GET", `/api/admin/audit-logs${qs ? `?${qs}` : ""}`, { token });
  },
};
