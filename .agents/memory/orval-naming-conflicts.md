---
name: Orval naming conflicts
description: How to prevent duplicate-export TypeScript errors when orval generates both Zod schemas and TypeScript types with the same name
---

## Rule
When an OpenAPI path uses an **inline (anonymous) request body**, orval auto-names it `{OperationId}Body` and generates that name in **both** `generated/api.ts` (as a Zod schema) and `generated/types/{name}.ts` (as a TypeScript type). Both are re-exported from the `index.ts` orval also generates, causing a TypeScript ambiguity error.

## Fix
Extract the inline body into a **named `$ref` schema** in `components/schemas` and reference it from the path. Orval will then use the schema name directly (no `Body` suffix collision).

```yaml
# Instead of inline:
requestBody:
  content:
    application/json:
      schema:
        type: object
        properties:
          reviewed_by: { type: string }

# Use a named ref:
requestBody:
  content:
    application/json:
      schema:
        $ref: "#/components/schemas/ReviewApprovalInput"
```

**Why:** orval's split mode generates both Zod validators and TypeScript types — they share names derived from operationId. Named schemas avoid the collision because the name comes from the schema definition, not the operation.

**How to apply:** Any time a new endpoint needs a request body with fields that don't map to an existing named schema, define a new named schema first. Batch multiple similar bodies into one shared schema when semantics allow (e.g. `ReviewApprovalInput` shared across approve-chain and approve-protocol).
