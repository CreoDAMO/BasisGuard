import { useBilling, type PlanName } from "@/context/BillingContext";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Check, Zap, Building2, ArrowRight } from "lucide-react";
import { useLocation } from "wouter";

const PLAN_DETAILS: Record<PlanName, { label: string; price: string; features: string[]; icon: React.ReactNode }> = {
  free: {
    label: "Free",
    price: "$0",
    features: ["100 transactions", "1 wallet", "1 tax year", "Evidence Log preview"],
    icon: null,
  },
  pro: {
    label: "Pro",
    price: "$49 / mo",
    features: [
      "Unlimited transactions",
      "Full Evidence Log + Review Queue",
      "Tax Optimizer (FIFO, LIFO, HIFO, harvest)",
      "Exchange sync (Coinbase, Kraken, Gemini)",
      "All exports (Form 8949, audit packages)",
    ],
    icon: <Zap className="h-5 w-5 text-yellow-400" />,
  },
  firm: {
    label: "Firm",
    price: "$149 / mo",
    features: [
      "Everything in Pro",
      "Multi-client workspaces",
      "Team roles & sign-off credentials",
      "Shared review queue",
      "White-label exports",
      "Priority support",
    ],
    icon: <Building2 className="h-5 w-5 text-blue-400" />,
  },
  enterprise: {
    label: "Enterprise",
    price: "Custom",
    features: [
      "Everything in Firm",
      "SSO & dedicated instance",
      "Custom protocol adapters",
      "API access & SLA",
      "SOC 2 ready",
    ],
    icon: <Building2 className="h-5 w-5 text-purple-400" />,
  },
};

export function UpgradeModal() {
  const { promptState, dismissUpgradePrompt } = useBilling();
  const [, navigate] = useLocation();

  const { open, requiredPlan, soft, promptCount } = promptState;
  const plan = PLAN_DETAILS[requiredPlan];

  function handleUpgrade() {
    dismissUpgradePrompt();
    navigate("/pricing");
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && dismissUpgradePrompt()}>
      <DialogContent className="bg-zinc-950 border-zinc-800 text-white max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-2 mb-1">
            {plan.icon}
            <Badge variant="outline" className="border-zinc-700 text-zinc-300 text-xs">
              {requiredPlan.toUpperCase()} REQUIRED
            </Badge>
          </div>
          <DialogTitle className="text-xl font-semibold">
            {soft ? "You've reached your plan limit" : "Feature not available on your plan"}
          </DialogTitle>
          <DialogDescription className="text-zinc-400">
            {soft
              ? `This feature requires BasisGuard ${plan.label}. You have ${2 - promptCount + 1} free access${2 - promptCount + 1 === 1 ? "" : "es"} remaining before access is restricted.`
              : `Upgrade to BasisGuard ${plan.label} to unlock this feature.`}
          </DialogDescription>
        </DialogHeader>

        {/* Feature highlights */}
        <div className="my-4 space-y-2">
          {plan.features.map((f) => (
            <div key={f} className="flex items-start gap-2 text-sm text-zinc-300">
              <Check className="h-4 w-4 text-emerald-500 mt-0.5 shrink-0" />
              {f}
            </div>
          ))}
        </div>

        <div className="flex items-center justify-between pt-2 border-t border-zinc-800">
          <span className="text-zinc-400 text-sm">Starting at <span className="text-white font-semibold">{plan.price}</span></span>
          <div className="flex gap-2">
            {soft && (
              <Button
                variant="ghost"
                size="sm"
                className="text-zinc-500 hover:text-zinc-300"
                onClick={dismissUpgradePrompt}
              >
                Maybe later
              </Button>
            )}
            <Button
              size="sm"
              className="bg-white text-black hover:bg-zinc-200 gap-1"
              onClick={handleUpgrade}
            >
              View plans <ArrowRight className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
