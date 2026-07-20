/**
 * Seeds the authority_citations table with real IRS sources used by the
 * tier suggestion engine.  Run via: pnpm --filter @workspace/db run seed
 *
 * All UUIDs are fixed so re-runs are idempotent (ON CONFLICT DO NOTHING).
 */
import { db, authorityCitationsTable } from "./index";

const CITATIONS = [
  {
    id: "aa000001-0000-0000-0000-000000000001",
    type: "Rev_Rul" as const,
    reference: "Rev. Rul. 2023-14",
    summary:
      "Staking rewards are includible in gross income at fair market value when received, treated as ordinary income under IRC §61. Establishes that proof-of-stake validation rewards are taxable upon receipt, not upon sale.",
    url: "https://www.irs.gov/pub/irs-drop/rr-23-14.pdf",
    authorityStrength: "binding_on_irs_only" as const,
  },
  {
    id: "aa000001-0000-0000-0000-000000000002",
    type: "Notice" as const,
    reference: "Notice 2024-57",
    summary:
      "Identifies six open-gap DeFi transaction categories where IRS guidance is pending and 1099-DA reporting is deferred: (1) LP deposits, (2) LP withdrawals, (3) yield farming, (4) liquidity mining, (5) staking, (6) wrapped/unwrapped token transactions. Taxpayers may take reasonable positions pending further guidance.",
    url: "https://www.irs.gov/pub/irs-drop/n-24-57.pdf",
    authorityStrength: "binding_on_irs_only" as const,
  },
  {
    id: "aa000001-0000-0000-0000-000000000003",
    type: "Court_Case" as const,
    reference: "Cottage Savings Ass'n v. Commissioner, 499 U.S. 554 (1991)",
    summary:
      "An exchange of materially different property interests constitutes a realization event under IRC §1001. Applied to crypto-to-crypto swaps: exchanging one digital asset for another realizes gain or loss because the properties are materially different.",
    url: "https://caselaw.findlaw.com/us-supreme-court/499/554.html",
    authorityStrength: "binding_on_courts" as const,
  },
  {
    id: "aa000001-0000-0000-0000-000000000004",
    type: "Rev_Proc" as const,
    reference: "Rev. Proc. 2024-28",
    summary:
      "Provides a safe-harbor method for allocating cost basis of digital assets held on or after January 1, 2025. Taxpayers may use specific identification, FIFO, or other IRS-approved methods. Establishes compliance framework for IRC §1012 basis accounting.",
    url: "https://www.irs.gov/pub/irs-drop/rp-24-28.pdf",
    authorityStrength: "binding_on_irs_only" as const,
  },
  {
    id: "aa000001-0000-0000-0000-000000000005",
    type: "Rev_Rul" as const,
    reference: "Rev. Rul. 2019-24",
    summary:
      "Hard fork coins received from a hard fork are taxable ordinary income at FMV when the taxpayer has dominion and control. Airdropped tokens are taxable income when constructively received. Establishes the dominion-and-control test for nascent digital assets.",
    url: "https://www.irs.gov/pub/irs-drop/rr-19-24.pdf",
    authorityStrength: "binding_on_irs_only" as const,
  },
  {
    id: "aa000001-0000-0000-0000-000000000006",
    type: "Notice" as const,
    reference: "Notice 2014-21",
    summary:
      "Virtual currency is treated as property for U.S. federal tax purposes. General tax principles applicable to property transactions apply to transactions using virtual currency. Foundational IRS guidance establishing crypto-as-property doctrine.",
    url: "https://www.irs.gov/pub/irs-drop/n-14-21.pdf",
    authorityStrength: "binding_on_irs_only" as const,
  },
  {
    id: "aa000001-0000-0000-0000-000000000007",
    type: "Treasury_Decision" as const,
    reference: "T.D. 10000 (2024)",
    summary:
      "Final regulations (July 9, 2024) governing custodial broker 1099-DA reporting under IRC §6045. Covers exchanges, hosted-wallet providers, and payment processors that take possession of customer digital assets. Establishes cost-basis reporting rules effective for sales on or after January 1, 2025. This Treasury Decision remains in force and was not affected by the Congressional Review Act repeal of T.D. 10021.",
    url: "https://www.federalregister.gov/documents/2024/07/09/2024-14701/gross-proceeds-and-basis-reporting-by-brokers-and-determination-of-amount-realized-and-basis-for",
    authorityStrength: "binding_on_courts" as const,
  },
  {
    id: "aa000001-0000-0000-0000-000000000008",
    type: "Treasury_Decision" as const,
    reference: "T.D. 10021 (2024) — REPEALED",
    summary:
      "REPEALED — No longer valid authority. T.D. 10021 (December 30, 2024) extended 1099-DA broker reporting rules to DeFi/non-custodial 'trading front-end service providers' under IRC §6045. Congress repealed it via the Congressional Review Act (H.J. Res. 25, signed April 10, 2025). It is not current law and must not be cited as live authority. Retained here for historical reference only — its repeal is part of the background context for Notice 2024-57's DeFi deferral.",
    url: "https://www.federalregister.gov/documents/2024/12/30/2024-30780/gross-proceeds-reporting-by-brokers-that-regularly-provide-services-effectuating-digital-asset-sales",
    authorityStrength: "non_binding_persuasive" as const,
  },
  {
    id: "aa000001-0000-0000-0000-000000000009",
    type: "Statute" as const,
    reference: "IRC §1001",
    summary:
      "Gain or loss is realized upon the sale or other disposition of property, measured against adjusted basis. A transfer that does not change beneficial ownership of an asset (e.g., posting it as loan collateral, or its later return) is not itself a disposition; a materially different property received in exchange is (Cottage Savings Ass'n, 499 U.S. 554).",
    url: "https://www.law.cornell.edu/uscode/text/26/1001",
    authorityStrength: "binding_on_courts" as const,
  },
  {
    id: "aa000001-0000-0000-0000-000000000010",
    type: "Statute" as const,
    reference: "IRC §165",
    summary:
      "Allows a deduction for losses sustained during the taxable year and not compensated by insurance or otherwise. A forced sale of collateral (e.g., DeFi liquidation) realizes gain or loss under §1001 based on FMV at disposition versus basis — §165 only produces a deductible loss where that computation is negative; it does not itself presume a loss.",
    url: "https://www.law.cornell.edu/uscode/text/26/165",
    authorityStrength: "binding_on_courts" as const,
  },
];

async function seed() {
  console.log("Seeding authority citations…");
  await db
    .insert(authorityCitationsTable)
    .values(CITATIONS)
    .onConflictDoNothing();
  console.log(`✓ ${CITATIONS.length} citations inserted (or already present).`);
  process.exit(0);
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
