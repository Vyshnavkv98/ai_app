# Requirements Document

## Introduction

AI Operations Copilot is a production-grade, multi-tenant AI SaaS platform that enables businesses to connect their existing tools (Slack, Gmail, CRM, databases, documents) and deploy AI agents to automate workflows, answer questions, summarize data, and perform actions across those integrations.

The platform is built as a monorepo with a Next.js 15 frontend, Express.js backend API, Python FastAPI AI service, PostgreSQL + Redis data layer, and a vector database for RAG-powered memory. It supports multi-tenant workspaces, role-based access control, a visual agent builder, real-time streaming chat, file-based RAG pipelines, workflow automation triggers, usage analytics, and an extensible integration framework.

---

## Glossary

- **Platform**: The AI Operations Copilot system as a whole
- **Web_App**: The Next.js 15 frontend application
- **API**: The Express.js REST API backend service
- **AI_Service**: The Python FastAPI microservice handling LLM invocations, RAG, and agent orchestration
- **Workspace**: A multi-tenant isolation unit representing a single organization or team
- **User**: An authenticated individual with a Clerk identity, belonging to one or more Workspaces
- **Member**: A User who belongs to a Workspace with an assigned Role
- **Role**: A permission level assigned to a Member — one of Owner, Admin, Member, or Viewer
- **Agent**: A configured AI entity with a system prompt, model selection, tools, and memory settings
- **Chat_Session**: A conversation container holding an ordered sequence of Messages between a User and an Agent
- **Message**: A single turn in a Chat_Session, with a role (user, assistant, system, or tool) and content
- **Integration**: A connected external service (Slack, Gmail, etc.) with encrypted OAuth credentials scoped to a Workspace
- **Workflow**: An automation definition with a trigger type, ordered steps, and an optional associated Agent
- **Workflow_Execution**: A single run instance of a Workflow, with status, input, output, and timing
- **File**: An uploaded document stored in S3 and indexed into the vector database for RAG retrieval
- **RAG**: Retrieval-Augmented Generation — the process of retrieving relevant document chunks from the vector database and injecting them into the LLM prompt as context
- **LLM_Router**: The component responsible for routing LLM requests to providers and executing retry/fallback logic
- **Memory**: Conversation context stored in Redis (short-term, sliding window) and the vector database (long-term embeddings)
- **Audit_Log**: An immutable, append-only record of every mutating action performed in the Platform
- **Usage_Log**: A record of token consumption and USD cost for a single LLM invocation
- **Prompt_Template**: A reusable system prompt with named variable placeholders
- **MCP_Server**: A Model Context Protocol server providing additional tool capabilities to Agents
- **Supervisor_Agent**: The orchestrating Agent in a multi-agent workflow that routes tasks to Specialist_Agents
- **Specialist_Agent**: A focused Agent in a multi-agent workflow that handles a specific domain of tasks
- **Vector_DB**: The vector database (Pinecone or pgvector) used for similarity search during RAG retrieval
- **Bull_Queue**: The Redis-backed job queue used for asynchronous background tasks such as file indexing
- **Clerk**: The third-party authentication provider used for user identity and JWT issuance

---

## Requirements

### Requirement 1: User Authentication and Identity Sync

**User Story:** As a user, I want to sign in securely and have my identity synchronized with the platform, so that I can access my workspaces and data.

#### Acceptance Criteria

1. THE Web_App SHALL provide a Clerk-powered login page at `/login` for user authentication.
2. WHEN a user is created or updated in Clerk, THE API SHALL receive a webhook event and upsert the corresponding User record in PostgreSQL.
3. WHEN a request is received on a protected API endpoint, THE API SHALL validate the Clerk JWT and reject requests with invalid or expired tokens with a `401 Unauthorized` response.
4. WHEN a user authenticates successfully, THE Web_App SHALL redirect the user to `/dashboard`.
5. THE API SHALL expose a `GET /api/auth/me` endpoint that returns the authenticated user's profile and current Workspace membership.

---

### Requirement 2: Multi-Tenant Workspace Management

**User Story:** As a user, I want to create and manage workspaces, so that my team's data and agents are isolated from other organizations.

#### Acceptance Criteria

1. THE API SHALL allow authenticated users to create a Workspace with a unique slug via `POST /api/workspaces`.
2. WHEN a Workspace is created, THE API SHALL assign the creating User the Owner Role in that Workspace.
3. THE API SHALL enforce that all data queries (Agents, Files, Workflows, Integrations, Usage_Logs, Audit_Logs) are scoped to the requesting user's Workspace.
4. IF a user attempts to access a resource belonging to a different Workspace, THEN THE API SHALL return a `404 Not Found` response.
5. THE API SHALL allow Workspace settings to be updated via `PATCH /api/workspaces/:id` by users with the Admin or Owner Role.

