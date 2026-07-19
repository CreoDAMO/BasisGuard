import React, { useState } from "react";
import { useGetReviewQueue, useBatchSignoffPositions, getGetReviewQueueQueryKey } from "@workspace/api-client-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { format } from "date-fns";
import { useLocation } from "wouter";
import { TierBadge } from "@/components/ui/tier-badge";
import { CheckSquare, ArrowRight, CheckCircle2, Users, X, AlertTriangle, Clock } from "lucide-react";
import { toast } from "sonner";

interface StaleItem {
  id: string;
  event_type: string;
  classification: string;
  tier: string;
  rationale: string;
  requires_review: boolean;
  reviewer_signoff_at: string | null;
  created_at: string;
  days_since_classification: number;
  is_stale: boolean;
}

export default function ReviewQueuePage() {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const { data: queue, isLoading } = useGetReviewQueue();
  const { data: staleData, isLoading: staleLoading } = useQuery<{ stale_count: number; items: StaleItem[] }>({
    queryKey: ["stale-positions"],
    queryFn: () => fetch("/api/intelligence/stale").then(r => r.json()),
  });
  const batchSignoff = useBatchSignoffPositions();

  const [tab, setTab] = useState<"pending" | "stale">("pending");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isBatchOpen, setIsBatchOpen] = useState(false);
  const [reviewerName, setReviewerName] = useState("");
  const [reviewerCredential, setReviewerCredential] = useState("");
  const [note, setNote] = useState("");

  const currentItems = tab === "pending" ? (queue ?? []) : (staleData?.items ?? []);
  const allIds = currentItems.map((p) => p.id);
  const allSelected = allIds.length > 0 && allIds.every((id) => selectedIds.has(id));
  const someSelected = selectedIds.size > 0;

  const toggleAll = () => {
    if (allSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(allIds));
    }
  };

  const toggleOne = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleBatchSignoff = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reviewerName || !reviewerCredential || selectedIds.size === 0) return;

    try {
      const result = await batchSignoff.mutateAsync({
        data: {
          position_ids: Array.from(selectedIds),
          reviewer_id: "u_" + Math.random().toString(36).substring(2, 9),
          reviewer_name: reviewerName,
          reviewer_credential: reviewerCredential,
          note: note || undefined,
        }
      });

      toast.success(`${result.signed_count} position${result.signed_count !== 1 ? "s" : ""} signed off`, {
        description: result.skipped_count > 0
          ? `${result.skipped_count} already signed — skipped.`
          : "All selected positions have been attested."
      });

      setIsBatchOpen(false);
      setSelectedIds(new Set());
      setReviewerName("");
      setReviewerCredential("");
      setNote("");
      queryClient.invalidateQueries({ queryKey: getGetReviewQueueQueryKey() });
      queryClient.invalidateQueries({ queryKey: ["stale-positions"] });
    } catch {
      toast.error("Batch sign-off failed", { description: "Check your inputs and try again." });
    }
  };

  const staleCount = staleData?.stale_count ?? 0;

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-6 h-full flex flex-col">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-serif font-bold text-foreground flex items-center gap-3">
            <CheckSquare className="h-8 w-8" />
            Review Queue
          </h1>
          <p className="text-muted-foreground mt-1 text-sm font-mono uppercase tracking-widest">
            Positions requiring preparer sign-off
          </p>
        </div>
        <div className="flex items-center gap-2">
          {queue && queue.length > 0 && (
            <Badge variant="outline" className="border-amber-500/30 text-amber-400 bg-amber-500/10 font-mono px-3 py-1">
              {queue.length} pending sign-off
            </Badge>
          )}
          {staleCount > 0 && (
            <Badge variant="outline" className="border-orange-500/30 text-orange-400 bg-orange-500/10 font-mono px-3 py-1">
              {staleCount} stale
            </Badge>
          )}
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={tab} onValueChange={(v) => { setTab(v as "pending" | "stale"); setSelectedIds(new Set()); }}>
        <TabsList className="bg-muted/30 border border-border/50">
          <TabsTrigger value="pending" className="font-mono text-xs uppercase tracking-wider gap-1.5">
            <Clock className="h-3.5 w-3.5" />
            Pending Sign-Off
            {queue && queue.length > 0 && (
              <Badge className="ml-1 h-4 min-w-4 px-1 text-[10px] bg-amber-500/20 text-amber-400 border-none">{queue.length}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="stale" className="font-mono text-xs uppercase tracking-wider gap-1.5">
            <AlertTriangle className="h-3.5 w-3.5" />
            Stale Positions
            {staleCount > 0 && (
              <Badge className="ml-1 h-4 min-w-4 px-1 text-[10px] bg-orange-500/20 text-orange-400 border-none">{staleCount}</Badge>
            )}
          </TabsTrigger>
        </TabsList>

        {/* Stale context banner */}
        {tab === "stale" && staleCount > 0 && (
          <div className="flex items-start gap-3 rounded-md border border-orange-500/30 bg-orange-500/5 p-4 text-orange-400">
            <AlertTriangle className="h-5 w-5 shrink-0 mt-0.5" />
            <div>
              <p className="font-mono text-sm font-semibold uppercase tracking-wider">
                {staleCount} Reasonable Basis Position{staleCount !== 1 ? "s" : ""} Require Attention
              </p>
              <p className="text-xs font-serif mt-1 text-orange-400/80 leading-relaxed">
                These positions were classified at Reasonable Basis over 180 days ago. New IRS guidance
                may apply — review each record for potential supersession or authority upgrade.
                Form 8275 disclosure is required for all Reasonable Basis positions.
              </p>
            </div>
          </div>
        )}

        {/* Table — shared across both tabs */}
        <TabsContent value={tab} className="mt-0">
          <div className="border border-border/50 rounded-md overflow-hidden bg-card/30 flex-1 flex flex-col min-h-[400px]">
            <Table>
              <TableHeader className="bg-muted/50 sticky top-0 z-10 backdrop-blur-sm">
                <TableRow className="border-border/50 hover:bg-transparent">
                  <TableHead className="w-12 pl-4">
                    {allIds.length > 0 && (
                      <Checkbox
                        checked={allSelected}
                        onCheckedChange={toggleAll}
                        aria-label="Select all"
                        className="border-border/60"
                      />
                    )}
                  </TableHead>
                  <TableHead className="w-[140px] font-mono text-xs uppercase tracking-wider">Date</TableHead>
                  <TableHead className="font-mono text-xs uppercase tracking-wider">Event & Classification</TableHead>
                  <TableHead className="font-mono text-xs uppercase tracking-wider">
                    {tab === "stale" ? "Age" : "Rationale Preview"}
                  </TableHead>
                  <TableHead className="w-[160px] font-mono text-xs uppercase tracking-wider text-center">Confidence</TableHead>
                  <TableHead className="w-[100px] font-mono text-xs uppercase tracking-wider text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(tab === "pending" ? isLoading : staleLoading) ? (
                  Array(5).fill(0).map((_, i) => (
                    <TableRow key={i} className="border-border/50">
                      <TableCell className="pl-4"><Skeleton className="h-4 w-4" /></TableCell>
                      <TableCell><Skeleton className="h-5 w-24" /></TableCell>
                      <TableCell><Skeleton className="h-5 w-32" /></TableCell>
                      <TableCell><Skeleton className="h-5 w-full" /></TableCell>
                      <TableCell className="text-center"><Skeleton className="h-6 w-20 mx-auto" /></TableCell>
                      <TableCell className="text-right"><Skeleton className="h-8 w-8 ml-auto" /></TableCell>
                    </TableRow>
                  ))
                ) : currentItems.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="h-[400px] text-center text-muted-foreground">
                      <div className="flex flex-col items-center justify-center">
                        <div className="h-16 w-16 bg-muted/50 rounded-full flex items-center justify-center mb-4 border border-border/50">
                          <CheckCircle2 className="h-8 w-8 text-green-500/50" />
                        </div>
                        <h3 className="font-serif text-xl text-foreground mb-1">
                          {tab === "pending" ? "Queue Empty" : "No Stale Positions"}
                        </h3>
                        <p className="font-mono text-sm max-w-sm">
                          {tab === "pending"
                            ? "All positions have been reviewed and signed off."
                            : "All Reasonable Basis positions are current (under 180 days old)."}
                        </p>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  currentItems.map((pos) => (
                    <TableRow
                      key={pos.id}
                      className={`border-border/50 hover:bg-muted/30 transition-colors group cursor-pointer ${
                        selectedIds.has(pos.id) ? "bg-primary/5 hover:bg-primary/8" : ""
                      }`}
                      onClick={(e) => {
                        const target = e.target as HTMLElement;
                        if (target.closest('[role="checkbox"]')) return;
                        setLocation(`/positions/${pos.id}`);
                      }}
                    >
                      <TableCell className="pl-4" onClick={(e) => e.stopPropagation()}>
                        <Checkbox
                          checked={selectedIds.has(pos.id)}
                          onCheckedChange={() => toggleOne(pos.id)}
                          aria-label={`Select position ${pos.id}`}
                          className="border-border/60"
                        />
                      </TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground whitespace-nowrap">
                        {format(new Date(pos.created_at), "MMM d, yyyy")}
                      </TableCell>
                      <TableCell>
                        <div className="font-medium text-sm text-foreground">{pos.event_type}</div>
                        <div className="text-xs text-muted-foreground mt-0.5">{pos.classification}</div>
                      </TableCell>
                      <TableCell className="max-w-md">
                        {tab === "stale" ? (
                          <div className="flex items-center gap-2">
                            <Badge variant="outline" className="border-orange-500/30 text-orange-400 bg-orange-500/5 font-mono text-[10px]">
                              {(pos as StaleItem).days_since_classification}d old
                            </Badge>
                            <span className="text-xs text-muted-foreground font-mono">Upgrade recommended</span>
                          </div>
                        ) : (
                          <p className="truncate text-sm text-muted-foreground font-serif">
                            {pos.rationale}
                          </p>
                        )}
                      </TableCell>
                      <TableCell className="text-center">
                        <TierBadge tier={pos.tier} />
                      </TableCell>
                      <TableCell className="text-right">
                        <Button variant="ghost" size="icon" className="group-hover:bg-primary/20 group-hover:text-primary transition-colors">
                          <ArrowRight className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>
      </Tabs>

      {/* Floating batch action bar */}
      {someSelected && (
        <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-50 animate-in slide-in-from-bottom-4 fade-in duration-200">
          <div className="flex items-center gap-3 rounded-xl border border-border/60 bg-background/95 backdrop-blur-xl px-5 py-3 shadow-2xl shadow-black/40">
            <div className="flex items-center gap-2 text-sm font-mono text-muted-foreground">
              <Users className="h-4 w-4" />
              <span className="font-semibold text-foreground">{selectedIds.size}</span> selected
            </div>
            <Separator />
            <Button
              size="sm"
              onClick={() => setIsBatchOpen(true)}
              className="font-mono text-xs tracking-wider h-8 gap-1.5"
            >
              <CheckSquare className="h-3.5 w-3.5" />
              Batch Sign Off
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setSelectedIds(new Set())}
              className="h-8 px-2 text-muted-foreground hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      )}

      {/* Batch sign-off dialog */}
      <Dialog open={isBatchOpen} onOpenChange={setIsBatchOpen}>
        <DialogContent className="sm:max-w-[520px] border-border/50 bg-background/95 backdrop-blur-md">
          <form onSubmit={handleBatchSignoff}>
            <DialogHeader>
              <DialogTitle className="font-serif text-xl flex items-center gap-2">
                <Users className="h-5 w-5 text-muted-foreground" />
                Batch Preparer Sign-Off
              </DialogTitle>
              <DialogDescription className="font-serif text-sm">
                Your attestation will be applied to{" "}
                <span className="font-semibold text-foreground">{selectedIds.size} position{selectedIds.size !== 1 ? "s" : ""}</span>.
                Each record will be sealed immutably with your credential and the current timestamp.
              </DialogDescription>
            </DialogHeader>

            <div className="grid gap-4 py-6">
              <div className="grid gap-2">
                <Label htmlFor="batch-name" className="font-mono text-xs uppercase tracking-wider text-muted-foreground">Preparer Name</Label>
                <Input
                  id="batch-name"
                  value={reviewerName}
                  onChange={(e) => setReviewerName(e.target.value)}
                  className="bg-card/50 border-border/50 font-mono"
                  placeholder="e.g. Jane Doe"
                  required
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="batch-credential" className="font-mono text-xs uppercase tracking-wider text-muted-foreground">Credential</Label>
                <Input
                  id="batch-credential"
                  value={reviewerCredential}
                  onChange={(e) => setReviewerCredential(e.target.value)}
                  className="bg-card/50 border-border/50 font-mono"
                  placeholder="e.g. CPA License #CA-98341, JD, EA"
                  required
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="batch-note" className="font-mono text-xs uppercase tracking-wider text-muted-foreground">
                  Attestation Note <span className="text-muted-foreground/50 normal-case">(optional)</span>
                </Label>
                <Textarea
                  id="batch-note"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  className="bg-card/50 border-border/50 font-serif text-sm resize-none"
                  placeholder="e.g. Reviewed all open-gap positions for Q4 2025 per engagement letter..."
                  rows={3}
                />
              </div>

              <div className="p-4 bg-muted/20 border border-border/50 rounded text-xs font-mono text-muted-foreground leading-relaxed">
                <div className="font-semibold text-foreground mb-1">Positions to be signed:</div>
                <div className="text-muted-foreground/70 max-h-20 overflow-y-auto space-y-0.5">
                  {Array.from(selectedIds).map((sid) => (
                    <div key={sid} className="truncate">· {sid}</div>
                  ))}
                </div>
                <div className="mt-2 pt-2 border-t border-border/30 text-muted-foreground/60">
                  This action is immutable and cannot be undone.
                </div>
              </div>
            </div>

            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setIsBatchOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={batchSignoff.isPending} className="font-mono tracking-wider gap-2">
                {batchSignoff.isPending ? (
                  "Signing..."
                ) : (
                  <>
                    <CheckSquare className="h-4 w-4" />
                    Attest {selectedIds.size} Position{selectedIds.size !== 1 ? "s" : ""}
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

function Separator() {
  return <div className="h-6 w-px bg-border/50" />;
}
