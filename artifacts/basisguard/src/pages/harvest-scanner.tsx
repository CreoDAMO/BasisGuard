import React, { useState } from "react";
import { Scissors, AlertTriangle, CheckCircle2, Info, Clock, TrendingDown, Search } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface WashSalePair {
  loss_position_id: string;
  gain_position_id: string;
  days_between: number;
}

interface HarvestCandidate {
  position_id: string;
  wallet_id: string | null;
  event_type: string;
  classification: string;
  tier: string;
  tx_date: string | null;
  amount_usd: number | null;
  requires_review: boolean;
  reviewer_signoff_at: string | null;
  wash_sale_risk: boolean;
  wash_sale_pairs: WashSalePair[];
}

interface HarvestResult {
  generated_at: string;
  tax_year: number | null;
  wallet_id: string | null;
  total_candidates: number;
  wash_sale_risk_count: number;
  disclaimer: string;
  candidates: HarvestCandidate[];
}

const BASE = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";

function fmtUsd(v: number | null): string {
  if (v == null) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    signDisplay: "always",
  }).format(v);
}

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

function tierBadgeClass(tier: string): string {
  if (tier === "will") return "border-green-500/40 text-green-400 bg-green-500/10";
  if (tier === "should") return "border-blue-500/40 text-blue-400 bg-blue-500/10";
  if (tier === "more_likely_than_not") return "border-yellow-500/40 text-yellow-400 bg-yellow-500/10";
  if (tier === "substantial_authority") return "border-orange-500/40 text-orange-400 bg-orange-500/10";
  return "border-red-500/40 text-red-400 bg-red-500/10"; // reasonable_basis
}

