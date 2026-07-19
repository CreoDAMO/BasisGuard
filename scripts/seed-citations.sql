-- Seeds the authority_citations table with IRS legal authorities used by the
-- tier suggestion intelligence engine. Fixed UUIDs make this idempotent.
-- Run via: psql $DATABASE_URL -f scripts/seed-citations.sql

INSERT INTO authority_citations (id, type, reference, summary, url, authority_strength)
VALUES
  (
    'aa000001-0000-0000-0000-000000000001',
    'Rev_Rul',
    'Rev. Rul. 2023-14',
    'Staking rewards are includible in gross income at fair market value when received, treated as ordinary income under IRC §61. Establishes that proof-of-stake validation rewards are taxable upon receipt, not upon sale.',
    'https://www.irs.gov/pub/irs-drop/rr-23-14.pdf',
    'binding_on_irs_only'
  ),
  (
    'aa000001-0000-0000-0000-000000000002',
    'Notice',
    'Notice 2024-57',
    'Identifies six open-gap DeFi transaction categories where IRS guidance is pending and 1099-DA reporting is deferred: (1) LP deposits, (2) LP withdrawals, (3) yield farming, (4) liquidity mining, (5) staking, (6) wrapped/unwrapped token transactions. Taxpayers may take reasonable positions pending further guidance.',
    'https://www.irs.gov/pub/irs-drop/n-24-57.pdf',
    'binding_on_irs_only'
  ),
  (
    'aa000001-0000-0000-0000-000000000003',
    'Court_Case',
    'Cottage Savings Ass''n v. Commissioner, 499 U.S. 554 (1991)',
    'An exchange of materially different property interests constitutes a realization event under IRC §1001. Applied to crypto-to-crypto swaps: exchanging one digital asset for another realizes gain or loss because the properties are materially different.',
    'https://caselaw.findlaw.com/us-supreme-court/499/554.html',
    'binding_on_courts'
  ),
  (
    'aa000001-0000-0000-0000-000000000004',
    'Rev_Proc',
    'Rev. Proc. 2024-28',
    'Provides a safe-harbor method for allocating cost basis of digital assets held on or after January 1, 2025. Taxpayers may use specific identification, FIFO, or other IRS-approved methods. Establishes compliance framework for IRC §1012 basis accounting.',
    'https://www.irs.gov/pub/irs-drop/rp-24-28.pdf',
    'binding_on_irs_only'
  ),
  (
    'aa000001-0000-0000-0000-000000000005',
    'Rev_Rul',
    'Rev. Rul. 2019-24',
    'Hard fork coins received from a hard fork are taxable ordinary income at FMV when the taxpayer has dominion and control. Airdropped tokens are taxable income when constructively received. Establishes the dominion-and-control test for nascent digital assets.',
    'https://www.irs.gov/pub/irs-drop/rr-19-24.pdf',
    'binding_on_irs_only'
  ),
  (
    'aa000001-0000-0000-0000-000000000006',
    'Notice',
    'Notice 2014-21',
    'Virtual currency is treated as property for U.S. federal tax purposes. General tax principles applicable to property transactions apply to transactions using virtual currency. Foundational IRS guidance establishing crypto-as-property doctrine.',
    'https://www.irs.gov/pub/irs-drop/n-14-21.pdf',
    'binding_on_irs_only'
  ),
  (
    'aa000001-0000-0000-0000-000000000007',
    'Treasury_Decision',
    'T.D. 10000 (2024)',
    'Final regulations (July 9, 2024) governing custodial broker 1099-DA reporting under IRC §6045. Covers exchanges, hosted-wallet providers, and payment processors that take possession of customer digital assets. Establishes cost-basis reporting rules effective for sales on or after January 1, 2025. This Treasury Decision remains in force and was not affected by the Congressional Review Act repeal of T.D. 10021.',
    'https://www.federalregister.gov/documents/2024/07/09/2024-14701/gross-proceeds-and-basis-reporting-by-brokers-and-determination-of-amount-realized-and-basis-for',
    'binding_on_courts'
  ),
  (
    'aa000001-0000-0000-0000-000000000008',
    'Treasury_Decision',
    'T.D. 10021 (2024) — REPEALED',
    'REPEALED — No longer valid authority. T.D. 10021 (December 30, 2024) extended 1099-DA broker reporting rules to DeFi/non-custodial ''trading front-end service providers'' under IRC §6045. Congress repealed it via the Congressional Review Act (H.J. Res. 25, signed April 10, 2025). It is not current law and must not be cited as live authority. Retained here for historical reference only.',
    'https://www.federalregister.gov/documents/2024/12/30/2024-30780/gross-proceeds-reporting-by-brokers-that-regularly-provide-services-effectuating-digital-asset-sales',
    'non_binding_persuasive'
  )
ON CONFLICT (id) DO NOTHING;
