# Implementation Plan: AI Operations Copilot

## Overview

Full-stack AI SaaS platform built as a monorepo (Turborepo) with Next.js 15, Express.js, Python FastAPI, PostgreSQL, Redis, and Pinecone. Implementation follows the 21-day roadmap: Week 1 establishes the foundation (auth, workspace, basic chat), Week 2 adds core features (RAG, agent builder, integrations, workflows), and Week 3 delivers advanced capabilities and production deployment.

---

## Tasks

### Week 1 — Foundation (Days 1–7)

- [ ] 1. Initialize monorepo and infrastructure scaffold
  - Create Turborepo workspace root with `package.json`, `turbo.json`, and `pnpm-workspace.yaml`
  - Scaffold `apps/web` (Next.js 15), `apps/api` (Express.js), `apps/ai-service` (FastAPI), `packages/shared` (TypeScript)
  - Write `infrastructure/docker-compose.yml` with services: web, api, ai-service, postgres (pgvector/pgvector:pg16), redis
  - Add per-service `Dockerfile` stubs under `infrastructure/docker/`
  - _Requirements: 22.1, 22.2_

- [ ] 2. Define PostgreSQL schema and run Prisma migrations
  - Write the full Prisma schema in `apps/api/prisma/schema.prisma` covering all models: User, Workspace, WorkspaceMember, Agent, ChatSession, Message, Integration, File, Workflow, WorkflowExecution, UsageLog, AuditLog, and all enums
  - Run `prisma migrate dev --name init` to generate and apply the initial migration
  - Add composite indexes on `(workspaceId, createdAt)` for Agent, Message, UsageLog, AuditLog, WorkflowExecution
  - Seed script with a test workspace, owner user, and sample agent
  - _Requirements: 2.1, 2.3, 6.4, 11.5_

- [x] 3. Implement Clerk authentication in Express.js API
  - Install `@clerk/express` and create `requireAuth` middleware that validates the JWT on every protected route
  - Implement `POST /api/auth/webhook` to receive Clerk user.created / user.updated events and upsert the User record in PostgreSQL; verify the Clerk webhook signature
  - Implement `GET /api/auth/me` returning the authenticated user's profile and active workspace membership
  - Apply `requireAuth` middleware globally via `app.use()`; exclude `/api/auth/webhook` and health-check routes
  - _Requirements: 1.1, 1.2, 1.3, 1.5, 21.3_

- [x] 4. Implement workspace CRUD API
  - Implement `POST /api/workspaces` — create workspace, assign Owner role to creator, write audit log
  - Implement `GET /api/workspaces/:id` — return workspace scoped to requesting user's membership
  - Implement `PATCH /api/workspaces/:id` — update settings; enforce Admin/Owner role guard
  - Add `WorkspaceScopeGuard` that injects `workspaceId` from the authenticated user's membership and returns 404 for cross-workspace access
  - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 12.4_

- [x] 5. Build shared TypeScript package
  - Define all shared types in `packages/shared/src/types.ts`: `AIModel`, `IntegrationType`, `WorkflowTrigger`, `UserRole`, `ChatMessage`, `AgentConfig`, `Integration`
  - Define Zod schemas: `CreateAgentSchema`, `SendMessageSchema`, `CreateWorkflowSchema`
  - Export model pricing constants used by `calculateCost()`
  - _Requirements: 9.3, 11.6_

- [ ] 6. Build Next.js frontend — auth and dashboard shell
  - Implement `/login` page with Clerk `<SignIn />` component; redirect authenticated users to `/dashboard`
  - Implement `/dashboard` layout with sidebar navigation (Chat, Agents, Integrations, Analytics, Settings, Admin)
  - Implement dashboard overview page fetching active agents count, connected integrations, recent sessions, and current-period token usage from the API
  - Add workspace context provider that scopes all API calls to the active workspace; support workspace switching without full page reload
  - _Requirements: 1.1, 1.4, 4.1, 4.2, 4.3, 4.4_