---

### Requirement 3: Role-Based Access Control

**User Story:** As a workspace owner, I want to assign roles to team members, so that I can control who can perform sensitive actions.

#### Acceptance Criteria

1. THE Platform SHALL support four Roles in ascending permission order: Viewer, Member, Admin, and Owner.
2. WHEN a user with the Viewer Role attempts a mutating operation (create, update, delete), THE API SHALL return a `403 Forbidden` response.
3. WHEN a user with the Member Role attempts to manage Integrations or update user Roles, THE API SHALL return a `403 Forbidden` response.
4. THE API SHALL allow users with the Admin or Owner Role to update another Member's Role via `PATCH /api/admin/users/:id/role`.
5. THE API SHALL allow only the Owner Role to delete a Workspace.
6. WHILE a user holds the Viewer Role, THE Web_App SHALL render all mutating controls (create, edit, delete buttons) as disabled or hidden.

---

### Requirement 4: Dashboard UI

**User Story:** As a user, I want a dashboard overview of my workspace activity, so that I can quickly understand the state of my agents, integrations, and recent usage.

#### Acceptance Criteria

1. THE Web_App SHALL render a dashboard at `/dashboard` showing a summary of active Agents, connected Integrations, recent Chat_Sessions, and current-period token usage.
2. WHEN the dashboard is loaded, THE Web_App SHALL fetch and display data scoped to the authenticated user's active Workspace.
3. THE Web_App SHALL display a navigation sidebar providing links to Chat, Agents, Integrations, Analytics, and Settings pages.
4. THE Web_App SHALL update dashboard summary metrics without requiring a full page reload when the user switches between Workspaces.

---

### Requirement 5: AI Chat with Streaming

**User Story:** As a user, I want to chat with an AI agent and see responses appear in real time, so that I get a fast, interactive experience.

#### Acceptance Criteria

1. THE Web_App SHALL provide a chat interface at `/chat/[sessionId]` that renders Messages in chronological order.
2. WHEN a user sends a Message, THE API SHALL persist the user Message and forward the request to the AI_Service.
3. WHEN the AI_Service generates a response, THE API SHALL stream response tokens to the Web_App via Server-Sent Events (SSE).
4. THE Web_App SHALL render each received SSE token incrementally so the user sees text appearing in real time.
5. THE API SHALL allow users to create a new Chat_Session via `POST /api/chat/sessions` and retrieve message history via `GET /api/chat/sessions/:id/messages`.
6. WHEN a Chat_Session is associated with an Agent, THE AI_Service SHALL use that Agent's system prompt, model, and tool configuration for the response.
7. IF the user's Workspace has exceeded its monthly token quota, THEN THE API SHALL return `429 Too Many Requests` with a `resetAt` timestamp and SHALL NOT invoke the LLM.
8. THE AI_Service SHALL load the short-term Memory for the session from Redis before invoking the LLM, and update it after the response is complete.
9. WHEN a Message is persisted, THE API SHALL create a Usage_Log entry recording the model used, prompt tokens, completion tokens, and USD cost.

---

### Requirement 6: File Upload and RAG Pipeline

**User Story:** As a user, I want to upload documents and have the AI use them to answer questions, so that the AI has access to my organization's knowledge base.

#### Acceptance Criteria

1. THE API SHALL accept file uploads via `POST /api/files/upload`, store the file in S3, and enqueue an indexing job in the Bull_Queue.
2. WHEN a file upload is accepted, THE API SHALL return immediately with the `fileId` and set the File's `indexStatus` to `PENDING`.
3. WHEN the indexing job is processed, THE AI_Service SHALL download the file from S3, extract text, split it into overlapping chunks of 1000 characters with 200-character overlap, generate embeddings, and upsert the vectors into the Vector_DB scoped to the Workspace.
4. WHEN indexing completes successfully, THE API SHALL update the File's `indexStatus` to `INDEXED` and record the `chunkCount`.
5. IF indexing fails at any step, THEN THE API SHALL update the File's `indexStatus` to `FAILED` and log the error.
6. WHEN a user sends a Message to a RAG-enabled Agent, THE AI_Service SHALL perform a similarity search in the Vector_DB filtered by `workspaceId`, retrieve the top 5 relevant chunks, and inject them into the system prompt as context.
7. THE API SHALL allow users to delete a File via `DELETE /api/files/:id`, which SHALL remove the S3 object and all associated vector embeddings from the Vector_DB.
8. THE API SHALL allow users to list all Files in their Workspace via `GET /api/files`.
9. FOR ALL valid File objects, indexing a File and then re-indexing the same File SHALL produce the same `chunkCount` and SHALL upsert (not duplicate) vectors in the Vector_DB.

