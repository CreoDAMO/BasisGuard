import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link2, Link2Off, RefreshCw, AlertCircle, CheckCircle2, ExternalLink } from "lucide-react";

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

interface ConnectionStatus {
  connected: boolean;
  api_key?: string;
  last_synced_at?: string | null;
  tx_count?: number;
  status?: string;
  error_message?: string | null;
}

interface SyncResult {
  synced: number;
  skipped: number;
  errors: Array<{ account: string; error: string }>;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function ConnectionsPage() {
  const qc = useQueryClient();

  const { data: conn, isLoading } = useQuery<ConnectionStatus>({
    queryKey: ["coinbase-connection"],
    queryFn: () => apiFetch("/api/coinbase/connection"),
  });

  const [apiKey, setApiKey] = useState("");
  const [apiSecret, setApiSecret] = useState("");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [syncResult, setSyncResult] = useState<SyncResult | null>(null);

  const saveMutation = useMutation({
    mutationFn: () =>
      apiFetch("/api/coinbase/connection", {
        method: "POST",
        body: JSON.stringify({ api_key: apiKey, api_secret: apiSecret }),
      }),
    onSuccess: () => {
      setSaveError(null);
      setApiKey("");
      setApiSecret("");
      qc.invalidateQueries({ queryKey: ["coinbase-connection"] });
    },
    onError: (e: Error) => setSaveError(e.message),
  });

  const disconnectMutation = useMutation({
    mutationFn: () => apiFetch("/api/coinbase/connection", { method: "DELETE" }),
    onSuccess: () => {
      setSyncResult(null);
      qc.invalidateQueries({ queryKey: ["coinbase-connection"] });
    },
  });

  const syncMutation = useMutation({
    mutationFn: () =>
      apiFetch<SyncResult>("/api/coinbase/sync", { method: "POST" }),
    onSuccess: (data) => {
      setSyncResult(data);
      qc.invalidateQueries({ queryKey: ["coinbase-connection"] });
    },
  });

  return (
    <div className="p-6 md:p-8 max-w-2xl space-y-8">
      {/* Header */}
      <div>
        <h1 className="font-serif text-2xl font-semibold tracking-wide uppercase text-foreground">
          Connections
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Import transaction history directly from exchanges and on-chain data sources.
        </p>
      </div>

      {/* Coinbase Card */}
      <div className="border border-border rounded-sm bg-card">
        {/* Card header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-sm bg-[#0052FF] flex items-center justify-center flex-shrink-0">
              <span className="text-white font-bold text-sm">₿</span>
            </div>
            <div>
              <div className="font-medium text-foreground text-sm">Coinbase</div>
              <div className="text-xs text-muted-foreground font-mono">
                CDP Advanced Trade · Legacy V2
              </div>
            </div>
          </div>
          {!isLoading && (
            <StatusBadge status={conn?.connected ? conn.status ?? "active" : "disconnected"} />
          )}
        </div>

        {/* Card body */}
        <div className="px-5 py-5 space-y-5">
          {isLoading ? (
            <div className="text-sm text-muted-foreground">Loading…</div>
          ) : conn?.connected ? (
            <ConnectedView
              conn={conn}
              syncResult={syncResult}
              onSync={() => { setSyncResult(null); syncMutation.mutate(); }}
              onDisconnect={() => disconnectMutation.mutate()}
              syncing={syncMutation.isPending}
              disconnecting={disconnectMutation.isPending}
              syncError={syncMutation.error?.message ?? null}
            />
          ) : (
            <ConnectForm
              apiKey={apiKey}
              apiSecret={apiSecret}
              onApiKeyChange={setApiKey}
              onApiSecretChange={setApiSecret}
              onSave={() => saveMutation.mutate()}
              saving={saveMutation.isPending}
              error={saveError}
            />
          )}
        </div>
      </div>

      {/* Docs callout */}
      <div className="text-xs text-muted-foreground space-y-1 border-t border-border pt-4">
        <p className="font-mono uppercase tracking-wider text-[10px]">What gets imported</p>
        <ul className="list-disc list-inside space-y-0.5 mt-1">
          <li>Trades, buys, sells, sends, receives — mapped to BasisGuard event types</li>
          <li>Staking rewards and Coinbase Earn payouts → <span className="font-mono">staking_reward</span> (Rev. Rul. 2023-14)</li>
          <li>Asset wraps/unwraps → <span className="font-mono">bridge_transfer</span></li>
          <li>All open-gap events are flagged for review automatically</li>
        </ul>
        <a
          href="https://portal.cdp.coinbase.com/access/api"
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 text-foreground hover:underline mt-2"
        >
          <ExternalLink className="h-3 w-3" />
          Manage CDP keys (Advanced Trade)
        </a>
        <span className="mx-2 text-border">·</span>
        <a
          href="https://www.coinbase.com/settings/api"
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 text-foreground hover:underline"
        >
          <ExternalLink className="h-3 w-3" />
          Legacy API keys
        </a>
      </div>
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  if (status === "disconnected") {
    return (
      <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground border border-border px-2 py-0.5 rounded-sm">
        Not connected
      </span>
    );
  }
  if (status === "error") {
    return (
      <span className="font-mono text-[10px] uppercase tracking-wider text-red-400 border border-red-800 px-2 py-0.5 rounded-sm">
        Error
      </span>
    );
  }
  return (
    <span className="font-mono text-[10px] uppercase tracking-wider text-green-400 border border-green-800 px-2 py-0.5 rounded-sm">
      Connected
    </span>
  );
}

function ConnectedView({
  conn,
  syncResult,
  onSync,
  onDisconnect,
  syncing,
  disconnecting,
  syncError,
}: {
  conn: ConnectionStatus;
  syncResult: SyncResult | null;
  onSync: () => void;
  onDisconnect: () => void;
  syncing: boolean;
  disconnecting: boolean;
  syncError: string | null;
}) {
  return (
    <div className="space-y-4">
      {/* Key info */}
      <div className="grid grid-cols-2 gap-3 text-sm">
        <InfoRow label="API Key" value={conn.api_key ?? "—"} />
        <InfoRow
          label="Last synced"
          value={
            conn.last_synced_at
              ? new Date(conn.last_synced_at).toLocaleString()
              : "Never"
          }
        />
        <InfoRow label="Transactions imported" value={String(conn.tx_count ?? 0)} />
        <InfoRow label="Status" value={conn.status === "error" ? "Error" : "Active"} />
      </div>

      {/* Error message */}
      {conn.status === "error" && conn.error_message && (
        <div className="flex items-start gap-2 text-xs text-red-400 bg-red-950/30 border border-red-800 rounded-sm px-3 py-2">
          <AlertCircle className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
          <span>{conn.error_message}</span>
        </div>
      )}

      {/* Sync result */}
      {syncResult && (
        <div className="flex items-start gap-2 text-xs bg-muted/30 border border-border rounded-sm px-3 py-2">
          <CheckCircle2 className="h-3.5 w-3.5 mt-0.5 flex-shrink-0 text-green-400" />
          <span className="text-foreground">
            Sync complete — <strong>{syncResult.synced}</strong> new transactions imported,{" "}
            <strong>{syncResult.skipped}</strong> already present.
            {syncResult.errors.length > 0 && (
              <span className="text-yellow-400">
                {" "}
                {syncResult.errors.length} account error(s).
              </span>
            )}
          </span>
        </div>
      )}

      {/* Sync error */}
      {syncError && (
        <div className="flex items-start gap-2 text-xs text-red-400 bg-red-950/30 border border-red-800 rounded-sm px-3 py-2">
          <AlertCircle className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
          <span>{syncError}</span>
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-2 pt-1">
        <button
          type="button"
          onClick={onSync}
          disabled={syncing}
          className="flex items-center gap-2 px-4 py-2 bg-foreground text-background text-xs font-medium rounded-sm hover:opacity-90 disabled:opacity-50 transition-opacity"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${syncing ? "animate-spin" : ""}`} />
          {syncing ? "Syncing…" : "Sync Now"}
        </button>
        <button
          type="button"
          onClick={onDisconnect}
          disabled={disconnecting}
          className="flex items-center gap-2 px-4 py-2 border border-border text-muted-foreground text-xs font-medium rounded-sm hover:text-foreground hover:border-foreground disabled:opacity-50 transition-colors"
        >
          <Link2Off className="h-3.5 w-3.5" />
          {disconnecting ? "Disconnecting…" : "Disconnect"}
        </button>
      </div>
    </div>
  );
}

function ConnectForm({
  apiKey,
  apiSecret,
  onApiKeyChange,
  onApiSecretChange,
  onSave,
  saving,
  error,
}: {
  apiKey: string;
  apiSecret: string;
  onApiKeyChange: (v: string) => void;
  onApiSecretChange: (v: string) => void;
  onSave: () => void;
  saving: boolean;
  error: string | null;
}) {
  // Detect CDP vs legacy based on key name format
  const isCdp =
    apiKey.includes("/apiKeys/") ||
    apiSecret.includes("BEGIN EC PRIVATE KEY") ||
    apiSecret.includes("BEGIN PRIVATE KEY");

  return (
    <div className="space-y-4">
      {/* Key type tabs */}
      <div className="flex gap-1 p-1 bg-muted/30 rounded-sm w-fit text-[11px] font-mono">
        <span className={`px-2 py-0.5 rounded-sm ${isCdp ? "bg-card text-foreground" : "text-muted-foreground"}`}>
          CDP (Advanced Trade)
        </span>
        <span className={`px-2 py-0.5 rounded-sm ${!isCdp && apiKey ? "bg-card text-foreground" : "text-muted-foreground"}`}>
          Legacy V2
        </span>
      </div>

      <p className="text-sm text-muted-foreground">
        {isCdp
          ? "Using CDP key format — your EC private key will be stored encrypted and used to sign JWT requests to the Advanced Trade API."
          : "Enter your Coinbase API credentials. For CDP keys, paste the full key name (organizations/…/apiKeys/…) and your EC private key. Credentials are encrypted at rest."}
      </p>

      <div className="space-y-3">
        <div className="space-y-1.5">
          <label className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
            {isCdp ? "Key Name" : "API Key"}
          </label>
          <input
            type="text"
            value={apiKey}
            onChange={(e) => onApiKeyChange(e.target.value)}
            placeholder={
              isCdp
                ? "organizations/abc123/apiKeys/def456"
                : "Your Coinbase API key"
            }
            className="w-full bg-input border border-border rounded-sm px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-foreground/20 font-mono"
          />
        </div>

        <div className="space-y-1.5">
          <label className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
            {isCdp ? "EC Private Key (PEM)" : "API Secret"}
          </label>
          {isCdp ? (
            <textarea
              value={apiSecret}
              onChange={(e) => onApiSecretChange(e.target.value)}
              rows={6}
              placeholder={"-----BEGIN EC PRIVATE KEY-----\nMHQCAQEEI...\n-----END EC PRIVATE KEY-----"}
              className="w-full bg-input border border-border rounded-sm px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-foreground/20 font-mono resize-none"
            />
          ) : (
            <input
              type="password"
              value={apiSecret}
              onChange={(e) => onApiSecretChange(e.target.value)}
              placeholder="Your Coinbase API secret"
              className="w-full bg-input border border-border rounded-sm px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-foreground/20 font-mono"
            />
          )}
        </div>
      </div>

      {error && (
        <div className="flex items-start gap-2 text-xs text-red-400 bg-red-950/30 border border-red-800 rounded-sm px-3 py-2">
          <AlertCircle className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <button
        type="button"
        onClick={onSave}
        disabled={saving || !apiKey.trim() || !apiSecret.trim()}
        className="flex items-center gap-2 px-4 py-2 bg-foreground text-background text-xs font-medium rounded-sm hover:opacity-90 disabled:opacity-50 transition-opacity"
      >
        <Link2 className="h-3.5 w-3.5" />
        {saving ? "Saving…" : "Connect Coinbase"}
      </button>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground mb-0.5">
        {label}
      </div>
      <div className="text-sm text-foreground">{value}</div>
    </div>
  );
}