- [ ] 7. Implement basic AI chat — Express.js proxy + FastAPI + SSE streaming
  - In Express.js: implement `POST /api/chat/sessions` and `GET /api/chat/sessions/:id/messages`
  - In Express.js: implement `POST /api/chat/sessions/:id/messages` — persist user message, forward to FastAPI, stream SSE tokens back to client
  - In FastAPI: implement `POST /ai/chat/stream` — call OpenAI with streaming, yield SSE tokens
  - In Next.js: implement `/chat/[sessionId]` page that reads the SSE stream and renders tokens incrementally
  - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5_

- [ ] 8. Checkpoint — Week 1 foundation complete
  - Ensure all tests pass, ask the user if questions arise.
  - Verify Docker Compose brings up all services cleanly
  - Confirm login → dashboard → chat SSE flow works end-to-end

---

### Week 2 — Core Features (Days 8–14)

- [ ] 9. Implement file upload and S3 + Bull indexing pipeline
  - Implement `POST /api/files/upload` — accept multipart, upload to S3, create File record with `indexStatus: PENDING`, enqueue Bull job
  - Implement `GET /api/files` and `DELETE /api/files/:id` (removes S3 object + vector embeddings)
  - In FastAPI worker: implement `indexFile(fileId, s3Key, workspaceId)` — download from S3, extract text (PDF/DOCX/TXT), chunk with 1000-char size and 200-char overlap, batch-embed via OpenAI `text-embedding-3-small`, upsert to Pinecone scoped by `workspaceId`, update File status to `INDEXED` or `FAILED`
  - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.7, 6.8_

  - [ ]* 9.1 Write property test for text chunking content preservation
    - **Property 5 (partial): Text chunking — all source content is represented in chunks**
    - Use `hypothesis` to generate arbitrary strings of length 1–50 000 chars; assert that `chunkText(text, {chunkSize:1000, chunkOverlap:200})` produces chunks whose concatenation covers the first 100 chars of the input
    - **Validates: Requirements 6.3, 6.9**

  - [ ]* 9.2 Write property test for file indexing idempotency
    - **Property 5: File indexing idempotency — re-indexing the same file produces the same chunkCount and upserts (not duplicates) vectors**
    - Use `hypothesis` with a mocked Pinecone client; assert that calling `indexFile` twice on the same file yields identical `chunkCount` and that the vector upsert is called with the same IDs both times
    - **Validates: Requirements 6.9**

- [ ] 10. Implement RAG chat flow
  - In FastAPI: implement `POST /ai/rag/query` — generate query embedding, run Pinecone similarity search filtered by `workspaceId` (topK: 5), inject retrieved chunks into system prompt, stream LLM response
  - Update `POST /ai/chat/stream` to branch on `agentConfig.ragEnabled`; call RAG flow when enabled
  - Implement `POST /ai/rag/index` and `DELETE /ai/rag/documents/{id}` endpoints
  - _Requirements: 6.6, 5.6_

- [ ] 11. Implement Agent Builder — CRUD API and React Flow canvas
  - In Express.js: implement full agent CRUD (`POST`, `GET`, `PATCH`, `DELETE /api/agents`, `POST /api/agents/:id/invoke`)
  - Validate all agent create/update requests against `CreateAgentSchema`; return 400 on invalid input
  - Enforce that `workspaceId` cannot be changed after creation; write audit log on create/update/delete
  - In Next.js: implement `/agents` list page and `/agents/[agentId]/build` canvas using `@xyflow/react` with nodes for system prompt, model selector, tool picker, memory toggle, RAG toggle
  - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5, 9.6, 9.7, 9.8, 9.9_

- [ ] 12. Implement Slack integration
  - In Express.js: implement `POST /api/integrations/slack/connect` — generate OAuth URL, store state token in Redis (10-min TTL); implement OAuth callback handler that exchanges code, AES-256-GCM encrypts tokens, persists Integration
  - Implement `POST /webhooks/slack` — verify Slack HMAC signature, acknowledge with 200 immediately, enqueue processing job
  - Implement Slack summarizer workflow step: fetch channel messages via Slack API, invoke AI_Service for summary, post result back to Slack
  - Implement `DELETE /api/integrations/:id` with Admin/Owner role guard
  - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7, 21.1, 21.2, 21.3_