---

### Requirement 7: Slack Integration

**User Story:** As a workspace admin, I want to connect Slack to the platform, so that AI agents can read channel messages and post summaries automatically.

#### Acceptance Criteria

1. THE API SHALL initiate a Slack OAuth flow via `POST /api/integrations/slack/connect` and store the OAuth state token in Redis with a 10-minute TTL.
2. WHEN the Slack OAuth callback is received, THE API SHALL exchange the authorization code for access tokens, encrypt the tokens with AES-256-GCM, and persist the Integration record with `status: CONNECTED`.
3. WHEN a Slack event webhook is received at `POST /webhooks/slack`, THE API SHALL verify the Slack request signature before processing.
4. WHEN a verified Slack event is received, THE API SHALL acknowledge the webhook with `200 OK` immediately and enqueue the processing job asynchronously.
5. WHEN a Slack summarizer Workflow is triggered, THE AI_Service SHALL fetch the configured channel's recent messages via the Slack API, generate a summary using the associated Agent, and post the summary back to the designated Slack channel.
6. IF the Slack access token has expired, THEN THE API SHALL set the Integration `status` to `ERROR` and notify the user to re-authenticate.
7. THE API SHALL allow users with Admin or Owner Role to disconnect the Slack Integration via `DELETE /api/integrations/:id`.

---

### Requirement 8: Gmail Integration

**User Story:** As a workspace admin, I want to connect Gmail to the platform, so that AI agents can read incoming emails and generate draft replies automatically.

#### Acceptance Criteria

1. THE API SHALL initiate a Gmail OAuth flow via `POST /api/integrations/gmail/connect` and store the OAuth state token in Redis with a 10-minute TTL.
2. WHEN the Gmail OAuth callback is received, THE API SHALL exchange the authorization code for access and refresh tokens, encrypt them with AES-256-GCM, and persist the Integration record with `status: CONNECTED`.
3. WHEN a Gmail push notification webhook is received at `POST /webhooks/gmail`, THE API SHALL verify the Google Pub/Sub token before processing.
4. WHEN a verified Gmail notification is received, THE API SHALL fetch the full email content and forward it to the AI_Service for classification and draft reply generation.
5. WHEN the AI_Service generates a draft reply with confidence >= 0.85 and auto-reply is enabled for the Workflow, THE API SHALL send the reply via the Gmail Send API.
6. WHEN the AI_Service generates a draft reply with confidence < 0.85 or auto-reply is disabled, THE API SHALL save the draft and notify the user via an in-app notification for human review.
7. IF the Gmail access token has expired, THEN THE API SHALL attempt to refresh it using the stored refresh token before marking the Integration as `ERROR`.

---

### Requirement 9: AI Agent Builder

**User Story:** As a user, I want to visually configure AI agents with custom prompts, tools, and models, so that I can create specialized agents for different tasks.

#### Acceptance Criteria

1. THE Web_App SHALL provide a visual agent builder canvas at `/agents/[agentId]/build` using a drag-and-drop interface.
2. THE API SHALL allow users with Member Role or higher to create an Agent via `POST /api/agents` with a name, description, system prompt, model, tools, memory settings, and RAG settings.
3. WHEN an Agent is created, THE API SHALL validate the request against the `CreateAgentSchema` and return `400 Bad Request` for invalid inputs.
4. THE API SHALL allow users to test an Agent before deploying it by invoking it with a test message via `POST /api/agents/:id/invoke`.
5. THE API SHALL allow users to update an Agent's configuration via `PATCH /api/agents/:id`.
6. THE API SHALL allow users to delete an Agent via `DELETE /api/agents/:id`, which SHALL also disassociate the Agent from any active Workflows.
7. WHEN an Agent is created or updated, THE API SHALL write an Audit_Log entry with the action, resource ID, and user ID.
8. THE API SHALL enforce that an Agent's `workspaceId` cannot be changed after creation.
9. THE Web_App SHALL display a list of all Agents in the Workspace at `/agents`.

---

### Requirement 10: Workflow Automation

