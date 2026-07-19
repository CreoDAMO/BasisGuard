import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, treatmentProfilesTable, positionRecordsTable } from "@workspace/db";
import {
  CreateProfileBody,
  UpdateProfileBody,
  GetProfileParams,
  UpdateProfileParams,
  GetProfileDeltaParams,
  ListProfilesQueryParams,
} from "@workspace/api-zod";

const router: IRouter = Router();

function serializeProfile(p: typeof treatmentProfilesTable.$inferSelect) {
  return {
    id: p.id,
    name: p.name,
    status: p.status,
    rules: (p.rules as unknown[]) ?? [],
    changelog: p.changelog ?? null,
    created_at: p.createdAt.toISOString(),
  };
}

// GET /profiles
router.get("/profiles", async (req, res): Promise<void> => {
  const parsed = ListProfilesQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const items = await db.select().from(treatmentProfilesTable)
    .where(parsed.data.status ? eq(treatmentProfilesTable.status, parsed.data.status) : undefined)
    .orderBy(treatmentProfilesTable.createdAt);

  res.json(items.map(serializeProfile));
});

// POST /profiles
router.post("/profiles", async (req, res): Promise<void> => {
  const parsed = CreateProfileBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [profile] = await db.insert(treatmentProfilesTable).values({
    name: parsed.data.name,
    status: parsed.data.status,
    rules: parsed.data.rules as unknown as object,
    changelog: parsed.data.changelog ?? null,
  }).returning();

  res.status(201).json(serializeProfile(profile));
});

// GET /profiles/:id
router.get("/profiles/:id", async (req, res): Promise<void> => {
  const params = GetProfileParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [profile] = await db.select().from(treatmentProfilesTable).where(eq(treatmentProfilesTable.id, params.data.id));
  if (!profile) {
    res.status(404).json({ error: "Profile not found" });
    return;
  }

  res.json(serializeProfile(profile));
});

// PATCH /profiles/:id
router.patch("/profiles/:id", async (req, res): Promise<void> => {
  const params = UpdateProfileParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = UpdateProfileBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [profile] = await db.update(treatmentProfilesTable)
    .set({
      ...(parsed.data.name !== undefined && { name: parsed.data.name }),
      ...(parsed.data.status !== undefined && { status: parsed.data.status }),
      ...(parsed.data.rules !== undefined && { rules: parsed.data.rules as unknown as object }),
      ...(parsed.data.changelog !== undefined && { changelog: parsed.data.changelog }),
    })
    .where(eq(treatmentProfilesTable.id, params.data.id))
    .returning();

  if (!profile) {
    res.status(404).json({ error: "Profile not found" });
    return;
  }

  res.json(serializeProfile(profile));
});

// GET /profiles/:id/delta
router.get("/profiles/:id/delta", async (req, res): Promise<void> => {
  const params = GetProfileDeltaParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [profile] = await db.select().from(treatmentProfilesTable).where(eq(treatmentProfilesTable.id, params.data.id));
  if (!profile) {
    res.status(404).json({ error: "Profile not found" });
    return;
  }

  const rules = (profile.rules as Array<{ event_type: string; classification: string; tier: string }>) ?? [];

  // Get all positions currently under OTHER profiles that would change
  const allPositions = await db.select().from(positionRecordsTable);

  const changedPositions = allPositions.flatMap((pos) => {
    const matchingRule = rules.find((r) => r.event_type === pos.eventType);
    if (!matchingRule) return [];
    if (matchingRule.classification === pos.classification && matchingRule.tier === pos.tier) return [];

    return [{
      position_id: pos.id,
      tx_id: pos.txId ?? "",
      event_type: pos.eventType,
      before_classification: pos.classification,
      after_classification: matchingRule.classification,
      before_tier: pos.tier,
      after_tier: matchingRule.tier,
    }];
  });

  res.json({
    profile_id: profile.id,
    profile_name: profile.name,
    changed_positions: changedPositions,
    total_changed: changedPositions.length,
  });
});

export default router;
