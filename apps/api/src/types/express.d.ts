import { User } from "@prisma/client";

// Augment Express res.locals with typed properties set by middleware
declare global {
  namespace Express {
    interface Locals {
      user: Pick<User, "id" | "clerkId" | "email" | "name" | "avatarUrl">;
      workspaceId: string;
      memberRole: "OWNER" | "ADMIN" | "MEMBER" | "VIEWER";
    }
  }
}