**User Story:** As a user, I want to define automated workflows with triggers and steps, so that AI agents can perform tasks on a schedule, in response to webhooks, or on demand.

#### Acceptance Criteria

1. THE API SHALL allow users to create a Workflow via `POST /api/workflows` with a name, trigger type (MANUAL, SCHEDULE, WEBHOOK, SLACK_MESSAGE, EMAIL_RECEIVED), trigger configuration, and ordered steps.
2. WHEN a SCHEDULE trigger Workflow is active, THE Platform SHALL invoke the Workflow according to the configured cron expression and timezone.
3. WHEN a WEBHOOK trigger Workflow is active and a matching webhook request is received, THE API SHALL invoke the Workflow with the request payload as input.
4. THE API SHALL allow users to manually trigger a Workflow via `POST /api/workflows/:id/trigger`.
5. WHEN a Workflow is triggered, THE API SHALL create a Workflow_Execution record with `status: RUNNING` and execute the steps asynchronously.
6. WHEN a Workflow_Execution completes successfully, THE API SHALL update the Workflow_Execution `status` to `SUCCESS` and record the output.
7. IF a Workflow_Execution exceeds 5 minutes, THEN THE API SHALL set the Workflow_Execution `status` to `FAILED` with error `"Execution timeout"` and release the Redis execution lock.
8. THE Platform SHALL enforce that at most one Workflow_Execution per Workflow is in `RUNNING` status at any time, using a Redis mutex lock.
9. THE API SHALL allow users to list Workflows and view Workflow_Execution history.
10. WHEN a Workflow is deactivated (`isActive: false`), THE Platform SHALL not trigger it on schedule or webhook events.

---

### Requirement 11: Usage Analytics Dashboard

**User Story:** As a workspace admin, I want to view token usage and cost analytics, so that I can monitor AI spending and optimize usage.

#### Acceptance Criteria

1. THE Web_App SHALL provide an analytics dashboard at `/analytics` displaying total token usage, total USD cost, and request count for the current billing period.
2. THE API SHALL expose `GET /api/analytics/usage` returning aggregated token and cost metrics filterable by date range for the authenticated Workspace.
3. THE API SHALL expose `GET /api/analytics/agents` returning per-Agent token usage and cost metrics.
4. THE Web_App SHALL render usage trends as time-series charts using a charting library.
5. THE API SHALL record a Usage_Log entry for every LLM invocation, capturing the model name, prompt tokens, completion tokens, total tokens, and USD cost.
6. WHEN calculating USD cost, THE AI_Service SHALL apply the formula: `cost = (promptTokens / 1000) * inputPricePerK + (completionTokens / 1000) * outputPricePerK` for the specific model used.
7. THE Platform SHALL ensure that `calculateCost` returns a non-negative value for all valid non-negative token counts and all supported models.
8. WHERE a fallback model was used instead of the originally requested model, THE Usage_Log SHALL record the actual model used.

---

### Requirement 12: Admin Settings and Audit Logs

**User Story:** As a workspace admin, I want to manage users and review an audit trail of all actions, so that I can maintain security and compliance.

#### Acceptance Criteria

1. THE Web_App SHALL provide an admin panel at `/admin` accessible only to users with the Admin or Owner Role.
2. THE API SHALL expose `GET /api/admin/users` returning all Members of the authenticated Workspace with their Roles.
3. THE API SHALL expose `GET /api/admin/audit-logs` returning paginated Audit_Log entries for the Workspace, ordered by `createdAt` descending.
4. WHEN any mutating API operation is performed (create, update, delete on any resource), THE API SHALL write an Audit_Log entry containing the action name, resource type, resource ID, user ID, workspace ID, IP address, and timestamp.
5. THE Audit_Log table SHALL be append-only; no Audit_Log entry SHALL be modified or deleted after creation.
6. IF a user with Viewer or Member Role attempts to access the admin panel endpoints, THEN THE API SHALL return `403 Forbidden`.

---

### Requirement 13: Multi-Agent Orchestration

**User Story:** As a user, I want to run complex tasks using multiple specialized AI agents coordinated by a supervisor, so that I can automate multi-step workflows that require different areas of expertise.

#### Acceptance Criteria

