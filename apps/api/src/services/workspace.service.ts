import { z } from "zod";
import { prisma } from "../lib/prisma";
import { writeAuditLog } from "../lib/audit";
import { AppError, NotFoundError } from "../middleware/error";

// ── Validation schemas ──────────────────────────────────────────────────────

export const CreateWorkspaceSchema = z.object({
  name: z.string().min(1).max(100),
  slug: z
    .string()
    .min(1)
    .max(50)
    .regex(/^[a-z0-9-]+$/, "Slug must be lowercase alphanumeric with hyphens"),
});

export const UpdateWorkspaceSchema = z.object({
  name: z.string().min(1).max(100).optional(),
});

export type CreateWorkspaceInput = z.infer<typeof CreateWorkspaceSchema>;
export type UpdateWorkspaceInput = z.infer<typeof UpdateWorkspaceSchema>;

// ── Service ─────────────────────────────────────────────────────────────────

export class WorkspaceService {
  async create(
    input: CreateWorkspaceInput,
    userId: string,
    ipAddress?: string
  ) {
    const existing = await prisma.workspace.findUnique({
      where: { slug: input.slug },
    });
    if (existing) {
      throw new AppError(409, "Slug already taken", "SLUG_CONFLICT");
    }

    const workspace = await prisma.$transaction(async (tx) => {
      const ws = await tx.workspace.create({
        data: { name: input.name, slug: input.slug },
      });
      await tx.workspaceMember.create({
        data: { userId, workspaceId: ws.id, role: "OWNER" },
      });
      return ws;
    });

    await writeAuditLog({
      action: "workspace.created",
      resourceType: "workspace",
      resourceId: workspace.id,
      userId,
      workspaceId: workspace.id,
      metadata: { name: workspace.name, slug: workspace.slug },
      ipAddress,
    });

    return workspace;
  }

  async findById(workspaceId: string) {
    const workspace = await prisma.workspace.findUnique({
      where: { id: workspaceId },
      include: {
        members: {
          include: {
            user: {
              select: { id: true, email: true, name: true, avatarUrl: true },
            },
          },
          orderBy: { joinedAt: "asc" },
        },
      },
    });

    if (!workspace) throw new NotFoundError("Workspace not found");
    return workspace;
  }

  async update(
    workspaceId: string,
    input: UpdateWorkspaceInput,
    userId: string,
    ipAddress?: string
  ) {
    const workspace = await prisma.workspace.update({
      where: { id: workspaceId },
      data: { ...(input.name && { name: input.name }) },
    });

    await writeAuditLog({
      action: "workspace.updated",
      resourceType: "workspace",
      resourceId: workspaceId,
      userId,
      workspaceId,
      metadata: input,
      ipAddress,
    });

    return workspace;
  }

  async delete(workspaceId: string, userId: string, ipAddress?: string) {
    await prisma.workspace.delete({ where: { id: workspaceId } });

    await writeAuditLog({
      action: "workspace.deleted",
      resourceType: "workspace",
      resourceId: workspaceId,
      userId,
      workspaceId,
      ipAddress,
    });
  }

  async listForUser(userId: string) {
    const memberships = await prisma.workspaceMember.findMany({
      where: { userId },
      include: {
        workspace: {
          select: {
            id: true,
            name: true,
            slug: true,
            plan: true,
            createdAt: true,
          },
        },
      },
      orderBy: { joinedAt: "asc" },
    });

    return memberships.map((m) => ({
      ...m.workspace,
      role: m.role,
      joinedAt: m.joinedAt,
    }));
  }
}

export const workspaceService = new WorkspaceService();
