import { Router, type IRouter } from "express";
import { eq, and, desc, count, isNull } from "drizzle-orm";
import { db, lotsTable, lotIdentificationsTable } from "@workspace/db";
import { requireRole, ADMIN_ROLES } from "../middlewares/auth.js";
import { getBatchPrices } from "../core/priceOracle.js";
import { remainingCostBasisUsd } from "../core/lotMatching.js";
import { z } from "zod";

// ── Validation schemas (strict — tighter than generated OpenAPI schemas) ─────

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

const router: IRouter = Router();

// ── Helpers ──────────────────────────────────────────────────────────────────

const MS_PER_DAY = 86_400_000;
const LONG_TERM_DAYS = 365;

function holdingDays(acquisitionDate: Date, disposalDate?: Date | null): number {
  const to = disposalDate ?? new Date();
  return Math.floor((to.getTime() - acquisitionDate.getTime()) / MS_PER_DAY);
}

/**
 * Serialize a lot record.  When `currentPriceUsd` is supplied (from the
 * price oracle), `current_price_usd` and `unrealized_gain_loss_usd` are
 * populated for open/partial lots; closed lots always return null for both.
 */
function serializeLot(
  lot: typeof lotsTable.$inferSelect,
  currentPriceUsd: number | null = null,
) {
  const isOpen = lot.status === "open" || lot.status === "partial";
  const days = holdingDays(lot.acquisitionDate, isOpen ? null : lot.disposalDate);

  // Unrealized G/L against remaining basis (per-unit × remaining qty).
  const remainingBasis = remainingCostBasisUsd(lot);
  const unrealizedGainLossUsd =
    isOpen && remainingBasis != null && currentPriceUsd != null
      ? currentPriceUsd * lot.quantity - remainingBasis
      : null;

  return {
    id: lot.id,
    position_record_id: lot.positionRecordId ?? null,
    wallet_id: lot.walletId,
    asset_symbol: lot.assetSymbol,
    asset_identifier: lot.assetIdentifier ?? null,
    chain_id: lot.chainId ?? null,
    quantity: lot.quantity,
    cost_basis_usd: remainingBasis,
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
    current_price_usd: isOpen ? currentPriceUsd : null,
    unrealized_gain_loss_usd: unrealizedGainLossUsd,
  };
}

// ── Routes ────────────────────────────────────────────────────────────────────

