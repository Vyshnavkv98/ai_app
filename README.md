# Nexus AI

> The central hub connecting your business tools with AI intelligence.

Nexus AI is a production-grade, multi-tenant AI SaaS platform. Connect Slack, Gmail, CRM, databases, and documents — then deploy AI agents to automate workflows, answer questions, summarize data, and take actions across your entire stack.

---

## Architecture

```
nexus-ai/
├── apps/
│   ├── web/          → Next.js 15  (frontend — UI only)
│   ├── api/          → Express.js  (REST API — business logic)
│   └── ai-service/   → FastAPI     (AI microservice — LLM, RAG, agents)
├── packages/
│   └── shared/       → TypeScript types, Zod schemas, constants
└── infrastructure/
    ├── docker/       → Dockerfiles per service
    └── docker-compose.yml
```

### Separation Contract

| Rule | Detail |
|------|--------|
| No cross-app imports | `apps/web` never imports from `apps/api` — HTTP only |
| Single API client | All frontend→backend calls go through `apps/web/src/lib/api-client.ts` |
| Single AI client | All backend→AI calls go through `apps/api/src/lib/ai-service.ts` |
| Shared = types only | `packages/shared` has zero runtime dependencies |
| RESTful | `GET` read · `POST` create/action · `PATCH` update · `DELETE` remove |
| Auth via JWT | `Authorization: Bearer <clerk_jwt>` on every protected request |

---

## REST API

```
POST   /api/auth/webhook              Clerk user sync (public, signature-verified)
GET    /api/auth/me                   Current user + workspaces

POST   /api/workspaces                Create workspace
GET    /api/workspaces                List user's workspaces
GET    /api/workspaces/:id            Get workspace + members
PATCH  /api/workspaces/:id            Update workspace (ADMIN+)
DELETE /api/workspaces/:id            Delete workspace (OWNER)

POST   /api/chat/sessions             Create chat session
GET    /api/chat/sessions             List sessions
POST   /api/chat/sessions/:id/messages   Send message → SSE stream
GET    /api/chat/sessions/:id/messages   Message history

POST   /api/agents                    Create agent (MEMBER+)
GET    /api/agents                    List agents
GET    /api/agents/:id                Get agent
PATCH  /api/agents/:id                Update agent (MEMBER+)
DELETE /api/agents/:id                Delete agent (ADMIN+)
POST   /api/agents/:id/invoke         Invoke agent directly

POST   /api/files/upload              Upload file → S3 + index
GET    /api/files                     List files
DELETE /api/files/:id                 Delete file + embeddings

GET    /api/integrations              List integrations
POST   /api/integrations/slack/connect   OAuth connect Slack (ADMIN+)
POST   /api/integrations/gmail/connect   OAuth connect Gmail (ADMIN+)
POST   /api/integrations/mcp          Add MCP server (ADMIN+)
DELETE /api/integrations/:id          Disconnect (ADMIN+)

POST   /api/workflows                 Create workflow
GET    /api/workflows                 List workflows
PATCH  /api/workflows/:id             Update workflow
POST   /api/workflows/:id/trigger     Manual trigger

GET    /api/analytics/usage           Token + cost usage
GET    /api/analytics/agents          Per-agent analytics

GET    /api/admin/users               List workspace members (ADMIN+)
PATCH  /api/admin/users/:id/role      Update role (OWNER)
GET    /api/admin/audit-logs          Audit trail (ADMIN+)

POST   /webhooks/slack                Slack events (signature-verified)
POST   /webhooks/gmail                Gmail push notifications (signature-verified)
```

---

## Local Development

```bash
# 1. Install dependencies
pnpm install

# 2. Configure environment
cp .env.example .env
# Fill in: CLERK_SECRET_KEY, OPENAI_API_KEY, PINECONE_API_KEY, etc.

# 3. Start infrastructure
docker compose -f infrastructure/docker-compose.yml up postgres redis -d

# 4. Run migrations and seed
pnpm --filter api db:migrate
pnpm --filter api db:seed

# 5. Start all services (3 terminals)
pnpm --filter web dev         # http://localhost:3000
pnpm --filter api dev         # http://localhost:4000
cd apps/ai-service && uvicorn main:app --reload --port 8000
```

---

## Key Environment Variables

| Variable | Service | Purpose |
|----------|---------|---------|
| `DATABASE_URL` | api | PostgreSQL connection |
| `REDIS_URL` | api, ai-service | Redis connection |
| `CLERK_SECRET_KEY` | api | Clerk JWT validation |
| `CLERK_WEBHOOK_SECRET` | api | Svix webhook verification |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | web | Clerk frontend key |
| `NEXT_PUBLIC_API_URL` | web | API base URL |
| `WEB_URL` | api | CORS allowed origin |
| `AI_SERVICE_URL` | api | FastAPI internal URL |
| `OPENAI_API_KEY` | ai-service | OpenAI |
| `ANTHROPIC_API_KEY` | ai-service | Claude |
| `GOOGLE_AI_API_KEY` | ai-service | Gemini |
| `PINECONE_API_KEY` | ai-service | Vector DB |
| `AWS_S3_BUCKET` | api | File storage |
| `ENCRYPTION_KEY` | api | AES-256 for OAuth tokens |

See `.env.example` for the full list.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 15, React 19, TypeScript, Tailwind CSS, shadcn/ui |
| Backend | Node.js, Express.js, TypeScript, Prisma ORM |
| AI Service | Python, FastAPI, LangChain, LangGraph |
| Database | PostgreSQL (pgvector), Redis |
| Vector DB | Pinecone |
| Auth | Clerk |
| Storage | AWS S3 |
| Deployment | Docker, AWS ECS, GitHub Actions |
