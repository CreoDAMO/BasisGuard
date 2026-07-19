import { Router, type IRouter } from "express";
import { eq, ilike, and } from "drizzle-orm";
import { db, authorityCitationsTable } from "@workspace/db";
import {
  CreateCitationBody,
  UpdateCitationBody,
  GetCitationParams,
  UpdateCitationParams,
  DeleteCitationParams,
  ListCitationsQueryParams,
} from "@workspace/api-zod";

const router: IRouter = Router();

function serializeCitation(c: typeof authorityCitationsTable.$inferSelect) {
  return {
    id: c.id,
    type: c.type,
    reference: c.reference,
    summary: c.summary,
    url: c.url ?? null,
    authority_strength: c.authorityStrength,
    created_at: c.createdAt.toISOString(),
  };
}

// GET /citations
router.get("/citations", async (req, res): Promise<void> => {
  const parsed = ListCitationsQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { type, authority_strength, q } = parsed.data;

  const conditions = [];
  if (type) conditions.push(eq(authorityCitationsTable.type, type));
  if (authority_strength) conditions.push(eq(authorityCitationsTable.authorityStrength, authority_strength));
  if (q) conditions.push(ilike(authorityCitationsTable.reference, `%${q}%`));

  const items = await db.select().from(authorityCitationsTable)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(authorityCitationsTable.createdAt);

  res.json(items.map(serializeCitation));
});

// POST /citations
router.post("/citations", async (req, res): Promise<void> => {
  const parsed = CreateCitationBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [citation] = await db.insert(authorityCitationsTable).values({
    type: parsed.data.type,
    reference: parsed.data.reference,
    summary: parsed.data.summary,
    url: parsed.data.url ?? null,
    authorityStrength: parsed.data.authority_strength,
  }).returning();

  res.status(201).json(serializeCitation(citation));
});

// GET /citations/:id
router.get("/citations/:id", async (req, res): Promise<void> => {
  const params = GetCitationParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [citation] = await db.select().from(authorityCitationsTable).where(eq(authorityCitationsTable.id, params.data.id));
  if (!citation) {
    res.status(404).json({ error: "Citation not found" });
    return;
  }

  res.json(serializeCitation(citation));
});

// PATCH /citations/:id
router.patch("/citations/:id", async (req, res): Promise<void> => {
  const params = UpdateCitationParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = UpdateCitationBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [citation] = await db.update(authorityCitationsTable)
    .set({
      ...(parsed.data.type && { type: parsed.data.type }),
      ...(parsed.data.reference && { reference: parsed.data.reference }),
      ...(parsed.data.summary && { summary: parsed.data.summary }),
      ...(parsed.data.url !== undefined && { url: parsed.data.url }),
      ...(parsed.data.authority_strength && { authorityStrength: parsed.data.authority_strength }),
    })
    .where(eq(authorityCitationsTable.id, params.data.id))
    .returning();

  if (!citation) {
    res.status(404).json({ error: "Citation not found" });
    return;
  }

  res.json(serializeCitation(citation));
});

// DELETE /citations/:id
router.delete("/citations/:id", async (req, res): Promise<void> => {
  const params = DeleteCitationParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [deleted] = await db.delete(authorityCitationsTable).where(eq(authorityCitationsTable.id, params.data.id)).returning();
  if (!deleted) {
    res.status(404).json({ error: "Citation not found" });
    return;
  }

  res.sendStatus(204);
});

export default router;
