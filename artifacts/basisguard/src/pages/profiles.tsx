import React from "react";
import { useListProfiles, useGetProfileDelta } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { format } from "date-fns";
import { Users, GitCommit, FileText, ArrowRight } from "lucide-react";
import { TierBadge } from "@/components/ui/tier-badge";

export default function ProfilesPage() {
  const { data: profiles, isLoading } = useListProfiles();
  const [selectedProfileId, setSelectedProfileId] = React.useState<string | null>(null);

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-6 h-full">
      <div>
        <h1 className="text-3xl font-serif font-bold text-foreground flex items-center gap-3">
          <Users className="h-7 w-7 text-muted-foreground" />
          Treatment Profiles
        </h1>
        <p className="text-muted-foreground mt-1 text-sm font-mono uppercase tracking-widest">Client classification rulesets</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
        {isLoading ? (
          Array(3).fill(0).map((_, i) => <Skeleton key={i} className="h-64 w-full rounded-xl" />)
        ) : profiles?.map(profile => (
          <Card key={profile.id} className="bg-card/40 border-border/40 hover:bg-card/60 transition-all flex flex-col">
            <CardHeader className="pb-4 border-b border-border/30">
              <div className="flex justify-between items-start">
                <CardTitle className="font-serif text-xl">{profile.name}</CardTitle>
                <Badge variant="outline" className={`text-[10px] font-mono uppercase ${
                  profile.status === 'active' ? 'border-green-500/30 text-green-500 bg-green-500/10' :
                  profile.status === 'deprecated' ? 'border-destructive/30 text-destructive bg-destructive/10' :
                  'border-blue-500/30 text-blue-500 bg-blue-500/10'
                }`}>
                  {profile.status.replace('_', ' ')}
                </Badge>
              </div>
              <CardDescription className="font-mono text-xs mt-2 text-muted-foreground">
                ID: {profile.id}
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-4 flex-1 space-y-4">
              <div className="space-y-2">
                <div className="text-[10px] font-mono uppercase text-muted-foreground tracking-wider flex items-center justify-between">
                  <span>Rules</span>
                  <Badge variant="secondary" className="font-mono text-[10px] bg-muted/50">{profile.rules.length}</Badge>
                </div>
                <div className="space-y-1">
                  {profile.rules.slice(0, 3).map((rule, i) => (
                    <div key={i} className="text-xs font-mono bg-background/50 border border-border/50 p-2 rounded flex justify-between items-center">
                      <span className="truncate max-w-[120px] text-muted-foreground">{rule.event_type}</span>
                      <ArrowRight className="h-3 w-3 text-muted-foreground/50 shrink-0 mx-2" />
                      <span className="truncate max-w-[100px] text-right">{rule.classification}</span>
                    </div>
                  ))}
                  {profile.rules.length > 3 && (
                    <div className="text-xs font-mono text-center text-muted-foreground/50 pt-1">+ {profile.rules.length - 3} more</div>
                  )}
                </div>
              </div>

              {profile.changelog && (
                <div className="text-xs font-serif text-muted-foreground border-l-2 border-primary/30 pl-3 italic">
                  "{profile.changelog}"
                </div>
              )}
            </CardContent>
            <div className="p-4 border-t border-border/30 bg-muted/10 mt-auto flex justify-between items-center">
              <span className="text-[10px] font-mono text-muted-foreground/70">
                Created {format(new Date(profile.created_at), "MMM yyyy")}
              </span>
              <button 
                onClick={() => setSelectedProfileId(profile.id)}
                className="text-[11px] font-mono uppercase text-primary hover:text-primary/80 transition-colors flex items-center gap-1"
              >
                <GitCommit className="h-3 w-3" /> View Impact Delta
              </button>
            </div>
          </Card>
        ))}
      </div>

      <DeltaModal profileId={selectedProfileId} onClose={() => setSelectedProfileId(null)} />
    </div>
  );
}

function DeltaModal({ profileId, onClose }: { profileId: string | null, onClose: () => void }) {
  const { data: delta, isLoading } = useGetProfileDelta(profileId || "", {
    query: {
      enabled: !!profileId
    }
  });

  return (
    <Dialog open={!!profileId} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[800px] border-border/50 bg-background/95 backdrop-blur-xl">
        <DialogHeader>
          <DialogTitle className="font-serif text-xl flex items-center gap-2">
            <GitCommit className="h-5 w-5 text-muted-foreground" />
            Impact Delta Analysis
          </DialogTitle>
          <DialogDescription className="font-mono text-sm">
            {delta?.profile_name ? `Simulated impact of applying profile: ${delta.profile_name}` : "Calculating historical deviation..."}
          </DialogDescription>
        </DialogHeader>
        
        <div className="min-h-[300px] max-h-[500px] overflow-auto border border-border/50 rounded-md mt-4">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center h-[300px] space-y-4">
              <Skeleton className="h-12 w-12 rounded-full" />
              <div className="font-mono text-sm text-muted-foreground animate-pulse">Running scenario analysis...</div>
            </div>
          ) : !delta || delta.changed_positions.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-[300px] text-muted-foreground">
              <FileText className="h-10 w-10 mb-4 opacity-50" />
              <p className="font-mono text-sm">No deviations detected.</p>
              <p className="font-serif text-sm mt-1">This profile matches historical position records.</p>
            </div>
          ) : (
            <Table>
              <TableHeader className="bg-muted/50 sticky top-0">
                <TableRow className="border-border/50">
                  <TableHead className="font-mono text-xs uppercase">Event / TX</TableHead>
                  <TableHead className="font-mono text-xs uppercase text-muted-foreground">Before (Current Log)</TableHead>
                  <TableHead className="font-mono text-xs uppercase w-10"></TableHead>
                  <TableHead className="font-mono text-xs uppercase text-primary">After (Simulated)</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {delta.changed_positions.map((entry, idx) => (
                  <TableRow key={idx} className="border-border/50 bg-card/30">
                    <TableCell>
                      <div className="font-medium text-sm">{entry.event_type}</div>
                      <div className="text-[10px] font-mono text-muted-foreground mt-1 truncate max-w-[120px]" title={entry.tx_id}>{entry.tx_id}</div>
                    </TableCell>
                    <TableCell className="align-top pt-4">
                      <div className="text-xs text-muted-foreground mb-2 line-through decoration-destructive/50">{entry.before_classification}</div>
                      <TierBadge tier={entry.before_tier} className="opacity-70 scale-90 origin-left" />
                    </TableCell>
                    <TableCell className="text-center align-middle">
                      <ArrowRight className="h-4 w-4 text-muted-foreground/30 mx-auto" />
                    </TableCell>
                    <TableCell className="align-top pt-4 bg-primary/5">
                      <div className="text-xs text-foreground font-medium mb-2">{entry.after_classification}</div>
                      <TierBadge tier={entry.after_tier} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
        
        {delta && delta.changed_positions.length > 0 && (
          <div className="text-xs font-mono text-muted-foreground mt-2 text-right">
            Found {delta.total_changed} historical positions that would be superseded.
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}