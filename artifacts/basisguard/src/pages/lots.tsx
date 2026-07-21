import React, { useState, useCallback } from "react";
import {
  Layers, Plus, TrendingUp, TrendingDown, Clock, DollarSign,
  ChevronDown, X, Info, AlertCircle, CheckCircle2,
} from "lucide-react";
import {
  Card, CardContent, CardHeader, CardTitle, CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";

const BASE = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";

// ── Types ─────────────────────────────────────────────────────────────────────

interface Lot {
  id: string;
  wallet_id: string;
  asset_symbol: string;
  asset_identifier: string | null;
  chain_id: string | null;
  quantity: number;
  cost_basis_usd: number | null;
  cost_basis_per_unit_usd: number | null;
  acquisition_date: string;
  acquisition_tx_id: string | null;
  disposal_date: string | null;
  disposal_proceeds_usd: number | null;
  realized_gain_loss_usd: number | null;
  status: "open" | "closed" | "partial";
  notes: string | null;
  created_at: string;
  holding_days: number;
  holding_period_type: "short_term" | "long_term";
  unrealized_gain_loss_usd: null;
}

interface LotSummaryByAsset {
  asset_symbol: string;
  open_lot_count: number;
  total_quantity: number;
  total_cost_basis_usd: number | null;
  short_term_lots: number;
  long_term_lots: number;
}

interface LotSummary {
  generated_at: string;
  wallet_id: string | null;
  open_lot_count: number;
  closed_lot_count: number;
  total_lot_count: number;
  total_cost_basis_usd: number | null;
  short_term_lots: number;
  long_term_lots: number;
  unrealized_gain_loss_usd: null;
  by_asset: LotSummaryByAsset[];
}

interface ListResponse {
  items: Lot[];
  total: number;
  limit: number;
  offset: number;
}

// ── Formatters ────────────────────────────────────────────────────────────────

function fmtUsd(v: number | null): string {
  if (v == null) return "—";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(v);
}

function fmtQty(v: number): string {
  return v.toLocaleString("en-US", { maximumFractionDigits: 8 });
}

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

function fmtDays(days: number): string {
  if (days < 30) return `${days}d`;
  if (days < 365) return `${Math.round(days / 30)}mo`;
  const y = Math.floor(days / 365);
  const mo = Math.round((days % 365) / 30);
  return mo > 0 ? `${y}y ${mo}mo` : `${y}y`;
}

// ── Status badge ──────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: Lot["status"] }) {
  if (status === "open") return <Badge variant="outline" className="border-green-500/40 text-green-400 bg-green-500/10">Open</Badge>;
  if (status === "partial") return <Badge variant="outline" className="border-yellow-500/40 text-yellow-400 bg-yellow-500/10">Partial</Badge>;
  return <Badge variant="outline" className="border-zinc-500/40 text-zinc-400 bg-zinc-500/10">Closed</Badge>;
}

function HoldingBadge({ type, days }: { type: "short_term" | "long_term"; days: number }) {
  if (type === "long_term") {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-mono">
        <TrendingUp className="h-3 w-3 text-blue-400" />
        <span className="text-blue-400">LT</span>
        <span className="text-muted-foreground">{fmtDays(days)}</span>
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-xs font-mono">
      <Clock className="h-3 w-3 text-orange-400" />
      <span className="text-orange-400">ST</span>
      <span className="text-muted-foreground">{fmtDays(days)}</span>
    </span>
  );
}

// ── New Lot Dialog ────────────────────────────────────────────────────────────

interface NewLotDialogProps {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}

