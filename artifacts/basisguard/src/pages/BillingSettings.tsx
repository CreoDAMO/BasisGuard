import React, { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { CreditCard, Zap, Building2, ShieldCheck, CheckCircle2, XCircle, Clock, ArrowRight, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { format } from "date-fns";

interface BillingStatus {
  plan: string;
  status: string;
  billing_period: string | null;
  current_period_end: string | null;
  upgrade_prompt_count: number;
  is_super_admin: boolean;
  payments: Array<{
    id: string;
    plan: string;
    billing_period: string;
    amount_usdc: string;
    status: string;
    created_at: string;
    confirmed_at: string | null;
  }>;
}

const PLAN_ICONS: Record<string, React.ReactNode> = {
  free: <ShieldCheck className="h-5 w-5 text-zinc-400" />,
  pro: <Zap className="h-5 w-5 text-yellow-400" />,
  firm: <Building2 className="h-5 w-5 text-blue-400" />,
  enterprise: <ShieldCheck className="h-5 w-5 text-purple-400" />,
};

const PAYMENT_STATUS_BADGE: Record<string, { label: string; className: string }> = {
  confirmed: { label: "Confirmed", className: "text-emerald-400 border-emerald-800" },
  pending: { label: "Pending", className: "text-yellow-400 border-yellow-800" },
  failed: { label: "Failed", className: "text-red-400 border-red-800" },
  expired: { label: "Expired", className: "text-zinc-500 border-zinc-700" },
};

const baseUrl = import.meta.env.BASE_URL;

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${baseUrl}api${path}`, {
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export default function BillingSettingsPage() {
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const [contactForm, setContactForm] = useState({ company: "", team_size: "", message: "" });
  const [showContact, setShowContact] = useState(() => new URLSearchParams(window.location.search).get("contact") === "1");

  const { data: billing, isLoading } = useQuery<BillingStatus>({
    queryKey: ["billing-status"],
    queryFn: () => apiFetch<BillingStatus>("/billing/status"),
  });

  const cancelMutation = useMutation({
    mutationFn: () => apiFetch<{ cancelled: boolean; access_until: string | null }>("/billing/cancel", { method: "POST" }),
    onSuccess: (data) => {
      toast({
        title: "Subscription cancelled",
        description: data.access_until
          ? `You have access until ${format(new Date(data.access_until), "PPP")}.`
          : "Your subscription has been cancelled.",
      });
    },
    onError: (err: Error) => toast({ title: "Cancel failed", description: err.message, variant: "destructive" }),
  });

  const contactMutation = useMutation({
    mutationFn: () =>
      apiFetch<{ received: boolean }>("/billing/contact", {
        method: "POST",
        body: JSON.stringify(contactForm),
      }),
    onSuccess: () => {
      toast({ title: "Message received", description: "We'll be in touch within 1 business day." });
      setShowContact(false);
    },
    onError: (err: Error) => toast({ title: "Failed to send", description: err.message, variant: "destructive" }),
  });

  async function handleUpgrade(planId: string) {
    if (planId === "enterprise") { setShowContact(true); return; }
    try {
      const data = await apiFetch<{ hosted_url: string }>("/billing/checkout", {
        method: "POST",
        body: JSON.stringify({ plan: planId, billing_period: "monthly" }),
      });
      window.location.href = data.hosted_url;
    } catch (err) {
      toast({ title: "Checkout failed", description: String(err), variant: "destructive" });
    }
  }

  if (isLoading) {
    return (
      <div className="p-8 text-center text-zinc-500">Loading billing information…</div>
    );
  }

  const plan = billing?.plan ?? "free";
  const status = billing?.status ?? "active";
  const isGrandfathered = status === "grandfathered" || billing?.is_super_admin;

  return (
    <div className="max-w-3xl mx-auto py-8 px-4 space-y-6">
      <h1 className="text-2xl font-semibold text-white">Billing & Plan</h1>

      {/* Current plan card */}
      <Card className="bg-zinc-900 border-zinc-800 text-white">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base font-medium text-zinc-300">
            <CreditCard className="h-4 w-4" /> Current plan
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {PLAN_ICONS[plan]}
              <div>
                <p className="font-semibold text-lg capitalize">{plan}</p>
                <p className="text-sm text-zinc-500">
                  {isGrandfathered
                    ? "Grandfathered — unlimited access"
                    : status === "beta_trial"
                    ? `Trial · expires ${billing?.current_period_end ? format(new Date(billing.current_period_end), "PPP") : "—"}`
                    : billing?.current_period_end
                    ? `Renews ${format(new Date(billing.current_period_end), "PPP")}`
                    : plan === "free"
                    ? "Free forever"
                    : "Active"}
                </p>
              </div>
            </div>
            <Badge
              variant="outline"
              className={cn(
                "capitalize",
                status === "active" || status === "grandfathered" || status === "beta_trial"
                  ? "text-emerald-400 border-emerald-800"
                  : "text-zinc-500 border-zinc-700",
              )}
            >
              {isGrandfathered ? "Grandfathered" : status.replace("_", " ")}
            </Badge>
          </div>

          {/* Upgrade / cancel actions */}
          {!isGrandfathered && (
            <div className="flex gap-2 pt-2">
              {plan !== "enterprise" && (
                <Button
                  size="sm"
                  className="bg-white text-black hover:bg-zinc-200 gap-1"
                  onClick={() => navigate("/pricing")}
                >
                  <ArrowRight className="h-3.5 w-3.5" /> View plans
                </Button>
              )}
              {plan !== "free" && status === "active" && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-zinc-500 hover:text-red-400"
                  onClick={() => cancelMutation.mutate()}
                  disabled={cancelMutation.isPending}
                >
                  Cancel subscription
                </Button>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Enterprise contact form */}
      {showContact && (
        <Card className="bg-zinc-900 border-zinc-800 text-white">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base font-medium text-zinc-300">
              <Mail className="h-4 w-4" /> Enterprise inquiry
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label className="text-zinc-400 text-sm">Company</Label>
                <Input
                  value={contactForm.company}
                  onChange={(e) => setContactForm((f) => ({ ...f, company: e.target.value }))}
                  className="bg-zinc-950 border-zinc-700 text-white"
                  placeholder="Acme CPA LLC"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-zinc-400 text-sm">Team size</Label>
                <Input
                  value={contactForm.team_size}
                  onChange={(e) => setContactForm((f) => ({ ...f, team_size: e.target.value }))}
                  className="bg-zinc-950 border-zinc-700 text-white"
                  placeholder="e.g. 15 people"
                />
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-zinc-400 text-sm">What are you looking for?</Label>
              <Textarea
                value={contactForm.message}
                onChange={(e) => setContactForm((f) => ({ ...f, message: e.target.value }))}
                className="bg-zinc-950 border-zinc-700 text-white min-h-[100px]"
                placeholder="Tell us about your firm and what you need…"
              />
            </div>
            <div className="flex gap-2">
              <Button
                size="sm"
                className="bg-white text-black hover:bg-zinc-200"
                onClick={() => contactMutation.mutate()}
                disabled={contactMutation.isPending || !contactForm.message}
              >
                Send inquiry
              </Button>
              <Button size="sm" variant="ghost" className="text-zinc-500" onClick={() => setShowContact(false)}>
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Payment history */}
      {(billing?.payments?.length ?? 0) > 0 && (
        <Card className="bg-zinc-900 border-zinc-800 text-white">
          <CardHeader>
            <CardTitle className="text-base font-medium text-zinc-300">Payment history</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {billing!.payments.map((p) => {
              const st = PAYMENT_STATUS_BADGE[p.status] ?? { label: p.status, className: "text-zinc-400 border-zinc-700" };
              return (
                <div key={p.id} className="flex items-center justify-between text-sm py-2 border-b border-zinc-800 last:border-0">
                  <div>
                    <p className="text-zinc-200 capitalize">{p.plan} · {p.billing_period}</p>
                    <p className="text-zinc-600 text-xs">{format(new Date(p.created_at), "PPP")}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-zinc-200">{p.amount_usdc} USDC</p>
                    <Badge variant="outline" className={cn("text-xs mt-0.5", st.className)}>{st.label}</Badge>
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
