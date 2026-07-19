import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth.js";

const router: IRouter = Router();

// GET /me — returns the authenticated user's profile and role
router.get("/me", requireAuth, (req, res) => {
  const u = req.user!;
  res.json({
    id: u.id,
    clerk_id: u.clerkId,
    email: u.email,
    display_name: u.displayName ?? null,
    role: u.role,
    credential: u.credential ?? null,
    created_at: u.createdAt.toISOString(),
  });
});

// PATCH /me — update display name or credential (self-service)
router.patch("/me", requireAuth, async (req, res): Promise<void> => {
  const { display_name, credential } = req.body as Record<string, string | undefined>;
  const [updated] = await db
    .update(usersTable)
    .set({
      ...(display_name !== undefined && { displayName: display_name }),
      ...(credential !== undefined && { credential }),
    })
    .where(eq(usersTable.id, req.user!.id))
    .returning();

  res.json({
    id: updated.id,
    clerk_id: updated.clerkId,
    email: updated.email,
    display_name: updated.displayName ?? null,
    role: updated.role,
    credential: updated.credential ?? null,
    created_at: updated.createdAt.toISOString(),
  });
});

export default router;
