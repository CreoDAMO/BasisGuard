import React, { useEffect, useRef, useState } from "react";
import { Copy, ShieldCheck, Upload } from "lucide-react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { API } from "@/lib/api-base";
import { LegalFooter } from "@/components/legal/LegalFooter";

const DEFAULT_INBOX = "https://basisguard-api.onrender.com/api/billing/webhook";

type DeskStatus = {
  inbox: string;
  live: boolean;
  gated: boolean;
  authorized: boolean;
  hasEnvKeys: boolean;
  hasWebhookSecret: boolean;
};

export default function TreasuryPage() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<DeskStatus | null>(null);
  const [deskKey, setDeskKey] = useState("");
  const [keyFile, setKeyFile] = useState("");
  const [fileName, setFileName] = useState<string | null>(null);
  const [sandbox, setSandbox] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [subscriptionId, setSubscriptionId] = useState<string | null>(null);

  function headers(): HeadersInit {
    const h: Record<string, string> = { "content-type": "application/json" };
    if (deskKey.trim()) h["x-desk-key"] = deskKey.trim();
    return h;
  }

  useEffect(() => {
    fetch(`${API}/api/desk/status`, { headers: headers() })
      .then((res) => res.json())
      .then((data: DeskStatus) => setStatus(data))
      .catch(() =>
        setStatus({
          inbox: DEFAULT_INBOX,
          live: false,
          gated: false,
          authorized: true,
          hasEnvKeys: false,
          hasWebhookSecret: false,
        }),
      );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function resetFileInput() {
    if (fileRef.current) fileRef.current.value = "";
  }

  async function onPickFile(list: FileList | null) {
    const file = list?.[0];
    if (!file) return;
    setError(null);
    setSecret(null);
    if (file.size > 12_000) {
      setError("That file is too large. Use the JSON Coinbase downloaded.");
      resetFileInput();
      return;
    }
    const text = (await file.text()).trim();
    if (!text.startsWith("{")) {
      setError("Need the JSON key file (starts with {), not a PEM or screenshot.");
      resetFileInput();
      return;
    }
    setKeyFile(text);
    setFileName(file.name);
  }

  async function register(useEnv: boolean) {
    setBusy(true);
    setError(null);
    setSecret(null);
    setCopied(false);
    try {
      const res = await fetch(`${API}/api/desk/webhook`, {
        method: "POST",
        headers: headers(),
        body: JSON.stringify({
          keyFile: useEnv ? undefined : keyFile,
          useEnv,
          sandbox,
          targetUrl: status?.inbox,
        }),
      });
      const data = (await res.json()) as { error?: string; secret?: string; id?: string };
      if (!res.ok || !data.secret) throw new Error(data.error || "Coinbase rejected the create.");
      setSecret(data.secret);
      setSubscriptionId(data.id || null);
      setKeyFile("");
      setFileName(null);
      resetFileInput();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Coinbase rejected the create.");
    } finally {
      setBusy(false);
    }
  }

  async function copySecret() {
    if (!secret) return;
    try {
      await navigator.clipboard.writeText(secret);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  const locked = Boolean(status?.gated && !status.authorized);

  return (
    <div className="flex min-h-[100dvh] flex-col bg-[#0a0a0a] text-[#e6e6e6]">
      <header className="border-b border-[#1f1f1f]">
        <div className="mx-auto flex h-14 max-w-xl items-center justify-between px-4">
          <Link href="/" className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5" strokeWidth={1.5} />
            <span className="font-serif text-lg tracking-wide">BasisGuard</span>
          </Link>
          <span className="font-mono text-xs uppercase tracking-[0.18em] text-[#999999]">Desk</span>
        </div>
      </header>
      <main className="mx-auto w-full max-w-xl flex-1 space-y-6 px-4 py-8">
        <img
          src="/hero-ledger.jpg"
          alt="Evidence log with a USDC settlement coin"
          className="w-full rounded-lg border border-[#1f1f1f] object-cover"
        />
        <section className="space-y-4 rounded-lg border border-[#1f1f1f] bg-[#111111] p-5">
          <p className="font-mono text-xs uppercase tracking-[0.2em] text-[#999999]">Phone wire</p>
          <h1 className="font-serif text-2xl tracking-tight">Register the Checkout webhook</h1>
          <p className="text-sm leading-relaxed text-[#999999]">
            Upload the JSON Coinbase downloaded, or paste it. Keys sign one request and are not stored. Copy the HMAC
            secret into Render as{" "}
            <span className="font-mono text-[#e6e6e6]">COINBASE_BUSINESS_WEBHOOK_SECRET</span>.
          </p>
          <p className="font-mono text-xs text-[#999999]">
            Inbox {status?.inbox ?? DEFAULT_INBOX}
            {status?.live ? " · live settlement" : " · preview settlement"}
            {status?.hasEnvKeys ? " · server already has a CDP key" : ""}
            {status?.hasWebhookSecret ? " · webhook secret already in env" : ""}
          </p>

          {locked ? (
            <div className="space-y-2">
              <Label htmlFor="desk-key">Desk key</Label>
              <input
                id="desk-key"
                type="password"
                value={deskKey}
                onChange={(e) => setDeskKey(e.target.value)}
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                className="min-h-11 w-full rounded-md border border-[#2a2a2a] bg-[#1f1f1f] px-3 font-mono text-base text-[#e6e6e6]"
              />
            </div>
          ) : null}

          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json,.txt,text/plain"
            className="sr-only"
            onChange={(e) => void onPickFile(e.target.files)}
          />
          <Button
            type="button"
            size="lg"
            variant="outline"
            className="min-h-11 w-full"
            disabled={busy}
            onClick={() => fileRef.current?.click()}
          >
            <Upload />
            {fileName ? fileName : "Upload key file"}
          </Button>
          <Label htmlFor="cdp-key">Or paste the JSON</Label>
          <textarea
            id="cdp-key"
            value={keyFile}
            onChange={(e) => {
              setKeyFile(e.target.value);
              setFileName(null);
            }}
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            autoComplete="off"
            rows={6}
            placeholder='{"name":"organizations/…/apiKeys/…","privateKey":"-----BEGIN …"}'
            className="w-full rounded-md border border-[#2a2a2a] bg-[#1f1f1f] px-3 py-3 font-mono text-base leading-relaxed text-[#e6e6e6] outline-none placeholder:text-[#666666]"
          />
          <button
            type="button"
            onClick={() => setSandbox((s) => !s)}
            className="flex min-h-11 w-full items-center justify-between rounded-md border border-[#2a2a2a] bg-[#1f1f1f] px-3 text-left text-sm"
          >
            <span>Sandbox events only</span>
            <span className="font-mono text-xs text-[#999999]">
              {sandbox ? "ON · labels.sandbox=true" : "OFF · live checkouts"}
            </span>
          </button>
          <Button
            size="lg"
            className="min-h-11 w-full"
            disabled={busy || !keyFile.trim()}
            onClick={() => void register(false)}
          >
            {busy ? "Talking to Coinbase…" : "Register webhook"}
          </Button>
          {status?.hasEnvKeys ? (
            <Button size="lg" variant="outline" className="min-h-11 w-full" disabled={busy} onClick={() => void register(true)}>
              Use the key already on the server
            </Button>
          ) : null}

          {error ? <p className="text-sm text-red-400">{error}</p> : null}

          {secret ? (
            <div className="space-y-3 rounded-md border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-4">
              <p className="font-mono text-xs uppercase tracking-[0.2em] text-[#999999]">Copy now — not saved</p>
              {subscriptionId ? <p className="font-mono text-xs text-[#999999]">id {subscriptionId}</p> : null}
              <p className="break-all font-mono text-sm">{secret}</p>
              <Button className="min-h-11 w-full" onClick={() => void copySecret()}>
                <Copy />
                {copied ? "Copied" : "Copy webhook secret"}
              </Button>
              <p className="text-xs text-[#999999]">
                Paste into Render → basisguard-api → Environment as COINBASE_BUSINESS_WEBHOOK_SECRET, then redeploy.
              </p>
            </div>
          ) : null}
        </section>
        <section className="space-y-3 rounded-lg border border-[#1f1f1f] bg-[#111111] p-5">
          <h2 className="font-serif text-xl">Merchant rail</h2>
          <p className="text-sm leading-relaxed text-[#999999]">
            Subscriptions settle in USDC to SSDF Inc.’s Coinbase Business account. This desk registers the Hook0
            subscription so checkout.payment.success can activate a plan. It does not classify lots and it does not wrap
            a Circular 230 opinion.
          </p>
        </section>
      </main>
      <LegalFooter />
    </div>
  );
}
