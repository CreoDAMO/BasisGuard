/**
 * Intelligence routes — event-type suggestion engine and stale-position scanner.
 *
 * GET /intelligence/suggest?event_type=swap[&protocol=uniswap_v3][&chain=arbitrum]
 *   Returns suggested_tier, rationale_template, suggested_authority_ids, confidence_basis
 *
 * GET /intelligence/stale
 *   Returns all positions that are stale (reasonable_basis, >180 days, not superseded)
 */
import { Router, type IRouter } from "express";
import { eq, and, isNull, desc } from "drizzle-orm";
import { db, positionRecordsTable, authorityCitationsTable } from "@workspace/db";

const router: IRouter = Router();

const STALE_THRESHOLD_DAYS = 180;

// ── Known authority UUIDs (seeded by lib/db/src/seed-citations.ts) ────────────
const CIT = {
  REV_RUL_2023_14:  "aa000001-0000-0000-0000-000000000001",
  NOTICE_2024_57:   "aa000001-0000-0000-0000-000000000002",
  COTTAGE_SAVINGS:  "aa000001-0000-0000-0000-000000000003",
  REV_PROC_2024_28: "aa000001-0000-0000-0000-000000000004",
  REV_RUL_2019_24:  "aa000001-0000-0000-0000-000000000005",
  NOTICE_2014_21:   "aa000001-0000-0000-0000-000000000006",
} as const;

type Tier = "will" | "should" | "more_likely_than_not" | "substantial_authority" | "reasonable_basis";

interface SuggestionRule {
  tier: Tier;
  confidence_basis: string;
  rationale_template: string;
  authority_ids: string[];
}

