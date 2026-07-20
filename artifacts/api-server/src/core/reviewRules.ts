/**
 * Domain rules shared across routes and adapters — no DB dependencies.
 *
 * Extracted from routes/positions.ts so that:
 *  - core/createPosition.ts can import without a circular dependency on a route file
 *  - Tests can exercise these rules without mocking the DB or Express router
 */

export const STALE_THRESHOLD_DAYS = 180;

/**
 * Canonical set of event types that always force preparer review.
 *
 * Two different reasons land a type here:
 *  - IRS guidance is genuinely pending (six Notice 2024-57 categories) — these
 *    also appear in /export/comment-letter as evidence for IRS rulemaking.
 *  - Classification requires facts a single event cannot establish alone
 *    (aave_withdraw, aave_liquidation — need lot-matching / basis comparison).
 *    These force review for data reasons, not regulatory ones, and deliberately
 *    do NOT appear in comment-letter (which is specifically about IRS guidance
 *    gaps, not fact-pattern gaps).
 */
export const OPEN_GAP_EVENT_TYPES = new Set([
  "lp_deposit",
  "lp_withdrawal",
  "defi_yield",
  "bridge_transfer",
  "staking_reward",
  "nft_sale",
  "aave_withdraw",
  "aave_liquidation",
]);

/**
 * Computes the effective requires_review flag for a new position.
 * Rules (in priority order):
 *  1. Open-gap event type → always true, non-overridable.
 *  2. No citations linked → true (a position without authority cannot be auto-applied).
 *  3. Otherwise → honour the caller's value (default false).
 */
export function computeRequiresReview(
  eventType: string,
  citationIds: string[] | undefined,
  callerValue: boolean | undefined | null,
): boolean {
  if (OPEN_GAP_EVENT_TYPES.has(eventType)) return true;
  if (!citationIds || citationIds.length === 0) return true;
  return callerValue ?? false;
}

/**
 * Returns true if a position is stale: Reasonable Basis tier, not superseded,
 * and older than STALE_THRESHOLD_DAYS. Used by both the review queue and
 * export routes to surface positions that need renewed authority review.
 */
export function isStale(p: {
  tier: string;
  supersededBy: string | null | undefined;
  createdAt: Date;
}): boolean {
  if (p.tier !== "reasonable_basis") return false;
  if (p.supersededBy) return false;
  return Date.now() - p.createdAt.getTime() > STALE_THRESHOLD_DAYS * 86400000;
}
