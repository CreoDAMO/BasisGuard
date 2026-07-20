/**
 * Wash-sale candidate detection for tax-loss harvesting.
 *
 * IRC §1091 wash-sale rules apply to stocks and securities; the IRS has not
 * officially extended them to cryptocurrency (crypto is property, not a
 * "security" under §1091). Many practitioners apply them conservatively
 * pending guidance. This module flags potential wash-sale situations — it does
 * NOT make a legal determination that §1091 applies.
 *
 * Algorithm: among taxable_disposition positions for the same wallet, any two
 * of the same event_type within ±30 days where at least one side has
 * amount_usd < 0 (or unknown) are flagged as a potential wash-sale pair.
 */

export const WASH_SALE_WINDOW_DAYS = 30;

export interface HarvestPosition {
  id: string;
  walletId: string | null | undefined;
  eventType: string;
  txDate: Date | null | undefined;
  amountUsd: number | null | undefined;
  classification: string;
  tier: string;
  requiresReview: boolean;
  reviewerSignoffAt: Date | null | undefined;
}

export interface WashSalePair {
  lossPositionId: string;
  gainPositionId: string;
  daysBetween: number;
}

export interface HarvestCandidate {
  position: HarvestPosition;
  washSaleRisk: boolean;
  washSalePairs: WashSalePair[];
}

/** Absolute day-difference between two dates (fractional). */
export function daysBetweenDates(a: Date, b: Date): number {
  return Math.abs(a.getTime() - b.getTime()) / (1000 * 60 * 60 * 24);
}

/**
 * Detects potential wash-sale pairs among a set of positions.
 *
 * Two positions are a pair when:
 *  - Same wallet_id (null wallets are never paired)
 *  - Same event_type
 *  - Both have txDate set
 *  - Within WASH_SALE_WINDOW_DAYS of each other
 *  - At least one has amount_usd < 0 or unknown (potential loss)
 */
export function detectWashSalePairs(positions: HarvestPosition[]): WashSalePair[] {
  const pairs: WashSalePair[] = [];
  // Only positions with a txDate and a non-null wallet can form pairs
  const dated = positions.filter((p) => p.txDate != null && p.walletId != null);

  for (let i = 0; i < dated.length; i++) {
    for (let j = i + 1; j < dated.length; j++) {
      const a = dated[i];
      const b = dated[j];

      if (a.walletId !== b.walletId) continue;
      if (a.eventType !== b.eventType) continue;

      // At least one side must be a potential loss (negative or unknown amount)
      const aLoss = a.amountUsd == null || a.amountUsd < 0;
      const bLoss = b.amountUsd == null || b.amountUsd < 0;
      if (!aLoss && !bLoss) continue;

      const days = daysBetweenDates(a.txDate!, b.txDate!);
      if (days > WASH_SALE_WINDOW_DAYS) continue;

      // Put the lower/null amount_usd as the loss side
      const aIsLoss =
        a.amountUsd == null
          ? true
          : b.amountUsd == null
          ? false
          : a.amountUsd <= b.amountUsd;

      pairs.push({
        lossPositionId: aIsLoss ? a.id : b.id,
        gainPositionId: aIsLoss ? b.id : a.id,
        daysBetween: Math.round(days),
      });
    }
  }

  return pairs;
}

/**
 * Annotates every position with its wash-sale risk status and any paired
 * positions, then returns the full candidate list sorted by amount_usd
 * ascending (most negative / worst losses first; unknown amounts last).
 */
export function buildHarvestCandidates(positions: HarvestPosition[]): HarvestCandidate[] {
  const pairs = detectWashSalePairs(positions);
  const pairsByPosition = new Map<string, WashSalePair[]>();

  for (const pair of pairs) {
    for (const id of [pair.lossPositionId, pair.gainPositionId]) {
      if (!pairsByPosition.has(id)) pairsByPosition.set(id, []);
      pairsByPosition.get(id)!.push(pair);
    }
  }

  const candidates: HarvestCandidate[] = positions.map((pos) => ({
    position: pos,
    washSaleRisk: pairsByPosition.has(pos.id),
    washSalePairs: pairsByPosition.get(pos.id) ?? [],
  }));

  // Sort: most negative amount_usd first (best harvesting candidates); null last
  return candidates.sort((a, b) => {
    const au = a.position.amountUsd;
    const bu = b.position.amountUsd;
    if (au == null && bu == null) return 0;
    if (au == null) return 1;
    if (bu == null) return -1;
    return au - bu;
  });
}
