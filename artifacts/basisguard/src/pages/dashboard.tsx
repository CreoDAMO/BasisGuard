import React from "react";
import { useGetDashboardSummary, useGetRecentActivity } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { TierBadge } from "@/components/ui/tier-badge";
import { format } from "date-fns";
import { Link } from "wouter";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { ShieldAlert, FileText, CheckCircle2, Bot, Layers, BookMarked, AlertCircle } from "lucide-react";

export default function DashboardPage() {
  const { data: summary, isLoading: isSummaryLoading } = useGetDashboardSummary();
  const { data: recentActivity, isLoading: isRecentLoading } = useGetRecentActivity({ limit: 5 });

  const getTierColor = (tier: string) => {
    switch(tier) {
      case "will": return "#4ADE80";
      case "should": return "#60A5FA";
      case "more_likely_than_not": return "#FCD34D";
      case "substantial_authority": return "#FB923C";
      case "reasonable_basis": return "#F87171";
      default: return "#888888";
    }
  };

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-8">
      <div>
        <h1 className="text-3xl font-serif font-bold text-foreground">Command Center</h1>
        <p className="text-muted-foreground mt-1 text-sm font-mono uppercase tracking-widest">System Overview & Integrity</p>
      </div>

      {isSummaryLoading || !summary ? (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {Array(4).fill(0).map((_, i) => (
            <Skeleton key={i} className="h-32 w-full" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card className="bg-card/50 backdrop-blur border-border/50 shadow-sm">
            <CardContent className="p-6 flex flex-col justify-between h-full">
              <div className="flex justify-between items-start">
                <div className="space-y-1">
                  <p className="text-sm font-medium text-muted-foreground">Pending Review</p>
                  <p className="text-4xl font-bold font-mono tracking-tighter">{summary.pending_review}</p>
                </div>
                <div className="h-10 w-10 bg-primary/10 rounded-full flex items-center justify-center">
                  <ShieldAlert className="h-5 w-5 text-primary" />
                </div>
              </div>
              <div className="mt-4 pt-4 border-t border-border/50 text-xs text-muted-foreground flex justify-between items-center">
                <span>Requires sign-off</span>
                <Link href="/review-queue" className="text-primary hover:underline font-medium">View Queue →</Link>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-card/50 backdrop-blur border-border/50 shadow-sm">
            <CardContent className="p-6 flex flex-col justify-between h-full">
              <div className="flex justify-between items-start">
                <div className="space-y-1">
                  <p className="text-sm font-medium text-muted-foreground">Auto-Applied</p>
                  <p className="text-4xl font-bold font-mono tracking-tighter">{summary.auto_applied}</p>
                </div>
                <div className="h-10 w-10 bg-blue-500/10 rounded-full flex items-center justify-center">
                  <Bot className="h-5 w-5 text-blue-500" />
                </div>
              </div>
              <div className="mt-4 pt-4 border-t border-border/50 text-xs text-muted-foreground flex justify-between items-center">
                <span>By active profiles</span>
                <span className="font-mono">{((summary.auto_applied / summary.total_positions) * 100).toFixed(1)}% coverage</span>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-card/50 backdrop-blur border-border/50 shadow-sm">
            <CardContent className="p-6 flex flex-col justify-between h-full">
              <div className="flex justify-between items-start">
                <div className="space-y-1">
                  <p className="text-sm font-medium text-muted-foreground">Signed Off</p>
                  <p className="text-4xl font-bold font-mono tracking-tighter">{summary.signed_off}</p>
                </div>
                <div className="h-10 w-10 bg-green-500/10 rounded-full flex items-center justify-center">
                  <CheckCircle2 className="h-5 w-5 text-green-500" />
                </div>
              </div>
              <div className="mt-4 pt-4 border-t border-border/50 text-xs text-muted-foreground flex justify-between items-center">
                <span>Verified positions</span>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-card/50 backdrop-blur border-border/50 shadow-sm">
            <CardContent className="p-6 flex flex-col justify-between h-full">
              <div className="flex justify-between items-start">
                <div className="space-y-1">
                  <p className="text-sm font-medium text-muted-foreground">Open Gap Events</p>
                  <p className="text-4xl font-bold font-mono tracking-tighter text-destructive">{summary.open_gap_events}</p>
                </div>
                <div className="h-10 w-10 bg-destructive/10 rounded-full flex items-center justify-center">
                  <AlertCircle className="h-5 w-5 text-destructive" />
                </div>
              </div>
              <div className="mt-4 pt-4 border-t border-border/50 text-xs text-muted-foreground flex justify-between items-center">
                <span>Missing classification</span>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <Card className="lg:col-span-2 bg-card/50 backdrop-blur border-border/50 shadow-sm flex flex-col">
          <CardHeader>
            <CardTitle className="font-serif">Classification Confidence</CardTitle>
            <CardDescription>Distribution of position records by IRC §6694 tier</CardDescription>
          </CardHeader>
          <CardContent className="flex-1 min-h-[300px]">
            {isSummaryLoading || !summary ? (
              <Skeleton className="w-full h-full" />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={summary.tier_breakdown} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <XAxis 
                    dataKey="label" 
                    stroke="hsl(var(--muted-foreground))" 
                    fontSize={12} 
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis 
                    stroke="hsl(var(--muted-foreground))" 
                    fontSize={12}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(value) => `${value}`}
                  />
                  <Tooltip 
                    cursor={{fill: 'hsl(var(--muted))'}}
                    contentStyle={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))' }}
                  />
                  <Bar dataKey="count" radius={[4, 4, 0, 0]} maxBarSize={60}>
                    {summary.tier_breakdown.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={getTierColor(entry.tier)} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card className="bg-card/50 backdrop-blur border-border/50 shadow-sm flex flex-col">
          <CardHeader className="pb-3 border-b border-border/50">
            <CardTitle className="font-serif text-lg">System Metrics</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
             {isSummaryLoading || !summary ? (
              <div className="p-6 space-y-4">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </div>
            ) : (
              <div className="divide-y divide-border/50">
                <div className="p-4 flex items-center justify-between hover:bg-muted/50 transition-colors">
                  <div className="flex items-center gap-3">
                    <FileText className="h-4 w-4 text-muted-foreground" />
                    <span className="font-medium text-sm">Total Positions</span>
                  </div>
                  <span className="font-mono text-sm">{summary.total_positions}</span>
                </div>
                <div className="p-4 flex items-center justify-between hover:bg-muted/50 transition-colors">
                  <div className="flex items-center gap-3">
                    <Layers className="h-4 w-4 text-muted-foreground" />
                    <span className="font-medium text-sm">Active Profiles</span>
                  </div>
                  <span className="font-mono text-sm">{summary.active_profiles}</span>
                </div>
                <div className="p-4 flex items-center justify-between hover:bg-muted/50 transition-colors">
                  <div className="flex items-center gap-3">
                    <BookMarked className="h-4 w-4 text-muted-foreground" />
                    <span className="font-medium text-sm">Authority Citations</span>
                  </div>
                  <span className="font-mono text-sm">{summary.total_citations}</span>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="bg-card/50 backdrop-blur border-border/50 shadow-sm">
        <CardHeader className="pb-4 border-b border-border/50 flex flex-row items-center justify-between">
          <div>
            <CardTitle className="font-serif">Recent Activity</CardTitle>
            <CardDescription>Latest classifications and overrides</CardDescription>
          </div>
          <Link href="/positions" className="text-sm font-medium text-primary hover:underline">
            View All
          </Link>
        </CardHeader>
        <CardContent className="p-0">
          {isRecentLoading || !recentActivity ? (
            <div className="p-6 space-y-4">
              {Array(3).fill(0).map((_, i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : recentActivity.length === 0 ? (
            <div className="p-12 text-center text-muted-foreground">
              <p>No recent activity found.</p>
            </div>
          ) : (
            <div className="divide-y divide-border/50">
              {recentActivity.map((record) => (
                <div key={record.id} className="p-4 flex items-center justify-between hover:bg-muted/30 transition-colors group">
                  <div className="flex items-center gap-4">
                    <div className="h-10 w-10 bg-muted rounded flex items-center justify-center border border-border shrink-0">
                      <FileText className="h-5 w-5 text-muted-foreground" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <Link href={`/positions/${record.id}`} className="font-medium hover:underline">
                          {record.event_type}
                        </Link>
                        {record.requires_review ? (
                          <span className="bg-destructive/20 text-destructive text-[10px] uppercase font-mono px-1.5 py-0.5 rounded border border-destructive/30">Needs Review</span>
                        ) : record.reviewer_signoff_at ? (
                          <span className="bg-green-500/20 text-green-500 text-[10px] uppercase font-mono px-1.5 py-0.5 rounded border border-green-500/30">Signed Off</span>
                        ) : null}
                      </div>
                      <p className="text-xs text-muted-foreground font-mono">
                        {format(new Date(record.created_at), "MMM d, yyyy HH:mm")} • TX: {record.tx_id?.substring(0, 8) || "N/A"}...
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="text-right hidden md:block">
                      <p className="text-sm font-medium">{record.classification}</p>
                      {record.profile_id && (
                        <p className="text-xs text-muted-foreground">Auto-applied</p>
                      )}
                    </div>
                    <TierBadge tier={record.tier} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}