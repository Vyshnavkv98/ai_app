import { prisma } from "../lib/prisma";
import { logger } from "../lib/logger";

interface ClerkEmailAddress {
  id: string;
  email_address: string;
}

export interface ClerkUserPayload {
  id: string;
  first_name?: string;
  last_name?: string;
  image_url?: string;
  primary_email_address_id?: string;
  email_addresses?: ClerkEmailAddress[];
}

export class AuthService {
  /**
   * Upsert a user record from a Clerk webhook payload.
   */
  async syncUserFromClerk(
    type: "user.created" | "user.updated",
    data: ClerkUserPayload
  ): Promise<void> {
    const primaryEmail = data.email_addresses?.find(
      (e) => e.id === data.primary_email_address_id
    )?.email_address;

    if (!primaryEmail) {
      logger.warn("Clerk webhook: user has no primary email", {
        clerkId: data.id,
      });
      return;
    }

    const name =
      [data.first_name, data.last_name].filter(Boolean).join(" ") || null;

    await prisma.user.upsert({
      where: { clerkId: data.id },
      update: { email: primaryEmail, name, avatarUrl: data.image_url ?? null },
      create: {
        clerkId: data.id,
        email: primaryEmail,
        name,
        avatarUrl: data.image_url ?? null,
      },
    });

    logger.info(`User synced from Clerk: ${primaryEmail} (${type})`);
  }

  /**
   * Delete a user record when Clerk fires user.deleted.
   */
  async deleteUserByClerkId(clerkId: string): Promise<void> {
    await prisma.user.deleteMany({ where: { clerkId } });
    logger.info(`User deleted via Clerk webhook: ${clerkId}`);
  }

  /**
   * Return the authenticated user's profile + workspace memberships.
   */
  async getMe(userId: string) {
    const user = await prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { id: true, email: true, name: true, avatarUrl: true },
    });

    const memberships = await prisma.workspaceMember.findMany({
      where: { userId },
      include: {
        workspace: {
          select: { id: true, name: true, slug: true, plan: true },
        },
      },
      orderBy: { joinedAt: "asc" },
    });

    return {
      user,
      workspaces: memberships.map((m) => ({
        id: m.workspace.id,
        name: m.workspace.name,
        slug: m.workspace.slug,
        plan: m.workspace.plan,
        role: m.role,
        joinedAt: m.joinedAt,
      })),
    };
  }
}

export const authService = new AuthService();
