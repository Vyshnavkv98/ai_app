# AI Operations Copilot

Production-grade AI SaaS platform — monorepo with strict frontend/backend separation.

## Architecture

```
apps/
  web/          → Next.js 15 (frontend only — no server logic)
  api/          → Express.js REST API (backend only — no UI code)
  ai-service/   → Python FastAPI (AI/ML microservice)
packages/
  shared/       → Types, Zod schemas, constants ONLY (no runtime deps)
infrastructure/
  docker/       → Dockerfiles per service
  docker-compose.yml
```

## Separation Rules

| Rule | Detail |
|------|--------|
| **No cross-app imports** | `apps/web` never imports from `apps/api` or vice versa |
| **REST only** | Frontend communicates with backend exclusively via HTTP through `apps/web/src/lib/api-client.ts` |
| **Shared = types only** | `packages/shared` contains TypeScript types, Zod schemas, and pricing constants — no Express, no Next.js, no runtime side effects |
| **RESTful conventions** | `GET` list/read · `POST` create/action · `PATCH` partial update · `DELETE` remove |
| **JSON responses** | All API responses are `{ data }` on success or `{ error, code }` on failure |
| **Auth via JWT** | Frontend sends `Authorization: Bearer <clerk_jwt>` on every request; API validates with `@clerk/express` |

## REST API Contract

```
GET    /api/auth/me
POST   /api/auth/webhook

POST   /api/workspaces
GET    /api/workspaces/:id
PATCH  /api/workspaces/:id

POST   /api/chat/sessions
GET    /api/chat/sessions
POST   /api/chat/sessions/:id/messages   ← SSE stream
GET    /api/chat/sessions/:id/messages

POST   /api/agents
GET    /api/agents
GET    /api/agents/:id
PATCH  /api/agents/:id
DELETE /api/agents/:id
POST   /api/agents/:id/invoke

POST   /api/files/upload
GET    /api/files
DELETE /api/files/:id

GET    /api/integrations
POST   /api/integrations/slack/connect
POST   /api/integrations/gmail/connect
DELETE /api/integrations/:id

POST   /api/workflows
GET    /api/workflows
PATCH  /api/workflows/:id
POST   /api/workflows/:id/trigger

GET    /api/analytics/usage
GET    /api/analytics/agents

GET    /api/admin/users
PATCH  /api/admin/users/:id/role
GET    /api/admin/audit-logs

POST   /webhooks/slack
POST   /webhooks/gmail
```

## Local Development

```bash
# 1. Install deps
pnpm install

# 2. Copy and fill env vars
cp .env.example .env

# 3. Start infrastructure
docker compose -f infrastructure/docker-compose.yml up postgres redis -d

# 4. Run DB migrations + seed
pnpm --filter api db:migrate
pnpm --filter api db:seed

# 5. Start all services (separate terminals)
pnpm --filter web dev       # → http://localhost:3000
pnpm --filter api dev       # → http://localhost:4000
pnpm --filter ai-service dev  # → http://localhost:8000
```

## Environment Variables

See `.env.example` for the full list. Key vars:

| Var | Used by |
|-----|---------|
| `DATABASE_URL` | api |
| `REDIS_URL` | api, ai-service |
| `CLERK_SECRET_KEY` | api |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | web |
| `OPENAI_API_KEY` | ai-service |
| `ANTHROPIC_API_KEY` | ai-service |
| `PINECONE_API_KEY` | ai-service |
| `AWS_S3_BUCKET` | api |
| `ENCRYPTION_KEY` | api (AES-256 for OAuth tokens) |
| `AI_SERVICE_URL` | api (internal service URL) |
| `NEXT_PUBLIC_API_URL` | web (public API base URL) |
