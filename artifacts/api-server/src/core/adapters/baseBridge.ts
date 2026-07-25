import { decodeEventLog, parseAbiItem } from "viem";
import { createPublicClient, http } from "viem";
import { base } from "viem/chains";
import type { RawTransaction } from "@workspace/db";
import { BaseProtocolAdapter, type ParsedEvent } from "./base.js";

// L2StandardBridge is an OP Stack predeploy — same fixed address on every
// OP Stack L2 (Base, Optimism, etc.), confirmed against the ethereum-optimism/specs
// repo. Only the L2 side is needed: both deposit-finalization (arriving from L1)
// and withdrawal-initiation (leaving to L1) are observable here, on Base itself,
// without needing a separate L1 contract address at all.
const L2_STANDARD_BRIDGE = "0x4200000000000000000000000000000000000010";

const BRIDGE_ABI = [
  parseAbiItem("event ETHBridgeInitiated(address indexed from, address indexed to, uint256 amount, bytes extraData)"),
  parseAbiItem("event ETHBridgeFinalized(address indexed from, address indexed to, uint256 amount, bytes extraData)"),
  parseAbiItem(
    "event ERC20BridgeInitiated(address indexed localToken, address indexed remoteToken, address indexed from, address to, uint256 amount, bytes extraData)",
  ),
  parseAbiItem(
    "event ERC20BridgeFinalized(address indexed localToken, address indexed remoteToken, address indexed from, address to, uint256 amount, bytes extraData)",
  ),
] as const;

// Matches the exact tier/citations/rationale the tier-suggestion engine already
// offers for "bridge_transfer" in routes/intelligence.ts — the adapter should
// suggest the same position a human would already see recommended, not a
// different one, whether the record starts from a manual entry or a real
// on-chain event.
const BRIDGE_RATIONALE =
  "Bridge transfers and wrapped token transactions are identified as open-gap areas in Notice 2024-57. IRS has not issued definitive guidance on whether a bridge transfer or wrapping event constitutes a realization event. The most defensible position is non-recognition treatment on the basis that the taxpayer retains beneficial ownership throughout, with a basis carryover. Form 8275 disclosure is recommended pending further guidance.";
const CIT = {
  NOTICE_2024_57: "aa000001-0000-0000-0000-000000000002",
  NOTICE_2014_21: "aa000001-0000-0000-0000-000000000006",
};

export class BaseBridgeAdapter extends BaseProtocolAdapter {
  async parse(tx: RawTransaction): Promise<ParsedEvent[]> {
    const fast = this.extractRawEvent(tx);
    if (fast) {
      const parsed = this.classify(fast.name, fast.args);
      return parsed ? [parsed] : [];
    }

    if (!tx.txHash) return [];

    const rpcUrl = (this.chain.metadata as { rpc_url?: string } | null)?.rpc_url;
    const client = createPublicClient({ chain: base, transport: http(rpcUrl) });
    const receipt = await client.getTransactionReceipt({ txHash: tx.txHash as `0x${string}` });

    const events: ParsedEvent[] = [];
    for (const log of receipt.logs) {
      if (log.address.toLowerCase() !== L2_STANDARD_BRIDGE.toLowerCase()) continue;
      try {
        const decoded = decodeEventLog({ abi: BRIDGE_ABI, data: log.data, topics: log.topics, strict: false });
        if (!decoded.eventName) continue;
        const parsed = this.classify(decoded.eventName, decoded.args as unknown as Record<string, unknown>);
        if (parsed) events.push(parsed);
      } catch {
        continue; // Log wasn't a bridge event — not every log in the receipt is ours to decode.
      }
    }
    return events;
  }

  private classify(eventName: string, _args: Record<string, unknown>): ParsedEvent | null {
    switch (eventName) {
      case "ETHBridgeFinalized":
      case "ERC20BridgeFinalized":
        // Deposit arriving on Base from L1 — the completion of an inbound bridge.
        return {
          eventType: "bridge_transfer",
          classification: "non_taxable_transfer_pending_review",
          tier: "reasonable_basis",
          rationale: BRIDGE_RATIONALE,
          citationIds: [CIT.NOTICE_2024_57, CIT.NOTICE_2014_21],
        };

      case "ETHBridgeInitiated":
      case "ERC20BridgeInitiated":
        // Withdrawal leaving Base for L1 — initiation only; the corresponding
        // L1 finalization happens after the challenge period and is a
        // separate transaction this adapter does not see.
        return {
          eventType: "bridge_transfer",
          classification: "non_taxable_transfer_pending_review",
          tier: "reasonable_basis",
          rationale: BRIDGE_RATIONALE,
          citationIds: [CIT.NOTICE_2024_57, CIT.NOTICE_2014_21],
        };

      default:
        return null;
    }
  }
}