- [ ] 13. Implement Gmail integration
  - In Express.js: implement `POST /api/integrations/gmail/connect` — OAuth flow with state token in Redis; callback exchanges code for access + refresh tokens, encrypts with AES-256-GCM, persists Integration
  - Implement `POST /webhooks/gmail` — verify Google Pub/Sub token, fetch full email, forward to AI_Service
  - In FastAPI: classify email intent, generate draft reply with confidence score
  - In Express.js: if confidence >= 0.85 and auto-reply enabled, send via Gmail Send API; otherwise save draft and create in-app notification
  - Implement refresh token rotation on 401 responses before marking Integration as ERROR
  - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 8.7, 21.1, 21.2_

- [ ] 14. Implement workflow automation engine
  - In Express.js: implement `POST /api/workflows`, `GET /api/workflows`, `PATCH /api/workflows/:id`, `POST /api/workflows/:id/trigger`
  - Implement SCHEDULE trigger using Bull's cron job support; WEBHOOK trigger via unique inbound URL generation
  - On trigger: create WorkflowExecution with `status: RUNNING`, acquire Redis mutex lock (`lock:workflow:{workflowId}`), execute steps asynchronously
  - Enforce 5-minute execution timeout; on timeout set status to FAILED and release lock
  - Enforce single-concurrent-execution invariant via Redis lock; skip trigger if lock exists
  - Implement outbound webhook step with 3-retry exponential backoff and HMAC signature header
  - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5, 10.6, 10.7, 10.8, 10.9, 10.10, 19.1, 19.2, 19.3, 19.4, 19.5_

- [ ] 15. Checkpoint — Week 2 core features complete
  - Ensure all tests pass, ask the user if questions arise.
  - Verify file upload → indexing → RAG chat flow end-to-end
  - Verify Slack and Gmail OAuth connect flows

---

### Week 3 — Advanced + Production (Days 15–21)

- [ ] 16. Implement multi-agent system with LangGraph
  - In FastAPI: implement `POST /ai/agents/multi` — build LangGraph `StateGraph` with supervisor node and specialist nodes; add conditional edges from supervisor to specialists and back
  - Implement `createSupervisorNode` and `createSpecialistNode` factory functions
  - Attach Redis checkpointer to compiled graph for state persistence after each node execution
  - Enforce 5-minute timeout via `asyncio.wait_for`; return `WorkflowResult` with status SUCCESS/PARTIAL/FAILED
  - Log a UsageLog entry for every individual agent invocation within the multi-agent workflow
  - _Requirements: 13.1, 13.2, 13.3, 13.4, 13.5, 13.6_

- [ ] 17. Implement memory system — Redis short-term + vector long-term
  - In FastAPI: implement `GET /ai/memory/{session_id}`, `POST /ai/memory/{session_id}`, `DELETE /ai/memory/{session_id}`
  - Implement `updateMemory(sessionId, newTurn)` — load existing array from Redis, append new turn, slice to last 20 entries, write back with 2-hour TTL
  - Integrate short-term memory into all chat invocations: load before LLM call, update after response
  - Implement long-term memory: embed significant turns and upsert to Pinecone with `session_id` metadata; retrieve on agent invocation when `memoryEnabled: true`
  - _Requirements: 14.1, 14.2, 14.3, 14.4, 14.5, 14.6_

  - [ ]* 17.1 Write property test for memory window enforcement
    - **Property 3: Memory window — short-term memory never exceeds 20 turns for any sequence of updates**
    - Use `fast-check` (or `hypothesis`): generate arbitrary arrays of message objects of length 0–100; assert that `updateMemory([], messages).length <= 20` for all inputs
    - **Validates: Requirements 14.1, 14.2, 14.6**

