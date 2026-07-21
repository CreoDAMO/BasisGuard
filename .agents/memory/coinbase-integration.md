---
name: Coinbase CDP Integration
description: Architecture and key decisions for the Coinbase CEX import feature
---

# Coinbase CDP Integration

## What was built
- `lib/db/src/schema/coinbase_connections.ts` — one connection per user, AES-256-GCM encrypted private key at rest
- `artifacts/api-server/src/lib/encrypt.ts` — AES-256-GCM encryption derived from SESSION_SECRET via scryptSync
- `artifacts/api-server/src/lib/coinbaseClient.ts` — CDP JWT builder (ES256, ieee-p1363 signature encoding) + V2 account/transaction fetchers + Coinbase→BasisGuard type map
- `artifacts/api-server/src/routes/coinbase.ts` — GET/POST/DELETE /coinbase/connection + POST /coinbase/sync
- `artifacts/basisguard/src/pages/connections.tsx` — connection management UI

## Key decisions

**Why CDP API keys (not OAuth):** Coinbase blocked OAuth app creation at time of implementation. CDP keys work immediately with JWT auth for V2 and Advanced Trade APIs.

**Why:** encrypt private key with SESSION_SECRET-derived key: avoids a new secret while using a well-established KDF (scryptSync with static salt).

**How to apply:** When adding more exchange connectors, follow the same pattern — separate schema table, encrypt.ts helpers, dedicated route file, page at /connections.

## Virtual chain for CEX transactions
Fixed UUID `00000000-0000-0000-0000-c01bba5e0000` seeded as "coinbase-cex" slug chain on first sync. raw_transactions requires a chain_id FK.

## Coinbase → BasisGuard event type mapping
See `coinbaseClient.ts` COINBASE_TYPE_MAP. Unknown types become `coinbase_<type>` — they land in review queue since they won't match OPEN_GAP_EVENT_TYPES but the unknown prefix makes them visible.

## Credentials flow
User enters Key Name (organizations/xxx/apiKeys/yyy) + PEM private key → POST /api/coinbase/connection → encrypted at rest. POST /api/coinbase/sync triggers live API calls.

**Why:** The private key is validated to contain "BEGIN EC PRIVATE KEY" or "BEGIN PRIVATE KEY" before accepting — rejects obviously wrong input early.
