---
name: Authority citation UUIDs
description: Fixed UUIDs for the 6 seeded IRS authority citations; intelligence engine hardcodes these
---

## Rule
The `GET /intelligence/suggest` engine in `artifacts/api-server/src/routes/intelligence.ts` hardcodes these UUIDs in the `CIT` constant. If any citation is deleted and re-inserted with a different UUID, the suggestion engine will silently return no authorities for that citation.

## UUIDs (must remain stable)
| UUID | Citation |
|------|----------|
| aa000001-0000-0000-0000-000000000001 | Rev. Rul. 2023-14 (staking rewards = ordinary income) |
| aa000001-0000-0000-0000-000000000002 | Notice 2024-57 (DeFi open gaps) |
| aa000001-0000-0000-0000-000000000003 | Cottage Savings 499 U.S. 554 (taxable exchange doctrine) |
| aa000001-0000-0000-0000-000000000004 | Rev. Proc. 2024-28 (cost basis methods) |
| aa000001-0000-0000-0000-000000000005 | Rev. Rul. 2019-24 (hard forks and airdrops) |
| aa000001-0000-0000-0000-000000000006 | Notice 2014-21 (crypto as property — foundational) |

**Why:** The engine maps event_type keywords → tiers and returns the UUIDs of relevant citations. Verification is done at query time (a DB lookup confirms which IDs exist), but the mapping itself is static.

**How to apply:** If adding new IRS citations for the engine, add them with a new UUID in the `aa000001-*` namespace AND add the UUID to the `CIT` constant and relevant rule entries in `intelligence.ts`.
