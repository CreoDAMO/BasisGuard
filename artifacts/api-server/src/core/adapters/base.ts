import type { RawTransaction, Chain } from "@workspace/db";

/**
 * One adapter per protocol. parse() reads a single raw_transactions row
 * (already chain/protocol-validated by the ingest route) and returns zero
 * or more Position Records worth of classification data — it does not
 * insert anything itself; callers pass results to createPositionFromClassification.
 *
 * Adapters may classify from tx.rawData (fast, no RPC) or fetch the
 * on-chain receipt from tx.txHash (slow, needs chain RPC). Prefer rawData
 * when the ingestion caller already decoded the event.
 */
export abstract class BaseProtocolAdapter {
  constructor(protected chain: Chain) {}

  abstract parse(tx: RawTransaction): Promise<ParsedEvent[]>;

  /**
   * Extracts a pre-decoded event from rawData when the ingestion caller
   * already decoded it — skips the RPC round-trip.
   * Callers should store rawData as { event_name: string, args: Record<string, unknown> }.
   */
  protected extractRawEvent(
    tx: RawTransaction,
  ): { name: string; args: Record<string, unknown> } | null {
    const raw = tx.rawData as { event_name?: string; args?: Record<string, unknown> } | null;
    if (raw?.event_name) {
      return { name: raw.event_name, args: raw.args ?? {} };
    }
    return null;
  }
}

export interface ParsedEvent {
  eventType: string;
  classification: string;
  tier: "will" | "should" | "more_likely_than_not" | "substantial_authority" | "reasonable_basis";
  rationale: string;
  citationIds: string[];
  /** Consulted only when the event type isn't structurally open-gap and citations exist. */
  requiresReviewOverride?: boolean;
}