// ── Keyword → rule mapping ────────────────────────────────────────────────────
// Ordered by specificity — first match wins.
const RULES: Array<{ patterns: string[]; rule: SuggestionRule }> = [
  {
    patterns: ["nft_sale", "nft_mint", "nft_transfer", "erc721", "erc1155"],
    rule: {
      tier: "will",
      confidence_basis: "Court-binding authority (Cottage Savings) + crypto-as-property doctrine",
      rationale_template:
        "The sale or exchange of an NFT constitutes a realization event under IRC §1001, supported by Cottage Savings Ass'n v. Commissioner, 499 U.S. 554 (1991). Each NFT is a materially different property interest; disposition triggers gain or loss equal to the difference between the amount realized and the adjusted basis. Basis is determined per Rev. Proc. 2024-28 using the taxpayer's elected method.",
      authority_ids: [CIT.COTTAGE_SAVINGS, CIT.NOTICE_2014_21, CIT.REV_PROC_2024_28],
    },
  },
  {
    patterns: ["swap", "trade", "exchange", "token_swap", "dex_swap", "spot_trade"],
    rule: {
      tier: "will",
      confidence_basis: "Court-binding authority (Cottage Savings) + crypto-as-property doctrine",
      rationale_template:
        "A crypto-to-crypto swap is a taxable exchange under IRC §1001 as each digital asset constitutes a materially different property interest per Cottage Savings Ass'n v. Commissioner, 499 U.S. 554 (1991). The taxpayer realizes gain or loss equal to the fair market value of the property received minus the adjusted basis of the property transferred. Basis allocation follows Rev. Proc. 2024-28.",
      authority_ids: [CIT.COTTAGE_SAVINGS, CIT.NOTICE_2014_21, CIT.REV_PROC_2024_28],
    },
  },
  {
    patterns: ["staking_reward", "validator_reward", "pos_reward", "proof_of_stake"],
    rule: {
      tier: "more_likely_than_not",
      confidence_basis: "IRS-binding Rev. Rul. 2023-14 (staking rewards = ordinary income at receipt)",
      rationale_template:
        "Staking rewards are includible in gross income as ordinary income under IRC §61 at their fair market value on the date of receipt, per Rev. Rul. 2023-14. The rewards constitute income when the taxpayer gains dominion and control over the newly created tokens. The FMV at receipt becomes the cost basis for subsequent disposition.",
      authority_ids: [CIT.REV_RUL_2023_14, CIT.NOTICE_2014_21],
    },
  },
  {
    patterns: ["bridge_transfer", "bridge", "cross_chain", "wrapped_token", "wrap", "unwrap"],
    rule: {
      tier: "should",
      confidence_basis: "IRS-binding Notice 2024-57 (open gap — reasonable position available)",
      rationale_template:
        "Bridge transfers and wrapped token transactions are identified as open-gap areas in Notice 2024-57. IRS has not issued definitive guidance on whether a bridge transfer or wrapping event constitutes a realization event. The most defensible position is non-recognition treatment on the basis that the taxpayer retains beneficial ownership throughout, with a basis carryover. Form 8275 disclosure is recommended pending further guidance.",
      authority_ids: [CIT.NOTICE_2024_57, CIT.NOTICE_2014_21],
    },
  },
  {
    patterns: ["lp_deposit", "liquidity_provision", "add_liquidity", "provide_liquidity"],
    rule: {
      tier: "more_likely_than_not",
      confidence_basis: "IRS-binding Notice 2024-57 (LP deposits are an open-gap area)",
      rationale_template:
        "Providing liquidity to a decentralized pool is an open-gap transaction identified in Notice 2024-57. The contribution of tokens in exchange for LP tokens may constitute a taxable exchange under IRC §1001 (Cottage Savings), but strong arguments support non-recognition as the taxpayer retains an undivided interest in the pooled assets. The position is classified at 'more likely than not' pending definitive IRS guidance. Form 8275 disclosure is recommended.",
      authority_ids: [CIT.NOTICE_2024_57, CIT.COTTAGE_SAVINGS, CIT.NOTICE_2014_21],
    },
  },
  {
    patterns: ["lp_withdrawal", "remove_liquidity", "withdraw_liquidity"],
    rule: {
      tier: "more_likely_than_not",
      confidence_basis: "IRS-binding Notice 2024-57 (LP withdrawals are an open-gap area)",
      rationale_template:
        "Withdrawing liquidity from a decentralized pool and receiving back the underlying tokens is an open-gap transaction per Notice 2024-57. Any difference between the value received and the basis in the LP tokens may constitute gain or loss. Impermanent loss realized upon withdrawal requires basis allocation across assets received. Classified at 'more likely than not' pending IRS guidance.",
      authority_ids: [CIT.NOTICE_2024_57, CIT.COTTAGE_SAVINGS, CIT.REV_PROC_2024_28],
    },
  },
  {
    patterns: ["defi_yield", "yield_farming", "farming_reward", "liquidity_mining", "mining_reward"],
    rule: {
      tier: "more_likely_than_not",
      confidence_basis: "IRS-binding Notice 2024-57 + Rev. Rul. 2023-14 by analogy",
      rationale_template:
        "DeFi yield and liquidity mining rewards are identified as an open-gap category in Notice 2024-57. By analogy to Rev. Rul. 2023-14 (staking rewards), yield tokens received from protocol incentives are likely includible as ordinary income at fair market value when received under IRC §61. The FMV at receipt establishes cost basis for subsequent disposition.",
      authority_ids: [CIT.NOTICE_2024_57, CIT.REV_RUL_2023_14, CIT.NOTICE_2014_21],
    },
  },
  {
    patterns: ["staking_deposit", "stake", "delegate", "delegat"],
    rule: {
      tier: "more_likely_than_not",
      confidence_basis: "IRS-binding Notice 2024-57 (staking deposits are an open-gap area)",
      rationale_template:
        "Depositing tokens for staking is an open-gap area per Notice 2024-57. The transfer of tokens to a staking contract may or may not constitute a realization event depending on whether there is a transfer of ownership. The most defensible position is non-recognition on deposit with basis carryover, treating the staking arrangement as similar to a loan of securities.",
      authority_ids: [CIT.NOTICE_2024_57, CIT.NOTICE_2014_21],
    },
  },
  {
    patterns: ["borrow", "collateral", "margin_open", "leverage", "debt"],
    rule: {
      tier: "substantial_authority",
      confidence_basis: "Notice 2024-57 open gap — non-recognition on borrowing is persuasive but untested",
      rationale_template:
        "Borrowing against digital asset collateral is an open-gap area under Notice 2024-57. Under general tax principles, a loan is not a taxable event; the collateral deposit is not a disposition if the taxpayer retains beneficial ownership and the right of recovery. However, the treatment of DeFi over-collateralized lending has not been addressed by the IRS. This position is based on non-binding analogy to traditional securities lending. Form 8275 disclosure is recommended.",
      authority_ids: [CIT.NOTICE_2024_57, CIT.NOTICE_2014_21],
    },
  },
  {
    patterns: ["liquidation", "margin_call", "forced_sale", "collateral_liquidation"],
    rule: {
      tier: "substantial_authority",
      confidence_basis: "Cottage Savings applies — liquidation is a forced sale realization event",
      rationale_template:
        "A liquidation event in a DeFi lending protocol constitutes a forced disposition of the collateral under IRC §1001, triggering gain or loss. By analogy to Cottage Savings Ass'n, the collateral transferred to satisfy the loan obligation is materially different from the liability extinguished, creating a realization event. The amount realized includes the fair market value of debt discharged. Notice 2024-57 identifies this as an open-gap area requiring careful documentation.",
      authority_ids: [CIT.COTTAGE_SAVINGS, CIT.NOTICE_2024_57, CIT.NOTICE_2014_21],
    },
  },
  {
    patterns: ["airdrop", "air_drop", "token_distribution", "retroactive_distribution"],
    rule: {
      tier: "reasonable_basis",
      confidence_basis: "Rev. Rul. 2019-24 — taxable at receipt, but dominion-and-control timing is contested",
      rationale_template:
        "Airdropped tokens are taxable as ordinary income under Rev. Rul. 2019-24 when the taxpayer has dominion and control over the assets. The exact timing of income recognition (announcement vs. claim vs. receipt) remains unsettled and is litigated in Jarrett v. United States. Form 8275 disclosure is required at Reasonable Basis to avoid accuracy-related penalties. Document the date, FMV at receipt, and number of tokens.",
      authority_ids: [CIT.REV_RUL_2019_24, CIT.NOTICE_2014_21],
    },
  },
  {
    patterns: ["hard_fork", "fork", "chain_split", "network_upgrade"],
    rule: {
      tier: "reasonable_basis",
      confidence_basis: "Rev. Rul. 2019-24 — taxable at receipt; dominion-and-control timing varies by fork",
      rationale_template:
        "Tokens received from a hard fork are taxable ordinary income under Rev. Rul. 2019-24 when the taxpayer has dominion and control. The timing and FMV depend on exchange listing dates and access to replay-protected chains. Significant uncertainty exists regarding which taxpayers 'receive' coins from contentious forks. Reasonable Basis is the maximum defensible tier without additional authority. Form 8275 disclosure is required.",
      authority_ids: [CIT.REV_RUL_2019_24, CIT.NOTICE_2014_21],
    },
  },
];

