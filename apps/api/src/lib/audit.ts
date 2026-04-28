import { prisma } from "./prisma";
import { logger } from "./logger";

interface AuditParams {
  action: string;          // e.g. "workspace.created", "agent.deleted"
  resourceType: string;    // e.g. "workspace", "agent"
  resourceId: string;
  userId: string;
  workspaceId: string;
  metadata?: Record<string, unknown>;
  ipAddress?: string;
}

/**
 * writeAuditLog — append-only audit trail entry.
 * Never throws — audit failures are logged but don't break the request.
 */
export async function writeAuditLog(params: AuditParams): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        action: params.action,
        resourceType: params.resourceType,
        resourceId: params.resourceId,
        userId: params.userId,
        workspaceId: params.workspaceId,
        metadata: params.metadata ?? {},
        ipAddress: params.ipAddress,
      },
    });
  } catch (err) {
    // Audit log failure must never break the main request
    logger.error("Failed to write audit log", {
      error: (err as Error).message,
      params,
    });
  }
}
