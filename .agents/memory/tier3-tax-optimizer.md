---
name: Tier 3 Tax Optimizer
description: Implementation details and lessons for the Tax Optimizer feature (Tier 3 of the BasisGuard roadmap)
---

# Tier 3 — Tax Optimizer

## What was built
- `core/taxOptimizer.ts` — pure algorithms: simulateSale, compareStrategies, harvestRecommendations, estateStepUp
- `core/priceOracle.ts` — added getHistoricalPrice + getHistoricalBatchPrices (CoinGecko /coins/{id}/history endpoint, dd-mm-yyyy format)
- `routes/tax-optimizer.ts` — three endpoints: GET /tax-optimizer/simulate, GET /tax-optimizer/harvest, POST /tax-optimizer/estate-step-up
- `test/taxOptimizer.test.ts` — 21 tests, all passing
- Frontend: `pages/tax-optimizer.tsx` — tabbed UI (Sale Simulator, Harvest Candidates, Estate Step-Up)
- Wired into: `routes/index.ts`, `App.tsx`, `app-sidebar.tsx` (Calculator icon, Operations group)

## Key correctness notes

**simulateSale / min_tax strategy**: With LT_HIGH (0.5 BTC) + LT_LOT (1.0 BTC) = exactly 1.5 BTC in long-term lots, min_tax selling 1.5 BTC produces NO short-term gain (all consumed from long-term). Test assertion must check shortTermGainUsd is null.

**compareStrategies sort stability**: FIFO and min_tax both take the oldest/long-term lot when lot inventory has only one long-term lot — they produce equal total gain. In a stable ascending sort, min_tax ends up LAST (later in STRATEGIES array). Test must NOT assert `results[last].strategy === "fifo"`; assert the gain value instead.

**Why:** JavaScript Array.sort is stable. STRATEGIES order is [fifo, lifo, hifo, min_tax]. Equal-gain items retain their original order → min_tax (index 3) always lands after fifo (index 0) when both have the same gain.

## Historical price oracle
CoinGecko free API `/api/v3/coins/{id}/history?date={dd-mm-yyyy}&localization=false`. No cache (historical prices are point-in-time, not TTL-able). Returns `market_data.current_price.usd`. Free tier covers roughly past 365 days.

## Pre-existing sidebar basePath bug
`app-sidebar.tsx` referenced `basePath` without defining it. Fixed by adding `const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");` at the top of the component file.

## OpenAPI spec gap
Tax Optimizer endpoints are NOT yet documented in `lib/api-spec/openapi.yaml`. Follow-up task #3 covers this.
