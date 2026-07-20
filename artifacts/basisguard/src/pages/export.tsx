import React, { useState } from "react";
import {
  useGetAuditPackage,
  useGetCommentLetter,
  useGetCpaHandoff,
  getGetAuditPackageQueryKey,
  getGetCommentLetterQueryKey,
  getGetCpaHandoffQueryKey,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  Download, ShieldCheck, FileJson, CheckCircle2, Clock,
  AlertTriangle, FileText, Users, MessageSquare, Eye, EyeOff
} from "lucide-react";
import { format } from "date-fns";

type ExportVariant = "audit" | "audit-redacted" | "cpa-handoff" | "comment-letter" | "dossier";

const VARIANTS: { value: ExportVariant; label: string; description: string; icon: React.ReactNode; needsYear: boolean }[] = [
  {
    value: "dossier",
    label: "IRS-Ready Dossier",
    description: "One-click combined package: audit evidence, pattern report, comment-letter data, and CPA hand-off in a single signed envelope. The definitive filing artefact.",
    icon: <FileText className="h-5 w-5" />,
    needsYear: true,
  },
  {
    value: "audit",
    label: "IRS Audit Defense Package",
    description: "Complete evidence log with all positions and cited IRS authorities for a tax year. Used for IRS examination responses.",
    icon: <ShieldCheck className="h-5 w-5" />,
    needsYear: true,
  },
  {
    value: "audit-redacted",
    label: "Audit Package (PII Redacted)",
    description: "Same as above but with wallet IDs and transaction IDs masked. Use when sharing with third-party reviewers.",
    icon: <EyeOff className="h-5 w-5" />,
    needsYear: true,
  },
  {
    value: "cpa-handoff",
    label: "CPA Hand-off Package",
    description: "Summary, open action items, and preparer checklist for the signing CPA. Flags pending sign-offs and stale positions.",
    icon: <Users className="h-5 w-5" />,
    needsYear: true,
  },
  {
    value: "comment-letter",
    label: "Comment Letter Prep",
    description: "Anonymized aggregate data for open-gap event types. Use when drafting ABA/AICPA comments on IRS proposed guidance.",
    icon: <MessageSquare className="h-5 w-5" />,
    needsYear: false,
  },
];