function NewLotDialog({ open, onClose, onCreated }: NewLotDialogProps) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    wallet_id: "",
    asset_symbol: "",
    asset_identifier: "",
    quantity: "",
    cost_basis_usd: "",
    cost_basis_per_unit_usd: "",
    acquisition_date: "",
    acquisition_tx_id: "",
    notes: "",
  });

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((p) => ({ ...p, [k]: e.target.value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const body: Record<string, unknown> = {
        wallet_id: form.wallet_id.trim(),
        asset_symbol: form.asset_symbol.trim(),
        quantity: parseFloat(form.quantity),
        acquisition_date: new Date(form.acquisition_date).toISOString(),
      };
      if (form.asset_identifier.trim()) body.asset_identifier = form.asset_identifier.trim();
      if (form.cost_basis_usd.trim()) body.cost_basis_usd = parseFloat(form.cost_basis_usd);
      if (form.cost_basis_per_unit_usd.trim()) body.cost_basis_per_unit_usd = parseFloat(form.cost_basis_per_unit_usd);
      if (form.acquisition_tx_id.trim()) body.acquisition_tx_id = form.acquisition_tx_id.trim();
      if (form.notes.trim()) body.notes = form.notes.trim();

      const resp = await fetch(`${BASE}/api/lots`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!resp.ok) {
        const b = await resp.json().catch(() => ({}));
        throw new Error((b as any).error ?? `HTTP ${resp.status}`);
      }
      setForm({ wallet_id: "", asset_symbol: "", asset_identifier: "", quantity: "", cost_basis_usd: "", cost_basis_per_unit_usd: "", acquisition_date: "", acquisition_tx_id: "", notes: "" });
      onCreated();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="bg-[#111] border-border max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-serif text-xl">Record Acquisition</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 pt-2">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs font-mono uppercase tracking-wider text-muted-foreground">Wallet Address *</Label>
              <Input value={form.wallet_id} onChange={set("wallet_id")} required placeholder="0x…" className="bg-background/50 border-border/50 font-mono text-sm" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-mono uppercase tracking-wider text-muted-foreground">Asset Symbol *</Label>
              <Input value={form.asset_symbol} onChange={set("asset_symbol")} required placeholder="ETH" className="bg-background/50 border-border/50 font-mono text-sm uppercase" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-mono uppercase tracking-wider text-muted-foreground">Asset Identifier (contract / coingecko id)</Label>
            <Input value={form.asset_identifier} onChange={set("asset_identifier")} placeholder="0x… or ethereum" className="bg-background/50 border-border/50 font-mono text-sm" />
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs font-mono uppercase tracking-wider text-muted-foreground">Quantity *</Label>
              <Input type="number" step="any" min="0" value={form.quantity} onChange={set("quantity")} required placeholder="1.5" className="bg-background/50 border-border/50 font-mono text-sm" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-mono uppercase tracking-wider text-muted-foreground">Total Basis (USD)</Label>
              <Input type="number" step="any" min="0" value={form.cost_basis_usd} onChange={set("cost_basis_usd")} placeholder="3000.00" className="bg-background/50 border-border/50 font-mono text-sm" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-mono uppercase tracking-wider text-muted-foreground">Per-Unit (USD)</Label>
              <Input type="number" step="any" min="0" value={form.cost_basis_per_unit_usd} onChange={set("cost_basis_per_unit_usd")} placeholder="2000.00" className="bg-background/50 border-border/50 font-mono text-sm" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs font-mono uppercase tracking-wider text-muted-foreground">Acquisition Date *</Label>
              <Input type="datetime-local" value={form.acquisition_date} onChange={set("acquisition_date")} required className="bg-background/50 border-border/50 font-mono text-sm" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-mono uppercase tracking-wider text-muted-foreground">Tx Hash</Label>
              <Input value={form.acquisition_tx_id} onChange={set("acquisition_tx_id")} placeholder="0x…" className="bg-background/50 border-border/50 font-mono text-sm" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-mono uppercase tracking-wider text-muted-foreground">Notes</Label>
            <Input value={form.notes} onChange={set("notes")} placeholder="Optional memo" className="bg-background/50 border-border/50 text-sm" />
          </div>
          <p className="text-xs text-muted-foreground font-serif">Provide either Total Basis or Per-Unit — the other is derived automatically.</p>
          {error && (
            <div className="flex items-start gap-2 rounded border border-red-500/20 bg-red-500/5 p-3">
              <AlertCircle className="h-4 w-4 text-red-400 shrink-0 mt-0.5" />
              <p className="text-xs text-red-400">{error}</p>
            </div>
          )}
          <DialogFooter className="pt-2">
            <Button type="button" variant="outline" onClick={onClose} className="border-border/50">Cancel</Button>
            <Button type="submit" disabled={submitting} className="bg-foreground text-background hover:bg-foreground/90">
              {submitting ? "Saving…" : "Record Lot"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ── Close Lot Dialog ──────────────────────────────────────────────────────────

interface CloseLotDialogProps {
  lot: Lot | null;
  onClose: () => void;
  onUpdated: () => void;
}

function CloseLotDialog({ lot, onClose, onUpdated }: CloseLotDialogProps) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [proceeds, setProceeds] = useState("");
  const [dispDate, setDispDate] = useState(new Date().toISOString().slice(0, 16));
  const [partial, setPartial] = useState(false);
  const [partialQty, setPartialQty] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!lot) return;
    setSubmitting(true);
    setError(null);
    try {
      const proceedsNum = proceeds ? parseFloat(proceeds) : null;
      const basisNum = lot.cost_basis_usd;
      const realizedPnl = proceedsNum != null && basisNum != null ? proceedsNum - basisNum : null;

      const body: Record<string, unknown> = {
        status: partial ? "partial" : "closed",
        disposal_date: new Date(dispDate).toISOString(),
        disposal_proceeds_usd: proceedsNum,
        realized_gain_loss_usd: realizedPnl,
      };
      if (partial && partialQty) body.quantity = parseFloat(partialQty);

      const resp = await fetch(`${BASE}/api/lots/${lot.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!resp.ok) {
        const b = await resp.json().catch(() => ({}));
        throw new Error((b as any).error ?? `HTTP ${resp.status}`);
      }
      onUpdated();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  };

  if (!lot) return null;

  const proceedsNum = proceeds ? parseFloat(proceeds) : null;
  const pnl = proceedsNum != null && lot.cost_basis_usd != null ? proceedsNum - lot.cost_basis_usd : null;

  return (
    <Dialog open={!!lot} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="bg-[#111] border-border max-w-md">
        <DialogHeader>
          <DialogTitle className="font-serif text-xl">Close Lot</DialogTitle>
          <p className="text-sm text-muted-foreground font-serif">
            {fmtQty(lot.quantity)} {lot.asset_symbol} · basis {fmtUsd(lot.cost_basis_usd)}
          </p>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 pt-2">
          <div className="space-y-1.5">
            <Label className="text-xs font-mono uppercase tracking-wider text-muted-foreground">Disposal Date *</Label>
            <Input type="datetime-local" value={dispDate} onChange={e => setDispDate(e.target.value)} required className="bg-background/50 border-border/50 font-mono text-sm" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-mono uppercase tracking-wider text-muted-foreground">Gross Proceeds (USD)</Label>
            <Input type="number" step="any" min="0" value={proceeds} onChange={e => setProceeds(e.target.value)} placeholder="e.g. 4500.00" className="bg-background/50 border-border/50 font-mono text-sm" />
          </div>
          {pnl != null && (
            <div className={`flex items-center gap-2 rounded border p-3 ${pnl >= 0 ? "border-green-500/20 bg-green-500/5" : "border-red-500/20 bg-red-500/5"}`}>
              {pnl >= 0 ? <TrendingUp className="h-4 w-4 text-green-400 shrink-0" /> : <TrendingDown className="h-4 w-4 text-red-400 shrink-0" />}
              <p className={`text-sm font-mono ${pnl >= 0 ? "text-green-400" : "text-red-400"}`}>
                Realized {pnl >= 0 ? "gain" : "loss"}: {fmtUsd(pnl)}
              </p>
            </div>
          )}
          <div className="flex items-center gap-2">
            <input type="checkbox" id="partial-chk" checked={partial} onChange={e => setPartial(e.target.checked)} className="accent-foreground" />
            <Label htmlFor="partial-chk" className="text-sm font-serif cursor-pointer">Partial disposal only</Label>
          </div>
          {partial && (
            <div className="space-y-1.5">
              <Label className="text-xs font-mono uppercase tracking-wider text-muted-foreground">Remaining Quantity</Label>
              <Input type="number" step="any" min="0" value={partialQty} onChange={e => setPartialQty(e.target.value)} placeholder={`≤ ${fmtQty(lot.quantity)}`} className="bg-background/50 border-border/50 font-mono text-sm" />
            </div>
          )}
          {error && (
            <div className="flex items-start gap-2 rounded border border-red-500/20 bg-red-500/5 p-3">
              <AlertCircle className="h-4 w-4 text-red-400 shrink-0 mt-0.5" />
              <p className="text-xs text-red-400">{error}</p>
            </div>
          )}
          <DialogFooter className="pt-2">
            <Button type="button" variant="outline" onClick={onClose} className="border-border/50">Cancel</Button>
            <Button type="submit" disabled={submitting} className="bg-foreground text-background hover:bg-foreground/90">
              {submitting ? "Saving…" : partial ? "Record Partial" : "Close Lot"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function LotsPage() {
  const [walletFilter, setWalletFilter] = useState("");
  const [assetFilter, setAssetFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState<"" | "open" | "closed" | "partial">("");
  const [showNew, setShowNew] = useState(false);
  const [closingLot, setClosingLot] = useState<Lot | null>(null);

  const [lots, setLots] = useState<Lot[]>([]);
  const [total, setTotal] = useState(0);
  const [summary, setSummary] = useState<LotSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [offset, setOffset] = useState(0);
  const LIMIT = 50;

  const fetchData = useCallback(async (off = 0) => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (walletFilter.trim()) params.set("wallet_id", walletFilter.trim());
      if (assetFilter.trim()) params.set("asset_symbol", assetFilter.trim().toUpperCase());
      if (statusFilter) params.set("status", statusFilter);
      params.set("limit", LIMIT.toString());
      params.set("offset", off.toString());

      const summaryParams = new URLSearchParams();
      if (walletFilter.trim()) summaryParams.set("wallet_id", walletFilter.trim());

      const [listResp, summaryResp] = await Promise.all([
        fetch(`${BASE}/api/lots?${params}`),
        fetch(`${BASE}/api/lots/summary?${summaryParams}`),
      ]);

      if (!listResp.ok || !summaryResp.ok) throw new Error(`HTTP ${listResp.status}`);
      const [list, sum]: [ListResponse, LotSummary] = await Promise.all([listResp.json(), summaryResp.json()]);
      setLots(list.items);
      setTotal(list.total);
      setSummary(sum);
      setOffset(off);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [walletFilter, assetFilter, statusFilter]);

  // Auto-fetch on mount
  React.useEffect(() => { fetchData(0); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleFilter = (e: React.FormEvent) => {
    e.preventDefault();
    fetchData(0);
  };

  return (
    <div className="p-8 max-w-6xl mx-auto space-y-8">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-serif font-bold text-foreground flex items-center gap-3">
            <Layers className="h-8 w-8 text-primary" />
            Lot Inventory
          </h1>
          <p className="text-muted-foreground mt-1 text-sm font-mono uppercase tracking-widest">
            Open positions · cost basis · holding period
          </p>
        </div>
        <Button onClick={() => setShowNew(true)} className="bg-foreground text-background hover:bg-foreground/90 gap-2">
          <Plus className="h-4 w-4" />
          Record Acquisition
        </Button>
      </div>

      {/* Price oracle note */}
      <div className="rounded-md border border-amber-500/20 bg-amber-500/5 p-4 flex gap-3">
        <Info className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
        <p className="text-xs font-serif text-amber-400/80 leading-relaxed">
          Unrealized gain/loss requires a price oracle and is not yet implemented. Cost basis, holding period
          (short-term ≤ 365 days / long-term {">"}365 days), and lot status are always available. Connect a
          price feed to enable mark-to-market unrealized P&L.
        </p>
      </div>

      {/* Summary cards */}
      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card className="bg-card/50 border-border/50">
            <CardContent className="p-4">
              <p className="text-xs font-mono uppercase tracking-wider text-muted-foreground">Open Lots</p>
              <p className="text-2xl font-serif font-bold mt-1">{summary.open_lot_count}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{summary.closed_lot_count} closed</p>
            </CardContent>
          </Card>
          <Card className="bg-card/50 border-border/50">
            <CardContent className="p-4">
              <p className="text-xs font-mono uppercase tracking-wider text-muted-foreground">Total Basis</p>
              <p className="text-2xl font-serif font-bold mt-1">{fmtUsd(summary.total_cost_basis_usd)}</p>
              <p className="text-xs text-muted-foreground mt-0.5">open lots only</p>
            </CardContent>
          </Card>
          <Card className="bg-card/50 border-border/50">
            <CardContent className="p-4">
              <p className="text-xs font-mono uppercase tracking-wider text-muted-foreground flex items-center gap-1">
                <Clock className="h-3 w-3 text-orange-400" /> Short-Term
              </p>
              <p className="text-2xl font-serif font-bold mt-1 text-orange-400">{summary.short_term_lots}</p>
              <p className="text-xs text-muted-foreground mt-0.5">≤ 365 days</p>
            </CardContent>
          </Card>
          <Card className="bg-card/50 border-border/50">
            <CardContent className="p-4">
              <p className="text-xs font-mono uppercase tracking-wider text-muted-foreground flex items-center gap-1">
                <TrendingUp className="h-3 w-3 text-blue-400" /> Long-Term
              </p>
              <p className="text-2xl font-serif font-bold mt-1 text-blue-400">{summary.long_term_lots}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{"> "}365 days</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* By-asset breakdown */}
      {summary && summary.by_asset.length > 0 && (
        <Card className="bg-card/50 border-border/50">
          <CardHeader className="border-b border-border/50 bg-muted/10 pb-4">
            <CardTitle className="font-serif text-base">By Asset</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y divide-border/30">
              {summary.by_asset.map((a) => (
                <div key={a.asset_symbol} className="flex items-center justify-between px-6 py-3">
                  <div className="flex items-center gap-4">
                    <span className="font-mono font-bold text-sm w-16">{a.asset_symbol}</span>
                    <span className="text-xs text-muted-foreground">{a.open_lot_count} lot{a.open_lot_count !== 1 ? "s" : ""}</span>
                    <span className="text-xs font-mono text-foreground">{fmtQty(a.total_quantity)} units</span>
                  </div>
                  <div className="flex items-center gap-6">
                    <div className="text-right">
                      <p className="text-sm font-mono">{fmtUsd(a.total_cost_basis_usd)}</p>
                      <p className="text-xs text-muted-foreground">total basis</p>
                    </div>
                    <div className="flex gap-2">
                      {a.short_term_lots > 0 && <Badge variant="outline" className="border-orange-500/30 text-orange-400 text-[10px]">ST ×{a.short_term_lots}</Badge>}
                      {a.long_term_lots > 0 && <Badge variant="outline" className="border-blue-500/30 text-blue-400 text-[10px]">LT ×{a.long_term_lots}</Badge>}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Filters + table */}
      <Card className="bg-card/50 backdrop-blur border-border/50">
        <CardHeader className="border-b border-border/50 bg-muted/10 pb-4">
          <CardTitle className="font-serif text-xl">Lots</CardTitle>
          <CardDescription className="font-serif">
            Each row is a discrete acquisition. Click "Close" to record a disposal and compute realized P&L.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-6 space-y-5">
          {/* Filters */}
          <form onSubmit={handleFilter} className="flex flex-wrap gap-3 items-end">
            <div className="space-y-1.5">
              <Label className="text-xs font-mono uppercase tracking-wider text-muted-foreground">Wallet</Label>
              <Input value={walletFilter} onChange={e => setWalletFilter(e.target.value)} placeholder="0x… or any" className="bg-background/50 border-border/50 h-9 text-sm font-mono w-52" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-mono uppercase tracking-wider text-muted-foreground">Asset</Label>
              <Input value={assetFilter} onChange={e => setAssetFilter(e.target.value)} placeholder="ETH, USDC…" className="bg-background/50 border-border/50 h-9 text-sm font-mono w-28" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-mono uppercase tracking-wider text-muted-foreground">Status</Label>
              <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as typeof statusFilter)}>
                <SelectTrigger className="bg-background/50 border-border/50 h-9 w-28 text-sm">
                  <SelectValue placeholder="All" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">All</SelectItem>
                  <SelectItem value="open">Open</SelectItem>
                  <SelectItem value="partial">Partial</SelectItem>
                  <SelectItem value="closed">Closed</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button type="submit" variant="outline" className="h-9 border-border/50 text-sm">Search</Button>
          </form>

          {/* Error */}
          {error && (
            <div className="flex items-start gap-2 rounded border border-red-500/20 bg-red-500/5 p-3">
              <AlertCircle className="h-4 w-4 text-red-400 shrink-0 mt-0.5" />
              <p className="text-sm text-red-400">{error}</p>
            </div>
          )}

          {/* Table */}
          {loading ? (
            <p className="text-sm text-muted-foreground font-serif py-8 text-center">Loading…</p>
          ) : lots.length === 0 ? (
            <div className="text-center py-12 space-y-2">
              <Layers className="h-10 w-10 text-muted-foreground/30 mx-auto" />
              <p className="text-sm font-serif text-muted-foreground">No lots found. Record the first acquisition above.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border/50 text-xs font-mono uppercase tracking-wider text-muted-foreground">
                    <th className="text-left pb-3 pr-4">Asset</th>
                    <th className="text-left pb-3 pr-4">Wallet</th>
                    <th className="text-right pb-3 pr-4">Quantity</th>
                    <th className="text-right pb-3 pr-4">Total Basis</th>
                    <th className="text-right pb-3 pr-4">Per Unit</th>
                    <th className="text-left pb-3 pr-4">Acquired</th>
                    <th className="text-left pb-3 pr-4">Holding</th>
                    <th className="text-left pb-3 pr-4">Status</th>
                    <th className="text-left pb-3 pr-4">Realized P&L</th>
                    <th className="pb-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/20">
                  {lots.map((lot) => (
                    <tr key={lot.id} className="hover:bg-muted/5 transition-colors group">
                      <td className="py-3 pr-4">
                        <span className="font-mono font-bold text-foreground">{lot.asset_symbol}</span>
                        {lot.asset_identifier && (
                          <span className="block text-[10px] text-muted-foreground font-mono truncate max-w-[80px]" title={lot.asset_identifier}>
                            {lot.asset_identifier.startsWith("0x") ? `${lot.asset_identifier.slice(0, 8)}…` : lot.asset_identifier}
                          </span>
                        )}
                      </td>
                      <td className="py-3 pr-4">
                        <span className="font-mono text-xs text-muted-foreground" title={lot.wallet_id}>
                          {lot.wallet_id.startsWith("0x") ? `${lot.wallet_id.slice(0, 6)}…${lot.wallet_id.slice(-4)}` : lot.wallet_id.slice(0, 12)}
                        </span>
                      </td>
                      <td className="py-3 pr-4 text-right font-mono text-xs">{fmtQty(lot.quantity)}</td>
                      <td className="py-3 pr-4 text-right font-mono text-xs">{fmtUsd(lot.cost_basis_usd)}</td>
                      <td className="py-3 pr-4 text-right font-mono text-xs">{fmtUsd(lot.cost_basis_per_unit_usd)}</td>
                      <td className="py-3 pr-4 text-xs text-muted-foreground">{fmtDate(lot.acquisition_date)}</td>
                      <td className="py-3 pr-4">
                        <HoldingBadge type={lot.holding_period_type} days={lot.holding_days} />
                      </td>
                      <td className="py-3 pr-4"><StatusBadge status={lot.status} /></td>
                      <td className="py-3 pr-4 font-mono text-xs">
                        {lot.realized_gain_loss_usd != null ? (
                          <span className={lot.realized_gain_loss_usd >= 0 ? "text-green-400" : "text-red-400"}>
                            {fmtUsd(lot.realized_gain_loss_usd)}
                          </span>
                        ) : "—"}
                      </td>
                      <td className="py-3">
                        {(lot.status === "open" || lot.status === "partial") && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-xs border-border/50 opacity-0 group-hover:opacity-100 transition-opacity"
                            onClick={() => setClosingLot(lot)}
                          >
                            Close
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Pagination */}
          {total > LIMIT && (
            <div className="flex items-center justify-between pt-2">
              <p className="text-xs text-muted-foreground font-mono">
                {offset + 1}–{Math.min(offset + LIMIT, total)} of {total}
              </p>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" className="h-7 text-xs border-border/50" disabled={offset === 0} onClick={() => fetchData(offset - LIMIT)}>Prev</Button>
                <Button size="sm" variant="outline" className="h-7 text-xs border-border/50" disabled={offset + LIMIT >= total} onClick={() => fetchData(offset + LIMIT)}>Next</Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Dialogs */}
      <NewLotDialog open={showNew} onClose={() => setShowNew(false)} onCreated={() => fetchData(0)} />
      <CloseLotDialog lot={closingLot} onClose={() => setClosingLot(null)} onUpdated={() => fetchData(offset)} />
    </div>
  );
}