export default function HarvestScannerPage() {
  const [taxYear, setTaxYear] = useState<string>((new Date().getFullYear() - 1).toString());
  const [walletId, setWalletId] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<HarvestResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const params = new URLSearchParams();
      if (taxYear) params.set("tax_year", taxYear);
      if (walletId.trim()) params.set("wallet_id", walletId.trim());
      const resp = await fetch(`${BASE}/api/positions/harvest-candidates?${params}`);
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

  const noAmountCount = result?.candidates.filter((c) => c.amount_usd == null).length ?? 0;

  return (
    <div className="p-8 max-w-5xl mx-auto space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-serif font-bold text-foreground flex items-center gap-3">
          <Scissors className="h-8 w-8 text-primary" />
          Loss Harvesting Scanner
        </h1>
        <p className="text-muted-foreground mt-1 text-sm font-mono uppercase tracking-widest">
          Identify taxable dispositions &amp; wash-sale risk
        </p>
      </div>

      {/* Disclaimer */}
      <div className="rounded-md border border-blue-500/20 bg-blue-500/5 p-4 flex gap-3">
        <Info className="h-4 w-4 text-blue-400 shrink-0 mt-0.5" />
        <p className="text-xs font-serif text-blue-400/80 leading-relaxed">
          IRC §1091 wash-sale rules apply to stocks and securities. The IRS has not officially extended them to
          cryptocurrency. Wash-sale risk flags here are conservative practitioner markers — not legal
          determinations. Consult qualified tax counsel before acting on these results.
        </p>
      </div>

      {/* Controls */}
      <Card className="bg-card/50 backdrop-blur border-border/50">
        <CardHeader className="border-b border-border/50 bg-muted/10 pb-5">
          <CardTitle className="font-serif text-xl">Scan Parameters</CardTitle>
          <CardDescription className="font-serif">
            Finds all positions classified as taxable dispositions and flags wash-sale pairs within a 30-day window.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-6 space-y-5">
          <div className="flex flex-col sm:flex-row gap-4 items-end">
            <div className="space-y-2 flex-1">
              <Label className="text-xs font-mono uppercase tracking-wider text-muted-foreground">Tax Year</Label>
              <Select value={taxYear} onValueChange={setTaxYear}>
                <SelectTrigger className="bg-background/50 border-border/50 h-12 text-lg font-mono">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[2025, 2024, 2023, 2022, 2021].map((y) => (
                    <SelectItem key={y} value={y.toString()}>{y}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2 flex-1">
              <Label className="text-xs font-mono uppercase tracking-wider text-muted-foreground">
                Wallet ID <span className="text-muted-foreground/50 normal-case">(optional)</span>
              </Label>
              <Input
                placeholder="0x…"
                value={walletId}
                onChange={(e) => setWalletId(e.target.value)}
                className="bg-background/50 border-border/50 h-12 font-mono text-sm"
              />
            </div>

            <Button onClick={run} disabled={loading} className="h-12 px-8 font-mono tracking-wider shrink-0">
              {loading ? (
                <span className="flex items-center gap-2 animate-pulse">
                  <Clock className="h-4 w-4" /> Scanning…
                </span>
              ) : (
                <span className="flex items-center gap-2">
                  <Search className="h-4 w-4" /> Run Scanner
                </span>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Error */}
      {error && (
        <div className="rounded-md border border-red-500/30 bg-red-500/5 p-4 flex gap-3 text-red-400">
          <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
          <span className="text-sm font-serif">{error}</span>
        </div>
      )}

      {/* Results */}
      {result && (
        <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 space-y-6">
          {/* Summary bar */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: "Total Candidates", value: result.total_candidates },
              {
                label: "Wash-Sale Risk",
                value: result.wash_sale_risk_count,
                highlight: result.wash_sale_risk_count > 0,
              },
              {
                label: "No Amount Data",
                value: noAmountCount,
                sub: "amount_usd not set",
              },
              {
                label: "Tax Year",
                value: result.tax_year ?? "All",
              },
            ].map((m) => (
              <div
                key={m.label}
                className={`rounded border p-3 text-center ${m.highlight ? "border-amber-500/30 bg-amber-500/5" : "border-border/40 bg-muted/20"}`}
              >
                <div className={`font-mono text-2xl font-bold ${m.highlight ? "text-amber-400" : "text-foreground"}`}>
                  {m.value}
                </div>
                <div className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground mt-1">
                  {m.label}
                </div>
                {m.sub && (
                  <div className="font-mono text-[9px] text-muted-foreground/50 mt-0.5">{m.sub}</div>
                )}
              </div>
            ))}
          </div>

          {/* No candidates */}
          {result.candidates.length === 0 && (
            <div className="flex items-center gap-3 text-muted-foreground p-6 rounded border border-border/30 bg-card/30">
              <CheckCircle2 className="h-5 w-5 text-green-500" />
              <span className="font-serif text-sm">
                No taxable disposition positions found for the selected parameters. Nothing to harvest.
              </span>
            </div>
          )}

          {/* Candidates table */}
          {result.candidates.length > 0 && (
            <Card className="bg-card/50 border-border/40">
              <CardHeader className="border-b border-border/40 bg-muted/10 pb-4">
                <CardTitle className="font-mono text-sm uppercase tracking-wider flex items-center gap-2">
                  <TrendingDown className="h-4 w-4 text-primary" />
                  Harvest Candidates — sorted by realized loss
                </CardTitle>
              </CardHeader>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-border/30 bg-muted/10">
                      {["Date", "Event Type", "Tier", "Realized P&L", "Review", "Wash-Sale"].map((h) => (
                        <th
                          key={h}
                          className="text-left px-4 py-3 font-mono uppercase tracking-wider text-muted-foreground/70 text-[10px]"
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/20">
                    {result.candidates.map((c) => (
                      <tr
                        key={c.position_id}
                        className={`hover:bg-muted/10 transition-colors ${c.wash_sale_risk ? "bg-amber-500/3" : ""}`}
                      >
                        <td className="px-4 py-3 font-mono text-muted-foreground">
                          {fmtDate(c.tx_date)}
                        </td>
                        <td className="px-4 py-3 font-mono text-foreground/80">{c.event_type}</td>
                        <td className="px-4 py-3">
                          <Badge
                            variant="outline"
                            className={`text-[10px] font-mono uppercase ${tierBadgeClass(c.tier)}`}
                          >
                            {c.tier.replace(/_/g, " ")}
                          </Badge>
                        </td>
                        <td className="px-4 py-3">
                          {c.amount_usd == null ? (
                            <span className="text-muted-foreground/50 font-mono">—</span>
                          ) : (
                            <span
                              className={`font-mono font-semibold ${c.amount_usd < 0 ? "text-red-400" : "text-green-400"}`}
                            >
                              {fmtUsd(c.amount_usd)}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          {c.reviewer_signoff_at ? (
                            <span className="text-green-500 font-mono text-[10px]">✓ Signed</span>
                          ) : c.requires_review ? (
                            <span className="text-amber-400 font-mono text-[10px]">Pending</span>
                          ) : (
                            <span className="text-muted-foreground/40 font-mono text-[10px]">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          {c.wash_sale_risk ? (
                            <div className="flex items-center gap-1">
                              <AlertTriangle className="h-3.5 w-3.5 text-amber-400" />
                              <span className="text-amber-400 font-mono text-[10px] uppercase tracking-wider">
                                Risk ({c.wash_sale_pairs.length} pair{c.wash_sale_pairs.length !== 1 ? "s" : ""})
                              </span>
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

          {/* Wash-sale pairs detail */}
          {result.wash_sale_risk_count > 0 && (
            <Card className="border-amber-500/20 bg-amber-500/5">
              <CardHeader className="pb-3">
                <CardTitle className="font-mono text-sm uppercase tracking-wider text-amber-400 flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4" />
                  Wash-Sale Risk Pairs
                </CardTitle>
                <CardDescription className="font-serif text-amber-400/70 text-xs leading-relaxed">
                  These position pairs fall within the 30-day window. If §1091 applies (uncertain for crypto),
                  the loss on the left-side position may be disallowed. Consult your preparer.
                </CardDescription>
              </CardHeader>
              <CardContent className="pt-0 space-y-2">
                {result.candidates
                  .filter((c) => c.wash_sale_risk && c.wash_sale_pairs.some((p) => p.loss_position_id === c.position_id))
                  .map((c) =>
                    c.wash_sale_pairs
                      .filter((p) => p.loss_position_id === c.position_id)
                      .map((pair) => (
                        <div
                          key={`${pair.loss_position_id}-${pair.gain_position_id}`}
                          className="rounded border border-amber-500/20 bg-amber-500/5 p-3 font-mono text-xs text-amber-300/80 flex flex-col sm:flex-row sm:items-center gap-2"
                        >
                          <span className="truncate">
                            Loss: <span className="text-amber-300">{pair.loss_position_id.slice(0, 8)}…</span>
                          </span>
                          <span className="text-amber-500/50 hidden sm:inline">↔</span>
                          <span className="truncate">
                            Other: <span className="text-amber-300">{pair.gain_position_id.slice(0, 8)}…</span>
                          </span>
                          <span className="text-amber-500/60 ml-auto shrink-0">
                            {pair.days_between}d apart
                          </span>
                        </div>
                      ))
                  )}
              </CardContent>
            </Card>
          )}

          {/* No amount_usd notice */}
          {noAmountCount > 0 && (
            <div className="rounded-md border border-border/30 bg-muted/10 p-4 flex gap-3">
              <Info className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
              <p className="text-xs font-serif text-muted-foreground/80 leading-relaxed">
                {noAmountCount} position{noAmountCount !== 1 ? "s" : ""} do not have a realized P&amp;L amount
                (amount_usd is null). These are classified positions created before the amount field was available.
                Populate <code className="font-mono text-[11px]">amount_usd</code> via the ingest route to enable
                dollar-level harvesting analysis.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
