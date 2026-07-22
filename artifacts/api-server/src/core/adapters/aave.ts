import { createPublicClient, http, parseAbiItem, decodeEventLog, type Log, type Chain } from "viem";
import { mainnet, arbitrum, base, optimism, polygon } from "viem/chains";
import type { RawTransaction } from "@workspace/db";
import { BaseProtocolAdapter, type ParsedEvent } from "./base.js";

// Fixed UUIDs from lib/db/src/seed-citations.ts — keep in sync with that file.
const CITATIONS = {
  NOTICE_2014_21: "aa000001-0000-0000-0000-000000000006",
  NOTICE_2024_57: "aa000001-0000-0000-0000-000000000002",
  IRC_1001: "aa000001-0000-0000-0000-000000000009",
  IRC_165: "aa000001-0000-0000-0000-000000000010",
  COTTAGE_SAVINGS: "aa000001-0000-0000-0000-000000000003",
} as const;

const AAVE_V3_POOL_ABI = [
  parseAbiItem(
    "event Supply(address indexed reserve, address user, address indexed onBehalfOf, uint256 amount, uint16 indexed referralCode)",
  ),
  parseAbiItem(
    "event Borrow(address indexed reserve, address user, address indexed onBehalfOf, uint256 amount, uint8 interestRateMode, uint256 borrowRate, uint16 indexed referralCode)",
  ),
  parseAbiItem(
    "event Repay(address indexed reserve, address indexed user, address indexed repayer, uint256 amount, bool useATokens)",
  ),
  parseAbiItem(
    "event Withdraw(address indexed reserve, address indexed user, address indexed to, uint256 amount)",
  ),
  parseAbiItem(
    "event LiquidationCall(address indexed collateralAsset, address indexed debtAsset, address indexed user, uint256 debtToCover, uint256 liquidatedCollateralAmount, address liquidator, bool receiveAToken)",
  ),
] as const;

const VIEM_CHAINS: Record<string, Chain> = {
  ethereum: mainnet,
  arbitrum,
  base,
  optimism,
  polygon,
};

export class AaveAdapter extends BaseProtocolAdapter {
  async parse(tx: RawTransaction): Promise<ParsedEvent[]> {
    // Fast path: use rawData if the caller already decoded the event.
    const pre = this.extractRawEvent(tx);
    if (pre) return this.classify(pre);

    // Slow path: fetch the on-chain receipt and decode logs.
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
   * Tries each ABI item against the log. Returns the first match — Aave emits
   * at most one event type per log entry, so the first successful decode wins.
   */
  private decodeLog(
    log: Log,
  ): { name: string; args: Record<string, unknown> } | null {
    for (const abiItem of AAVE_V3_POOL_ABI) {
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
        // topic0 didn't match this ABI item — try the next one.
        continue;
      }
    }
    return null;
  }

  private classify(
    event: { name: string; args: Record<string, unknown> },
  ): ParsedEvent[] {
    switch (event.name) {
      case "Supply":
        return [
          {
            eventType: "aave_deposit",
            classification: "non_taxable_collateral_transfer",
            tier: "substantial_authority",
            rationale:
              "Posting an asset as loan collateral does not change beneficial ownership and is not a sale or exchange under IRC §1001 — the depositor retains the right to withdraw the same asset and no materially different property is received in exchange (Cottage Savings, 499 U.S. 554).",
            citationIds: [CITATIONS.IRC_1001, CITATIONS.COTTAGE_SAVINGS, CITATIONS.NOTICE_2014_21],
          },
        ];

      case "Borrow":
        return [
          {
            eventType: "aave_borrow",
            classification: "non_taxable_loan",
            tier: "substantial_authority",
            rationale:
              "Loan proceeds are not income and borrowing against collateral is not a disposition of the collateral under IRC §1001 — the borrower incurs a liability but receives no permanently enriching transfer.",
            citationIds: [CITATIONS.IRC_1001, CITATIONS.NOTICE_2014_21],
          },
        ];

      case "Repay":
        return [
          {
            eventType: "aave_repay",
            classification: "loan_repayment",
            tier: "substantial_authority",
            rationale:
              "Repayment of loan principal extinguishes a liability rather than disposing of property at a gain or loss. No realization event under IRC §1001.",
            citationIds: [CITATIONS.IRC_1001],
          },
        ];

      case "Withdraw":
        // Whether this realizes gain/loss depends on comparing the withdrawn
        // amount against the specific deposit lot it closes out (aTokens can
        // rebase). A single event can't resolve that without lot-matching.
        // aave_withdraw is in OPEN_GAP_EVENT_TYPES so review is forced structurally.
        return [
          {
            eventType: "aave_withdraw",
            classification: "disposition_pending_lot_match",
            tier: "reasonable_basis",
            rationale:
              "Withdrawal of previously-deposited collateral realizes gain or loss under IRC §1001 only to the extent the withdrawn amount differs from the original deposit lot (aToken interest accrual is common). Requires matching against the specific deposit lot; not determinable from this event alone.",
            citationIds: [CITATIONS.IRC_1001, CITATIONS.COTTAGE_SAVINGS],
          },
        ];

      case "LiquidationCall":
        // Forced sale of collateral at FMV — realizes gain or loss vs basis.
        // §165 only applies if the result is negative. aave_liquidation is in
        // OPEN_GAP_EVENT_TYPES so review is forced structurally.
        return [
          {
            eventType: "aave_liquidation",
            classification: "disposition_pending_basis_comparison",
            tier: "reasonable_basis",
            rationale:
              "Forced liquidation of collateral is a disposition at fair market value under IRC §1001; whether it produces a gain or a deductible §165 loss depends on FMV at liquidation versus adjusted basis, which this event does not by itself establish.",
            citationIds: [CITATIONS.IRC_1001, CITATIONS.IRC_165],
          },
        ];

      default:
        return [];
    }
  }
}
