import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { CheckCircle2, XCircle, Clock, PlusCircle, Network, Box } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

type SubmissionStatus = "pending" | "approved" | "rejected";

interface Submission {
  id: string;
  type: "chain" | "protocol";
  submitted_by: string;
  submitter_credential: string;
  name: string;
  slug: string;
  status: SubmissionStatus;
  reviewed_by: string | null;
  reviewed_at: string | null;
  rejection_reason: string | null;
  created_at: string;
  // chain-specific
  is_l2?: boolean;
  parent_chain_slug?: string | null;
  rpc_url?: string | null;
  explorer_url?: string | null;
  native_token?: string | null;
  // protocol-specific
  chain_slug?: string;
  documentation_url?: string | null;
  notes?: string | null;
}

function useSubmissions(status = "all") {
  return useQuery<Submission[]>({
    queryKey: ["admin-submissions", status],
    queryFn: async () => {
      const r = await fetch(`/api/admin/submissions?status=${status}`);
      if (!r.ok) {
        if (r.status === 403) return []; // non-admin users see an empty list
        const body = await r.json().catch(() => ({})) as { error?: string };
        throw new Error(body.error ?? `HTTP ${r.status}`);
      }
      return r.json() as Promise<Submission[]>;
    },
  });
}

function StatusBadge({ status }: { status: SubmissionStatus }) {
  const map = {
    pending: { label: "Pending", class: "bg-amber-500/10 text-amber-400 border-amber-500/20", icon: Clock },
    approved: { label: "Approved", class: "bg-green-500/10 text-green-400 border-green-500/20", icon: CheckCircle2 },
    rejected: { label: "Rejected", class: "bg-red-500/10 text-red-400 border-red-500/20", icon: XCircle },
  };
  const cfg = map[status];
  const Icon = cfg.icon;
  return (
    <Badge variant="outline" className={`gap-1 ${cfg.class}`}>
      <Icon className="h-3 w-3" />
      {cfg.label}
    </Badge>
  );
}

function SubmissionCard({ sub, onApprove, onReject, isPending }: {
  sub: Submission;
  onApprove: (id: string, type: "chain" | "protocol") => void;
  onReject: (id: string, type: "chain" | "protocol") => void;
  isPending: boolean;
}) {
  return (
    <Card className="bg-card/50 backdrop-blur border-border/50">
      <CardContent className="p-5 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2">
            {sub.type === "chain" ? <Network className="h-4 w-4 text-primary" /> : <Box className="h-4 w-4 text-primary" />}
            <div>
              <p className="font-medium text-sm">{sub.name}</p>
              <p className="text-xs text-muted-foreground font-mono">{sub.slug}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <Badge variant="secondary" className="text-xs capitalize">{sub.type}</Badge>
            <StatusBadge status={sub.status} />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
          <div><span className="text-muted-foreground">Submitted by </span><span>{sub.submitted_by}</span></div>
          <div><span className="text-muted-foreground">License </span><span className="font-mono">{sub.submitter_credential}</span></div>
          {sub.type === "chain" && sub.is_l2 && <div><span className="text-muted-foreground">Parent chain </span><span className="font-mono">{sub.parent_chain_slug ?? "—"}</span></div>}
          {sub.type === "protocol" && <div><span className="text-muted-foreground">Chain </span><span className="font-mono">{sub.chain_slug}</span></div>}
          {sub.rpc_url && <div className="col-span-2"><span className="text-muted-foreground">RPC </span><span className="font-mono break-all">{sub.rpc_url}</span></div>}
          {sub.documentation_url && <div className="col-span-2"><span className="text-muted-foreground">Docs </span><a href={sub.documentation_url} target="_blank" rel="noreferrer" className="text-primary hover:underline">{sub.documentation_url}</a></div>}
          {sub.notes && <div className="col-span-2"><span className="text-muted-foreground">Notes </span><span>{sub.notes}</span></div>}
          {sub.rejection_reason && <div className="col-span-2 text-red-400"><span className="text-muted-foreground">Rejection reason </span><span>{sub.rejection_reason}</span></div>}
        </div>

        {sub.status === "pending" && (
          <div className="flex gap-2 pt-1">
            <Button size="sm" variant="outline" className="text-green-400 border-green-500/30 hover:bg-green-500/10" disabled={isPending} onClick={() => onApprove(sub.id, sub.type)}>
              <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Approve
            </Button>
            <Button size="sm" variant="outline" className="text-red-400 border-red-500/30 hover:bg-red-500/10" disabled={isPending} onClick={() => onReject(sub.id, sub.type)}>
              <XCircle className="h-3.5 w-3.5 mr-1" /> Reject
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function SubmitChainForm({ onSuccess }: { onSuccess: () => void }) {
  const [form, setForm] = useState({ submitted_by: "", submitter_credential: "", name: "", slug: "", is_l2: false, parent_chain_slug: "", rpc_url: "", explorer_url: "", native_token: "" });
  const { toast } = useToast();
  const mutation = useMutation({
    mutationFn: (data: typeof form) => fetch("/api/submit/chain", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...data, is_l2: data.is_l2 || undefined }) }).then((r) => r.json()),
    onSuccess: () => { toast({ title: "Chain submitted", description: "Your submission is pending admin review." }); onSuccess(); },
  });
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value }));

  return (
    <form onSubmit={(e) => { e.preventDefault(); mutation.mutate(form); }} className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-1.5"><Label className="text-xs">Your Name / Firm</Label><Input placeholder="Jane Smith, CPA" value={form.submitted_by} onChange={set("submitted_by")} required /></div>
        <div className="space-y-1.5"><Label className="text-xs">License / Credential Number</Label><Input placeholder="CPA-12345" value={form.submitter_credential} onChange={set("submitter_credential")} required /></div>
        <div className="space-y-1.5"><Label className="text-xs">Chain Name</Label><Input placeholder="Ethereum Mainnet" value={form.name} onChange={set("name")} required /></div>
        <div className="space-y-1.5"><Label className="text-xs">Slug (unique identifier)</Label><Input placeholder="ethereum" value={form.slug} onChange={set("slug")} required /></div>
        <div className="space-y-1.5"><Label className="text-xs">RPC URL</Label><Input placeholder="https://..." value={form.rpc_url} onChange={set("rpc_url")} /></div>
        <div className="space-y-1.5"><Label className="text-xs">Explorer URL</Label><Input placeholder="https://etherscan.io" value={form.explorer_url} onChange={set("explorer_url")} /></div>
        <div className="space-y-1.5"><Label className="text-xs">Native Token</Label><Input placeholder="ETH" value={form.native_token} onChange={set("native_token")} /></div>
        <div className="space-y-1.5">
          <Label className="text-xs flex items-center gap-2">
            <input type="checkbox" checked={form.is_l2} onChange={set("is_l2")} className="rounded" />
            This is an L2 / rollup network
          </Label>
          {form.is_l2 && <Input placeholder="Parent chain slug (e.g. ethereum)" value={form.parent_chain_slug} onChange={set("parent_chain_slug")} />}
        </div>
      </div>
      <Button type="submit" disabled={mutation.isPending}><PlusCircle className="h-4 w-4 mr-2" />Submit Chain</Button>
    </form>
  );
}

