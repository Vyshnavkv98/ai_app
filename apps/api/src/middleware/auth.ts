import { Request, Response, NextFunction } from "express";
import { clerkMiddleware, getAuth } from "@clerk/express";
import { prisma } from "../lib/prisma";
import { UnauthorizedError } from "./error";

// Apply Clerk's SDK middleware globally — populates req.auth on every request
export const clerkAuth = clerkMiddleware();

/**
 * requireAuth — must come after clerkAuth in the middleware chain.
 * Rejects requests with no valid Clerk JWT.
 * Attaches the resolved DB user to res.locals.user for downstream handlers.
 */
export async function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction
) {
  const { userId } = getAuth(req);
  if (!userId) {
    throw new UnauthorizedError("Authentication required");
  }

  // Load the DB user (synced from Clerk via webhook)
  const user = await prisma.user.findUnique({ where: { clerkId: userId } });
  if (!user) {
    // User exists in Clerk but not yet synced — return 401 so client retries
    throw new UnauthorizedError("User not found — please try again");
  }

  res.locals.user = user;
  next();
}

/**
 * Helper to get the authenticated user from res.locals (set by requireAuth).
 * Throws if called outside an authenticated route.
 */
export function getUser(res: Response) {
  const user = res.locals.user as {
    id: string;
    clerkId: string;
    email: string;
    name: string | null;
    avatarUrl: string | null;
  };
  if (!user) throw new UnauthorizedError("No authenticated user");
  return user;
}
