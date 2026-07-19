import { Router, type IRouter } from "express";
import { eq, desc } from "drizzle-orm";
import { db, chainsTable, protocolsTable } from "@workspace/db";

const router: IRouter = Router();

function serializeChain(c: typeof chainsTable.$inferSelect) {
  return {
    id: c.id,
    name: c.name,
    slug: c.slug,
    is_l2: c.isL2,
    parent_chain_id: c.parentChainId ?? null,
    metadata: c.metadata ?? {},
    created_at: c.createdAt.toISOString(),
  };
}

function serializeProtocol(p: typeof protocolsTable.$inferSelect) {
  return {
    id: p.id,
    chain_id: p.chainId,
    name: p.name,
    slug: p.slug,
    contract_addresses: p.contractAddresses ?? {},
    adapter_version: p.adapterVersion ?? null,
    metadata: p.metadata ?? {},
    created_at: p.createdAt.toISOString(),
  };
}

// GET /chains
router.get("/chains", async (_req, res): Promise<void> => {
  const rows = await db.select().from(chainsTable).orderBy(chainsTable.isL2, chainsTable.name);
  res.json(rows.map(serializeChain));
});

// POST /chains
router.post("/chains", async (req, res): Promise<void> => {
  const { name, slug, is_l2, parent_chain_id, metadata } = req.body as {
    name: string;
    slug: string;
    is_l2?: boolean;
    parent_chain_id?: string;
    metadata?: Record<string, unknown>;
  };
  if (!name || !slug) {
    res.status(400).json({ error: "name and slug are required" });
    return;
  }
  const [chain] = await db.insert(chainsTable).values({
    name,
    slug,
    isL2: is_l2 ?? false,
    parentChainId: parent_chain_id ?? null,
    metadata: metadata ?? {},
  }).returning();
  res.status(201).json(serializeChain(chain));
});

// GET /chains/:id
router.get("/chains/:id", async (req, res): Promise<void> => {
  const { id } = req.params;
  const [chain] = await db.select().from(chainsTable).where(eq(chainsTable.id, id));
  if (!chain) { res.status(404).json({ error: "Chain not found" }); return; }
  // Also return protocols for this chain
  const protocols = await db.select().from(protocolsTable).where(eq(protocolsTable.chainId, id));
  res.json({ ...serializeChain(chain), protocols: protocols.map(serializeProtocol) });
});

// ── Protocols ─────────────────────────────────────────────────────────────────

// GET /protocols
router.get("/protocols", async (req, res): Promise<void> => {
  const chainId = req.query.chain_id as string | undefined;
  const rows = chainId
    ? await db.select().from(protocolsTable).where(eq(protocolsTable.chainId, chainId)).orderBy(desc(protocolsTable.createdAt))
    : await db.select().from(protocolsTable).orderBy(desc(protocolsTable.createdAt));
  res.json(rows.map(serializeProtocol));
});

// POST /protocols
router.post("/protocols", async (req, res): Promise<void> => {
  const { chain_id, name, slug, contract_addresses, adapter_version, metadata } = req.body as {
    chain_id: string;
    name: string;
    slug: string;
    contract_addresses?: Record<string, unknown>;
    adapter_version?: string;
    metadata?: Record<string, unknown>;
  };
  if (!chain_id || !name || !slug) {
    res.status(400).json({ error: "chain_id, name and slug are required" });
    return;
  }
  const [chain] = await db.select().from(chainsTable).where(eq(chainsTable.id, chain_id));
  if (!chain) { res.status(404).json({ error: "Chain not found" }); return; }

  const [protocol] = await db.insert(protocolsTable).values({
    chainId: chain_id,
    name,
    slug,
    contractAddresses: contract_addresses ?? {},
    adapterVersion: adapter_version ?? null,
    metadata: metadata ?? {},
  }).returning();
  res.status(201).json(serializeProtocol(protocol));
});

// GET /protocols/:id
router.get("/protocols/:id", async (req, res): Promise<void> => {
  const { id } = req.params;
  const [protocol] = await db.select().from(protocolsTable).where(eq(protocolsTable.id, id));
  if (!protocol) { res.status(404).json({ error: "Protocol not found" }); return; }
  res.json(serializeProtocol(protocol));
});

export default router;