function SubmitProtocolForm({ onSuccess }: { onSuccess: () => void }) {
  const [form, setForm] = useState({ submitted_by: "", submitter_credential: "", chain_slug: "", name: "", slug: "", documentation_url: "", notes: "" });
  const { toast } = useToast();
  const mutation = useMutation({
    mutationFn: (data: typeof form) => fetch("/api/submit/protocol", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) }).then((r) => r.json()),
    onSuccess: () => { toast({ title: "Protocol submitted", description: "Your submission is pending admin review." }); onSuccess(); },
  });
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));

  return (
    <form onSubmit={(e) => { e.preventDefault(); mutation.mutate(form); }} className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-1.5"><Label className="text-xs">Your Name / Firm</Label><Input placeholder="Jane Smith, CPA" value={form.submitted_by} onChange={set("submitted_by")} required /></div>
        <div className="space-y-1.5"><Label className="text-xs">License / Credential Number</Label><Input placeholder="CPA-12345" value={form.submitter_credential} onChange={set("submitter_credential")} required /></div>
        <div className="space-y-1.5"><Label className="text-xs">Chain Slug</Label><Input placeholder="ethereum, arbitrum, base..." value={form.chain_slug} onChange={set("chain_slug")} required /></div>
        <div className="space-y-1.5"><Label className="text-xs">Protocol Name</Label><Input placeholder="Uniswap V3" value={form.name} onChange={set("name")} required /></div>
        <div className="space-y-1.5"><Label className="text-xs">Protocol Slug</Label><Input placeholder="uniswap_v3" value={form.slug} onChange={set("slug")} required /></div>
        <div className="space-y-1.5"><Label className="text-xs">Documentation URL</Label><Input placeholder="https://docs.uniswap.org" value={form.documentation_url} onChange={set("documentation_url")} /></div>
        <div className="space-y-1.5 md:col-span-2"><Label className="text-xs">Notes (tax treatment context, open gaps, etc.)</Label><Input placeholder="Key events: Swap (§1001 taxable), Mint/Burn (LP tracking needed)..." value={form.notes} onChange={set("notes")} /></div>
      </div>
      <Button type="submit" disabled={mutation.isPending}><PlusCircle className="h-4 w-4 mr-2" />Submit Protocol</Button>
    </form>
  );
}

