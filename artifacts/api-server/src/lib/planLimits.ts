export type PlanName = "free" | "pro" | "firm" | "enterprise";
export type BillingPeriod = "monthly" | "annual" | "lifetime";

/** Ordinal ranking — higher number = higher tier. */
export const PLAN_RANK: Record<PlanName, number> = {
  free: 0,
  pro: 1,
  firm: 2,
  enterprise: 3,
};

export function planRank(plan: string): number {
  return PLAN_RANK[plan as PlanName] ?? 0;
}

export function meetsRequirement(current: string, required: PlanName): boolean {
  return planRank(current) >= planRank(required);
}

export const PLAN_LIMITS = {
  free: {
    maxTransactions: 100,
    maxWallets: 1,
    maxTaxYears: 1,
    multiClient: false,
    exports: false,
    taxOptimizer: false,
    exchangeSync: false,
  },
  pro: {
    maxTransactions: null,   // unlimited
    maxWallets: null,
    maxTaxYears: null,
    multiClient: false,
    exports: true,
    taxOptimizer: true,
    exchangeSync: true,
  },
  firm: {
    maxTransactions: null,
    maxWallets: null,
    maxTaxYears: null,
    multiClient: true,
    exports: true,
    taxOptimizer: true,
    exchangeSync: true,
  },
  enterprise: {
    maxTransactions: null,
    maxWallets: null,
    maxTaxYears: null,
    multiClient: true,
    exports: true,
    taxOptimizer: true,
    exchangeSync: true,
  },
} as const satisfies Record<PlanName, object>;

/** USDC prices — kept in sync with the Pricing page. */
export const PLAN_PRICES: Record<string, Record<BillingPeriod, string | null>> = {
  pro: { monthly: "49.00", annual: "399.00", lifetime: null },
  firm: { monthly: "149.00", annual: "1299.00", lifetime: null },
  enterprise: { monthly: null, annual: null, lifetime: null },
};

/** Days to add to currentPeriodEnd on payment confirmation. */
export const PERIOD_DAYS: Record<string, number> = {
  monthly: 30,
  annual: 365,
};

/**
 * Number of soft-prompt 402s allowed before upgrading to a hard block.
 * 0 and 1 → soft (dismissible); 2+ → hard.
 */
export const SOFT_LIMIT_MAX = 2;

/** Super-admin email — always granted enterprise access, never limited. */
export const SUPER_ADMIN_EMAIL = "jacquedegraff81@gmail.com";