1. THE AI_Service SHALL support multi-agent workflows using a LangGraph StateGraph with at least one Supervisor_Agent and one or more Specialist_Agents.
2. WHEN a multi-agent workflow is invoked, THE Supervisor_Agent SHALL classify the task and route it to the appropriate Specialist_Agent.
3. WHEN a Specialist_Agent completes its subtask, THE AI_Service SHALL route the result back to the Supervisor_Agent for further routing or final response assembly.
4. THE AI_Service SHALL checkpoint LangGraph workflow state in Redis after each node execution to support resumability.
5. WHEN a multi-agent workflow is invoked via `POST /ai/agents/multi`, THE AI_Service SHALL return a WorkflowResult with a status of SUCCESS, PARTIAL, or FAILED.
6. THE AI_Service SHALL log a Usage_Log entry for every individual Agent invocation within a multi-agent workflow.

---

### Requirement 14: Memory System

**User Story:** As a user, I want the AI to remember context from our conversation and from past interactions, so that responses are coherent and personalized.

#### Acceptance Criteria

1. THE AI_Service SHALL maintain short-term Memory for each Chat_Session as a sliding window of the last 20 Messages stored in Redis with a 2-hour TTL.
2. WHEN a new Message turn is added to short-term Memory, THE AI_Service SHALL enforce that the Memory array never exceeds 20 entries by removing the oldest entries.
3. THE AI_Service SHALL include the short-term Memory in the messages array sent to the LLM on every invocation.
4. WHERE long-term memory is enabled for an Agent, THE AI_Service SHALL store significant conversation turns as vector embeddings in the Vector_DB for future retrieval.
5. THE API SHALL expose endpoints to retrieve, update, and clear session Memory via `GET /ai/memory/{session_id}`, `POST /ai/memory/{session_id}`, and `DELETE /ai/memory/{session_id}`.
6. FOR ALL session IDs, the short-term Memory length SHALL satisfy `memory.length <= 20` at all times.

---

### Requirement 15: LLM Router with Retry and Fallback

**User Story:** As a user, I want the platform to automatically recover from AI provider outages, so that my workflows continue without interruption.

#### Acceptance Criteria

1. THE LLM_Router SHALL accept a fallback chain of ordered AI models (e.g., GPT-4o → Claude-3.5-Sonnet → Gemini-1.5-Pro) and attempt each in order on failure.
2. WHEN the primary model returns a rate limit error, THE LLM_Router SHALL apply exponential backoff starting at 1 second with a maximum of 30 seconds before retrying or advancing to the next model.
3. WHEN a model is unavailable, THE LLM_Router SHALL advance to the next model in the fallback chain without delay.
4. WHEN a token limit error occurs, THE LLM_Router SHALL truncate the messages context to 80% of the model's context window and retry the same model.
5. WHEN a fallback model is used instead of the originally requested model, THE LLM_Router SHALL log a warning identifying the original and fallback models.
6. IF all models in the fallback chain fail, THEN THE LLM_Router SHALL throw an `AllModelsFailedError` containing the last error.
7. THE LLM_Router SHALL attempt every model in the fallback chain before throwing `AllModelsFailedError`.
8. THE AI_Service SHALL expose `GET /ai/models` listing available models and their connectivity status.

---

### Requirement 16: Prompt Templates

**User Story:** As a user, I want to create reusable prompt templates with variable placeholders, so that I can standardize AI instructions across multiple agents and workflows.

#### Acceptance Criteria

1. THE Platform SHALL support Prompt_Templates with named variable placeholders using `{{variableName}}` syntax.
2. WHEN an Agent is invoked, THE AI_Service SHALL render the Agent's system prompt by substituting all `{{variableName}}` placeholders with the provided variable values.
3. IF a required variable is missing during template rendering, THEN THE AI_Service SHALL return an error identifying the missing variable name.
4. THE API SHALL allow users to create, list, update, and delete Prompt_Templates scoped to their Workspace.

---

### Requirement 17: Structured JSON Outputs

**User Story:** As a developer, I want AI agents to return structured JSON responses, so that I can reliably parse and use the output in downstream systems.

#### Acceptance Criteria

1. WHERE an Agent is configured with a JSON output schema, THE AI_Service SHALL invoke the LLM using function calling or structured output mode to enforce the schema.
2. WHEN the LLM returns a structured response, THE AI_Service SHALL validate the output against the configured JSON schema before returning it.
3. IF the LLM output fails schema validation, THEN THE AI_Service SHALL retry the invocation up to 2 additional times before returning an error.
4. THE API SHALL allow Agent configurations to include an optional `outputSchema` field defining the expected JSON structure.

---

### Requirement 18: Cost Tracking Per User and Workspace

**User Story:** As a workspace admin, I want to track AI costs broken down by user and agent, so that I can allocate costs and enforce budgets.

