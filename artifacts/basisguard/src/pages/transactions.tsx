import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowUpDown, Upload, RefreshCw, AlertCircle, ArrowDownLeft, ArrowUpRight } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

// ── API helpers ───────────────────────────────────────────────────────────────

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
    credentials: "include",
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { error?: string }).error ?? `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface PositionRecord {
  id: string;
  asset_symbol: string;
  quantity: string;
  event_type: string;
  occurred_at: string | null;
  acquisition_price_usd: string | null;
  disposition_price_usd: string | null;
  wallet_id: string | null;
  chain_name: string | null;
  tx_hash: string | null;
  requires_review: boolean;
  is_stale: boolean;
}

interface PositionRecordsResponse {
  data: PositionRecord[];
  total: number;
  page: number;
  pageSize: number;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function eventLabel(type: string): { label: string; variant: "default" | "secondary" | "destructive" | "outline" } {
  switch (type) {
    case "acquisition":   return { label: "Acquisition",   variant: "default" };
    case "disposition":   return { label: "Disposition",   variant: "destructive" };
    case "transfer_in":   return { label: "Transfer In",   variant: "secondary" };
    case "transfer_out":  return { label: "Transfer Out",  variant: "outline" };
    case "airdrop":       return { label: "Airdrop",       variant: "secondary" };
    case "mining":        return { label: "Mining",        variant: "secondary" };
    case "staking_reward":return { label: "Staking Reward",variant: "secondary" };
    default:              return { label: type,            variant: "outline" };
  }
}

function fmtDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function fmtQty(qty: string) {
  const n = parseFloat(qty);
  return isNaN(n) ? qty : n.toLocaleString("en-US", { maximumFractionDigits: 8 });
}

function fmtUsd(val: string | null) {
  if (!val) return "—";
  const n = parseFloat(val);
  return isNaN(n) ? val : `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function TransactionsPage() {
  const [page, setPage] = useState(1);
  const pageSize = 50;

  const { data, isLoading, isError, error, refetch, isFetching } = useQuery<PositionRecordsResponse>({
    queryKey: ["position-records", page],
    queryFn: () => apiFetch<PositionRecordsResponse>(`/api/positions?page=${page}&pageSize=${pageSize}`),
  });

  const records = data?.data ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <ArrowUpDown className="h-6 w-6" />
            Transaction Ingestion
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            All ingested position records across connected wallets and chains.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
            <RefreshCw className={`h-4 w-4 mr-2 ${isFetching ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          <Button size="sm" disabled>
            <Upload className="h-4 w-4 mr-2" />
            Import CSV
          </Button>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Records</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{total.toLocaleString()}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Acquisitions</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-emerald-500">
              {records.filter(r => r.event_type === "acquisition" || r.event_type === "transfer_in" || r.event_type === "airdrop" || r.event_type === "mining" || r.event_type === "staking_reward").length}
            </p>
            <p className="text-xs text-muted-foreground">on this page</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Dispositions</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-red-500">
              {records.filter(r => r.event_type === "disposition" || r.event_type === "transfer_out").length}
            </p>
            <p className="text-xs text-muted-foreground">on this page</p>
          </CardContent>
        </Card>
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-16 text-muted-foreground">
              <RefreshCw className="h-5 w-5 animate-spin mr-2" />
              Loading transactions…
            </div>
          ) : isError ? (
            <div className="flex items-center justify-center py-16 text-destructive gap-2">
              <AlertCircle className="h-5 w-5" />
              {(error as Error).message}
            </div>
          ) : records.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-2">
              <ArrowUpDown className="h-8 w-8 opacity-30" />
              <p className="text-sm">No transactions found. Connect a wallet or import a CSV to get started.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/40">
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Date</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Type</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Asset</th>
                    <th className="text-right px-4 py-3 font-medium text-muted-foreground">Quantity</th>
                    <th className="text-right px-4 py-3 font-medium text-muted-foreground">Acq. Price</th>
                    <th className="text-right px-4 py-3 font-medium text-muted-foreground">Disp. Price</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Chain</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Tx Hash</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {records.map((r) => {
                    const ev = eventLabel(r.event_type);
                    const isIn = ["acquisition", "transfer_in", "airdrop", "mining", "staking_reward"].includes(r.event_type);
                    return (
                      <tr key={r.id} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
                        <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">{fmtDate(r.occurred_at)}</td>
                        <td className="px-4 py-3">
                          <span className="flex items-center gap-1.5">
                            {isIn
                              ? <ArrowDownLeft className="h-3 w-3 text-emerald-500 shrink-0" />
                              : <ArrowUpRight className="h-3 w-3 text-red-500 shrink-0" />
                            }
                            <Badge variant={ev.variant} className="text-xs">{ev.label}</Badge>
                          </span>
                        </td>
                        <td className="px-4 py-3 font-mono font-medium">{r.asset_symbol}</td>
                        <td className="px-4 py-3 text-right font-mono">{fmtQty(r.quantity)}</td>
                        <td className="px-4 py-3 text-right font-mono">{fmtUsd(r.acquisition_price_usd)}</td>
                        <td className="px-4 py-3 text-right font-mono">{fmtUsd(r.disposition_price_usd)}</td>
                        <td className="px-4 py-3 text-muted-foreground">{r.chain_name ?? "—"}</td>
                        <td className="px-4 py-3 font-mono text-xs text-muted-foreground truncate max-w-[120px]">
                          {r.tx_hash ? `${r.tx_hash.slice(0, 10)}…` : "—"}
                        </td>
                        <td className="px-4 py-3">
                          {r.requires_review && (
                            <Badge variant="outline" className="text-xs border-yellow-500 text-yellow-600">Review</Badge>
                          )}
                          {r.is_stale && (
                            <Badge variant="outline" className="text-xs border-red-400 text-red-500 ml-1">Stale</Badge>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>Page {page} of {totalPages} ({total.toLocaleString()} total)</span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>Previous</Button>
            <Button variant="outline" size="sm" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}>Next</Button>
          </div>
        </div>
      )}
    </div>
  );
}
