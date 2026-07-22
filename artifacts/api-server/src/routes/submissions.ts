import { Router, type IRouter } from "express";
import { eq, desc, or } from "drizzle-orm";
import { db, chainSubmissionsTable, protocolSubmissionsTable, chainsTable, protocolsTable } from "@workspace/db";
import { requireRole, ADMIN_ROLES } from "../middlewares/auth.js";

const router: IRouter = Router();

function serializeChainSub(s: typeof chainSubmissionsTable.$inferSelect) {
  return {
    id: s.id,
    type: "chain" as const,
    submitted_by: s.submittedBy,
    submitter_credential: s.submitterCredential,
    name: s.name,
    slug: s.slug,
    is_l2: s.isL2,
    parent_chain_slug: s.parentChainSlug ?? null,
    rpc_url: s.rpcUrl ?? null,
    explorer_url: s.explorerUrl ?? null,
    native_token: s.nativeToken ?? null,
    status: s.status,
    reviewed_by: s.reviewedBy ?? null,
    reviewed_at: s.reviewedAt?.toISOString() ?? null,
    rejection_reason: s.rejectionReason ?? null,
    created_at: s.createdAt.toISOString(),
  };
}

function serializeProtocolSub(s: typeof protocolSubmissionsTable.$inferSelect) {
  return {
    id: s.id,
    type: "protocol" as const,
    submitted_by: s.submittedBy,
    submitter_credential: s.submitterCredential,
    chain_slug: s.chainSlug,
    name: s.name,
    slug: s.slug,
    contract_addresses: s.contractAddresses ?? {},
    adapter_version: s.adapterVersion ?? null,
    documentation_url: s.documentationUrl ?? null,
    notes: s.notes ?? null,
    status: s.status,
    reviewed_by: s.reviewedBy ?? null,
    reviewed_at: s.reviewedAt?.toISOString() ?? null,
    rejection_reason: s.rejectionReason ?? null,
    created_at: s.createdAt.toISOString(),
  };
}

// POST /submit/chain
router.post("/submit/chain", async (req, res): Promise<void> => {
  const { submitted_by, submitter_credential, name, slug, is_l2, parent_chain_slug, rpc_url, explorer_url, native_token } = req.body as Record<string, string | boolean | undefined>;
  if (!submitted_by || !submitter_credential || !name || !slug) {
    res.status(400).json({ error: "submitted_by, submitter_credential, name, and slug are required" });
    return;
  }
  const [sub] = await db.insert(chainSubmissionsTable).values({
    submittedBy: submitted_by as string,
    submitterCredential: submitter_credential as string,
    name: name as string,
    slug: slug as string,
    isL2: (is_l2 as boolean) ?? false,
    parentChainSlug: (parent_chain_slug as string) ?? null,
    rpcUrl: (rpc_url as string) ?? null,
    explorerUrl: (explorer_url as string) ?? null,
    nativeToken: (native_token as string) ?? null,
  }).returning();
  res.status(201).json(serializeChainSub(sub));
});

// POST /submit/protocol
router.post("/submit/protocol", async (req, res): Promise<void> => {
  const { submitted_by, submitter_credential, chain_slug, name, slug, contract_addresses, adapter_version, documentation_url, notes } = req.body as Record<string, unknown>;
  if (!submitted_by || !submitter_credential || !chain_slug || !name || !slug) {
    res.status(400).json({ error: "submitted_by, submitter_credential, chain_slug, name, and slug are required" });
    return;
  }
  const [sub] = await db.insert(protocolSubmissionsTable).values({
    submittedBy: submitted_by as string,
    submitterCredential: submitter_credential as string,
    chainSlug: chain_slug as string,
    name: name as string,
    slug: slug as string,
    contractAddresses: (contract_addresses as Record<string, unknown>) ?? {},
    adapterVersion: (adapter_version as string) ?? null,
    documentationUrl: (documentation_url as string) ?? null,
    notes: (notes as string) ?? null,
  }).returning();
  res.status(201).json(serializeProtocolSub(sub));
});

// GET /admin/submissions  — all pending, or filter by status/type
router.get("/admin/submissions", requireRole(ADMIN_ROLES), async (req, res): Promise<void> => {
  const status = (req.query.status as string) ?? "pending";
  const [chainSubs, protocolSubs] = await Promise.all([
    db.select().from(chainSubmissionsTable)
      .where(status === "all" ? undefined : eq(chainSubmissionsTable.status, status))
      .orderBy(desc(chainSubmissionsTable.createdAt)),
    db.select().from(protocolSubmissionsTable)
      .where(status === "all" ? undefined : eq(protocolSubmissionsTable.status, status))
      .orderBy(desc(protocolSubmissionsTable.createdAt)),
  ]);
  const all = [
    ...chainSubs.map(serializeChainSub),
    ...protocolSubs.map(serializeProtocolSub),
  ].sort((a, b) => b.created_at.localeCompare(a.created_at));
  res.json(all);
});

