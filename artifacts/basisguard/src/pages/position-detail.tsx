import React, { useState } from "react";
import { useParams, useLocation } from "wouter";
import {
  useGetPosition,
  useSignOffPosition,
  useGetPositionHistory,
  useSupersedePosition,
  useListCitations,
  getGetPositionQueryKey,
  getGetPositionHistoryQueryKey,
} from "@workspace/api-client-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TierBadge } from "@/components/ui/tier-badge";
import { format } from "date-fns";
import {
  ArrowLeft, BookOpen, User, CheckCircle2, AlertTriangle,
  CheckSquare, Scale, GitBranch, Clock, AlertCircle, Sparkles, ArrowUp
} from "lucide-react";
import { toast } from "sonner";

interface IntelligenceSuggestion {
  event_type: string;
  suggested_tier: string;
  confidence_basis: string;
  rationale_template: string;
  suggested_authority_ids: string[];
  citations_seeded: number;
}

const TIER_ORDER = ["will", "should", "more_likely_than_not", "substantial_authority", "reasonable_basis"] as const;
type Tier = typeof TIER_ORDER[number];

const TIER_LABELS: Record<string, string> = {
  will: "Will Prevail",
  should: "Should Prevail",
  more_likely_than_not: "More Likely Than Not",
  substantial_authority: "Substantial Authority",
  reasonable_basis: "Reasonable Basis",
};

function tierRank(tier: string): number {
  return TIER_ORDER.indexOf(tier as Tier);
}

