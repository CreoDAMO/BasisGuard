import React, { useState } from "react";
import { useListCitations, useCreateCitation, getListCitationsQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Search, BookMarked, ExternalLink, Plus } from "lucide-react";
import { format } from "date-fns";
import { CitationInputType, CitationInputAuthorityStrength } from "@workspace/api-client-react/src/generated/api.schemas";

export default function CitationsPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  
  const queryParams: any = {};
  if (search) queryParams.q = search;
  if (typeFilter !== "all") queryParams.type = typeFilter;

  const { data: citations, isLoading } = useListCitations(queryParams);
  const createCitation = useCreateCitation();

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [newCitation, setNewCitation] = useState({
    type: "Notice" as CitationInputType,
    reference: "",
    summary: "",
    url: "",
    authority_strength: "binding_on_irs_only" as CitationInputAuthorityStrength
  });

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await createCitation.mutateAsync({ data: newCitation });
      setIsCreateOpen(false);
      queryClient.invalidateQueries({ queryKey: getListCitationsQueryKey() });
      setNewCitation({
        type: "Notice",
        reference: "",
        summary: "",
        url: "",
        authority_strength: "binding_on_irs_only"
      });
    } catch (err) {
      console.error(err);
    }
  };

  const getStrengthColor = (strength: string) => {
    switch (strength) {
      case "binding_on_courts": return "text-emerald-500 border-emerald-500/30 bg-emerald-500/10";
      case "binding_on_irs_only": return "text-blue-500 border-blue-500/30 bg-blue-500/10";
      case "non_binding_persuasive": return "text-muted-foreground border-border bg-muted/20";
      default: return "";
    }
  };

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-6 h-full flex flex-col">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 shrink-0">
        <div>
          <h1 className="text-3xl font-serif font-bold text-foreground flex items-center gap-3">
            <BookMarked className="h-7 w-7 text-muted-foreground" />
            Authority Library
          </h1>
          <p className="text-muted-foreground mt-1 text-sm font-mono uppercase tracking-widest">IRS Guidance & Case Law Repository</p>
        </div>
        
        <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
          <DialogTrigger asChild>
            <Button className="font-mono tracking-wider text-sm shadow-[0_0_10px_rgba(255,255,255,0.05)] border border-primary/20">
              <Plus className="h-4 w-4 mr-2" /> Add Citation
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[600px] border-border/50 bg-background/95 backdrop-blur-xl">
            <form onSubmit={handleCreate}>
              <DialogHeader>
                <DialogTitle className="font-serif text-xl">Add Authority Citation</DialogTitle>
              </DialogHeader>
              <div className="grid gap-4 py-6 font-mono text-sm">
                <div className="grid grid-cols-2 gap-4">
                  <div className="grid gap-2">
                    <Label className="text-xs uppercase text-muted-foreground">Type</Label>
                    <Select value={newCitation.type} onValueChange={(val: any) => setNewCitation({...newCitation, type: val})}>
                      <SelectTrigger className="bg-card/50 border-border/50"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {["Notice", "Rev_Proc", "Rev_Rul", "Treasury_Decision", "Case", "Statute"].map(t => (
                          <SelectItem key={t} value={t}>{t.replace('_', ' ')}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid gap-2">
                    <Label className="text-xs uppercase text-muted-foreground">Strength</Label>
                    <Select value={newCitation.authority_strength} onValueChange={(val: any) => setNewCitation({...newCitation, authority_strength: val})}>
                      <SelectTrigger className="bg-card/50 border-border/50"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="binding_on_courts">Binding on Courts</SelectItem>
                        <SelectItem value="binding_on_irs_only">Binding on IRS Only</SelectItem>
                        <SelectItem value="non_binding_persuasive">Non-binding (Persuasive)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid gap-2">
                  <Label className="text-xs uppercase text-muted-foreground">Reference</Label>
                  <Input 
                    value={newCitation.reference} 
                    onChange={e => setNewCitation({...newCitation, reference: e.target.value})}
                    placeholder="e.g. Notice 2014-21"
                    className="bg-card/50 border-border/50" required 
                  />
                </div>
                <div className="grid gap-2">
                  <Label className="text-xs uppercase text-muted-foreground">Summary / Holding</Label>
                  <Textarea 
                    value={newCitation.summary} 
                    onChange={e => setNewCitation({...newCitation, summary: e.target.value})}
                    className="bg-card/50 border-border/50 font-serif min-h-[100px]" 
                    placeholder="Briefly summarize the tax principle established..."
                    required 
                  />
                </div>
                <div className="grid gap-2">
                  <Label className="text-xs uppercase text-muted-foreground">URL (Optional)</Label>
                  <Input 
                    value={newCitation.url} 
                    onChange={e => setNewCitation({...newCitation, url: e.target.value})}
                    placeholder="https://irs.gov/..."
                    className="bg-card/50 border-border/50" 
                  />
                </div>
              </div>
              <DialogFooter>
                <Button type="button" variant="ghost" onClick={() => setIsCreateOpen(false)}>Cancel</Button>
                <Button type="submit" disabled={createCitation.isPending} className="font-mono">
                  Save Citation
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <Card className="bg-card/50 backdrop-blur border-border/50 shadow-sm shrink-0">
        <CardContent className="p-4 flex gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input 
              placeholder="Search reference or summary..." 
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-9 bg-background/50 border-border/50 font-mono text-sm"
            />
          </div>
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="w-[200px] bg-background/50 border-border/50 font-mono text-sm">
              <SelectValue placeholder="Type Filter" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              {["Notice", "Rev_Proc", "Rev_Rul", "Treasury_Decision", "Case", "Statute"].map(t => (
                <SelectItem key={t} value={t}>{t.replace('_', ' ')}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6 overflow-y-auto pb-8">
        {isLoading ? (
          Array(6).fill(0).map((_, i) => <Skeleton key={i} className="h-64 w-full rounded-xl" />)
        ) : citations?.map(citation => (
          <Card key={citation.id} className="bg-card/40 border-border/40 hover:bg-card/60 hover:border-border/80 transition-all flex flex-col shadow-sm">
            <CardHeader className="pb-3 border-b border-border/30">
              <div className="flex justify-between items-start mb-1">
                <Badge variant="outline" className="text-[10px] font-mono uppercase bg-background/50 border-border/60 text-muted-foreground">
                  {citation.type.replace('_', ' ')}
                </Badge>
                {citation.url && (
                  <a href={citation.url} target="_blank" rel="noreferrer" className="text-muted-foreground hover:text-primary transition-colors">
                    <ExternalLink className="h-4 w-4" />
                  </a>
                )}
              </div>
              <CardTitle className="font-mono text-lg text-primary mt-2">{citation.reference}</CardTitle>
            </CardHeader>
            <CardContent className="pt-4 flex-1">
              <p className="text-sm font-serif text-muted-foreground leading-relaxed line-clamp-6">
                {citation.summary}
              </p>
            </CardContent>
            <div className="p-4 border-t border-border/30 bg-muted/10 mt-auto flex justify-between items-center">
              <span className={`text-[10px] font-mono uppercase px-2 py-1 rounded border ${getStrengthColor(citation.authority_strength)}`}>
                {citation.authority_strength.replace(/_/g, ' ')}
              </span>
              <span className="text-[10px] font-mono text-muted-foreground/50">
                Added {format(new Date(citation.created_at), "MMM yyyy")}
              </span>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}