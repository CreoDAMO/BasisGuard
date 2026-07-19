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
      "Identifies eight open-gap DeFi transaction categories where IRS guidance is pending: LP deposits/withdrawals, yield farming, liquidity mining, staking, and wrapped token wrapping/unwrapping. Taxpayers may take reasonable positions pending further guidance.",
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
