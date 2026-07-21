import { Router, type IRouter } from "express";
import { eq, and, desc, count } from "drizzle-orm";
import { db, lotsTable } from "@workspace/db";
import { z } from "zod/v4";

const router: IRouter = Router();

// ── Helpers ──────────────────────────────────────────────────────────────────

const MS_PER_DAY = 86_400_000;
const LONG_TERM_DAYS = 365;

function holdingDays(acquisitionDate: Date, disposalDate?: Date | null): number {
  const to = disposalDate ?? new Date();
  return Math.floor((to.getTime() - acquisitionDate.getTime()) / MS_PER_DAY);
}

function serializeLot(lot: typeof lotsTable.$inferSelect) {
  const days = holdingDays(lot.acquisitionDate, lot.status === "open" || lot.status === "partial" ? null : lot.disposalDate);
  return {
    id: lot.id,
    position_record_id: lot.positionRecordId ?? null,
    wallet_id: lot.walletId,
    asset_symbol: lot.assetSymbol,
    asset_identifier: lot.assetIdentifier ?? null,
    chain_id: lot.chainId ?? null,
    quantity: lot.quantity,
    cost_basis_usd: lot.costBasisUsd ?? null,
    cost_basis_per_unit_usd: lot.costBasisPerUnitUsd ?? null,
    acquisition_date: lot.acquisitionDate.toISOString(),
    acquisition_tx_id: lot.acquisitionTxId ?? null,
    disposal_position_id: lot.disposalPositionId ?? null,
    disposal_date: lot.disposalDate?.toISOString() ?? null,
    disposal_proceeds_usd: lot.disposalProceedsUsd ?? null,
    realized_gain_loss_usd: lot.realizedGainLossUsd ?? null,
    status: lot.status,
    notes: lot.notes ?? null,
    created_at: lot.createdAt.toISOString(),
    // Computed fields
    holding_days: days,
    holding_period_type: days > LONG_TERM_DAYS ? "long_term" : "short_term",
    /**
     * unrealized_gain_loss_usd is always null — a price oracle is required.
     * Use the mark-to-market endpoint (future) or supply spot prices externally.
     */
    unrealized_gain_loss_usd: null as null,
  };
}

// ── Validation schemas ────────────────────────────────────────────────────────

