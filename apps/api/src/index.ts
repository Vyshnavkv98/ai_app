import "express-async-errors";
import "dotenv/config";
import express from "express";
import helmet from "helmet";
import cors from "cors";
import { clerkAuth, requireAuth } from "./middleware/auth";
import { errorHandler } from "./middleware/error";
import { logger } from "./lib/logger";
import { startIndexingWorker } from "./lib/queue";

// Route imports
import authRouter from "./routes/auth";
import workspacesRouter from "./routes/workspaces";
import chatRouter from "./routes/chat";
import agentsRouter from "./routes/agents";
import filesRouter from "./routes/files";
import integrationsRouter from "./routes/integrations";
import workflowsRouter from "./routes/workflows";
import analyticsRouter from "./routes/analytics";
import adminRouter from "./routes/admin";
import webhooksRouter from "./routes/webhooks";
import internalRouter from "./routes/internal";

const app = express();
const PORT = process.env.PORT || 4000;

// ── Security & parsing ──────────────────────────────────────────────────────
app.use(helmet());
app.use(
  cors({
    origin: process.env.WEB_URL || "http://localhost:3000",
    credentials: true,
    methods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Workspace-Id"],
  })
);
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));

// ── Clerk SDK middleware (populates req.auth on every request) ──────────────
app.use(clerkAuth);

// ── Public routes (no JWT required) ────────────────────────────────────────
app.get("/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// Clerk webhook — signature-verified, not JWT-protected
app.use("/api/auth/webhook", authRouter);

// External webhooks (Slack, Gmail) — signature-verified per handler
app.use("/webhooks", webhooksRouter);

// Internal service-to-service routes (AI service → API)
app.use("/internal", internalRouter);

// ── Protected routes (JWT required) ────────────────────────────────────────
app.use(requireAuth);

app.use("/api/auth", authRouter);
app.use("/api/workspaces", workspacesRouter);
app.use("/api/chat", chatRouter);
app.use("/api/agents", agentsRouter);
app.use("/api/files", filesRouter);
app.use("/api/integrations", integrationsRouter);
app.use("/api/workflows", workflowsRouter);
app.use("/api/analytics", analyticsRouter);
app.use("/api/admin", adminRouter);

// ── Global error handler (must be last) ────────────────────────────────────
app.use(errorHandler);

app.listen(PORT, () => {
  logger.info(`Nexus AI — API server running on port ${PORT}`);
  // Start background workers
  startIndexingWorker();
  logger.info("File indexing worker started");
});

export default app;