#### Acceptance Criteria

1. THE Platform SHALL record a Usage_Log entry for every LLM invocation, associating it with the Workspace, the invoking User, and the Agent (if applicable).
2. THE API SHALL allow admins to query cost and token usage aggregated by User via `GET /api/analytics/usage?groupBy=user`.
3. THE API SHALL allow admins to query cost and token usage aggregated by Agent via `GET /api/analytics/agents`.
4. WHEN a Workspace's monthly token quota is exceeded, THE API SHALL reject further LLM invocations with `429 Too Many Requests` until the quota resets.
5. THE API SHALL return the quota reset timestamp in the `resetAt` field of the `429` response body.

---

### Requirement 19: Webhook Support

**User Story:** As a developer, I want to trigger workflows via inbound webhooks and receive outbound webhook notifications, so that I can integrate the platform with external systems.

#### Acceptance Criteria

1. THE Platform SHALL generate a unique inbound webhook URL for each Workflow configured with the WEBHOOK trigger type.
2. WHEN a POST request is received at a Workflow's webhook URL, THE API SHALL validate the request and enqueue the Workflow for execution with the request body as input.
3. THE API SHALL support outbound webhook steps in Workflow definitions that POST a JSON payload to a configured external URL.
4. WHEN an outbound webhook step is executed, THE Platform SHALL include a signature header for the receiving system to verify authenticity.
5. IF an outbound webhook request fails, THEN THE Platform SHALL retry up to 3 times with exponential backoff before marking the step as failed.

---

### Requirement 20: MCP Server Integrations

**User Story:** As a developer, I want to connect MCP servers to the platform, so that agents can use additional tools provided by external Model Context Protocol servers.

#### Acceptance Criteria

1. THE Platform SHALL support connecting external MCP servers to a Workspace, making their tools available to Agents.
2. WHEN an Agent is configured with an MCP server tool, THE AI_Service SHALL invoke the MCP server's tool endpoint during agent execution.
3. THE API SHALL allow users with Admin or Owner Role to add, configure, and remove MCP server connections for their Workspace.
4. IF an MCP server is unreachable during Agent execution, THEN THE AI_Service SHALL return an error identifying the unavailable tool and SHALL NOT silently skip the tool call.

---

### Requirement 21: Security and Credential Protection

**User Story:** As a platform operator, I want all sensitive credentials and user data to be protected, so that the platform meets enterprise security standards.

#### Acceptance Criteria

1. THE API SHALL encrypt all Integration OAuth tokens using AES-256-GCM before storing them in PostgreSQL, with the encryption key stored in AWS Secrets Manager.
2. THE API SHALL never include raw or encrypted OAuth credentials in any API response body.
3. THE API SHALL verify webhook signatures (Slack HMAC, Google Pub/Sub token, Clerk webhook secret) before processing any inbound webhook payload.
4. THE Platform SHALL store all LLM provider API keys (OpenAI, Anthropic, Google) in AWS Secrets Manager and inject them as environment variables at runtime.
5. THE API SHALL validate all user inputs using Zod schemas before processing, and SHALL use Prisma parameterized queries for all database operations.
6. THE Platform SHALL enforce HTTPS-only communication with HSTS headers on all responses.
7. THE API SHALL apply per-Workspace rate limiting of 100 requests per minute per endpoint, returning `429 Too Many Requests` when exceeded.
8. WHEN a user input is used in an Agent system prompt, THE AI_Service SHALL inject it as a separate user message and SHALL NOT interpolate it directly into the system prompt string.

---

### Requirement 22: Observability and Deployment

**User Story:** As a platform operator, I want the system to be deployable on AWS with CI/CD and observable via logs and metrics, so that I can operate it reliably in production.

#### Acceptance Criteria

1. THE Platform SHALL be deployable using Docker Compose for local development with services for Web_App, API, AI_Service, PostgreSQL, and Redis.
2. THE Platform SHALL be deployable to AWS using ECS Fargate for the Web_App, API, AI_Service, and background worker services.
3. THE API and AI_Service SHALL emit structured logs to AWS CloudWatch for all requests, errors, and LLM invocations.
4. THE Platform SHALL include a GitHub Actions CI/CD pipeline that runs all tests and deploys updated container images to ECS on merge to the `main` branch.
5. THE API and AI_Service SHALL be stateless so that ECS task counts can be scaled horizontally without coordination.
6. THE Platform SHALL use a PostgreSQL connection pool sized appropriately for the ECS task count, with PgBouncer for high-concurrency scenarios.
