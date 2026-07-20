---
name: Protocol Adapter Layer
description: How the protocol registry, adapters, and classify route fit together; key design decisions.
---

# Protocol Adapter Layer

## Structure
- `artifacts/api-server/src/core/adapters/base.ts` — `BaseProtocolAdapter` abstract class + `ParsedEvent` interface
- `artifacts/api-server/src/core/adapters/aave.ts` — Aave V3 adapter (Supply/Borrow/Repay/Withdraw/LiquidationCall)
- `artifacts/api-server/src/core/adapters/uniswap.ts` — Uniswap V3 adapter (Swap → taxable disposition)
- `artifacts/api-server/src/core/createPosition.ts` — shared insert path; calls `computeRequiresReview`
- `artifacts/api-server/src/core/protocolRegistry.ts` — singleton `registry`; keyed by `protocol.id` (UUID)

## Registry initialization
- `registry.initialize()` is called at server startup (fire-and-forget) and lazily on first classify call
- Adapters: 0 at startup is EXPECTED when no protocols are seeded in the `protocols` table
- Add protocols to the DB with `slug = 'aave_v3'` or `slug = 'uniswap_v3'` to wire them up

## OPEN_GAP_EVENT_TYPES distinction (important)
- `aave_withdraw` and `aave_liquidation` are in `OPEN_GAP_EVENT_TYPES` (structural review) but NOT in the comment-letter export's `OPEN_GAP_EVENTS`
- Reason: comment-letter is for IRS guidance gaps; aave events force review for data reasons (lot-matching), not regulatory ones

## classify route
- `POST /api/transactions/classify` — walks `raw_transactions` where `processed=false`
- Query params: `limit` (default 50, max 200), `protocol_id` (optional filter)
- Returns: `{ total_fetched, classified, skipped, errors }`

## Registry refresh route
- `POST /admin/registry/refresh` — gated with `requireRole(ADMIN_ROLES)`
- Calls `registry.initialize()` directly (bypasses the `ensureInitialized` guard)
- Returns `{ refreshed_at, adapters }` — call this after seeding a new protocol row
- Needed because `ensureInitialized` only re-runs if `initialized === false`; successful startup leaves it `true` even with 0 adapters, so seeding protocols without a restart or refresh silently does nothing
- `initialize()` resets `this.initialized = false` at the top — any mid-init failure leaves registry retryable

## Fast path vs slow path in adapters
- Adapters first check `tx.rawData.event_name` (fast, no RPC call)
- Fall back to fetching receipt from `tx.txHash` via viem if rawData not decoded
- `chain.metadata.rpc_url` drives the viem transport; falls back to chain's public RPC if absent

**Why:** avoids RPC calls for indexer-ingested transactions that already decoded the event.
