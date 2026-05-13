import { z } from "zod";
import { prisma } from "../lib/prisma";
import { writeAuditLog } from "../lib/audit";
import { NotFoundError, AppError, ForbiddenError } from "../middleware/error";

const ROLE_HIERARCHY = ["VIEWER", "MEMBER", "ADMIN", "OWNER"] as const;
type Role = (typeof ROLE_HIERARCHY)[number];

export const UpdateRoleSchema = z.object({
  role: z.enum(["VIEWER", "MEMBER", "ADMIN", "OWNER"]),
});

export class AdminService {
  async listUsers(workspaceId: string) {
    const members = await prisma.workspaceMember.findMany({
      where: { workspaceId },
      include: {
        user: { select: { id: true, email: true, name: true, avatarUrl: true, createdAt: true } },
      },
      orderBy: { joinedAt: "asc" },
    });

    return members.map((m) => ({
      id: m.id,
      role: m.role,
      joinedAt: m.joinedAt,
      user: m.user,
    }));
  }

  async updateRole(
    targetUserId: string,
    newRole: Role,
    requestingUserId: string,
    workspaceId: string,
    ipAddress?: string
  ) {
    // Cannot change your own role
    if (targetUserId === requestingUserId) {
      throw new AppError(400, "Cannot change your own role", "SELF_ROLE_CHANGE");
    }

    // Get requesting user's role
    const requester = await prisma.workspaceMember.findUnique({
      where: { userId_workspaceId: { userId: requestingUserId, workspaceId } },
    });
    if (!requester) throw new NotFoundError("Workspace not found");

    // Cannot assign a role higher than your own
    const requesterLevel = ROLE_HIERARCHY.indexOf(requester.role as Role);
    const newRoleLevel = ROLE_HIERARCHY.indexOf(newRole);
    if (newRoleLevel >= requesterLevel) {
      throw new ForbiddenError("Cannot assign a role equal to or higher than your own");
    }

    // Cannot demote the workspace owner
    const target = await prisma.workspaceMember.findUnique({
      where: { userId_workspaceId: { userId: targetUserId, workspaceId } },
    });
    if (!target) throw new NotFoundError("User not found in workspace");
    if (target.role === "OWNER") {
      throw new ForbiddenError("Cannot change the workspace owner's role");
    }

    const updated = await prisma.workspaceMember.update({
      where: { userId_workspaceId: { userId: targetUserId, workspaceId } },
      data: { role: newRole },
      include: { user: { select: { id: true, email: true, name: true } } },
    });

    await writeAuditLog({
      action: "member.role_updated",
      resourceType: "workspace_member",
      resourceId: updated.id,
      userId: requestingUserId,
      workspaceId,
      metadata: { targetUserId, oldRole: target.role, newRole },
      ipAddress,
    });

    return { id: updated.id, role: updated.role, user: updated.user };
  }

  async getAuditLogs(
    workspaceId: string,
    params: { page?: number; limit?: number; action?: string }
  ) {
    const page = Math.max(1, params.page ?? 1);
    const limit = Math.min(100, params.limit ?? 20);
    const skip = (page - 1) * limit;

    const where = {
      workspaceId,
      ...(params.action && { action: { contains: params.action } }),
    };

    const [logs, total] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
        include: {
          user: { select: { id: true, email: true, name: true } },
        },
      }),
      prisma.auditLog.count({ where }),
    ]);

    return {
      data: logs,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async removeUser(
    targetUserId: string,
    requestingUserId: string,
    workspaceId: string,
    ipAddress?: string
  ) {
    if (targetUserId === requestingUserId) {
      throw new AppError(400, "Cannot remove yourself from workspace", "SELF_REMOVE");
    }

    const target = await prisma.workspaceMember.findUnique({
      where: { userId_workspaceId: { userId: targetUserId, workspaceId } },
    });
    if (!target) throw new NotFoundError("User not found in workspace");
    if (target.role === "OWNER") {
      throw new ForbiddenError("Cannot remove the workspace owner");
    }

    await prisma.workspaceMember.delete({
      where: { userId_workspaceId: { userId: targetUserId, workspaceId } },
    });

    await writeAuditLog({
      action: "member.removed",
      resourceType: "workspace_member",
      resourceId: targetUserId,
      userId: requestingUserId,
      workspaceId,
      metadata: { targetUserId, role: target.role },
      ipAddress,
    });
  }
}

export const adminService = new AdminService();
