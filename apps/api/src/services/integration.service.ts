import { randomBytes, createHmac } from "crypto";
import { prisma } from "../lib/prisma";
import { redis } from "../lib/redis";
import { encrypt, decrypt } from "../lib/encryption";
import { writeAuditLog } from "../lib/audit";
import { NotFoundError, AppError, ForbiddenError } from "../middleware/error";
import { logger } from "../lib/logger";

const OAUTH_STATE_TTL = 600; // 10 minutes

// ── Slack ────────────────────────────────────────────────────────────────────

export class IntegrationService {
  // ── List ──────────────────────────────────────────────────────────────────

  async list(workspaceId: string) {
    const integrations = await prisma.integration.findMany({
      where: { workspaceId },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        type: true,
        status: true,
        config: true,
        createdAt: true,
        updatedAt: true,
        // encryptedCreds is intentionally excluded
      },
    });
    return integrations;
  }

  // ── Slack OAuth ───────────────────────────────────────────────────────────

  async initiateSlackOAuth(workspaceId: string, userId: string): Promise<string> {
    const clientId = process.env.SLACK_CLIENT_ID;
    if (!clientId) throw new AppError(503, "Slack integration not configured", "CONFIG_ERROR");

    const state = randomBytes(16).toString("hex");
    await redis.setex(
      `oauth:state:${state}`,
      OAUTH_STATE_TTL,
      JSON.stringify({ workspaceId, userId, type: "SLACK" })
    );

    const redirectUri = `${process.env.API_BASE_URL}/api/integrations/slack/callback`;
    const scopes = "channels:history,channels:read,chat:write,users:read";
    return `https://slack.com/oauth/v2/authorize?client_id=${clientId}&scope=${scopes}&redirect_uri=${encodeURIComponent(redirectUri)}&state=${state}`;
  }

  async handleSlackCallback(
    code: string,
    state: string
  ): Promise<{ workspaceId: string }> {
    // Verify state
    const stateData = await redis.get(`oauth:state:${state}`);
    if (!stateData) throw new AppError(400, "Invalid or expired OAuth state", "INVALID_STATE");
    await redis.del(`oauth:state:${state}`);

    const { workspaceId, userId } = JSON.parse(stateData);

    // Exchange code for tokens
    const clientId = process.env.SLACK_CLIENT_ID!;
    const clientSecret = process.env.SLACK_CLIENT_SECRET!;
    const redirectUri = `${process.env.API_BASE_URL}/api/integrations/slack/callback`;

    const tokenRes = await fetch("https://slack.com/api/oauth.v2.access", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ code, client_id: clientId, client_secret: clientSecret, redirect_uri: redirectUri }),
    });
    const tokenData = await tokenRes.json() as any;
    if (!tokenData.ok) throw new AppError(400, `Slack OAuth failed: ${tokenData.error}`, "OAUTH_ERROR");

    // Encrypt credentials
    const creds = JSON.stringify({
      access_token: tokenData.access_token,
      bot_user_id: tokenData.bot_user_id,
      team_id: tokenData.team?.id,
    });
    const encryptedCreds = encrypt(creds);

    // Upsert integration
    await prisma.integration.upsert({
      where: {
        // Use a composite approach — find existing SLACK for workspace
        id: (await prisma.integration.findFirst({ where: { workspaceId, type: "SLACK" } }))?.id ?? "new",
      },
      update: { status: "CONNECTED", encryptedCreds, config: { teamName: tokenData.team?.name, teamId: tokenData.team?.id } },
      create: {
        type: "SLACK",
        status: "CONNECTED",
        encryptedCreds,
        config: { teamName: tokenData.team?.name, teamId: tokenData.team?.id },
        workspaceId,
        createdById: userId,
      },
    });

    await writeAuditLog({ action: "integration.connected", resourceType: "integration", resourceId: workspaceId, userId, workspaceId, metadata: { type: "SLACK" } });
    logger.info("Slack integration connected", { workspaceId });
    return { workspaceId };
  }

  async getSlackToken(workspaceId: string): Promise<string> {
    const integration = await prisma.integration.findFirst({
      where: { workspaceId, type: "SLACK", status: "CONNECTED" },
    });
    if (!integration) throw new NotFoundError("Slack integration not found");
    const creds = JSON.parse(decrypt(integration.encryptedCreds));
    return creds.access_token;
  }

  // ── Gmail OAuth ───────────────────────────────────────────────────────────

  async initiateGmailOAuth(workspaceId: string, userId: string): Promise<string> {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    if (!clientId) throw new AppError(503, "Gmail integration not configured", "CONFIG_ERROR");

    const state = randomBytes(16).toString("hex");
    await redis.setex(
      `oauth:state:${state}`,
      OAUTH_STATE_TTL,
      JSON.stringify({ workspaceId, userId, type: "GMAIL" })
    );

    const redirectUri = `${process.env.API_BASE_URL}/api/integrations/gmail/callback`;
    const scopes = "https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/gmail.send";
    return `https://accounts.google.com/o/oauth2/v2/auth?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=${encodeURIComponent(scopes)}&access_type=offline&prompt=consent&state=${state}`;
  }

  async handleGmailCallback(code: string, state: string): Promise<{ workspaceId: string }> {
    const stateData = await redis.get(`oauth:state:${state}`);
    if (!stateData) throw new AppError(400, "Invalid or expired OAuth state", "INVALID_STATE");
    await redis.del(`oauth:state:${state}`);

    const { workspaceId, userId } = JSON.parse(stateData);

    const clientId = process.env.GOOGLE_CLIENT_ID!;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET!;
    const redirectUri = `${process.env.API_BASE_URL}/api/integrations/gmail/callback`;

    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ code, client_id: clientId, client_secret: clientSecret, redirect_uri: redirectUri, grant_type: "authorization_code" }),
    });
    const tokenData = await tokenRes.json() as any;
    if (tokenData.error) throw new AppError(400, `Gmail OAuth failed: ${tokenData.error}`, "OAUTH_ERROR");

    const creds = JSON.stringify({
      access_token: tokenData.access_token,
      refresh_token: tokenData.refresh_token,
      expires_at: Date.now() + tokenData.expires_in * 1000,
    });
    const encryptedCreds = encrypt(creds);

    await prisma.integration.upsert({
      where: {
        id: (await prisma.integration.findFirst({ where: { workspaceId, type: "GMAIL" } }))?.id ?? "new",
      },
      update: { status: "CONNECTED", encryptedCreds, config: {} },
      create: { type: "GMAIL", status: "CONNECTED", encryptedCreds, config: {}, workspaceId, createdById: userId },
    });

    await writeAuditLog({ action: "integration.connected", resourceType: "integration", resourceId: workspaceId, userId, workspaceId, metadata: { type: "GMAIL" } });
    return { workspaceId };
  }

  async getGmailTokens(workspaceId: string): Promise<{ access_token: string; refresh_token: string }> {
    const integration = await prisma.integration.findFirst({
      where: { workspaceId, type: "GMAIL", status: "CONNECTED" },
    });
    if (!integration) throw new NotFoundError("Gmail integration not found");

    const creds = JSON.parse(decrypt(integration.encryptedCreds));

    // Refresh if expired
    if (creds.expires_at && Date.now() > creds.expires_at - 60_000) {
      try {
        const refreshRes = await fetch("https://oauth2.googleapis.com/token", {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            client_id: process.env.GOOGLE_CLIENT_ID!,
            client_secret: process.env.GOOGLE_CLIENT_SECRET!,
            refresh_token: creds.refresh_token,
            grant_type: "refresh_token",
          }),
        });
        const refreshData = await refreshRes.json() as any;
        if (!refreshData.error) {
          creds.access_token = refreshData.access_token;
          creds.expires_at = Date.now() + refreshData.expires_in * 1000;
          await prisma.integration.update({
            where: { id: integration.id },
            data: { encryptedCreds: encrypt(JSON.stringify(creds)) },
          });
        }
      } catch {
        await prisma.integration.update({ where: { id: integration.id }, data: { status: "ERROR" } });
        throw new AppError(401, "Gmail token refresh failed — please reconnect", "TOKEN_EXPIRED");
      }
    }

    return { access_token: creds.access_token, refresh_token: creds.refresh_token };
  }

  // ── Disconnect ────────────────────────────────────────────────────────────

  async disconnect(integrationId: string, userId: string, workspaceId: string, ipAddress?: string) {
    const integration = await prisma.integration.findFirst({
      where: { id: integrationId, workspaceId },
    });
    if (!integration) throw new NotFoundError("Integration not found");

    await prisma.integration.delete({ where: { id: integrationId } });
    await writeAuditLog({ action: "integration.disconnected", resourceType: "integration", resourceId: integrationId, userId, workspaceId, metadata: { type: integration.type }, ipAddress });
  }

  // ── Slack webhook helpers ─────────────────────────────────────────────────

  verifySlackSignature(body: string, timestamp: string, signature: string): boolean {
    const secret = process.env.SLACK_SIGNING_SECRET;
    if (!secret) return false;
    const sigBase = `v0:${timestamp}:${body}`;
    const expected = `v0=${createHmac("sha256", secret).update(sigBase).digest("hex")}`;
    return expected === signature;
  }
}

export const integrationService = new IntegrationService();
