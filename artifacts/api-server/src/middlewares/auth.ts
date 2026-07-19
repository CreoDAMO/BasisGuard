import { getAuth } from "@clerk/express";
import type { Request, Response, NextFunction } from "express";
import { db } from "@workspace/db";
import { usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";

// Augment Express Request so downstream handlers can read req.user
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: typeof usersTable.$inferSelect;
    }
  }
}

/**
 * Verifies the Clerk session, JIT-provisions a local user row on first visit,
 * and attaches it to req.user. Returns 401 if no valid session is present.
 */
export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const auth = getAuth(req);
  const clerkUserId = auth?.userId;

  if (!clerkUserId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  // Find existing local user
  const existing = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.clerkId, clerkUserId))
    .limit(1);

  if (existing.length > 0) {
    req.user = existing[0];
    next();
    return;
  }

  // JIT provision: first time this Clerk user hits the API
  const email = (auth.sessionClaims?.email as string | undefined) ?? "";
  const displayName = (auth.sessionClaims?.name as string | undefined) ?? null;
  const [created] = await db
    .insert(usersTable)
    .values({ clerkId: clerkUserId, email, displayName, role: "cpa_partner" })
    .returning();

  req.user = created;
  next();
}

/**
 * Enforces one of the given roles. Must be placed after requireAuth in the
 * middleware chain — it reads req.user which requireAuth populates.
 * Returns 403 if the user's role is not in the allowed list.
 */
export function requireRole(roles: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const role = req.user?.role;
    if (!role || !roles.includes(role)) {
      res.status(403).json({
        error: "Forbidden: insufficient role",
        required: roles,
        actual: role ?? null,
      });
      return;
    }
    next();
  };
}

export const ADMIN_ROLES = ["super_admin", "reviewer"] as const;