- [ ] 18. Implement analytics dashboard
  - In Express.js: implement `GET /api/analytics/usage` — aggregate UsageLog by date range for the workspace; support `?groupBy=user` query param
  - Implement `GET /api/analytics/agents` — per-agent token and cost aggregation
  - In Next.js: implement `/analytics` page with Recharts/Tremor time-series charts for token usage and cost; display total tokens, total cost, and request count for current billing period
  - _Requirements: 11.1, 11.2, 11.3, 11.4, 11.5, 18.1, 18.2, 18.3_

- [ ] 19. Implement RBAC enforcement, audit logs, and admin panel
  - Create `requireRole(role)` Express middleware that checks the user's WorkspaceMember role before each handler; return 403 for insufficient roles
  - Enforce role rules: Viewer → no mutations; Member → no integration management or role updates; Admin/Owner → full access; Owner-only → workspace deletion
  - Implement `AuditLogService.write()` called in every mutating service method (create/update/delete on all resources)
  - Implement `GET /api/admin/users`, `PATCH /api/admin/users/:id/role`, `GET /api/admin/audit-logs` (paginated, ordered by `createdAt` desc)
  - In Next.js: implement `/admin` page (Admin/Owner only) with user list, role editor, and paginated audit log table
  - Disable/hide mutating controls in the UI for Viewer role
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 12.1, 12.2, 12.3, 12.4, 12.5, 12.6_

  - [ ]* 19.1 Write property test for workspace isolation
    - **Property 1: Workspace isolation — agents are never accessible cross-workspace**
    - Use `fast-check`: generate pairs of distinct workspace IDs and agent records; assert that `getAgent(agent.id, differentWorkspaceId)` throws `NotFoundError` for all such pairs
    - **Validates: Requirements 2.3, 2.4, 9.8**

- [ ] 20. Implement LLM fallback router, prompt templates, and structured JSON outputs
  - In FastAPI: implement `llmRouter(request, fallbackChain)` — iterate fallback chain; on RateLimitError apply exponential backoff (base 1s, max 30s); on ModelUnavailableError advance immediately; on TokenLimitError truncate to 80% context window and retry; throw `AllModelsFailedError` after exhausting chain
  - Implement `GET /ai/models` and `POST /ai/models/test`
  - Implement prompt template rendering: substitute `{{variableName}}` placeholders; return error identifying missing variables
  - Implement structured JSON output enforcement via OpenAI function calling; retry up to 2 times on schema validation failure
  - Add `outputSchema` field to Agent configuration and API
  - _Requirements: 15.1, 15.2, 15.3, 15.4, 15.5, 15.6, 15.7, 15.8, 16.1, 16.2, 16.3, 16.4, 17.1, 17.2, 17.3, 17.4_

  - [ ]* 20.1 Write property test for cost calculation non-negativity
    - **Property 4: Cost non-negativity — calculateCost returns >= 0 for all valid non-negative token counts and all supported models**
    - Use `fast-check`: generate `fc.constantFrom(...SUPPORTED_MODELS)`, `fc.nat()` for promptTokens, `fc.nat()` for completionTokens; assert `calculateCost(model, promptTokens, completionTokens) >= 0`
    - **Validates: Requirements 11.6, 11.7**

  - [ ]* 20.2 Write property test for LLM fallback exhaustion
    - **Property 10: LLM fallback exhaustion — AllModelsFailedError is thrown only after every model in the fallback chain has been attempted**
    - Use `hypothesis`: generate fallback chains of 1–5 model names with all providers mocked to raise errors; assert that `llmRouter` raises `AllModelsFailedError` and that every model in the chain was called at least once
    - **Validates: Requirements 15.6, 15.7**

- [ ] 21. Implement token quota enforcement and rate limiting
  - In Express.js: add `quotaGuard` middleware that checks the workspace's monthly token usage against the plan limit before forwarding to AI_Service; return 429 with `{ error: "quota_exceeded", resetAt: ISO8601 }` when exceeded
  - Add per-workspace rate limiting middleware (100 req/min per endpoint) using `express-rate-limit` + Redis store; return 429 on breach
  - Implement `UsageLog` write in every LLM invocation path (NestJS and FastAPI), recording actual model used (post-fallback)
  - _Requirements: 5.7, 5.9, 11.5, 11.8, 18.4, 18.5, 21.7_