export default function SubmissionsPage() {
  const qc = useQueryClient();
  const { data: submissions, isLoading } = useSubmissions("all");
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("queue");

  const pending = submissions?.filter((s) => s.status === "pending") ?? [];
  const reviewed = submissions?.filter((s) => s.status !== "pending") ?? [];

  const approveMutation = useMutation({
    mutationFn: ({ id, type }: { id: string; type: "chain" | "protocol" }) =>
      fetch(`/api/admin/submissions/${type}/${id}/approve`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reviewed_by: "admin" }) }).then((r) => r.json()),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["admin-submissions"] });
      qc.invalidateQueries({ queryKey: ["chains"] });
      qc.invalidateQueries({ queryKey: ["protocols"] });
      toast({ title: "Approved", description: data.created_chain_id ? `Chain created: ${data.created_chain_id}` : `Protocol created: ${data.created_protocol_id}` });
    },
    onError: () => toast({ title: "Error", description: "Failed to approve submission.", variant: "destructive" }),
  });

  const rejectMutation = useMutation({
    mutationFn: ({ id, type }: { id: string; type: "chain" | "protocol" }) => {
      const reason = prompt("Rejection reason (optional):");
      return fetch(`/api/admin/submissions/${type}/${id}/reject`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reviewed_by: "admin", rejection_reason: reason }) }).then((r) => r.json());
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["admin-submissions"] }); toast({ title: "Rejected" }); },
  });

  const onSuccess = () => { qc.invalidateQueries({ queryKey: ["admin-submissions"] }); setActiveTab("queue"); };

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-8">
      <div>
        <h1 className="text-3xl font-serif font-bold text-foreground">Network Onboarding</h1>
        <p className="text-muted-foreground mt-1 text-sm font-mono uppercase tracking-widest">Submit & Review Chain / Protocol Requests</p>
      </div>

      <div className="grid grid-cols-3 gap-4">
        {[
          { label: "Pending Review", value: pending.length, class: "text-amber-400" },
          { label: "Approved", value: submissions?.filter((s) => s.status === "approved").length ?? 0, class: "text-green-400" },
          { label: "Rejected", value: submissions?.filter((s) => s.status === "rejected").length ?? 0, class: "text-red-400" },
        ].map(({ label, value, class: cls }) => (
          <Card key={label} className="bg-card/50 backdrop-blur border-border/50">
            <CardContent className="p-4">
              <p className={`text-2xl font-bold font-mono ${cls}`}>{isLoading ? "—" : value}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="queue">Review Queue {pending.length > 0 && <span className="ml-1.5 rounded-full bg-amber-500/20 text-amber-400 text-[10px] px-1.5 py-0.5 font-mono">{pending.length}</span>}</TabsTrigger>
          <TabsTrigger value="reviewed">Reviewed</TabsTrigger>
          <TabsTrigger value="submit-chain">Submit Chain</TabsTrigger>
          <TabsTrigger value="submit-protocol">Submit Protocol</TabsTrigger>
        </TabsList>

        <TabsContent value="queue" className="mt-4 space-y-3">
          {isLoading ? Array(2).fill(0).map((_, i) => <Skeleton key={i} className="h-32 w-full" />) :
            pending.length === 0 ? (
              <Card className="bg-card/50 backdrop-blur border-border/50">
                <CardContent className="p-10 text-center text-muted-foreground text-sm">No pending submissions — the queue is clear.</CardContent>
              </Card>
            ) : pending.map((sub) => (
              <SubmissionCard key={sub.id} sub={sub}
                onApprove={(id, type) => approveMutation.mutate({ id, type })}
                onReject={(id, type) => rejectMutation.mutate({ id, type })}
                isPending={approveMutation.isPending || rejectMutation.isPending}
              />
            ))
          }
        </TabsContent>

        <TabsContent value="reviewed" className="mt-4 space-y-3">
          {isLoading ? Array(2).fill(0).map((_, i) => <Skeleton key={i} className="h-24 w-full" />) :
            reviewed.length === 0 ? (
              <Card className="bg-card/50 backdrop-blur border-border/50">
                <CardContent className="p-10 text-center text-muted-foreground text-sm">No reviewed submissions yet.</CardContent>
              </Card>
            ) : reviewed.map((sub) => (
              <SubmissionCard key={sub.id} sub={sub} onApprove={() => {}} onReject={() => {}} isPending={false} />
            ))
          }
        </TabsContent>

        <TabsContent value="submit-chain" className="mt-4">
          <Card className="bg-card/50 backdrop-blur border-border/50">
            <CardHeader>
              <CardTitle className="font-serif text-base">Submit a New Chain</CardTitle>
              <CardDescription>CPAs and chain teams can request a new network be added to BasisGuard. Submissions are reviewed before activation.</CardDescription>
            </CardHeader>
            <CardContent><SubmitChainForm onSuccess={onSuccess} /></CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="submit-protocol" className="mt-4">
          <Card className="bg-card/50 backdrop-blur border-border/50">
            <CardHeader>
              <CardTitle className="font-serif text-base">Submit a Protocol Adapter</CardTitle>
              <CardDescription>Protocol teams and CPAs can request a new DeFi protocol adapter. Submissions are reviewed for tax treatment coverage before activation.</CardDescription>
            </CardHeader>
            <CardContent><SubmitProtocolForm onSuccess={onSuccess} /></CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
