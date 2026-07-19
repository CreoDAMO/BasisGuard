---
name: is_stale computed field pattern
description: Staleness is computed dynamically at serialization time, not stored in DB
---

**Rule:** `is_stale` is a derived boolean added to every serialized `PositionRecord`. It is computed in `serializePosition()` and in export helpers, never stored as a column.

**Why:** Staleness is time-dependent (>180 days old) and would need continuous updates if stored. Computing at read time is simpler and always accurate.

**How to apply:** 
- Threshold: 180 days
- Criteria: `tier === "reasonable_basis"` AND `supersededBy === null` AND age > threshold
- The `is_stale` field is required in the OpenAPI `PositionRecord` schema — any new serialization helper must include it
