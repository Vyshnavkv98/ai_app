import { Request, Response, NextFunction } from "express";
import { prisma } from "../lib/prisma";
import { getUser } from "./auth";
import { ForbiddenError, NotFoundError } from "./error";

// Role hierarchy — higher index = more permissions
const ROLE_HIERARCHY = ["VIEWER", "MEMBER", "ADMIN", "OWNER"] as const;
type Role = (typeof ROLE_HIERARCHY)[number];

function roleLevel(role: string): number {
  return ROLE_HIERARCHY.indexOf(role as Role);
}

/**
 * requireRole — middleware factory.
 * Checks that the authenticated user has at least `minRole` in the workspace
 * identified by req.params.workspaceId or res.locals.workspaceId.
 *
 * Also sets res.locals.workspaceId and res.locals.memberRole for downstream use.
 */
export function requireRole(minRole: Role) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const user = getUser(res);
    const workspaceId =
      (req.params.workspaceId as string) ||
      (res.locals.workspaceId as string) ||
      (req.body?.workspaceId as string);

    if (!workspaceId) {
      throw new NotFoundError("Workspace not found");
    }

    const member = await prisma.workspaceMember.findUnique({
      where: { userId_workspaceId: { userId: user.id, workspaceId } },
    });

    if (!member) {
      // Return 404 — don't reveal workspace existence to non-members
      throw new NotFoundError("Workspace not found");
    }

    if (roleLevel(member.role) < roleLevel(minRole)) {
      throw new ForbiddenError(
        `Requires ${minRole} role or higher`
      );
    }

    res.locals.workspaceId = workspaceId;
    res.locals.memberRole = member.role;
    next();
  };
}

/**
 * injectWorkspace — resolves the workspace from the authenticated user's
 * primary membership and injects workspaceId into res.locals.
 * Used on routes that don't have :workspaceId in the path.
 */
export async function injectWorkspace(
  req: Request,
  res: Response,
  next: NextFunction
) {
  const user = getUser(res);

  // Use x-workspace-id header or fall back to the user's first workspace
  const headerWorkspaceId = req.headers["x-workspace-id"] as string | undefined;

  let workspaceId: string;

  if (headerWorkspaceId) {
    const member = await prisma.workspaceMember.findUnique({
      where: {
        userId_workspaceId: { userId: user.id, workspaceId: headerWorkspaceId },
      },
    });
    if (!member) throw new NotFoundError("Workspace not found");
    workspaceId = headerWorkspaceId;
    res.locals.memberRole = member.role;
  } else {
    const member = await prisma.workspaceMember.findFirst({
      where: { userId: user.id },
      orderBy: { joinedAt: "asc" },
    });
    if (!member) throw new NotFoundError("No workspace found for this user");
    workspaceId = member.workspaceId;
    res.locals.memberRole = member.role;
  }

  res.locals.workspaceId = workspaceId;
  next();
}
