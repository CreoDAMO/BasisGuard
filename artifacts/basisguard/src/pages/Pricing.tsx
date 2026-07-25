import React, { useState } from "react";
import { useLocation } from "wouter";
import { Check, Zap, Building2, ShieldCheck, Mail, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { useUser } from "@clerk/react";

const PLANS = [
  {
    id: "free",
    label: "Free",
    description: "Try the core value without friction.",
    monthlyPrice: 0,
    annualPrice: 0,
    icon: <ShieldCheck className="h-6 w-6 text-zinc-400" />,
    cta: "Get started",
    ctaVariant: "outline" as const,
    highlighted: false,
    features: [
      "Up to 100 transactions",
      "Basic Evidence Log preview",
      "1 wallet · 1 tax year",
      "IRS citation lookup",
    ],
    missing: ["Tax Optimizer", "Exchange sync", "Exports", "Review Queue"],
  },
  {
    id: "pro",
    label: "Pro",
    description: "Power users and solo CPAs.",
    monthlyPrice: 49,
    annualPrice: 399,
    icon: <Zap className="h-6 w-6 text-yellow-400" />,
    cta: "Upgrade to Pro",
    ctaVariant: "default" as const,
    highlighted: true,
    badge: "Most popular",
    features: [
      "Unlimited transactions",
      "Full Evidence Log + Review Queue",
      "Tax Optimizer (FIFO · LIFO · HIFO · Min-tax)",
      "Lot inventory & harvest scanner",
      "Exchange sync — Coinbase, Kraken, Gemini",
      "All exports (Form 8949, audit packages)",
      "Confidence tier enforcement (IRC §6694)",
    ],
    missing: [],
  },
  {
    id: "firm",
    label: "Firm",
    description: "Small CPA firms managing multiple clients.",
    monthlyPrice: 149,
    annualPrice: 1299,
    icon: <Building2 className="h-6 w-6 text-blue-400" />,
    cta: "Upgrade to Firm",
    ctaVariant: "default" as const,
    highlighted: false,
    features: [
      "Everything in Pro",
      "Multi-client workspaces",
      "Team roles & sign-off credentials",
      "Shared review queue",
      "White-label export option",
      "Priority support",
    ],
    missing: [],
  },
  {
    id: "enterprise",
    label: "Enterprise",
    description: "Larger firms, treasury teams, and institutions.",
    monthlyPrice: null,
    annualPrice: null,
    icon: <ShieldCheck className="h-6 w-6 text-purple-400" />,
    cta: "Contact sales",
    ctaVariant: "outline" as const,
    highlighted: false,
    priceLabel: "Custom",
    features: [
      "Everything in Firm",
      "SSO & dedicated instance",
      "Custom protocol adapters",
      "API access & SLA",
      "SOC 2 ready",
      "Dedicated onboarding",
    ],
    missing: [],
  },
] as const;

const ANNUAL_SAVINGS: Record<string, string> = {
  pro: "Save 32%",
  firm: "Save 27%",
};

export default function PricingPage() {
  const [annual, setAnnual] = useState(false);
  const [, navigate] = useLocation();
  const { isSignedIn } = useUser();

  async function handleSelect(planId: string) {
    if (planId === "enterprise") {
      navigate("/billing?contact=1");
      return;
    }
    if (planId === "free") {
      navigate(isSignedIn ? "/dashboard" : "/sign-up");
      return;
    }
    if (!isSignedIn) {
      navigate("/sign-up");
      return;
    }

    // Create Commerce charge and redirect to hosted checkout
    try {
      const res = await fetch(`${import.meta.env.BASE_URL}api/billing/checkout`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ plan: planId, billing_period: annual ? "annual" : "monthly" }),
      });
      if (!res.ok) throw new Error(await res.text());
      const data = (await res.json()) as { hosted_url: string };
      window.location.href = data.hosted_url;
    } catch (err) {
      console.error("Checkout failed", err);
    }
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      {/* Header */}
      <div className="text-center pt-20 pb-12 px-4">
        <Badge variant="outline" className="border-zinc-700 text-zinc-400 mb-4">
          USDC · Powered by Coinbase Commerce
        </Badge>
        <h1 className="text-4xl md:text-5xl font-semibold tracking-tight mb-4">
          Simple, transparent pricing
        </h1>
        <p className="text-zinc-400 text-lg max-w-xl mx-auto">
          Professional crypto tax compliance for individuals and firms.
          Pay with USDC — native to the assets you work with.
        </p>

        {/* Annual toggle */}
        <div className="flex items-center justify-center gap-3 mt-8">
          <Label htmlFor="annual-toggle" className="text-zinc-400">Monthly</Label>
          <Switch
            id="annual-toggle"
            checked={annual}
            onCheckedChange={setAnnual}
            className="data-[state=checked]:bg-white"
          />
          <Label htmlFor="annual-toggle" className="text-zinc-300">
            Annual
            <span className="ml-2 text-xs text-emerald-400 font-medium">Save up to 32%</span>
          </Label>
        </div>
      </div>

      {/* Plan cards */}
      <div className="max-w-6xl mx-auto px-4 pb-24 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {PLANS.map((plan) => {
          const price = annual ? plan.annualPrice : plan.monthlyPrice;
          const savings = annual ? ANNUAL_SAVINGS[plan.id] : null;

          return (
            <div
              key={plan.id}
              className={cn(
                "relative rounded-xl border p-6 flex flex-col gap-5 transition-shadow",
                plan.highlighted
                  ? "border-white/20 bg-white/5 shadow-[0_0_40px_-10px_rgba(255,255,255,0.1)]"
                  : "border-zinc-800 bg-zinc-900/50",
              )}
            >
              {plan.badge && (
                <Badge className="absolute -top-3 left-1/2 -translate-x-1/2 bg-white text-black text-xs">
                  {plan.badge}
                </Badge>
              )}

              {/* Plan name */}
              <div className="flex items-center gap-2">
                {plan.icon}
                <span className="font-semibold text-lg">{plan.label}</span>
              </div>

              {/* Price */}
              <div>
                {"priceLabel" in plan ? (
                  <span className="text-3xl font-bold">Custom</span>
                ) : price === 0 ? (
                  <span className="text-3xl font-bold">$0</span>
                ) : (
                  <div className="flex items-end gap-1">
                    <span className="text-3xl font-bold">${price}</span>
                    <span className="text-zinc-500 text-sm mb-1">
                      / {annual ? "yr" : "mo"}
                    </span>
                  </div>
                )}
                {savings && (
                  <span className="text-xs text-emerald-400 font-medium mt-0.5 block">{savings}</span>
                )}
                <p className="text-zinc-500 text-sm mt-1">{plan.description}</p>
              </div>

              {/* CTA */}
              <Button
                variant={plan.ctaVariant}
                className={cn(
                  "w-full gap-1",
                  plan.highlighted
                    ? "bg-white text-black hover:bg-zinc-200"
                    : plan.ctaVariant === "outline"
                    ? "border-zinc-700 text-zinc-300 hover:bg-zinc-800"
                    : "",
                )}
                onClick={() => handleSelect(plan.id)}
              >
                {plan.id === "enterprise" ? <Mail className="h-4 w-4" /> : <ArrowRight className="h-4 w-4" />}
                {plan.cta}
              </Button>

              {/* Features */}
              <div className="space-y-2 flex-1">
                {plan.features.map((f) => (
                  <div key={f} className="flex items-start gap-2 text-sm text-zinc-300">
                    <Check className="h-4 w-4 text-emerald-500 mt-0.5 shrink-0" />
                    {f}
                  </div>
                ))}
              </div>

              {/* USDC badge */}
              {plan.id !== "free" && plan.id !== "enterprise" && (
                <div className="pt-4 border-t border-zinc-800">
                  <p className="text-xs text-zinc-600 text-center">
                    Pay with USDC on Base, Ethereum, or Polygon
                  </p>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* FAQ strip */}
      <div className="border-t border-zinc-800 py-16 px-4">
        <div className="max-w-3xl mx-auto space-y-6 text-sm text-zinc-400">
          <p>
            <span className="text-white font-medium">What happens when my trial ends?</span>{" "}
            You're automatically moved to the Free tier. No charge, no disruption — your data stays intact.
          </p>
          <p>
            <span className="text-white font-medium">Can I cancel anytime?</span>{" "}
            Yes. Cancel from your billing settings and you keep access until the end of your paid period.
          </p>
          <p>
            <span className="text-white font-medium">Why USDC?</span>{" "}
            It's stable, instant, and native to the assets BasisGuard manages. No credit card fees, no FX conversion.
          </p>
          <p>
            <span className="text-white font-medium">What network?</span>{" "}
            Coinbase Commerce accepts USDC on Base, Ethereum, and Polygon — choose at checkout.
          </p>
        </div>
      </div>
    </div>
  );
}
