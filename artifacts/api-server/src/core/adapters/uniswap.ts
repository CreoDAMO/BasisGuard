import { createPublicClient, http, parseAbiItem, decodeEventLog, type Log, type Chain } from "viem";
import { mainnet, arbitrum, base, optimism, polygon } from "viem/chains";
import type { RawTransaction } from "@workspace/db";
import { BaseProtocolAdapter, type ParsedEvent } from "./base.js";

// Fixed UUIDs from lib/db/src/seed-citations.ts — keep in sync with that file.
const CITATIONS = {
  NOTICE_2014_21: "aa000001-0000-0000-0000-000000000006",
  REV_PROC_2024_28: "aa000001-0000-0000-0000-000000000004",
  IRC_1001: "aa000001-0000-0000-0000-000000000009",
  COTTAGE_SAVINGS: "aa000001-0000-0000-0000-000000000003",
} as const;

/**
 * Uniswap V3 Pool — Swap is the only event that needs classification.
 * The other V3 events (Mint, Burn, Collect, Flash) have different tax treatment
 * and belong to their own adapters; they're ignored here rather than mis-classified.
 */
const UNISWAP_V3_POOL_ABI = [
  parseAbiItem(
    "event Swap(address indexed sender, address indexed recipient, int256 amount0, int256 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick)",
  ),
] as const;

const VIEM_CHAINS: Record<string, Chain> = {
  ethereum: mainnet,
  arbitrum,
  base,
  optimism,
  polygon,
};

export class UniswapV3Adapter extends BaseProtocolAdapter {
  async parse(tx: RawTransaction): Promise<ParsedEvent[]> {
    // Fast path: use rawData if the caller already decoded the event.
    const pre = this.extractRawEvent(tx);
    if (pre) return this.classify(pre);

    // Slow path: fetch the on-chain receipt and decode any Swap logs.
    if (!tx.txHash) return [];

    const chainKey = (this.chain.slug ?? "ethereum") as string;
    const rpcUrl = (this.chain.metadata as { rpc_url?: string } | null)?.rpc_url;
    const client = createPublicClient({
      chain: VIEM_CHAINS[chainKey] ?? mainnet,
      transport: http(rpcUrl),
    });

    const receipt = await client.getTransactionReceipt({
      hash: tx.txHash as `0x${string}`,
    });

    const events: ParsedEvent[] = [];
    for (const log of receipt.logs) {
      const decoded = this.decodeLog(log);
      if (decoded) events.push(...this.classify(decoded));
    }
    return events;
  }

  /**
   * Decodes a single receipt log against the Uniswap V3 Pool ABI.
   * A transaction can route through multiple pools (multi-hop), so a single
   * tx receipt may contain several Swap logs — each is classified independently.
   */
  private decodeLog(
    log: Log,
  ): { name: string; args: Record<string, unknown> } | null {
    for (const abiItem of UNISWAP_V3_POOL_ABI) {
      try {
        const decoded = decodeEventLog({
          abi: [abiItem],
          data: log.data,
          topics: log.topics,
          strict: false,
        });
        return {
          name: decoded.eventName as string,
          args: decoded.args as Record<string, unknown>,
        };
      } catch {
        continue;
      }
    }
    return null;
  }

  private classify(
    event: { name: string; args: Record<string, unknown> },
  ): ParsedEvent[] {
    if (event.name !== "Swap") return [];

    return [
      {
        eventType: "crypto_swap",
        classification: "taxable_disposition",
        tier: "should",
        rationale:
          "Exchanging one digital asset for another through a Uniswap V3 pool is a sale or exchange of property under IRC §1001: the two tokens are materially different property interests (Cottage Savings Ass'n, 499 U.S. 554). Gain or loss equals the FMV of the token received minus the adjusted basis of the token disposed of, per Notice 2014-21 (crypto treated as property) and Rev. Proc. 2024-28 (basis allocation). Cost basis method (FIFO / specific ID) must be applied consistently per Rev. Proc. 2024-28.",
        citationIds: [
          CITATIONS.IRC_1001,
          CITATIONS.COTTAGE_SAVINGS,
          CITATIONS.NOTICE_2014_21,
          CITATIONS.REV_PROC_2024_28,
        ],
      },
    ];
  }
}