const ListLotsQuery = z.object({
  wallet_id: z.string().optional(),
  asset_symbol: z.string().optional(),
  status: z.enum(["open", "closed", "partial"]).optional(),
  chain_id: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

const CreateLotBody = z.object({
  wallet_id: z.string().min(1),
  asset_symbol: z.string().min(1),
  asset_identifier: z.string().optional(),
  chain_id: z.string().uuid().optional(),
  quantity: z.number().positive(),
  cost_basis_usd: z.number().nonnegative().optional(),
  cost_basis_per_unit_usd: z.number().nonnegative().optional(),
  acquisition_date: z.string().datetime(),
  acquisition_tx_id: z.string().optional(),
  position_record_id: z.string().uuid().optional(),
  notes: z.string().optional(),
});

const PatchLotBody = z.object({
  status: z.enum(["open", "closed", "partial"]).optional(),
  quantity: z.number().positive().optional(),
  cost_basis_usd: z.number().nullable().optional(),
  disposal_position_id: z.string().uuid().nullable().optional(),
  disposal_date: z.string().datetime().nullable().optional(),
  disposal_proceeds_usd: z.number().nullable().optional(),
  realized_gain_loss_usd: z.number().nullable().optional(),
  notes: z.string().nullable().optional(),
});

// ── Routes ────────────────────────────────────────────────────────────────────

// GET /lots/summary — must be before /lots/:id to avoid param capture
router.get("/lots/summary", async (req, res): Promise<void> => {
  const wallet_id = typeof req.query.wallet_id === "string" ? req.query.wallet_id : undefined;
  const where = wallet_id ? eq(lotsTable.walletId, wallet_id) : undefined;

  const rows = await db.select().from(lotsTable).where(where);
  const now = Date.now();

  const open = rows.filter((r) => r.status === "open" || r.status === "partial");
  const closed = rows.filter((r) => r.status === "closed");

  // Build per-asset aggregates for open lots only
  const assetMap = new Map<string, {
    asset_symbol: string;
    open_lot_count: number;
    total_quantity: number;
    total_cost_basis_usd: number | null;
    short_term_lots: number;
    long_term_lots: number;
  }>();

  let totalBasis: number | null = null;
  let shortTermCount = 0;
  let longTermCount = 0;

  for (const lot of open) {
    const days = Math.floor((now - lot.acquisitionDate.getTime()) / MS_PER_DAY);
    if (days > LONG_TERM_DAYS) longTermCount++; else shortTermCount++;
    if (lot.costBasisUsd != null) totalBasis = (totalBasis ?? 0) + lot.costBasisUsd;

    let entry = assetMap.get(lot.assetSymbol);
    if (!entry) {
      entry = { asset_symbol: lot.assetSymbol, open_lot_count: 0, total_quantity: 0, total_cost_basis_usd: null, short_term_lots: 0, long_term_lots: 0 };
      assetMap.set(lot.assetSymbol, entry);
    }
    entry.open_lot_count++;
    entry.total_quantity += lot.quantity;
    if (lot.costBasisUsd != null) entry.total_cost_basis_usd = (entry.total_cost_basis_usd ?? 0) + lot.costBasisUsd;
    if (days > LONG_TERM_DAYS) entry.long_term_lots++; else entry.short_term_lots++;
  }

  res.json({
    generated_at: new Date().toISOString(),
    wallet_id: wallet_id ?? null,
    open_lot_count: open.length,
    closed_lot_count: closed.length,
    total_lot_count: rows.length,
    total_cost_basis_usd: totalBasis,
    short_term_lots: shortTermCount,
    long_term_lots: longTermCount,
    /**
     * unrealized_gain_loss_usd requires a price oracle and is not yet implemented.
     * The forward-looking analysis (which lots are underwater right now) requires
     * current market prices per asset — planned as a future enhancement.
     */
    unrealized_gain_loss_usd: null,
    by_asset: [...assetMap.values()].sort((a, b) => (b.total_cost_basis_usd ?? 0) - (a.total_cost_basis_usd ?? 0)),
  });
});

// GET /lots
router.get("/lots", async (req, res): Promise<void> => {
  const parsed = ListLotsQuery.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { wallet_id, asset_symbol, status, chain_id, limit, offset } = parsed.data;

  const conditions = [];
  if (wallet_id) conditions.push(eq(lotsTable.walletId, wallet_id));
  if (asset_symbol) conditions.push(eq(lotsTable.assetSymbol, asset_symbol.toUpperCase()));
  if (status) conditions.push(eq(lotsTable.status, status));
  if (chain_id) conditions.push(eq(lotsTable.chainId, chain_id));

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const [items, totalRows] = await Promise.all([
    db.select().from(lotsTable).where(where).orderBy(desc(lotsTable.acquisitionDate)).limit(limit).offset(offset),
    db.select({ count: count() }).from(lotsTable).where(where),
  ]);

  res.json({
    items: items.map(serializeLot),
    total: Number(totalRows[0].count),
    limit,
    offset,
  });
});

// POST /lots
router.post("/lots", async (req, res): Promise<void> => {
  const parsed = CreateLotBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const d = parsed.data;

  // Derive per-unit or total if only one side is provided
  let perUnit = d.cost_basis_per_unit_usd ?? null;
  let total = d.cost_basis_usd ?? null;
  if (total != null && perUnit == null) perUnit = total / d.quantity;
  if (perUnit != null && total == null) total = perUnit * d.quantity;

  const [lot] = await db
    .insert(lotsTable)
    .values({
      positionRecordId: d.position_record_id ?? null,
      walletId: d.wallet_id,
      assetSymbol: d.asset_symbol.toUpperCase(),
      assetIdentifier: d.asset_identifier ?? null,
      chainId: d.chain_id ?? null,
      quantity: d.quantity,
      costBasisUsd: total,
      costBasisPerUnitUsd: perUnit,
      acquisitionDate: new Date(d.acquisition_date),
      acquisitionTxId: d.acquisition_tx_id ?? null,
      notes: d.notes ?? null,
    })
    .returning();

  res.status(201).json(serializeLot(lot));
});

// GET /lots/:id
router.get("/lots/:id", async (req, res): Promise<void> => {
  const rows = await db.select().from(lotsTable).where(eq(lotsTable.id, req.params.id)).limit(1);
  if (rows.length === 0) {
    res.status(404).json({ error: "Lot not found" });
    return;
  }
  res.json(serializeLot(rows[0]));
});

// PATCH /lots/:id
router.patch("/lots/:id", async (req, res): Promise<void> => {
  const parsed = PatchLotBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const d = parsed.data;

  const existing = await db.select().from(lotsTable).where(eq(lotsTable.id, req.params.id)).limit(1);
  if (existing.length === 0) {
    res.status(404).json({ error: "Lot not found" });
    return;
  }

  // Build update object only from provided keys
  const updates: Partial<typeof lotsTable.$inferInsert> = {};
  if (d.status !== undefined) updates.status = d.status;
  if (d.quantity !== undefined) updates.quantity = d.quantity;
  if (d.cost_basis_usd !== undefined) updates.costBasisUsd = d.cost_basis_usd;
  if (d.disposal_position_id !== undefined) updates.disposalPositionId = d.disposal_position_id;
  if (d.disposal_date !== undefined) updates.disposalDate = d.disposal_date ? new Date(d.disposal_date) : null;
  if (d.disposal_proceeds_usd !== undefined) updates.disposalProceedsUsd = d.disposal_proceeds_usd;
  if (d.realized_gain_loss_usd !== undefined) updates.realizedGainLossUsd = d.realized_gain_loss_usd;
  if (d.notes !== undefined) updates.notes = d.notes;

  const [updated] = await db
    .update(lotsTable)
    .set(updates)
    .where(eq(lotsTable.id, req.params.id))
    .returning();

  res.json(serializeLot(updated));
});

export default router;