export default function PositionDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();

  const { data: position, isLoading, error } = useGetPosition(id || "", {
    query: { enabled: !!id, queryKey: getGetPositionQueryKey(id || "") }
  });

  const { data: history, isLoading: historyLoading } = useGetPositionHistory(id || "", {
    query: { enabled: !!id, queryKey: getGetPositionHistoryQueryKey(id || "") }
  });

  // Fetch intelligence suggestion when position is stale
  const { data: suggestion } = useQuery<IntelligenceSuggestion>({
    queryKey: ["intelligence-suggest", position?.event_type],
    queryFn: () => fetch(`/api/intelligence/suggest?event_type=${encodeURIComponent(position!.event_type)}`).then(r => r.json()),
    enabled: !!(position?.is_stale || position?.tier === "reasonable_basis"),
  });

  // Fetch citations for the supersede dialog
  const { data: citationsData } = useListCitations({}, {
    query: { enabled: !!(position?.is_stale), queryKey: ["citations-all"] }
  });

  const signOffMutation = useSignOffPosition();
  const supersedeMutation = useSupersedePosition();

  const [isSignoffOpen, setIsSignoffOpen] = useState(false);
  const [reviewerName, setReviewerName] = useState("");
  const [reviewerCredential, setReviewerCredential] = useState("");

  // Supersede-with-intelligence dialog
  const [isSupersede, setIsSupersede] = useState(false);
  const [supersedeUseTemplate, setSupersedeUseTemplate] = useState(true);
  const [supersedeTier, setSupersedeTier] = useState<string>("");
  const [supersedeRationale, setSupersedeRationale] = useState("");
  const [supersedeClassification, setSupersedeClassification] = useState("");

  const openSupersedeDialog = () => {
    if (suggestion) {
      setSupersedeTier(suggestion.suggested_tier);
      setSupersedeRationale(suggestion.rationale_template);
    }
    setSupersedeClassification(position?.classification ?? "");
    setIsSupersede(true);
  };

  const handleSignOff = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id || !reviewerName || !reviewerCredential) return;
    try {
      await signOffMutation.mutateAsync({
        id,
        data: {
          reviewer_id: "u_" + Math.random().toString(36).substring(2, 9),
          reviewer_name: reviewerName,
          reviewer_credential: reviewerCredential,
        }
      });
      toast.success("Position signed off successfully", {
        description: "The evidence log has been immutably updated."
      });
      setIsSignoffOpen(false);
      queryClient.invalidateQueries({ queryKey: getGetPositionQueryKey(id) });
    } catch {
      toast.error("Sign-off failed", { description: "There was an error saving the sign-off record." });
    }
  };

  const handleSupersede = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id || !supersedeTier || !supersedeRationale || !supersedeClassification) return;
    try {
      const citationIds = supersedeUseTemplate && suggestion?.suggested_authority_ids?.length
        ? suggestion.suggested_authority_ids
        : [];

      await supersedeMutation.mutateAsync({
        id,
        data: {
          event_type: position!.event_type,
          classification: supersedeClassification,
          tier: supersedeTier as Tier,
          rationale: supersedeRationale,
          requires_review: true,
          ...(citationIds.length > 0 && { citation_ids: citationIds } as any),
        }
      });
      toast.success("Supersession created", {
        description: "A new authoritative record has been created. Review and sign off when ready."
      });
      setIsSupersede(false);
      queryClient.invalidateQueries({ queryKey: getGetPositionQueryKey(id) });
      queryClient.invalidateQueries({ queryKey: getGetPositionHistoryQueryKey(id) });
    } catch {
      toast.error("Supersession failed", { description: "There was an error creating the supersession." });
    }
  };

  if (isLoading) {
    return (
      <div className="p-8 max-w-5xl mx-auto space-y-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-64 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (error || !position) {
    return (
      <div className="p-8 max-w-5xl mx-auto text-center py-20">
        <AlertTriangle className="h-12 w-12 text-destructive mx-auto mb-4" />
        <h2 className="text-xl font-bold font-serif mb-2">Record Not Found</h2>
        <p className="text-muted-foreground mb-6">This position record may have been superseded or doesn't exist.</p>
        <Button onClick={() => setLocation("/positions")} variant="outline">
          <ArrowLeft className="mr-2 h-4 w-4" /> Back to Evidence Log
        </Button>
      </div>
    );
  }

  const hasSuggestionUpgrade = suggestion &&
    tierRank(suggestion.suggested_tier) < tierRank(position.tier);

  return (
    <div className="p-8 max-w-5xl mx-auto space-y-8">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => setLocation("/positions")} className="shrink-0 h-8 w-8">
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-2xl font-serif font-bold text-foreground">{position.event_type}</h1>
            <TierBadge tier={position.tier} className="text-xs px-2 py-1" />
            {position.superseded_by && (
              <Badge variant="outline" className="text-[10px] font-mono uppercase border-destructive/30 text-destructive bg-destructive/10">
                Superseded
              </Badge>
            )}
          </div>
          <p className="text-muted-foreground mt-1 text-sm font-mono">Record ID: {position.id}</p>
        </div>
        <div className="flex items-center gap-2">
          {position.requires_review && !position.reviewer_signoff_at ? (
            <Button
              onClick={() => setIsSignoffOpen(true)}
              className="bg-primary text-primary-foreground hover:bg-primary/90 font-mono text-sm tracking-wide"
            >
              <CheckSquare className="mr-2 h-4 w-4" /> Attest & Sign Off
            </Button>
          ) : position.reviewer_signoff_at ? (
            <Badge variant="outline" className="bg-green-500/10 text-green-500 border-green-500/30 px-3 py-1.5 font-mono text-xs gap-2">
              <CheckCircle2 className="h-4 w-4" /> Signed by {position.reviewer_name}
            </Badge>
          ) : (
            <Badge variant="outline" className="bg-muted/50 text-muted-foreground border-border/50 px-3 py-1.5 font-mono text-xs gap-2">
              Auto-Applied
            </Badge>
          )}
        </div>
      </div>

      {/* Stale warning */}
      {position.is_stale && (
        <div className="flex items-start gap-3 rounded-md border border-amber-500/30 bg-amber-500/5 p-4 text-amber-400">
          <AlertCircle className="h-5 w-5 shrink-0 mt-0.5" />
          <div>
            <p className="font-mono text-sm font-semibold uppercase tracking-wider">Stale Reasonable Basis Position</p>
            <p className="text-xs font-serif mt-1 text-amber-400/80 leading-relaxed">
              This position was classified at Reasonable Basis over 180 days ago. New IRS guidance may have issued since
              classification. Review for potential supersession or authority upgrade before filing.
              Form 8275 disclosure is required for Reasonable Basis positions.
            </p>
          </div>
        </div>
      )}

      {/* Intelligence card — shown when stale or reasonable_basis with a better suggestion */}
      {suggestion && !position.superseded_by && (
        <Card className={`border shadow-sm ${
          hasSuggestionUpgrade
            ? "border-indigo-500/30 bg-indigo-500/5"
            : "border-border/50 bg-card/50"
        }`}>
          <CardHeader className="pb-3 border-b border-border/50">
            <CardTitle className="font-serif text-base flex items-center gap-2">
              <Sparkles className={`h-4 w-4 ${hasSuggestionUpgrade ? "text-indigo-400" : "text-muted-foreground"}`} />
              <span className={hasSuggestionUpgrade ? "text-indigo-300" : "text-foreground"}>
                Intelligence Analysis
              </span>
              {hasSuggestionUpgrade && (
                <Badge variant="outline" className="border-indigo-500/30 text-indigo-400 bg-indigo-500/10 font-mono text-[10px] ml-1">
                  <ArrowUp className="h-2.5 w-2.5 mr-1" />
                  Tier Upgrade Available
                </Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-5">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <p className="text-xs font-mono uppercase tracking-wider text-muted-foreground mb-1">Suggested Tier</p>
                <div className="flex items-center gap-2">
                  <TierBadge tier={suggestion.suggested_tier} />
                  {hasSuggestionUpgrade && (
                    <span className="text-xs text-muted-foreground font-mono">
                      vs. current <span className="text-amber-400">{TIER_LABELS[position.tier] ?? position.tier}</span>
                    </span>
                  )}
                </div>
              </div>
              <div>
                <p className="text-xs font-mono uppercase tracking-wider text-muted-foreground mb-1">Confidence Basis</p>
                <p className="text-xs font-serif text-foreground/80 leading-relaxed">{suggestion.confidence_basis}</p>
              </div>
            </div>

            {suggestion.suggested_authority_ids.length > 0 && (
              <div className="mt-4">
                <p className="text-xs font-mono uppercase tracking-wider text-muted-foreground mb-2">Suggested Authorities</p>
                <div className="flex gap-2 flex-wrap">
                  {suggestion.suggested_authority_ids.map((id) => {
                    const citation = citationsData?.find((c: any) => c.id === id);
                    return (
                      <Badge key={id} variant="outline" className="font-mono text-[10px] border-border/50 text-muted-foreground">
                        {citation?.reference ?? id.substring(0, 16) + "…"}
                      </Badge>
                    );
                  })}
                </div>
              </div>
            )}

            {!position.superseded_by && (
              <div className="mt-4 pt-4 border-t border-border/30">
                <Button
                  size="sm"
                  variant={hasSuggestionUpgrade ? "default" : "outline"}
                  onClick={openSupersedeDialog}
                  className={`font-mono text-xs tracking-wider gap-1.5 ${
                    hasSuggestionUpgrade
                      ? "bg-indigo-600 hover:bg-indigo-700 text-white border-none"
                      : ""
                  }`}
                >
                  <GitBranch className="h-3.5 w-3.5" />
                  {hasSuggestionUpgrade ? "Create Upgraded Supersession" : "Create Supersession with Template"}
                </Button>
                <p className="text-[10px] font-mono text-muted-foreground/60 mt-2">
                  Pre-fills tier, rationale template, and authority citations from the suggestion engine.
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Superseded warning */}
      {position.superseded_by && (
        <div className="flex items-start gap-3 rounded-md border border-destructive/30 bg-destructive/5 p-4 text-destructive">
          <AlertTriangle className="h-5 w-5 shrink-0 mt-0.5" />
          <div>
            <p className="font-mono text-sm font-semibold uppercase tracking-wider">This Record Has Been Superseded</p>
            <p className="text-xs font-serif mt-1 text-destructive/80 leading-relaxed">
              A newer position record has replaced this one. View the History tab to see the current authoritative classification.
            </p>
          </div>
        </div>
      )}

      {/* Main content tabs */}
      <Tabs defaultValue="record" className="space-y-6">
        <TabsList className="bg-muted/30 border border-border/50">
          <TabsTrigger value="record" className="font-mono text-xs uppercase tracking-wider">
            <Scale className="h-3.5 w-3.5 mr-1.5" /> Position Record
          </TabsTrigger>
          <TabsTrigger value="history" className="font-mono text-xs uppercase tracking-wider">
            <GitBranch className="h-3.5 w-3.5 mr-1.5" />
            History
            {history && history.chain_length > 1 && (
              <Badge className="ml-1.5 h-4 min-w-4 px-1 text-[10px] bg-primary/20 text-primary border-none">
                {history.chain_length}
              </Badge>
            )}
          </TabsTrigger>
        </TabsList>

        {/* ── Position Record Tab ───────────────────────────────────────────── */}
        <TabsContent value="record" className="mt-0">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="md:col-span-2 space-y-6">
              {/* Rationale */}
              <Card className="bg-card/50 backdrop-blur border-border/50 shadow-sm">
                <CardHeader className="border-b border-border/50 bg-muted/20 pb-4">
                  <CardTitle className="font-serif text-lg flex items-center gap-2">
                    <Scale className="h-5 w-5 text-muted-foreground" />
                    Classification Rationale
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-6">
                  <div className="prose prose-invert max-w-none font-serif text-[15px] leading-relaxed text-foreground/90">
                    {position.rationale.split('\n\n').map((paragraph, i) => (
                      <p key={i}>{paragraph}</p>
                    ))}
                  </div>
                </CardContent>
              </Card>

              {/* Citations */}
              <Card className="bg-card/50 backdrop-blur border-border/50 shadow-sm">
                <CardHeader className="border-b border-border/50 bg-muted/20 pb-4">
                  <CardTitle className="font-serif text-lg flex items-center gap-2">
                    <BookOpen className="h-5 w-5 text-muted-foreground" />
                    Cited Authorities
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="divide-y divide-border/50">
                    {position.citations && position.citations.length > 0 ? (
                      position.citations.map((citation) => (
                        <div key={citation.id} className="p-4 hover:bg-muted/30 transition-colors">
                          <div className="flex justify-between items-start mb-2">
                            <span className="font-mono font-bold text-primary text-sm">{citation.reference}</span>
                            <Badge variant="outline" className="text-[10px] uppercase font-mono tracking-wider text-muted-foreground border-border/50 bg-background/50">
                              {citation.type.replace('_', ' ')}
                            </Badge>
                          </div>
                          <p className="text-sm text-muted-foreground font-serif leading-relaxed mb-2">{citation.summary}</p>
                          <div className="flex justify-between items-center mt-3">
                            <span className="text-[10px] font-mono text-muted-foreground/70 uppercase">
                              Strength: {citation.authority_strength.replace(/_/g, ' ')}
                            </span>
                            {citation.url && (
                              <a href={citation.url} target="_blank" rel="noreferrer" className="text-xs text-primary hover:underline font-medium">
                                Source Document →
                              </a>
                            )}
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="p-8 text-center text-muted-foreground text-sm font-mono">
                        No explicit authorities cited. Relies on profile defaults.
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Right sidebar */}
            <div className="space-y-6">
              <Card className="bg-card/50 backdrop-blur border-border/50 shadow-sm">
                <CardHeader className="border-b border-border/50 bg-muted/20 pb-4">
                  <CardTitle className="font-serif text-lg">Transaction Data</CardTitle>
                </CardHeader>
                <CardContent className="p-5 space-y-4 font-mono text-sm">
                  <div>
                    <span className="text-muted-foreground text-xs uppercase tracking-wider block mb-1">Applied Classification</span>
                    <span className="font-medium">{position.classification}</span>
                  </div>
                  <Separator className="bg-border/50" />
                  <div>
                    <span className="text-muted-foreground text-xs uppercase tracking-wider block mb-1">Transaction ID</span>
                    <span className="break-all">{position.tx_id || "N/A"}</span>
                  </div>
                  <Separator className="bg-border/50" />
                  <div>
                    <span className="text-muted-foreground text-xs uppercase tracking-wider block mb-1">Wallet/Entity</span>
                    <span className="break-all">{position.wallet_id || "N/A"}</span>
                  </div>
                  <Separator className="bg-border/50" />
                  <div>
                    <span className="text-muted-foreground text-xs uppercase tracking-wider block mb-1">Timestamp</span>
                    <span>{format(new Date(position.created_at), "yyyy-MM-dd HH:mm:ss 'UTC'")}</span>
                  </div>
                </CardContent>
              </Card>

              {position.reviewer_signoff_at && (
                <Card className="bg-card/50 backdrop-blur border-border/50 shadow-sm border-green-500/20">
                  <CardHeader className="border-b border-border/50 bg-green-500/5 pb-4">
                    <CardTitle className="font-serif text-lg flex items-center gap-2 text-green-500">
                      <User className="h-5 w-5" />
                      Reviewer Attestation
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-5 space-y-4 font-mono text-sm">
                    <div>
                      <span className="text-muted-foreground text-xs uppercase tracking-wider block mb-1">Preparer / Reviewer</span>
                      <span className="font-medium text-foreground">{position.reviewer_name}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground text-xs uppercase tracking-wider block mb-1">Credential</span>
                      <span>{position.reviewer_credential}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground text-xs uppercase tracking-wider block mb-1">Signed On</span>
                      <span>{format(new Date(position.reviewer_signoff_at), "yyyy-MM-dd HH:mm:ss 'UTC'")}</span>
                    </div>
                  </CardContent>
                </Card>
              )}

              {position.profile && (
                <Card className="bg-card/50 backdrop-blur border-border/50 shadow-sm">
                  <CardHeader className="border-b border-border/50 bg-muted/20 pb-4">
                    <CardTitle className="font-serif text-lg text-muted-foreground">Applied Profile</CardTitle>
                  </CardHeader>
                  <CardContent className="p-5 space-y-2 font-mono text-sm">
                    <div>
                      <span className="text-muted-foreground text-xs uppercase tracking-wider block mb-1">Name</span>
                      <span>{position.profile.name}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground text-xs uppercase tracking-wider block mb-1">Version</span>
                      <span>{position.profile_version || "Latest"}</span>
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          </div>
        </TabsContent>

        {/* ── History Tab ───────────────────────────────────────────────────── */}
        <TabsContent value="history" className="mt-0">
          <Card className="bg-card/50 backdrop-blur border-border/50 shadow-sm">
            <CardHeader className="border-b border-border/50 bg-muted/20 pb-4">
              <CardTitle className="font-serif text-lg flex items-center gap-2">
                <GitBranch className="h-5 w-5 text-muted-foreground" />
                Supersession Chain
              </CardTitle>
              <p className="text-xs font-mono text-muted-foreground mt-1">
                Complete adaptation history — oldest classification to current authoritative record
              </p>
            </CardHeader>
            <CardContent className="p-6">
              {historyLoading ? (
                <div className="space-y-4">
                  {[1, 2].map((i) => <Skeleton key={i} className="h-24 w-full" />)}
                </div>
              ) : !history || history.entries.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <GitBranch className="h-10 w-10 mx-auto mb-4 opacity-30" />
                  <p className="font-mono text-sm">No history available for this position.</p>
                </div>
              ) : (
                <div className="relative">
                  {history.entries.length > 1 && (
                    <div className="absolute left-[19px] top-10 bottom-10 w-px bg-border/50" />
                  )}
                  <div className="space-y-0">
                    {history.entries.map((entry, idx) => (
                      <div key={entry.id} className="flex gap-4 pb-6 last:pb-0">
                        <div className="relative flex-shrink-0 flex flex-col items-center">
                          <div className={`h-10 w-10 rounded-full border-2 flex items-center justify-center font-mono text-xs font-bold z-10 ${
                            entry.is_current
                              ? "bg-primary/20 border-primary text-primary"
                              : "bg-muted/50 border-border/50 text-muted-foreground"
                          }`}>
                            {entry.is_current ? (
                              <CheckCircle2 className="h-4 w-4" />
                            ) : (
                              <span>v{entry.generation}</span>
                            )}
                          </div>
                        </div>

                        <div className={`flex-1 rounded-md border p-4 transition-colors ${
                          entry.is_current
                            ? "border-primary/30 bg-primary/5"
                            : "border-border/30 bg-muted/20"
                        }`}>
                          <div className="flex items-start justify-between gap-3 flex-wrap">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-mono text-sm font-semibold text-foreground">
                                {entry.event_type}
                              </span>
                              <TierBadge tier={entry.tier} className="text-[10px] px-1.5 py-0.5" />
                              {entry.is_current && (
                                <Badge className="text-[10px] font-mono bg-primary/20 text-primary border-primary/30 border">
                                  Current
                                </Badge>
                              )}
                              {entry.superseded_by && !entry.is_current && (
                                <Badge variant="outline" className="text-[10px] font-mono border-destructive/30 text-destructive/70">
                                  Superseded
                                </Badge>
                              )}
                            </div>
                            <div className="flex items-center gap-1 text-muted-foreground text-[10px] font-mono">
                              <Clock className="h-3 w-3" />
                              {format(new Date(entry.created_at), "MMM d, yyyy HH:mm")}
                            </div>
                          </div>
                          <p className="text-xs text-muted-foreground mt-2 font-serif">
                            <span className="font-semibold not-italic font-mono">{entry.classification}</span>
                          </p>
                          <p className="text-xs text-muted-foreground/80 mt-1.5 font-serif leading-relaxed line-clamp-2">
                            {entry.rationale}
                          </p>
                          {entry.reviewer_signoff_at && (
                            <div className="flex items-center gap-1.5 mt-3 text-[10px] font-mono text-green-500/80">
                              <User className="h-3 w-3" />
                              Signed by {entry.reviewer_name} · {format(new Date(entry.reviewer_signoff_at), "MMM d, yyyy")}
                            </div>
                          )}
                          {idx < history.entries.length - 1 && (
                            <div className="mt-3 text-[10px] font-mono text-muted-foreground/50 flex items-center gap-1">
                              <GitBranch className="h-3 w-3" />
                              Superseded by Generation {entry.generation + 1}
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Sign-off dialog */}
      <Dialog open={isSignoffOpen} onOpenChange={setIsSignoffOpen}>
        <DialogContent className="sm:max-w-[500px] border-border/50 bg-background/95 backdrop-blur-md">
          <form onSubmit={handleSignOff}>
            <DialogHeader>
              <DialogTitle className="font-serif text-xl">Preparer Sign-Off</DialogTitle>
              <DialogDescription className="font-serif text-sm">
                By signing off, you attest that the classification and cited authorities provide a
                sufficient basis for this tax position under Circular 230 and IRC §6694.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-6">
              <div className="grid gap-2">
                <Label htmlFor="name" className="font-mono text-xs uppercase tracking-wider text-muted-foreground">Preparer Name</Label>
                <Input
                  id="name"
                  value={reviewerName}
                  onChange={(e) => setReviewerName(e.target.value)}
                  className="bg-card/50 border-border/50 font-mono"
                  placeholder="e.g. Jane Doe"
                  required
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="credential" className="font-mono text-xs uppercase tracking-wider text-muted-foreground">Credential</Label>
                <Input
                  id="credential"
                  value={reviewerCredential}
                  onChange={(e) => setReviewerCredential(e.target.value)}
                  className="bg-card/50 border-border/50 font-mono"
                  placeholder="e.g. CPA, JD, EA"
                  required
                />
              </div>
              <div className="mt-4 p-4 bg-muted/20 border border-border/50 rounded text-xs font-mono text-muted-foreground leading-relaxed">
                This action is immutable. The signature, timestamp, and position state will be sealed in the Evidence Log.
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setIsSignoffOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={signOffMutation.isPending} className="font-mono tracking-wider">
                {signOffMutation.isPending ? "Signing..." : "Attest & Sign Off"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Supersede-with-intelligence dialog */}
      <Dialog open={isSupersede} onOpenChange={setIsSupersede}>
        <DialogContent className="sm:max-w-[640px] border-border/50 bg-background/95 backdrop-blur-md">
          <form onSubmit={handleSupersede}>
            <DialogHeader>
              <DialogTitle className="font-serif text-xl flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-indigo-400" />
                Create Supersession
              </DialogTitle>
              <DialogDescription className="font-serif text-sm">
                Pre-filled from the Intelligence Engine. Review and adjust before creating the new authoritative record.
              </DialogDescription>
            </DialogHeader>

            <div className="grid gap-4 py-5">
              {/* Tier selector */}
              <div className="grid gap-2">
                <Label className="font-mono text-xs uppercase tracking-wider text-muted-foreground">Confidence Tier</Label>
                <div className="flex flex-wrap gap-2">
                  {TIER_ORDER.map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setSupersedeTier(t)}
                      className={`px-3 py-1.5 rounded border font-mono text-xs transition-colors ${
                        supersedeTier === t
                          ? "bg-primary/20 border-primary text-primary"
                          : "border-border/50 text-muted-foreground hover:border-border hover:text-foreground"
                      }`}
                    >
                      {TIER_LABELS[t]}
                    </button>
                  ))}
                </div>
              </div>

              {/* Classification */}
              <div className="grid gap-2">
                <Label htmlFor="sup-classification" className="font-mono text-xs uppercase tracking-wider text-muted-foreground">
                  Applied Classification
                </Label>
                <Input
                  id="sup-classification"
                  value={supersedeClassification}
                  onChange={(e) => setSupersedeClassification(e.target.value)}
                  className="bg-card/50 border-border/50 font-mono"
                  placeholder="e.g. Taxable Exchange — Capital Gain"
                  required
                />
              </div>

              {/* Rationale */}
              <div className="grid gap-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="sup-rationale" className="font-mono text-xs uppercase tracking-wider text-muted-foreground">
                    Rationale
                  </Label>
                  {suggestion && (
                    <button
                      type="button"
                      onClick={() => setSupersedeRationale(suggestion.rationale_template)}
                      className="text-[10px] font-mono text-indigo-400 hover:text-indigo-300 transition-colors"
                    >
                      ↺ Reset to template
                    </button>
                  )}
                </div>
                <Textarea
                  id="sup-rationale"
                  value={supersedeRationale}
                  onChange={(e) => setSupersedeRationale(e.target.value)}
                  className="bg-card/50 border-border/50 font-serif text-sm resize-none"
                  rows={6}
                  required
                />
              </div>

              {/* Authorities summary */}
              {suggestion && suggestion.suggested_authority_ids.length > 0 && (
                <div className="p-3 bg-indigo-500/5 border border-indigo-500/20 rounded text-xs font-mono text-muted-foreground">
                  <span className="text-indigo-400 font-semibold">Authorities to be linked: </span>
                  {suggestion.suggested_authority_ids.map((aid) => {
                    const citation = citationsData?.find((c: any) => c.id === aid);
                    return citation?.reference ?? aid.substring(0, 16);
                  }).join(" · ")}
                </div>
              )}

              <div className="p-3 bg-muted/20 border border-border/50 rounded text-[10px] font-mono text-muted-foreground">
                This will create a new authoritative record and mark the current record as superseded.
                The supersession requires sign-off before it is considered attested.
              </div>
            </div>

            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setIsSupersede(false)}>Cancel</Button>
              <Button
                type="submit"
                disabled={supersedeMutation.isPending || !supersedeTier || !supersedeRationale}
                className="font-mono tracking-wider gap-2 bg-indigo-600 hover:bg-indigo-700 text-white border-none"
              >
                {supersedeMutation.isPending ? (
                  "Creating…"
                ) : (
                  <>
                    <GitBranch className="h-4 w-4" />
                    Create Supersession
                  </>
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
