/**
 * Tier ceiling computation — shared between the tier-suggestion read endpoint
 * and all write routes that must enforce the ceiling at mutation time.
 *
 * TIER_ORDER is sorted highest-confidence → lowest-confidence.
 * A lower index means a MORE optimistic (stronger) tier.
 */

import { inArray } from "drizzle-orm";
import { db, authorityCitationsTable } from "@workspace/db";

export const TIER_ORDER = [
  "will",
  "should",
  "more_likely_than_not",
  "substantial_authority",
  "reasonable_basis",
] as const;

export type Tier = (typeof TIER_ORDER)[number];

/** Returns the index of a tier in TIER_ORDER, or -1 if unknown. */
export function tierIndex(tier: string): number {
  return TIER_ORDER.indexOf(tier as Tier);
}

/**
 * Computes the maximum defensible tier given a set of citation IDs.
 * Fetches authority strengths from the DB.
 */
export async function computeTierCeiling(citationIds: string[]): Promise<Tier> {
  if (citationIds.length === 0) return "reasonable_basis";

  const rows = await db
    .select({ authorityStrength: authorityCitationsTable.authorityStrength })
    .from(authorityCitationsTable)
    .where(inArray(authorityCitationsTable.id, citationIds));

  const bindingOnCourts = rows.filter(
    (c) => c.authorityStrength === "binding_on_courts",
  ).length;
  const bindingOnIrs = rows.filter(
    (c) => c.authorityStrength === "binding_on_irs_only",
  ).length;
  const nonBinding = rows.filter(
    (c) => c.authorityStrength === "non_binding_persuasive",
  ).length;

  if (bindingOnCourts >= 2) return "will";
  if (bindingOnCourts === 1) return "should";
  if (bindingOnIrs >= 1) return "more_likely_than_not";
  if (nonBinding > 0) return "substantial_authority";
  return "reasonable_basis";
}

/**
 * Returns true when the requested tier is MORE optimistic than the ceiling
 * allows (i.e., its index is strictly lower than the ceiling's index).
 */
export function exceedsCeiling(
  requestedTier: string,
  ceilingTier: Tier,
): boolean {
  const reqIdx = tierIndex(requestedTier);
  const ceilIdx = tierIndex(ceilingTier);
  return reqIdx !== -1 && reqIdx < ceilIdx;
}
