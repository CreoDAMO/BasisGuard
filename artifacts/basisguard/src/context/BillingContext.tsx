/**
 * BillingContext — global upgrade-prompt state.
 *
 * Any component can call useBilling().showUpgradePrompt(plan) to trigger the
 * upgrade modal. The customFetch layer dispatches a "billing:limit_hit" DOM
 * event on 402 responses so the modal fires without needing per-call handling.
 */
import React, { createContext, useContext, useState, useEffect, useCallback } from "react";

export type PlanName = "free" | "pro" | "firm" | "enterprise";

interface UpgradePromptState {
  open: boolean;
  requiredPlan: PlanName;
  soft: boolean;
  promptCount: number;
}

interface BillingContextValue {
  showUpgradePrompt: (plan: PlanName, soft?: boolean, promptCount?: number) => void;
  dismissUpgradePrompt: () => void;
  promptState: UpgradePromptState;
}

const BillingContext = createContext<BillingContextValue | null>(null);

export function BillingProvider({ children }: { children: React.ReactNode }) {
  const [promptState, setPromptState] = useState<UpgradePromptState>({
    open: false,
    requiredPlan: "pro",
    soft: true,
    promptCount: 0,
  });

  const showUpgradePrompt = useCallback(
    (plan: PlanName, soft = true, promptCount = 1) => {
      setPromptState({ open: true, requiredPlan: plan, soft, promptCount });
    },
    [],
  );

  const dismissUpgradePrompt = useCallback(() => {
    setPromptState((s) => ({ ...s, open: false }));
  }, []);

  // Listen to the custom event dispatched by the API client on 402 responses
  useEffect(() => {
    function handler(e: Event) {
      const detail = (e as CustomEvent<{ required_plan: PlanName; soft: boolean; prompt_count: number }>).detail;
      showUpgradePrompt(detail.required_plan, detail.soft, detail.prompt_count);
    }
    window.addEventListener("billing:limit_hit", handler);
    return () => window.removeEventListener("billing:limit_hit", handler);
  }, [showUpgradePrompt]);

  return (
    <BillingContext.Provider value={{ showUpgradePrompt, dismissUpgradePrompt, promptState }}>
      {children}
    </BillingContext.Provider>
  );
}

export function useBilling(): BillingContextValue {
  const ctx = useContext(BillingContext);
  if (!ctx) throw new Error("useBilling must be used inside BillingProvider");
  return ctx;
}