// PATCH /admin/submissions/chain/:id/approve
router.patch("/admin/submissions/chain/:id/approve", requireRole(ADMIN_ROLES), async (req, res): Promise<void> => {
  const id = req.params.id as string;
  const { reviewed_by } = req.body as { reviewed_by?: string };
  const [sub] = await db.select().from(chainSubmissionsTable).where(eq(chainSubmissionsTable.id, id));
  if (!sub) { res.status(404).json({ error: "Submission not found" }); return; }
  if (sub.status !== "pending") { res.status(409).json({ error: "Submission already reviewed" }); return; }

  // Resolve parent chain id if L2
  let parentChainId: string | null = null;
  if (sub.isL2 && sub.parentChainSlug) {
    const [parent] = await db.select().from(chainsTable).where(eq(chainsTable.slug, sub.parentChainSlug));
    parentChainId = parent?.id ?? null;
  }

  // 0h — wrap the 2-step write (insert chain + mark submission approved) in a
  // single transaction so a failure after chain insert cannot leave an orphaned
  // chain record with no corresponding approved submission.
  const { updated, newChain } = await db.transaction(async (tx) => {
    const [chain] = await tx.insert(chainsTable).values({
      name: sub.name,
      slug: sub.slug,
      isL2: sub.isL2,
      parentChainId,
      metadata: {
        rpc_url: sub.rpcUrl,
        explorer_url: sub.explorerUrl,
        native_token: sub.nativeToken,
      },
    }).returning();
    const [submission] = await tx.update(chainSubmissionsTable)
      .set({ status: "approved", reviewedBy: reviewed_by ?? "admin", reviewedAt: new Date() })
      .where(eq(chainSubmissionsTable.id, id))
      .returning();
    return { updated: submission, newChain: chain };
  });

  res.json({ submission: serializeChainSub(updated), created_chain_id: newChain.id });
});

// PATCH /admin/submissions/chain/:id/reject
router.patch("/admin/submissions/chain/:id/reject", requireRole(ADMIN_ROLES), async (req, res): Promise<void> => {
  const id = req.params.id as string;
  const { reviewed_by, rejection_reason } = req.body as { reviewed_by?: string; rejection_reason?: string };
  const [updated] = await db.update(chainSubmissionsTable)
    .set({ status: "rejected", reviewedBy: reviewed_by ?? "admin", reviewedAt: new Date(), rejectionReason: rejection_reason ?? null })
    .where(eq(chainSubmissionsTable.id, id))
    .returning();
  if (!updated) { res.status(404).json({ error: "Submission not found" }); return; }
  res.json(serializeChainSub(updated));
});

// PATCH /admin/submissions/protocol/:id/approve
router.patch("/admin/submissions/protocol/:id/approve", requireRole(ADMIN_ROLES), async (req, res): Promise<void> => {
  const id = req.params.id as string;
  const { reviewed_by } = req.body as { reviewed_by?: string };
  const [sub] = await db.select().from(protocolSubmissionsTable).where(eq(protocolSubmissionsTable.id, id));
  if (!sub) { res.status(404).json({ error: "Submission not found" }); return; }
  if (sub.status !== "pending") { res.status(409).json({ error: "Submission already reviewed" }); return; }

  // Resolve chain
  const [chain] = await db.select().from(chainsTable).where(eq(chainsTable.slug, sub.chainSlug));
  if (!chain) { res.status(400).json({ error: `Chain '${sub.chainSlug}' not found — add it first` }); return; }

  // 0h — wrap insert + update in a single transaction.
  const { updated, newProtocol } = await db.transaction(async (tx) => {
    const [protocol] = await tx.insert(protocolsTable).values({
      chainId: chain.id,
      name: sub.name,
      slug: sub.slug,
      contractAddresses: (sub.contractAddresses as Record<string, unknown>) ?? {},
      adapterVersion: sub.adapterVersion ?? null,
      metadata: { documentation_url: sub.documentationUrl },
    }).returning();
    const [submission] = await tx.update(protocolSubmissionsTable)
      .set({ status: "approved", reviewedBy: reviewed_by ?? "admin", reviewedAt: new Date() })
      .where(eq(protocolSubmissionsTable.id, id))
      .returning();
    return { updated: submission, newProtocol: protocol };
  });

  res.json({ submission: serializeProtocolSub(updated), created_protocol_id: newProtocol.id });
});

// PATCH /admin/submissions/protocol/:id/reject
router.patch("/admin/submissions/protocol/:id/reject", requireRole(ADMIN_ROLES), async (req, res): Promise<void> => {
  const id = req.params.id as string;
  const { reviewed_by, rejection_reason } = req.body as { reviewed_by?: string; rejection_reason?: string };
  const [updated] = await db.update(protocolSubmissionsTable)
    .set({ status: "rejected", reviewedBy: reviewed_by ?? "admin", reviewedAt: new Date(), rejectionReason: rejection_reason ?? null })
    .where(eq(protocolSubmissionsTable.id, id))
    .returning();
  if (!updated) { res.status(404).json({ error: "Submission not found" }); return; }
  res.json(serializeProtocolSub(updated));
});

export default router;