// GET /lots/summary — must be before /lots/:id to avoid param capture
router.get("/lots/summary", async (req, res): Promise<void> => {
  const wallet_id = typeof req.query.wallet_id === "string" ? req.query.wallet_id : undefined;
  const where = wallet_id ? eq(lotsTable.walletId, wallet_id) : undefined;

  const rows = await db.select().from(lotsTable).where(where);
  const now = Date.now();

  const open = rows.filter((r) => r.status === "open" || r.status === "partial");
  const closed = rows.filter((r) => r.status === "closed");

  // Batch-fetch current prices for all open-lot assets in one CoinGecko call
  const openSymbols = [...new Set(open.map((l) => l.assetSymbol))];
  const prices = openSymbols.length > 0 ? await getBatchPrices(openSymbols) : {};

  // Build per-asset aggregates for open lots only
  const assetMap = new Map<string, {
    asset_symbol: string;
    open_lot_count: number;
    total_quantity: number;
    total_cost_basis_usd: number | null;
    current_value_usd: number | null;
    unrealized_gain_loss_usd: number | null;
    short_term_lots: number;
    long_term_lots: number;
  }>();

  let totalBasis: number | null = null;
  let totalUnrealized: number | null = null;
  let shortTermCount = 0;
  let longTermCount = 0;

  for (const lot of open) {
    const days = Math.floor((now - lot.acquisitionDate.getTime()) / MS_PER_DAY);
    if (days > LONG_TERM_DAYS) longTermCount++; else shortTermCount++;
    if (lot.costBasisPerUnitUsd != null || lot.costBasisUsd != null) {
      const remaining = remainingCostBasisUsd(lot);
      if (remaining != null) totalBasis = (totalBasis ?? 0) + remaining;
    }

    const priceUsd = prices[lot.assetSymbol] ?? null;
    const currentValue = priceUsd != null ? priceUsd * lot.quantity : null;
    const remaining = remainingCostBasisUsd(lot);
    const lotGainLoss =
      currentValue != null && remaining != null
        ? currentValue - remaining
        : null;
    if (lotGainLoss != null) totalUnrealized = (totalUnrealized ?? 0) + lotGainLoss;

    let entry = assetMap.get(lot.assetSymbol);
    if (!entry) {
      entry = {
        asset_symbol: lot.assetSymbol,
        open_lot_count: 0,
        total_quantity: 0,
        total_cost_basis_usd: null,
        current_value_usd: null,
        unrealized_gain_loss_usd: null,
        short_term_lots: 0,
        long_term_lots: 0,
      };
      assetMap.set(lot.assetSymbol, entry);
    }
    entry.open_lot_count++;
    entry.total_quantity += lot.quantity;
    if (remaining != null) entry.total_cost_basis_usd = (entry.total_cost_basis_usd ?? 0) + remaining;
    if (currentValue != null) entry.current_value_usd = (entry.current_value_usd ?? 0) + currentValue;
    if (lotGainLoss != null) entry.unrealized_gain_loss_usd = (entry.unrealized_gain_loss_usd ?? 0) + lotGainLoss;
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
    unrealized_gain_loss_usd: totalUnrealized,
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

function serializeIdentification(row: typeof lotIdentificationsTable.$inferSelect) {
  return {
    id: row.id,
    lot_id: row.lotId,
    wallet_id: row.walletId,
    asset_symbol: row.assetSymbol,
    quantity: row.quantity,
    method: row.method,
    identified_at: row.identifiedAt.toISOString(),
    identified_by: row.identifiedBy,
    disposal_position_id: row.disposalPositionId,
    consumed_at: row.consumedAt?.toISOString() ?? null,
    notes: row.notes,
    created_at: row.createdAt.toISOString(),
    survives_exam: row.consumedAt == null || (row.consumedAt.getTime() >= row.identifiedAt.getTime()),
  };
}

const IdentifyBody = z.object({
  quantity: z.number().positive().optional(),
  identified_at: z.string().datetime().optional(),
  notes: z.string().max(2000).optional(),
});

// GET /lots/identifications — standing + consumed ID records (must precede /lots/:id)
router.get("/lots/identifications", async (req, res): Promise<void> => {
  const wallet_id = typeof req.query.wallet_id === "string" ? req.query.wallet_id : undefined;
  const where = wallet_id ? eq(lotIdentificationsTable.walletId, wallet_id) : undefined;
  const rows = await db
    .select()
    .from(lotIdentificationsTable)
    .where(where)
    .orderBy(desc(lotIdentificationsTable.identifiedAt))
    .limit(200);
  res.json({
    items: rows.map(serializeIdentification),
    disclaimer:
      "Specific identification is only the method that files if the lot was identified no later than the sale. This log is books-and-records (Notice 2025-7 / 2026-20). Ranked HIFO/LIFO/min-tax simulator output is not an identification.",
  });
});

// POST /lots/:id/identify — contemporaneous Spec ID. Does not close the lot.
// The optimizer never writes this table.
router.post("/lots/:id/identify", async (req, res): Promise<void> => {
  const parsed = IdentifyBody.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const lotId = String(req.params.id);
  const rows = await db.select().from(lotsTable).where(eq(lotsTable.id, lotId)).limit(1);
  if (rows.length === 0) {
    res.status(404).json({ error: "Lot not found" });
    return;
  }
  const lot = rows[0];
  if (lot.status === "closed") {
    res.status(409).json({ error: "Cannot identify a closed lot. Identification must be contemporaneous with (or before) the sale." });
    return;
  }

  const identifiedAt = parsed.data.identified_at ? new Date(parsed.data.identified_at) : new Date();
  if (identifiedAt.getTime() > Date.now() + 1000) {
    res.status(400).json({ error: "identified_at cannot be in the future." });
    return;
  }

  const standing = await db
    .select({ id: lotIdentificationsTable.id })
    .from(lotIdentificationsTable)
    .where(and(eq(lotIdentificationsTable.lotId, lotId), isNull(lotIdentificationsTable.consumedAt)))
    .limit(1);
  if (standing.length > 0) {
    res.status(409).json({
      error: "This lot already has an unconsumed identification. Cancel it before recording another.",
      identification_id: standing[0].id,
    });
    return;
  }

  const qty = parsed.data.quantity ?? lot.quantity;
  if (qty > lot.quantity + 1e-10) {
    res.status(400).json({ error: "Identified quantity cannot exceed remaining lot quantity." });
    return;
  }

  const [record] = await db
    .insert(lotIdentificationsTable)
    .values({
      lotId: lot.id,
      walletId: lot.walletId,
      assetSymbol: lot.assetSymbol,
      quantity: qty,
      method: "specific_identification",
      identifiedAt,
      identifiedBy: req.user?.id ?? null,
      notes: parsed.data.notes ?? null,
    })
    .returning();

  res.status(201).json({
    identification: serializeIdentification(record),
    disclaimer:
      "Recorded. This is not a standing HIFO/LIFO order. The next disposal of this wallet+asset will consume this lot first only if identified_at is on or before the sale date. FIFO remains the default for unidentified lots.",
  });
});

router.get("/lots/:id/identifications", async (req, res): Promise<void> => {
  const rows = await db
    .select()
    .from(lotIdentificationsTable)
    .where(eq(lotIdentificationsTable.lotId, req.params.id))
    .orderBy(desc(lotIdentificationsTable.identifiedAt));
  res.json({ items: rows.map(serializeIdentification) });
});

router.delete("/lots/identifications/:id", async (req, res): Promise<void> => {
  const id = String(req.params.id);
  const rows = await db.select().from(lotIdentificationsTable).where(eq(lotIdentificationsTable.id, id)).limit(1);
  if (rows.length === 0) {
    res.status(404).json({ error: "Identification not found" });
    return;
  }
  if (rows[0].consumedAt) {
    res.status(409).json({ error: "Consumed identifications are books-and-records and cannot be deleted." });
    return;
  }
  await db.delete(lotIdentificationsTable).where(eq(lotIdentificationsTable.id, id));
  res.status(204).end();
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

// PATCH /lots/:id — admin only.
// Disposal fields (disposal_position_id, disposal_proceeds_usd,
// realized_gain_loss_usd) directly set gain/loss figures that feed into
// tax calculations; unrestricted editing is equivalent to letting any user
// falsify a tax record.
router.patch("/lots/:id", requireRole(ADMIN_ROLES), async (req, res): Promise<void> => {
  const parsed = PatchLotBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const d = parsed.data;

  const lotId = String(req.params.id);
  const existing = await db.select().from(lotsTable).where(eq(lotsTable.id, lotId)).limit(1);
  if (existing.length === 0) {
    res.status(404).json({ error: "Lot not found" });
    return;
  }

  // Build update object only from provided keys
  const updates: Partial<typeof lotsTable.$inferInsert> = {};
  if (d.status !== undefined) updates.status = d.status;
  if (d.quantity !== undefined) {
    updates.quantity = d.quantity;
    if (existing[0].costBasisPerUnitUsd != null) {
      updates.costBasisUsd = existing[0].costBasisPerUnitUsd * d.quantity;
    }
  }
  if (d.cost_basis_usd !== undefined) updates.costBasisUsd = d.cost_basis_usd;
  if (d.disposal_position_id !== undefined) updates.disposalPositionId = d.disposal_position_id;
  if (d.disposal_date !== undefined) updates.disposalDate = d.disposal_date ? new Date(d.disposal_date) : null;
  if (d.disposal_proceeds_usd !== undefined) updates.disposalProceedsUsd = d.disposal_proceeds_usd;
  if (d.realized_gain_loss_usd !== undefined) updates.realizedGainLossUsd = d.realized_gain_loss_usd;
  if (d.notes !== undefined) updates.notes = d.notes;

  const [updated] = await db
    .update(lotsTable)
    .set(updates)
    .where(eq(lotsTable.id, lotId))
    .returning();

  res.json(serializeLot(updated));
});

export default router;