- [ ] 22. Implement MCP server integrations
  - In Express.js: implement `POST`, `GET`, `DELETE /api/integrations/mcp` for Admin/Owner role; store MCP server URL and config in Integration record
  - In FastAPI: when an agent tool is of type `mcp`, invoke the MCP server's tool endpoint; if unreachable, return error identifying the unavailable tool (do not silently skip)
  - _Requirements: 20.1, 20.2, 20.3, 20.4_

- [ ] 23. Implement security hardening
  - Add AES-256-GCM encryption/decryption service in Express.js using key from AWS Secrets Manager; apply to all Integration credential storage and retrieval
  - Ensure no API response body ever includes `encryptedCreds` or raw OAuth tokens
  - Add HSTS headers via `helmet` middleware; enforce HTTPS-only in production
  - Add Zod validation middleware globally in Express.js; confirm all inputs validated before processing
  - Confirm all webhook handlers verify signatures (Slack HMAC, Google Pub/Sub token, Clerk webhook secret) before processing payloads
  - _Requirements: 21.1, 21.2, 21.3, 21.4, 21.5, 21.6_

- [ ] 24. Checkpoint — Week 3 advanced features complete
  - Ensure all tests pass, ask the user if questions arise.
  - Verify multi-agent workflow, memory system, analytics, RBAC, and LLM fallback end-to-end

- [ ] 25. AWS deployment — ECS, RDS, ElastiCache, ALB, Secrets Manager
  - Write ECS task definitions for web, api, ai-service, and worker services under `infrastructure/aws/`
  - Configure RDS PostgreSQL Multi-AZ and ElastiCache Redis cluster; set Prisma `DATABASE_URL` and `REDIS_URL` via Secrets Manager
  - Configure Application Load Balancer with HTTPS listener and target groups for each ECS service
  - Store all API keys (OpenAI, Anthropic, Google, Pinecone, Clerk) in Secrets Manager; inject as ECS environment variables
  - Configure PgBouncer sidecar for connection pooling; size Prisma pool to `ECS_TASK_COUNT × 5`
  - _Requirements: 22.2, 22.5, 22.6, 21.4_

- [ ] 26. CI/CD pipeline, CloudWatch monitoring, and load testing
  - Write `.github/workflows/deploy.yml` — jobs: test (Jest + pytest), build-and-push (ECR per service matrix), deploy (ECS force-new-deployment)
  - Add CloudWatch log groups for api and ai-service; emit structured JSON logs for all requests, errors, and LLM invocations
  - Create CloudWatch dashboards for: request latency p50/p95/p99, error rate, token usage per minute, ECS CPU/memory
  - Add CloudWatch alarms for error rate > 1% and p99 latency > 2s
  - Write a k6 or Artillery load test script targeting `/api/chat/sessions/:id/messages` at 100 concurrent users; assert p95 < 3s
  - _Requirements: 22.3, 22.4, 22.5_

- [ ] 27. Final checkpoint — production ready
  - Ensure all tests pass, ask the user if questions arise.
  - Verify CI/CD pipeline deploys successfully to ECS
  - Confirm CloudWatch dashboards and alarms are active

---

## Notes

- Tasks marked with `*` are optional and can be skipped for a faster MVP
- Property tests use `fast-check` (TypeScript) and `hypothesis` (Python) as specified in the design
- Each task references specific requirements for traceability
- Checkpoints at end of each week ensure incremental validation
- The 5 property-based tests cover: text chunking (9.1), file indexing idempotency (9.2), memory window enforcement (17.1), workspace isolation (19.1), cost calculation (20.1), and LLM fallback exhaustion (20.2)
- All AWS deployment tasks (25–26) are coding tasks: writing task definitions, CI/CD YAML, and IaC configs