function matchRule(eventType: string, protocol?: string): SuggestionRule {
  const needle = eventType.toLowerCase().replace(/[\s-]/g, "_");
  for (const { patterns, rule } of RULES) {
    if (patterns.some((p) => needle.includes(p) || p.includes(needle))) {
      return rule;
    }
  }
  // Default: reasonable_basis with no specific authority
  return {
    tier: "reasonable_basis",
    confidence_basis: "No specific IRS authority found for this event type",
    rationale_template:
      `The tax treatment of "${eventType}" transactions has not been directly addressed by the IRS. Under general property principles (Notice 2014-21), digital assets are treated as property, so any disposition likely triggers gain or loss recognition. However, without specific guidance, the maximum defensible tier is Reasonable Basis. Form 8275 disclosure is required. Consult IRC §§ 1001, 61, and 1012 and monitor IRS guidance channels.`,
    authority_ids: [CIT.NOTICE_2014_21],
  };
}

// GET /intelligence/suggest
router.get("/intelligence/suggest", async (req, res): Promise<void> => {
  const eventType = req.query.event_type as string | undefined;
  if (!eventType) {
    res.status(400).json({ error: "event_type is required" });
    return;
  }
  const protocol = req.query.protocol as string | undefined;

  const rule = matchRule(eventType, protocol);

  // Verify which of the suggested citation IDs are actually in the DB
  const existingCitations = await db
    .select({ id: authorityCitationsTable.id, reference: authorityCitationsTable.reference })
    .from(authorityCitationsTable);
  const existingIds = new Set(existingCitations.map((c) => c.id));

  const verifiedAuthorityIds = rule.authority_ids.filter((id) => existingIds.has(id));

  res.json({
    event_type: eventType,
    suggested_tier: rule.tier,
    confidence_basis: rule.confidence_basis,
    rationale_template: rule.rationale_template,
    suggested_authority_ids: verifiedAuthorityIds,
    citations_seeded: existingCitations.length,
  });
});

// GET /intelligence/stale
router.get("/intelligence/stale", async (_req, res): Promise<void> => {
  const cutoff = new Date(Date.now() - STALE_THRESHOLD_DAYS * 24 * 60 * 60 * 1000);

  const allReasonableBasis = await db
    .select()
    .from(positionRecordsTable)
    .where(
      and(
        eq(positionRecordsTable.tier, "reasonable_basis"),
        isNull(positionRecordsTable.supersededBy)
      )
    )
    .orderBy(desc(positionRecordsTable.createdAt));

  const stale = allReasonableBasis.filter((p) => p.createdAt < cutoff);

  res.json({
    stale_count: stale.length,
    items: stale.map((p) => ({
      id: p.id,
      tx_id: p.txId ?? null,
      wallet_id: p.walletId ?? null,
      event_type: p.eventType,
      classification: p.classification,
      tier: p.tier,
      rationale: p.rationale,
      profile_id: p.profileId ?? null,
      requires_review: p.requiresReview,
      reviewer_signoff_at: p.reviewerSignoffAt?.toISOString() ?? null,
      created_at: p.createdAt.toISOString(),
      days_since_classification: Math.floor((Date.now() - p.createdAt.getTime()) / (24 * 60 * 60 * 1000)),
      is_stale: true,
    })),
  });
});

export default router;