export default function ExportPage() {
  const [taxYear, setTaxYear] = useState<number>(new Date().getFullYear() - 1);
  const [variant, setVariant] = useState<ExportVariant>("audit");
  const [isExporting, setIsExporting] = useState(false);
  const [packageResult, setPackageResult] = useState<any>(null);
  const [complianceOverride, setComplianceOverride] = useState(false);

  const selectedVariant = VARIANTS.find((v) => v.value === variant)!;
  const isRedacted = variant === "audit-redacted";

  const { refetch: refetchAudit } = useGetAuditPackage(
    { tax_year: taxYear, redact_pii: isRedacted },
    { query: { enabled: false, queryKey: getGetAuditPackageQueryKey({ tax_year: taxYear, redact_pii: isRedacted }) } }
  );

  const { refetch: refetchComment } = useGetCommentLetter({
    query: { enabled: false, queryKey: getGetCommentLetterQueryKey() }
  });

  const { refetch: refetchCpa } = useGetCpaHandoff(
    { tax_year: taxYear },
    { query: { enabled: false, queryKey: getGetCpaHandoffQueryKey({ tax_year: taxYear }) } }
  );

  const BASE = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";

  const handleExport = async () => {
    setIsExporting(true);
    setPackageResult(null);
    try {
      let data: any;

      if (variant === "dossier") {
        // Direct fetch — no generated hook yet for the dossier endpoint
        const params = new URLSearchParams({ tax_year: String(taxYear) });
        if (isRedacted) params.set("redact_pii", "true");
        const resp = await fetch(`${BASE}/api/export/dossier?${params}`);
        if (!resp.ok) {
          const body = await resp.json().catch(() => ({}));
          throw new Error((body as any).error ?? `HTTP ${resp.status}`);
        }
        data = await resp.json();
      } else if (variant === "audit" || variant === "audit-redacted") {
        const result = await refetchAudit();
        data = result.data;
      } else if (variant === "comment-letter") {
        const result = await refetchComment();
        data = result.data;
      } else {
        const result = await refetchCpa();
        data = result.data;
      }

      if (!data) throw new Error("No data returned");

      // Compliance guard: block export if pending reviews exist (unless overridden)
      if ((variant === "audit" || variant === "audit-redacted") && data.requires_review_count > 0 && !complianceOverride) {
        setPackageResult({ __blocked: true, data });
        return;
      }

      setPackageResult(data);
      triggerDownload(data, variant, taxYear);
    } catch (err) {
      console.error(err);
    } finally {
      setIsExporting(false);
    }
  };

  const triggerDownload = (data: any, v: ExportVariant, year: number) => {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = v === "dossier"
      ? `basisguard_irs_dossier_${year}.json`
      : v === "comment-letter"
      ? `basisguard_comment_letter_${new Date().getFullYear()}.json`
      : v === "cpa-handoff"
      ? `basisguard_cpa_handoff_${year}.json`
      : `basisguard_audit_package_${year}${v === "audit-redacted" ? "_redacted" : ""}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const isBlocked = packageResult?.__blocked;
  const pendingCount = isBlocked ? packageResult.data?.requires_review_count : 0;

  return (
    <div className="p-8 max-w-4xl mx-auto space-y-8">
      <div>
        <h1 className="text-3xl font-serif font-bold text-foreground flex items-center gap-3">
          <ShieldCheck className="h-8 w-8 text-primary" />
          Audit Defense Package
        </h1>
        <p className="text-muted-foreground mt-1 text-sm font-mono uppercase tracking-widest">Generate immutable position schedules</p>
      </div>

      {/* Export variant selector */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {VARIANTS.map((v) => (
          <button
            key={v.value}
            onClick={() => { setVariant(v.value); setPackageResult(null); setComplianceOverride(false); }}
            className={`text-left rounded-lg border p-4 transition-all ${
              variant === v.value
                ? "border-primary/40 bg-primary/5 shadow-[0_0_12px_rgba(255,255,255,0.04)]"
                : "border-border/40 bg-card/30 hover:bg-card/50 hover:border-border/60"
            }`}
          >
            <div className="flex items-center gap-2 mb-1.5">
              <span className={variant === v.value ? "text-primary" : "text-muted-foreground"}>{v.icon}</span>
              <span className={`font-mono text-xs font-semibold uppercase tracking-wider ${variant === v.value ? "text-foreground" : "text-muted-foreground"}`}>
                {v.label}
              </span>
            </div>
            <p className="text-xs font-serif text-muted-foreground/80 leading-relaxed">{v.description}</p>
          </button>
        ))}
      </div>

      {/* Parameters */}
      <Card className="bg-card/50 backdrop-blur border-border/50 shadow-sm">
        <CardHeader className="border-b border-border/50 bg-muted/10 pb-5">
          <CardTitle className="font-serif text-xl">Generation Parameters</CardTitle>
          <CardDescription className="font-serif">{selectedVariant.description}</CardDescription>
        </CardHeader>
        <CardContent className="p-6 space-y-6">
          <div className="flex flex-col sm:flex-row gap-4 items-end">
            {selectedVariant.needsYear && (
              <div className="space-y-2 flex-1">
                <label className="text-xs font-mono uppercase tracking-wider text-muted-foreground">Tax Year</label>
                <Select value={taxYear.toString()} onValueChange={(v) => { setTaxYear(parseInt(v)); setPackageResult(null); }}>
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
            )}

            <div className="flex-1 space-y-2">
              <label className="text-xs font-mono uppercase tracking-wider text-muted-foreground">Export Format</label>
              <div className="h-12 flex items-center px-3 rounded-md border border-border/50 bg-muted/20 font-mono text-sm text-muted-foreground gap-2">
                <FileJson className="h-4 w-4" />
                JSON (machine-readable)
              </div>
            </div>

            <Button
              onClick={handleExport}
              disabled={isExporting}
              className="h-12 px-8 font-mono tracking-wider"
            >
              {isExporting ? (
                <span className="flex items-center gap-2 animate-pulse"><Clock className="h-4 w-4" /> Generating...</span>
              ) : (
                <span className="flex items-center gap-2"><Download className="h-4 w-4" /> Generate Package</span>
              )}
            </Button>
          </div>

          {/* Redact PII toggle — shown for both audit variants */}
          {(variant === "audit" || variant === "audit-redacted") && (
            <div className="flex items-center gap-3 pt-1 border-t border-border/30">
              <Eye className="h-4 w-4 text-muted-foreground" />
              <div className="flex-1">
                <Label htmlFor="redact-toggle" className="font-mono text-xs uppercase tracking-wider text-muted-foreground cursor-pointer">
                  Redact PII (wallet ID & tx hash)
                </Label>
                <p className="text-[11px] text-muted-foreground/60 font-serif mt-0.5">
                  Replaces identifying fields with [REDACTED] for third-party review
                </p>
              </div>
              <Switch
                id="redact-toggle"
                checked={variant === "audit-redacted"}
                onCheckedChange={(v) => { setVariant(v ? "audit-redacted" : "audit"); setPackageResult(null); }}
              />
            </div>
          )}
        </CardContent>
      </Card>

      {/* Compliance block warning */}
      {isBlocked && (
        <div className="rounded-md border border-amber-500/30 bg-amber-500/5 p-5 space-y-3">
          <div className="flex items-center gap-2 text-amber-400">
            <AlertTriangle className="h-5 w-5 shrink-0" />
            <span className="font-mono text-sm font-semibold uppercase tracking-wider">
              Compliance Hold — {pendingCount} Unsigned Position{pendingCount !== 1 ? "s" : ""}
            </span>
          </div>
          <p className="text-sm font-serif text-amber-400/80 leading-relaxed">
            This package contains positions that require preparer sign-off before filing. Exporting with unsigned
            positions may create an incomplete evidence record. Return to the Review Queue to complete sign-offs,
            or attest below to proceed with override.
          </p>
          <div className="flex gap-3">
            <Button
              size="sm"
              variant="outline"
              className="font-mono text-xs border-amber-500/40 text-amber-400 hover:bg-amber-500/10"
              onClick={() => window.location.assign("/review-queue")}
            >
              Go to Review Queue
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="font-mono text-xs text-muted-foreground hover:text-foreground"
              onClick={() => {
                setComplianceOverride(true);
                triggerDownload(packageResult.data, variant, taxYear);
                setPackageResult(packageResult.data);
              }}
            >
              Override & Download Anyway
            </Button>
          </div>
        </div>
      )}

      {/* Result preview */}
      {packageResult && !isBlocked && (
        <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 space-y-4">
          <div className="flex items-center gap-3 text-green-500 px-2">
            <CheckCircle2 className="h-5 w-5" />
            <span className="font-mono text-sm tracking-wider uppercase">Package Generated Successfully</span>
          </div>

          {/* Summary metrics for CPA handoff */}
          {variant === "cpa-handoff" && packageResult.summary && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { label: "Total Positions", value: packageResult.summary.total_positions },
                { label: "Signed Off", value: packageResult.summary.signed_off },
                { label: "Pending Sign-off", value: packageResult.summary.pending_signoff },
                { label: "Stale Reasonable Basis", value: packageResult.summary.stale_reasonable_basis },
              ].map((m) => (
                <div key={m.label} className="rounded border border-border/40 bg-muted/20 p-3 text-center">
                  <div className="font-mono text-2xl font-bold text-foreground">{m.value}</div>
                  <div className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground mt-1">{m.label}</div>
                </div>
              ))}
            </div>
          )}

          {/* Open action items for CPA handoff */}
          {variant === "cpa-handoff" && packageResult.summary?.open_action_items?.length > 0 && (
            <Card className="border-amber-500/20 bg-amber-500/5">
              <CardHeader className="pb-3">
                <CardTitle className="font-mono text-sm uppercase tracking-wider text-amber-400 flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4" /> Open Action Items
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-0 space-y-2">
                {packageResult.summary.open_action_items.map((item: string, i: number) => (
                  <div key={i} className="flex items-start gap-2 text-xs font-serif text-amber-400/80">
                    <span className="font-mono mt-0.5">·</span>
                    <span>{item}</span>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {/* Comment letter open gaps */}
          {variant === "comment-letter" && packageResult.entries?.length > 0 && (
            <div className="space-y-3">
              {packageResult.entries.map((entry: any) => (
                <Card key={entry.event_type} className="bg-card/50 border-border/40">
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-mono text-sm font-semibold text-foreground">{entry.event_type}</span>
                      <Badge variant="outline" className="text-[10px] font-mono border-amber-500/30 text-amber-400 bg-amber-500/10">
                        {entry.position_count} position{entry.position_count !== 1 ? "s" : ""}
                      </Badge>
                    </div>
                    <p className="text-xs font-serif text-muted-foreground leading-relaxed">{entry.practitioner_summary}</p>
                    {entry.pending_irs_notices.length > 0 && (
                      <div className="flex gap-1 mt-2 flex-wrap">
                        {entry.pending_irs_notices.map((n: string) => (
                          <Badge key={n} variant="outline" className="text-[10px] font-mono border-border/40 text-muted-foreground">{n}</Badge>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          {/* JSON preview terminal */}
          <Card className="bg-[#050505] border-border/30 overflow-hidden">
            <div className="bg-[#111] border-b border-border/30 px-4 py-2 flex items-center justify-between">
              <span className="font-mono text-xs text-muted-foreground flex items-center gap-2">
                <FileJson className="h-3.5 w-3.5" />
                {variant === "comment-letter"
                  ? `basisguard_comment_letter_${new Date().getFullYear()}.json`
                  : variant === "cpa-handoff"
                  ? `basisguard_cpa_handoff_${taxYear}.json`
                  : `basisguard_audit_package_${taxYear}${variant === "audit-redacted" ? "_redacted" : ""}.json`}
              </span>
              <Button
                size="sm"
                variant="ghost"
                className="h-6 px-2 text-xs font-mono text-muted-foreground hover:text-foreground gap-1"
                onClick={() => triggerDownload(packageResult, variant, taxYear)}
              >
                <Download className="h-3 w-3" /> Re-download
              </Button>
            </div>
            <div className="p-6 overflow-auto max-h-[320px]">
              <pre className="text-xs font-mono text-muted-foreground leading-relaxed whitespace-pre-wrap">
                {JSON.stringify(packageResult, null, 2).slice(0, 2000)}
                {JSON.stringify(packageResult, null, 2).length > 2000 && "\n... (truncated — download for full data)"}
              </pre>
            </div>
          </Card>

          {/* Preparer checklist for CPA handoff */}
          {variant === "cpa-handoff" && packageResult.preparer_checklist?.length > 0 && (
            <Card className="bg-card/30 border-border/40">
              <CardHeader className="pb-3">
                <CardTitle className="font-mono text-sm uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                  <FileText className="h-4 w-4" /> Preparer Checklist
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-0 space-y-2">
                {packageResult.preparer_checklist.map((item: string, i: number) => (
                  <div key={i} className="flex items-start gap-3 text-xs">
                    <div className="h-4 w-4 rounded-sm border border-border/50 shrink-0 mt-0.5" />
                    <span className="font-serif text-muted-foreground leading-relaxed">{item}</span>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
