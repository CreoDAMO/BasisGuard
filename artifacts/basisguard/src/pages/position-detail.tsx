import React, { useState } from "react";
import { useParams, useLocation } from "wouter";
import {
  useGetPosition,
  useSignOffPosition,
  useGetPositionHistory,
  getGetPositionQueryKey,
  getGetPositionHistoryQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TierBadge } from "@/components/ui/tier-badge";
import { format } from "date-fns";
import {
  ArrowLeft, BookOpen, User, CheckCircle2, AlertTriangle,
  CheckSquare, Scale, GitBranch, Clock, AlertCircle
} from "lucide-react";
import { toast } from "sonner";

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

  const signOffMutation = useSignOffPosition();
  const [isSignoffOpen, setIsSignoffOpen] = useState(false);
  const [reviewerName, setReviewerName] = useState("");
  const [reviewerCredential, setReviewerCredential] = useState("");

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
                  {/* Timeline connector */}
                  {history.entries.length > 1 && (
                    <div className="absolute left-[19px] top-10 bottom-10 w-px bg-border/50" />
                  )}
                  <div className="space-y-0">
                    {history.entries.map((entry, idx) => (
                      <div key={entry.id} className="flex gap-4 pb-6 last:pb-0">
                        {/* Timeline dot */}
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

                        {/* Entry content */}
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
    </div>
  );
}
