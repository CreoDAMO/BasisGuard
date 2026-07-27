import React, { useState } from "react";
import { useListPositions } from "@workspace/api-client-react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { format } from "date-fns";
import { Link, useLocation } from "wouter";
import { TierBadge } from "@/components/ui/tier-badge";
import { Search, Filter, AlertCircle, CheckCircle2, Clock } from "lucide-react";
import { PositionRecordTier } from "@workspace/api-client-react";

interface Chain { id: string; name: string; slug: string; }

export default function PositionsPage() {
  const [, setLocation] = useLocation();
  const [tier, setTier] = useState<PositionRecordTier | "all">("all");
  const [statusFilter, setStatusFilter] = useState<"all" | "requires_review" | "signed_off">("all");
  const [chainFilter, setChainFilter] = useState<string>("all");

  const { data: chains } = useQuery<Chain[]>({ queryKey: ["chains"], queryFn: () => fetch("/api/chains").then(r => r.json()) });

  const queryParams: any = {};
  if (tier !== "all") queryParams.tier = tier;
  if (statusFilter === "requires_review") queryParams.requires_review = true;
  if (statusFilter === "signed_off") queryParams.requires_review = false;
  if (chainFilter !== "all") queryParams.chain_id = chainFilter;

  const { data: positionsData, isLoading } = useListPositions(queryParams);

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-6 h-full flex flex-col">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4 shrink-0">
        <div>
          <h1 className="text-3xl font-serif font-bold text-foreground">Evidence Log</h1>
          <p className="text-muted-foreground mt-1 text-sm font-mono uppercase tracking-widest">Immutable Position Records</p>
        </div>
      </div>

      <Card className="bg-card/50 backdrop-blur border-border/50 shadow-sm shrink-0">
        <CardContent className="p-4 flex flex-col sm:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input 
              placeholder="Search by event type, tx id..." 
              className="pl-9 bg-background/50 border-border/50"
            />
          </div>
          <div className="flex gap-3 flex-wrap">
            <Select value={tier} onValueChange={(val: any) => setTier(val)}>
              <SelectTrigger className="w-[180px] bg-background/50 border-border/50">
                <div className="flex items-center gap-2">
                  <Filter className="h-4 w-4 text-muted-foreground" />
                  <SelectValue placeholder="Confidence Tier" />
                </div>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Tiers</SelectItem>
                <SelectItem value="will">Will</SelectItem>
                <SelectItem value="should">Should</SelectItem>
                <SelectItem value="more_likely_than_not">More Likely Than Not</SelectItem>
                <SelectItem value="substantial_authority">Substantial Authority</SelectItem>
                <SelectItem value="reasonable_basis">Reasonable Basis</SelectItem>
              </SelectContent>
            </Select>

            <Select value={statusFilter} onValueChange={(val: any) => setStatusFilter(val)}>
              <SelectTrigger className="w-[160px] bg-background/50 border-border/50">
                <SelectValue placeholder="Review Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="requires_review">Requires Review</SelectItem>
                <SelectItem value="signed_off">Signed Off</SelectItem>
              </SelectContent>
            </Select>

            <Select value={chainFilter} onValueChange={setChainFilter}>
              <SelectTrigger className="w-[160px] bg-background/50 border-border/50">
                <SelectValue placeholder="Chain" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Chains</SelectItem>
                {chains?.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <div className="border border-border/50 rounded-md overflow-hidden bg-card/30 flex-1 flex flex-col min-h-[400px]">
        <Table>
          <TableHeader className="bg-muted/50 sticky top-0 z-10 backdrop-blur-sm">
            <TableRow className="border-border/50 hover:bg-transparent">
              <TableHead className="w-[140px] font-mono text-xs uppercase tracking-wider">Date</TableHead>
              <TableHead className="font-mono text-xs uppercase tracking-wider">Event & Classification</TableHead>
              <TableHead className="w-[200px] font-mono text-xs uppercase tracking-wider text-center">Confidence</TableHead>
              <TableHead className="w-[180px] font-mono text-xs uppercase tracking-wider text-center">Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array(8).fill(0).map((_, i) => (
                <TableRow key={i} className="border-border/50">
                  <TableCell><Skeleton className="h-5 w-24" /></TableCell>
                  <TableCell><Skeleton className="h-5 w-48" /></TableCell>
                  <TableCell className="text-center"><Skeleton className="h-6 w-20 mx-auto" /></TableCell>
                  <TableCell className="text-center"><Skeleton className="h-6 w-24 mx-auto" /></TableCell>
                </TableRow>
              ))
            ) : positionsData?.items.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="h-48 text-center text-muted-foreground">
                  <div className="flex flex-col items-center justify-center">
                    <AlertCircle className="h-8 w-8 mb-2 opacity-50" />
                    <p>No position records found matching filters.</p>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              positionsData?.items.map((pos) => (
                <TableRow 
                  key={pos.id} 
                  className="border-border/50 cursor-pointer hover:bg-muted/30 transition-colors"
                  onClick={() => setLocation(`/positions/${pos.id}`)}
                >
                  <TableCell className="font-mono text-xs text-muted-foreground whitespace-nowrap">
                    {format(new Date(pos.created_at), "MMM d, yyyy")}
                    <div className="text-[10px] opacity-70">{format(new Date(pos.created_at), "HH:mm:ss")}</div>
                  </TableCell>
                  <TableCell>
                    <div className="font-medium text-sm">{pos.event_type}</div>
                    <div className="text-xs text-muted-foreground mt-0.5">{pos.classification}</div>
                  </TableCell>
                  <TableCell className="text-center">
                    <TierBadge tier={pos.tier} />
                  </TableCell>
                  <TableCell className="text-center">
                    {pos.requires_review ? (
                      <Badge variant="outline" className="border-destructive/30 text-destructive bg-destructive/10 font-mono text-[10px] uppercase py-0.5 gap-1">
                        <Clock className="h-3 w-3" /> Review
                      </Badge>
                    ) : pos.reviewer_signoff_at ? (
                      <Badge variant="outline" className="border-green-500/30 text-green-500 bg-green-500/10 font-mono text-[10px] uppercase py-0.5 gap-1">
                        <CheckCircle2 className="h-3 w-3" /> Signed Off
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="border-border/50 font-mono text-[10px] uppercase py-0.5 text-muted-foreground">
                        Auto
                      </Badge>
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
        
        {positionsData && positionsData.items.length > 0 && (
          <div className="p-4 border-t border-border/50 bg-muted/20 text-xs font-mono text-muted-foreground flex justify-between items-center mt-auto">
            <span>Showing {positionsData.items.length} of {positionsData.total} records</span>
            <div className="flex gap-2">
              <button disabled className="px-3 py-1 border border-border/50 rounded disabled:opacity-50">Prev</button>
              <button disabled className="px-3 py-1 border border-border/50 rounded disabled:opacity-50">Next</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}