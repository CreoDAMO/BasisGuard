import React, { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { useQuery } from "@tanstack/react-query";
import { Link2, Layers, ChevronRight, Network, Box } from "lucide-react";

interface Chain {
  id: string;
  name: string;
  slug: string;
  is_l2: boolean;
  parent_chain_id: string | null;
  metadata: Record<string, string>;
  created_at: string;
  protocols?: Protocol[];
}

interface Protocol {
  id: string;
  chain_id: string;
  name: string;
  slug: string;
  contract_addresses: Record<string, string>;
  adapter_version: string | null;
  metadata: Record<string, string>;
  created_at: string;
}

function useChains() {
  return useQuery<Chain[]>({
    queryKey: ["chains"],
    queryFn: () => fetch("/api/chains").then((r) => r.json()),
  });
}

function useProtocols() {
  return useQuery<Protocol[]>({
    queryKey: ["protocols"],
    queryFn: () => fetch("/api/protocols").then((r) => r.json()),
  });
}

const CHAIN_COLORS: Record<string, string> = {
  ethereum: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  arbitrum: "bg-sky-500/10 text-sky-400 border-sky-500/20",
  base: "bg-indigo-500/10 text-indigo-400 border-indigo-500/20",
  optimism: "bg-red-500/10 text-red-400 border-red-500/20",
};

const CHAIN_DOT: Record<string, string> = {
  ethereum: "bg-blue-400",
  arbitrum: "bg-sky-400",
  base: "bg-indigo-400",
  optimism: "bg-red-400",
};

export default function ChainsPage() {
  const { data: chains, isLoading: chainsLoading } = useChains();
  const { data: protocols, isLoading: protocolsLoading } = useProtocols();
  const [selectedChain, setSelectedChain] = useState<string | null>(null);

  const l1s = chains?.filter((c) => !c.is_l2) ?? [];
  const l2s = chains?.filter((c) => c.is_l2) ?? [];

  const chainProtocols = (chainId: string) =>
    protocols?.filter((p) => p.chain_id === chainId) ?? [];

  const isLoading = chainsLoading || protocolsLoading;

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-8">
      <div>
        <h1 className="text-3xl font-serif font-bold text-foreground">Chain Registry</h1>
        <p className="text-muted-foreground mt-1 text-sm font-mono uppercase tracking-widest">Supported Networks & Protocol Adapters</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "L1 Networks", value: l1s.length, icon: Network },
          { label: "L2 Networks", value: l2s.length, icon: Layers },
          { label: "Protocol Adapters", value: protocols?.length ?? 0, icon: Box },
          { label: "Total Chains", value: chains?.length ?? 0, icon: Link2 },
        ].map(({ label, value, icon: Icon }) => (
          <Card key={label} className="bg-card/50 backdrop-blur border-border/50">
            <CardContent className="p-5 flex items-center gap-4">
              <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                <Icon className="h-4 w-4 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-bold font-mono">{isLoading ? "—" : value}</p>
                <p className="text-xs text-muted-foreground">{label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Chain list */}
        <div className="lg:col-span-1 space-y-3">
          <h2 className="text-sm font-mono uppercase tracking-widest text-muted-foreground">Networks</h2>
          {isLoading
            ? Array(4).fill(0).map((_, i) => <Skeleton key={i} className="h-16 w-full" />)
            : chains?.map((chain) => (
                <button
                  key={chain.id}
                  onClick={() => setSelectedChain(selectedChain === chain.id ? null : chain.id)}
                  className={`w-full text-left rounded-lg border p-4 transition-all hover:bg-muted/40 ${
                    selectedChain === chain.id ? "border-primary/50 bg-primary/5" : "border-border/50 bg-card/50"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span className={`h-2.5 w-2.5 rounded-full ${CHAIN_DOT[chain.slug] ?? "bg-muted-foreground"}`} />
                      <div>
                        <p className="font-medium text-sm">{chain.name}</p>
                        <p className="text-xs text-muted-foreground font-mono">{chain.slug}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {chain.is_l2 && (
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0">L2</Badge>
                      )}
                      <span className="text-xs text-muted-foreground">{chainProtocols(chain.id).length} protocols</span>
                      <ChevronRight className={`h-3.5 w-3.5 text-muted-foreground transition-transform ${selectedChain === chain.id ? "rotate-90" : ""}`} />
                    </div>
                  </div>
                </button>
              ))
          }
        </div>

        {/* Chain detail / protocols */}
        <div className="lg:col-span-2">
          {selectedChain ? (
            (() => {
              const chain = chains?.find((c) => c.id === selectedChain);
              const protos = chainProtocols(selectedChain);
              if (!chain) return null;
              const meta = chain.metadata ?? {};
              const colorClass = CHAIN_COLORS[chain.slug] ?? "bg-muted/10 text-muted-foreground border-border/30";
              return (
                <div className="space-y-4">
                  <Card className="bg-card/50 backdrop-blur border-border/50">
                    <CardHeader className="pb-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <span className={`h-3 w-3 rounded-full ${CHAIN_DOT[chain.slug] ?? "bg-muted"}`} />
                          <CardTitle className="font-serif text-xl">{chain.name}</CardTitle>
                          {chain.is_l2 && <Badge variant="outline">L2</Badge>}
                        </div>
                        <Badge variant="outline" className={`font-mono text-xs ${colorClass}`}>{chain.slug}</Badge>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-3 text-sm">
                      {meta.rpc_url && (
                        <div className="flex items-start gap-2">
                          <span className="text-muted-foreground w-24 flex-shrink-0">RPC</span>
                          <span className="font-mono text-xs break-all">{meta.rpc_url}</span>
                        </div>
                      )}
                      {meta.explorer_url && (
                        <div className="flex items-start gap-2">
                          <span className="text-muted-foreground w-24 flex-shrink-0">Explorer</span>
                          <a href={meta.explorer_url} target="_blank" rel="noreferrer" className="font-mono text-xs text-primary hover:underline break-all">{meta.explorer_url}</a>
                        </div>
                      )}
                      {meta.native_token && (
                        <div className="flex items-center gap-2">
                          <span className="text-muted-foreground w-24 flex-shrink-0">Native Token</span>
                          <Badge variant="secondary" className="font-mono text-xs">{meta.native_token}</Badge>
                        </div>
                      )}
                    </CardContent>
                  </Card>

                  <h3 className="text-sm font-mono uppercase tracking-widest text-muted-foreground">Protocol Adapters on {chain.name}</h3>
                  {protos.length === 0 ? (
                    <Card className="bg-card/50 backdrop-blur border-border/50">
                      <CardContent className="p-8 text-center text-muted-foreground text-sm">No protocols registered on this chain yet.</CardContent>
                    </Card>
                  ) : (
                    protos.map((proto) => (
                      <Card key={proto.id} className="bg-card/50 backdrop-blur border-border/50">
                        <CardContent className="p-4 space-y-2">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <Box className="h-4 w-4 text-primary" />
                              <span className="font-medium">{proto.name}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              {proto.adapter_version && (
                                <Badge variant="outline" className="font-mono text-xs">v{proto.adapter_version}</Badge>
                              )}
                              <Badge variant="secondary" className="font-mono text-xs">{proto.slug}</Badge>
                            </div>
                          </div>
                          {proto.metadata?.description && (
                            <p className="text-xs text-muted-foreground">{proto.metadata.description as string}</p>
                          )}
                          {Object.keys(proto.contract_addresses ?? {}).length > 0 && (
                            <div className="space-y-1 pt-1">
                              {Object.entries(proto.contract_addresses).map(([key, addr]) => (
                                <div key={key} className="flex items-center gap-2 text-xs">
                                  <span className="text-muted-foreground capitalize w-16 flex-shrink-0">{key}</span>
                                  <span className="font-mono break-all text-muted-foreground/70">{addr}</span>
                                </div>
                              ))}
                            </div>
                          )}
                        </CardContent>
                      </Card>
                    ))
                  )}
                </div>
              );
            })()
          ) : (
            <Card className="bg-card/50 backdrop-blur border-border/50 h-full">
              <CardContent className="p-12 flex flex-col items-center justify-center text-center gap-4 h-full min-h-[300px]">
                <Network className="h-10 w-10 text-muted-foreground/40" />
                <div>
                  <p className="font-medium text-muted-foreground">Select a chain</p>
                  <p className="text-sm text-muted-foreground/60 mt-1">Click a network to view its details and registered protocol adapters</p>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* L2 Hierarchy */}
      {!isLoading && l2s.length > 0 && (
        <Card className="bg-card/50 backdrop-blur border-border/50">
          <CardHeader>
            <CardTitle className="font-serif text-base">L2 Hierarchy</CardTitle>
            <CardDescription>Layer 2 networks and their parent chains</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {l1s.map((l1) => {
                const children = l2s.filter((l2) => l2.parent_chain_id === l1.id);
                if (!children.length) return null;
                return (
                  <div key={l1.id} className="space-y-1">
                    <div className="flex items-center gap-2 text-sm">
                      <span className={`h-2 w-2 rounded-full ${CHAIN_DOT[l1.slug] ?? "bg-muted"}`} />
                      <span className="font-medium">{l1.name}</span>
                      <Badge variant="outline" className="font-mono text-[10px] px-1.5">L1</Badge>
                    </div>
                    {children.map((l2) => (
                      <div key={l2.id} className="ml-4 flex items-center gap-2 text-sm border-l border-border/50 pl-4 py-0.5">
                        <span className={`h-1.5 w-1.5 rounded-full ${CHAIN_DOT[l2.slug] ?? "bg-muted"}`} />
                        <span className="text-muted-foreground">{l2.name}</span>
                        <Badge variant="outline" className="font-mono text-[10px] px-1.5">L2</Badge>
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
