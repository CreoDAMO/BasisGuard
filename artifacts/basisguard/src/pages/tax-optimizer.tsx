import React, { useState } from "react";
import {
  Calculator,
  TrendingDown,
  ArrowRight,
  Info,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Search,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const BASE = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";

// ── Formatters ────────────────────────────────────────────────────────────────

function fmtUsd(v: number | null | undefined, opts?: { always?: boolean }): string {
  if (v == null) return "—";
  const sign = opts?.always ? "always" : ("auto" as const);
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", signDisplay: sign }).format(v);
}

function fmtNum(v: number | null | undefined, decimals = 8): string {
  if (v == null) return "—";
  return v.toFixed(decimals);
}

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

function gainClass(v: number | null | undefined): string {
  if (v == null) return "text-muted-foreground";
  return v < 0 ? "text-red-400" : v > 0 ? "text-green-400" : "text-muted-foreground";
}

// ── Strategy labels ───────────────────────────────────────────────────────────

const STRATEGY_META: Record<string, { label: string; description: string }> = {
  fifo: { label: "FIFO", description: "First In, First Out — IRS default" },
  lifo: { label: "LIFO", description: "Last In, First Out" },
  hifo: { label: "HIFO", description: "Highest Cost First — minimises gain" },
  min_tax: { label: "Min Tax", description: "Long-term lots first, then HIFO" },
};

const STRATEGY_ORDER = ["fifo", "lifo", "hifo", "min_tax"];

// ── Tabs ──────────────────────────────────────────────────────────────────────

type Tab = "simulate" | "harvest" | "estate";

// ── Simulate tab ──────────────────────────────────────────────────────────────

interface ConsumedLot {
  lot_id: string;
  quantity_consumed: number;
  cost_basis_usd: number | null;
  proceeds_usd: number;
  gain_loss_usd: number | null;
  holding_days: number;
  holding_period: "short_term" | "long_term";
}

interface SimulationResult {
  asset_symbol: string;
  quantity_requested: number;
  quantity_available: number;
  quantity_fillable: number;
  current_price_usd: number;
  strategy: string;
  lots_consumed: ConsumedLot[];
  total_proceeds_usd: number;
  total_cost_basis_usd: number | null;
  short_term_gain_usd: number | null;
  long_term_gain_usd: number | null;
  total_gain_usd: number | null;
  warning: string | null;
}

interface StrategyComparison {
  strategy: string;
  total_gain_usd: number | null;
  short_term_gain_usd: number | null;
  long_term_gain_usd: number | null;
  total_proceeds_usd: number;
}

interface SimulateResponse {
  generated_at: string;
  asset_symbol: string;
  quantity_requested: number;
  current_price_usd: number;
  ranked_strategies: StrategyComparison[];
  simulations: SimulationResult[];
  disclaimer: string;
}

function SimulateTab() {
  const [symbol, setSymbol] = useState("");
  const [quantity, setQuantity] = useState("");
  const [walletId, setWalletId] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<SimulateResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  const run = async () => {
    if (!symbol || !quantity) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const params = new URLSearchParams({
        asset_symbol: symbol.trim().toUpperCase(),
        quantity: quantity.trim(),
      });
      if (walletId.trim()) params.set("wallet_id", walletId.trim());
      const resp = await fetch(`${BASE}/api/tax-optimizer/simulate?${params}`, { credentials: "include" });
      if (!resp.ok) {
        const body = await resp.json().catch(() => ({}));
        throw new Error((body as any).error ?? `HTTP ${resp.status}`);
      }
      setResult(await resp.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  const bestStrategy = result?.ranked_strategies[0];

  return (
    <div className="space-y-6">
      {/* Controls */}
      <Card className="bg-card/50 border-border/50">
        <CardHeader className="border-b border-border/50 bg-muted/10 pb-5">
          <CardTitle className="font-serif text-xl">What-If Sale Simulator</CardTitle>
          <CardDescription className="font-serif">
            Choose an asset and quantity to sell. BasisGuard runs all four lot-selection strategies and ranks them
            by total tax impact, so you can pick the most advantageous method before executing.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-6">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
            <div className="space-y-2">
              <Label className="text-xs font-mono uppercase tracking-wider text-muted-foreground">Asset Symbol</Label>
              <Input
                placeholder="BTC"
                value={symbol}
                onChange={(e) => setSymbol(e.target.value.toUpperCase())}
                className="bg-background/50 border-border/50 h-12 font-mono text-lg uppercase"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs font-mono uppercase tracking-wider text-muted-foreground">Quantity to Sell</Label>
              <Input
                placeholder="0.5"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                type="number"
                step="any"
                min="0"
                className="bg-background/50 border-border/50 h-12 font-mono text-lg"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs font-mono uppercase tracking-wider text-muted-foreground">
                Wallet ID <span className="normal-case text-muted-foreground/50">(optional)</span>
              </Label>
              <Input
                placeholder="0x…"
                value={walletId}
                onChange={(e) => setWalletId(e.target.value)}
                className="bg-background/50 border-border/50 h-12 font-mono text-sm"
              />
            </div>
          </div>
          <Button onClick={run} disabled={loading || !symbol || !quantity} className="h-12 px-8 font-mono tracking-wider">
            {loading ? (
              <span className="flex items-center gap-2 animate-pulse">
                <Clock className="h-4 w-4" /> Simulating…
              </span>
            ) : (
              <span className="flex items-center gap-2">
                <Calculator className="h-4 w-4" /> Run Simulation
              </span>
            )}
          </Button>
        </CardContent>
      </Card>

      {error && (
        <div className="rounded-md border border-red-500/30 bg-red-500/5 p-4 flex gap-3 text-red-400">
          <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
          <span className="text-sm font-serif">{error}</span>
        </div>
      )}

      {result && (
        <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 space-y-6">
          {/* Summary row */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: "Asset", value: result.asset_symbol },
              { label: "Quantity", value: fmtNum(result.quantity_requested, 8) },
              { label: "Current Price", value: fmtUsd(result.current_price_usd) },
              {
                label: "Best Strategy",
                value: STRATEGY_META[bestStrategy?.strategy ?? ""]?.label ?? "—",
                sub: fmtUsd(bestStrategy?.total_gain_usd, { always: true }) + " gain",
              },
            ].map((m) => (
              <div key={m.label} className="rounded border border-border/40 bg-muted/20 p-3 text-center">
                <div className="font-mono text-xl font-bold text-foreground">{m.value}</div>
                <div className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground mt-1">{m.label}</div>
                {m.sub && <div className="font-mono text-[10px] text-muted-foreground/60 mt-0.5">{m.sub}</div>}
              </div>
            ))}
          </div>

          {/* Warning */}
          {result.simulations[0]?.warning && (
            <div className="rounded-md border border-amber-500/30 bg-amber-500/5 p-4 flex gap-3">
              <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
              <span className="text-xs font-serif text-amber-400/90">{result.simulations[0].warning}</span>
            </div>
          )}

          {/* Strategy comparison table */}
          <Card className="bg-card/50 border-border/40">
            <CardHeader className="border-b border-border/40 bg-muted/10 pb-4">
              <CardTitle className="font-mono text-sm uppercase tracking-wider">Strategy Comparison — ranked by total gain</CardTitle>
            </CardHeader>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border/30 bg-muted/10">
                    {["Rank", "Strategy", "Short-Term Gain", "Long-Term Gain", "Total Gain", "Proceeds"].map((h) => (
                      <th key={h} className="text-left px-4 py-3 font-mono uppercase tracking-wider text-muted-foreground/70 text-[10px]">{h}</th>
                    ))}
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/20">
                  {result.ranked_strategies.map((s, i) => {
                    const isExpanded = expanded === s.strategy;
                    const full = result.simulations.find((sim) => sim.strategy === s.strategy);
                    const isBest = i === 0;
                    return (
                      <React.Fragment key={s.strategy}>
                        <tr
                          className={`hover:bg-muted/10 transition-colors cursor-pointer ${isBest ? "bg-green-500/5" : ""}`}
                          onClick={() => setExpanded(isExpanded ? null : s.strategy)}
                        >
                          <td className="px-4 py-3 font-mono font-bold text-muted-foreground">
                            {isBest ? (
                              <span className="text-green-400 flex items-center gap-1">
                                <CheckCircle2 className="h-3 w-3" /> #1
                              </span>
                            ) : (
                              <span>#{i + 1}</span>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            <div className="font-mono font-semibold text-foreground">{STRATEGY_META[s.strategy]?.label}</div>
                            <div className="font-mono text-[10px] text-muted-foreground/60">{STRATEGY_META[s.strategy]?.description}</div>
                          </td>
                          <td className={`px-4 py-3 font-mono font-semibold ${gainClass(s.short_term_gain_usd)}`}>
                            {fmtUsd(s.short_term_gain_usd, { always: true })}
                          </td>
                          <td className={`px-4 py-3 font-mono font-semibold ${gainClass(s.long_term_gain_usd)}`}>
                            {fmtUsd(s.long_term_gain_usd, { always: true })}
                          </td>
                          <td className={`px-4 py-3 font-mono font-bold ${gainClass(s.total_gain_usd)}`}>
                            {fmtUsd(s.total_gain_usd, { always: true })}
                          </td>
                          <td className="px-4 py-3 font-mono text-foreground/80">{fmtUsd(s.total_proceeds_usd)}</td>
                          <td className="px-4 py-3 text-muted-foreground">
                            {isExpanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                          </td>
                        </tr>
                        {isExpanded && full && (
                          <tr className="bg-muted/5">
                            <td colSpan={7} className="px-4 py-4">
                              <div className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider mb-2">
                                Lot Breakdown — {STRATEGY_META[s.strategy]?.label}
                              </div>
                              <table className="w-full text-xs border border-border/20 rounded">
                                <thead>
                                  <tr className="border-b border-border/20 bg-muted/20">
                                    {["Lot ID", "Qty Consumed", "Holding", "Period", "Proceeds", "Basis", "Gain/Loss"].map((h) => (
                                      <th key={h} className="text-left px-3 py-2 font-mono text-[10px] uppercase tracking-wider text-muted-foreground/60">{h}</th>
                                    ))}
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-border/10">
                                  {full.lots_consumed.map((c) => (
                                    <tr key={c.lot_id} className="hover:bg-muted/10">
                                      <td className="px-3 py-2 font-mono text-muted-foreground text-[11px]">{c.lot_id.slice(0, 8)}…</td>
                                      <td className="px-3 py-2 font-mono">{fmtNum(c.quantity_consumed, 8)}</td>
                                      <td className="px-3 py-2 font-mono text-muted-foreground">{c.holding_days}d</td>
                                      <td className="px-3 py-2">
                                        <Badge variant="outline" className={`text-[10px] font-mono ${c.holding_period === "long_term" ? "border-green-500/30 text-green-400" : "border-amber-500/30 text-amber-400"}`}>
                                          {c.holding_period === "long_term" ? "LT" : "ST"}
                                        </Badge>
                                      </td>
                                      <td className="px-3 py-2 font-mono">{fmtUsd(c.proceeds_usd)}</td>
                                      <td className="px-3 py-2 font-mono text-muted-foreground">{fmtUsd(c.cost_basis_usd)}</td>
                                      <td className={`px-3 py-2 font-mono font-semibold ${gainClass(c.gain_loss_usd)}`}>
                                        {fmtUsd(c.gain_loss_usd, { always: true })}
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>

          {/* Disclaimer */}
          <div className="rounded-md border border-border/20 bg-muted/10 p-4 flex gap-3">
            <Info className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
            <p className="text-xs font-serif text-muted-foreground/70 leading-relaxed">{result.disclaimer}</p>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Harvest tab ───────────────────────────────────────────────────────────────

interface HarvestRecommendation {
  lot_id: string;
  wallet_id: string;
  asset_symbol: string;
  quantity: number;
  cost_basis_usd: number | null;
  cost_basis_per_unit_usd: number | null;
  current_price_usd: number;
  current_value_usd: number;
  unrealized_loss_usd: number;
  holding_days: number;
  holding_period: "short_term" | "long_term";
  proceeds_if_sold_usd: number;
  wash_sale_risk: boolean;
}

interface HarvestResponse {
  generated_at: string;
  wallet_id: string | null;
  min_loss_usd_filter: number;
  total_candidates: number;
  wash_sale_risk_count: number;
  total_unrealized_loss_usd: number;
  candidates: HarvestRecommendation[];
  disclaimer: string;
}

function HarvestTab() {
  const [walletId, setWalletId] = useState("");
  const [minLoss, setMinLoss] = useState("0");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<HarvestResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const params = new URLSearchParams({ min_loss_usd: minLoss });
      if (walletId.trim()) params.set("wallet_id", walletId.trim());
      const resp = await fetch(`${BASE}/api/tax-optimizer/harvest?${params}`, { credentials: "include" });
      if (!resp.ok) {
        const body = await resp.json().catch(() => ({}));
        throw new Error((body as any).error ?? `HTTP ${resp.status}`);
      }
      setResult(await resp.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <Card className="bg-card/50 border-border/50">
        <CardHeader className="border-b border-border/50 bg-muted/10 pb-5">
          <CardTitle className="font-serif text-xl">Unrealized-Loss Harvest Candidates</CardTitle>
          <CardDescription className="font-serif">
            Identifies open lot positions with unrealized losses ranked by magnitude. Unlike the Realized-Loss Review
            (which shows already-closed positions), this surfaces lots you currently hold that could be sold to
            realize a loss — a forward-looking harvest opportunity scanner.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-6">
          <div className="flex flex-col sm:flex-row gap-4 items-end">
            <div className="space-y-2 flex-1">
              <Label className="text-xs font-mono uppercase tracking-wider text-muted-foreground">
                Wallet ID <span className="normal-case text-muted-foreground/50">(optional)</span>
              </Label>
              <Input
                placeholder="0x… (all wallets if blank)"
                value={walletId}
                onChange={(e) => setWalletId(e.target.value)}
                className="bg-background/50 border-border/50 h-12 font-mono text-sm"
              />
            </div>
            <div className="space-y-2 w-48">
              <Label className="text-xs font-mono uppercase tracking-wider text-muted-foreground">Min Loss (USD)</Label>
              <Input
                placeholder="0"
                value={minLoss}
                onChange={(e) => setMinLoss(e.target.value)}
                type="number"
                min="0"
                step="100"
                className="bg-background/50 border-border/50 h-12 font-mono"
              />
            </div>
            <Button onClick={run} disabled={loading} className="h-12 px-8 font-mono tracking-wider shrink-0">
              {loading ? (
                <span className="flex items-center gap-2 animate-pulse">
                  <Clock className="h-4 w-4" /> Scanning…
                </span>
              ) : (
                <span className="flex items-center gap-2">
                  <Search className="h-4 w-4" /> Scan Positions
                </span>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      {error && (
        <div className="rounded-md border border-red-500/30 bg-red-500/5 p-4 flex gap-3 text-red-400">
          <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
          <span className="text-sm font-serif">{error}</span>
        </div>
      )}

      {result && (
        <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 space-y-6">
          {/* Stats */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: "Candidates", value: result.total_candidates },
              { label: "Total Unrealized Loss", value: fmtUsd(result.total_unrealized_loss_usd) },
              { label: "Wash-Sale Risk", value: result.wash_sale_risk_count, highlight: result.wash_sale_risk_count > 0 },
              { label: "Min Loss Filter", value: fmtUsd(result.min_loss_usd_filter) },
            ].map((m) => (
              <div key={m.label} className={`rounded border p-3 text-center ${(m as any).highlight ? "border-amber-500/30 bg-amber-500/5" : "border-border/40 bg-muted/20"}`}>
                <div className={`font-mono text-xl font-bold ${(m as any).highlight ? "text-amber-400" : "text-foreground"}`}>{m.value}</div>
                <div className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground mt-1">{m.label}</div>
              </div>
            ))}
          </div>

          {result.candidates.length === 0 ? (
            <div className="flex items-center gap-3 text-muted-foreground p-6 rounded border border-border/30 bg-card/30">
              <CheckCircle2 className="h-5 w-5 text-green-500" />
              <span className="font-serif text-sm">No open lots with unrealized losses above the threshold. Nothing to harvest.</span>
            </div>
          ) : (
            <Card className="bg-card/50 border-border/40">
              <CardHeader className="border-b border-border/40 bg-muted/10 pb-4">
                <CardTitle className="font-mono text-sm uppercase tracking-wider flex items-center gap-2">
                  <TrendingDown className="h-4 w-4 text-primary" />
                  Harvest Candidates — largest unrealized loss first
                </CardTitle>
              </CardHeader>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-border/30 bg-muted/10">
                      {["Asset", "Qty", "Basis/Unit", "Current Price", "Current Value", "Unrealized Loss", "Period", "Wash-Sale"].map((h) => (
                        <th key={h} className="text-left px-4 py-3 font-mono uppercase tracking-wider text-muted-foreground/70 text-[10px]">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/20">
                    {result.candidates.map((c) => (
                      <tr key={c.lot_id} className={`hover:bg-muted/10 ${c.wash_sale_risk ? "bg-amber-500/3" : ""}`}>
                        <td className="px-4 py-3 font-mono font-bold text-foreground">{c.asset_symbol}</td>
                        <td className="px-4 py-3 font-mono text-muted-foreground">{fmtNum(c.quantity, 8)}</td>
                        <td className="px-4 py-3 font-mono text-muted-foreground">{fmtUsd(c.cost_basis_per_unit_usd)}</td>
                        <td className="px-4 py-3 font-mono">{fmtUsd(c.current_price_usd)}</td>
                        <td className="px-4 py-3 font-mono">{fmtUsd(c.current_value_usd)}</td>
                        <td className="px-4 py-3 font-mono font-bold text-red-400">−{fmtUsd(c.unrealized_loss_usd)}</td>
                        <td className="px-4 py-3">
                          <Badge variant="outline" className={`text-[10px] font-mono ${c.holding_period === "long_term" ? "border-green-500/30 text-green-400" : "border-amber-500/30 text-amber-400"}`}>
                            {c.holding_period === "long_term" ? "LT" : "ST"} · {c.holding_days}d
                          </Badge>
                        </td>
                        <td className="px-4 py-3">
                          {c.wash_sale_risk ? (
                            <div className="flex items-center gap-1">
                              <AlertTriangle className="h-3.5 w-3.5 text-amber-400" />
                              <span className="text-amber-400 font-mono text-[10px] uppercase tracking-wider">Risk</span>
                            </div>
                          ) : (
                            <span className="text-muted-foreground/40 font-mono text-[10px]">Clear</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}

          <div className="rounded-md border border-border/20 bg-muted/10 p-4 flex gap-3">
            <Info className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
            <p className="text-xs font-serif text-muted-foreground/70 leading-relaxed">{result.disclaimer}</p>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Estate step-up tab ────────────────────────────────────────────────────────

interface StepUpLot {
  lot_id: string;
  asset_symbol: string;
  quantity: number;
  original_cost_basis_usd: number | null;
  original_cost_basis_per_unit_usd: number | null;
  step_up_price_usd: number | null;
  stepped_up_cost_basis_usd: number | null;
  gain_eliminated_usd: number | null;
}

interface StepUpResponse {
  generated_at: string;
  step_up_date: string;
  wallet_id: string;
  lots: StepUpLot[];
  total_original_basis_usd: number | null;
  total_stepped_up_basis_usd: number | null;
  total_gain_eliminated_usd: number | null;
  unavailable_prices?: string[];
  disclaimer: string;
}

function EstateTab() {
  const [walletId, setWalletId] = useState("");
  const [stepUpDate, setStepUpDate] = useState("");
  const [symbols, setSymbols] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<StepUpResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    if (!walletId || !stepUpDate) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const body: Record<string, unknown> = {
        wallet_id: walletId.trim(),
        step_up_date: new Date(stepUpDate).toISOString(),
      };
      if (symbols.trim()) {
        body.asset_symbols = symbols.split(",").map((s) => s.trim().toUpperCase()).filter(Boolean);
      }
      const resp = await fetch(`${BASE}/api/tax-optimizer/estate-step-up`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(body),
      });
      if (!resp.ok) {
        const bd = await resp.json().catch(() => ({}));
        throw new Error((bd as any).error ?? `HTTP ${resp.status}`);
      }
      setResult(await resp.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Legal notice */}
      <div className="rounded-md border border-blue-500/20 bg-blue-500/5 p-4 flex gap-3">
        <Info className="h-4 w-4 text-blue-400 shrink-0 mt-0.5" />
        <p className="text-xs font-serif text-blue-400/80 leading-relaxed">
          IRC §1014 provides that the basis of inherited property is stepped up to its FMV at the decedent's date of
          death. This calculator is illustrative only — FMV must be substantiated by qualified appraisal or
          contemporaneous market data. Consult a qualified estate attorney before filing.
        </p>
      </div>

      <Card className="bg-card/50 border-border/50">
        <CardHeader className="border-b border-border/50 bg-muted/10 pb-5">
          <CardTitle className="font-serif text-xl">IRC §1014 Estate Basis Step-Up</CardTitle>
          <CardDescription className="font-serif">
            Enter the wallet ID and date of death. BasisGuard fetches historical prices from CoinGecko and
            computes the stepped-up cost basis for every open lot acquired before that date.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-6 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-xs font-mono uppercase tracking-wider text-muted-foreground">Wallet ID</Label>
              <Input
                placeholder="0x… or any wallet identifier"
                value={walletId}
                onChange={(e) => setWalletId(e.target.value)}
                className="bg-background/50 border-border/50 h-12 font-mono text-sm"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs font-mono uppercase tracking-wider text-muted-foreground">Date of Death (Step-Up Date)</Label>
              <Input
                type="date"
                value={stepUpDate}
                onChange={(e) => setStepUpDate(e.target.value)}
                className="bg-background/50 border-border/50 h-12 font-mono"
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label className="text-xs font-mono uppercase tracking-wider text-muted-foreground">
              Asset Symbols <span className="normal-case text-muted-foreground/50">(optional — comma-separated; defaults to all assets in wallet)</span>
            </Label>
            <Input
              placeholder="BTC, ETH, SOL"
              value={symbols}
              onChange={(e) => setSymbols(e.target.value)}
              className="bg-background/50 border-border/50 h-12 font-mono"
            />
          </div>
          <Button onClick={run} disabled={loading || !walletId || !stepUpDate} className="h-12 px-8 font-mono tracking-wider">
            {loading ? (
              <span className="flex items-center gap-2 animate-pulse">
                <Clock className="h-4 w-4" /> Fetching historical prices…
              </span>
            ) : (
              <span className="flex items-center gap-2">
                <ArrowRight className="h-4 w-4" /> Calculate Step-Up
              </span>
            )}
          </Button>
        </CardContent>
      </Card>

      {error && (
        <div className="rounded-md border border-red-500/30 bg-red-500/5 p-4 flex gap-3 text-red-400">
          <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
          <span className="text-sm font-serif">{error}</span>
        </div>
      )}

      {result && (
        <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 space-y-6">
          {result.unavailable_prices && result.unavailable_prices.length > 0 && (
            <div className="rounded-md border border-amber-500/30 bg-amber-500/5 p-4 flex gap-3">
              <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
              <p className="text-xs font-serif text-amber-400/80">
                Historical price not available for: <span className="font-mono">{result.unavailable_prices.join(", ")}</span>.
                CoinGecko free API covers roughly the past 365 days. Manually provide FMV for these assets.
              </p>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {[
              { label: "Step-Up Date", value: fmtDate(result.step_up_date) },
              { label: "Original Basis", value: fmtUsd(result.total_original_basis_usd) },
              { label: "Stepped-Up Basis", value: fmtUsd(result.total_stepped_up_basis_usd) },
              { label: "Gain Eliminated", value: fmtUsd(result.total_gain_eliminated_usd, { always: true }) },
              { label: "Lots Covered", value: result.lots.length },
              { label: "Wallet", value: result.wallet_id ? result.wallet_id.slice(0, 12) + (result.wallet_id.length > 12 ? "…" : "") : "—" },
            ].map((m) => (
              <div key={m.label} className="rounded border border-border/40 bg-muted/20 p-3 text-center">
                <div className="font-mono text-xl font-bold text-foreground">{m.value}</div>
                <div className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground mt-1">{m.label}</div>
              </div>
            ))}
          </div>

          {result.lots.length === 0 ? (
            <div className="flex items-center gap-3 text-muted-foreground p-6 rounded border border-border/30 bg-card/30">
              <CheckCircle2 className="h-5 w-5 text-green-500" />
              <span className="font-serif text-sm">No open lots found for this wallet before the step-up date.</span>
            </div>
          ) : (
            <Card className="bg-card/50 border-border/40">
              <CardHeader className="border-b border-border/40 bg-muted/10 pb-4">
                <CardTitle className="font-mono text-sm uppercase tracking-wider">Lot-Level Step-Up Detail</CardTitle>
              </CardHeader>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-border/30 bg-muted/10">
                      {["Lot ID", "Asset", "Qty", "Original Basis", "FMV at Death", "Stepped-Up Basis", "Gain Eliminated"].map((h) => (
                        <th key={h} className="text-left px-4 py-3 font-mono uppercase tracking-wider text-muted-foreground/70 text-[10px]">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/20">
                    {result.lots.map((l) => (
                      <tr key={l.lot_id} className="hover:bg-muted/10">
                        <td className="px-4 py-3 font-mono text-muted-foreground text-[11px]">{l.lot_id.slice(0, 8)}…</td>
                        <td className="px-4 py-3 font-mono font-bold text-foreground">{l.asset_symbol}</td>
                        <td className="px-4 py-3 font-mono text-muted-foreground">{fmtNum(l.quantity, 8)}</td>
                        <td className="px-4 py-3 font-mono text-muted-foreground">
                          <div>{l.original_cost_basis_per_unit_usd != null ? fmtUsd(l.original_cost_basis_per_unit_usd) + "/unit" : "—"}</div>
                          {l.original_cost_basis_usd != null && (
                            <div className="text-[10px] text-muted-foreground/50 mt-0.5">{fmtUsd(l.original_cost_basis_usd)} total</div>
                          )}
                        </td>
                        <td className="px-4 py-3 font-mono">{l.step_up_price_usd != null ? fmtUsd(l.step_up_price_usd) + "/unit" : "—"}</td>
                        <td className="px-4 py-3 font-mono font-semibold text-foreground">{fmtUsd(l.stepped_up_cost_basis_usd)}</td>
                        <td className={`px-4 py-3 font-mono font-semibold ${gainClass(l.gain_eliminated_usd)}`}>
                          {fmtUsd(l.gain_eliminated_usd, { always: true })}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}

          <div className="rounded-md border border-border/20 bg-muted/10 p-4 flex gap-3">
            <Info className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
            <p className="text-xs font-serif text-muted-foreground/70 leading-relaxed">{result.disclaimer}</p>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────

export default function TaxOptimizerPage() {
  const [tab, setTab] = useState<Tab>("simulate");

  const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: "simulate", label: "Sale Simulator", icon: <Calculator className="h-4 w-4" /> },
    { id: "harvest", label: "Harvest Candidates", icon: <TrendingDown className="h-4 w-4" /> },
    { id: "estate", label: "Estate Step-Up", icon: <ArrowRight className="h-4 w-4" /> },
  ];

  return (
    <div className="p-8 max-w-6xl mx-auto space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-serif font-bold text-foreground flex items-center gap-3">
          <Calculator className="h-8 w-8 text-primary" />
          Tax Optimizer
        </h1>
        <p className="text-muted-foreground mt-1 text-sm font-mono uppercase tracking-widest">
          Lot selection strategies · Harvest candidates · Estate basis step-up
        </p>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 border border-border/40 rounded-sm bg-muted/10 p-1 w-fit">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-[2px] text-sm font-mono transition-colors ${
              tab === t.id
                ? "bg-foreground text-background"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {t.icon}
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === "simulate" && <SimulateTab />}
      {tab === "harvest" && <HarvestTab />}
      {tab === "estate" && <EstateTab />}
    </div>
  );
}
