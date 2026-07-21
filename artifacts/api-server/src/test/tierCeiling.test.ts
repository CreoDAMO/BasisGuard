import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock @workspace/db before importing tierCeiling
vi.mock("@workspace/db", () => {
  const whereBuilder = {
    // default: return empty rows; individual tests override via mockImplementation
    then: undefined as unknown,
  };
  const fromBuilder = {
    where: vi.fn(() => Promise.resolve([])),
  };
  const selectBuilder = {
    from: vi.fn(() => fromBuilder),
  };
  return {
    db: {
      select: vi.fn(() => selectBuilder),
    },
    authorityCitationsTable: {
      id: "id",
      authorityStrength: "authorityStrength",
    },
    // Other named exports used transitively
    chainsTable: {},
    protocolsTable: {},
    positionRecordsTable: {},
    positionCitationsTable: {},
    rawTransactionsTable: {},
  };
});

// inArray is re-exported from drizzle-orm — mock to pass-through
vi.mock("drizzle-orm", () => ({
  inArray: vi.fn((_col: unknown, _ids: unknown) => "MOCK_WHERE_CLAUSE"),
}));

import { computeTierCeiling, exceedsCeiling, tierIndex, TIER_ORDER } from "../core/tierCeiling.js";
import { db } from "@workspace/db";

// Helper to make the DB where() return specific rows
function mockRows(rows: { authorityStrength: string }[]) {
  const whereBuilder = { then: undefined as unknown };
  const fromMock = { where: vi.fn(() => Promise.resolve(rows)) };
  vi.mocked(db.select).mockReturnValueOnce({ from: vi.fn(() => fromMock) } as any);
}

// ── tierIndex ─────────────────────────────────────────────────────────────────

describe("tierIndex", () => {
  it("returns 0 for 'will' (highest confidence)", () => {
    expect(tierIndex("will")).toBe(0);
  });

  it("returns 1 for 'should'", () => {
    expect(tierIndex("should")).toBe(1);
  });

  it("returns 2 for 'more_likely_than_not'", () => {
    expect(tierIndex("more_likely_than_not")).toBe(2);
  });

  it("returns 3 for 'substantial_authority'", () => {
    expect(tierIndex("substantial_authority")).toBe(3);
  });

  it("returns 4 for 'reasonable_basis' (lowest confidence)", () => {
    expect(tierIndex("reasonable_basis")).toBe(4);
  });

  it("returns -1 for an unknown tier string", () => {
    expect(tierIndex("unknown_tier")).toBe(-1);
  });

  it("TIER_ORDER has exactly 5 entries", () => {
    expect(TIER_ORDER).toHaveLength(5);
  });
});

// ── computeTierCeiling ────────────────────────────────────────────────────────

describe("computeTierCeiling", () => {
  it("returns 'reasonable_basis' for an empty citation list (no DB call)", async () => {
    const result = await computeTierCeiling([]);
    expect(result).toBe("reasonable_basis");
  });

  it("returns 'should' for exactly 1 binding_on_courts citation", async () => {
    mockRows([{ authorityStrength: "binding_on_courts" }]);
    const result = await computeTierCeiling(["cit-1"]);
    expect(result).toBe("should");
  });

  it("returns 'will' for 2 binding_on_courts citations", async () => {
    mockRows([
      { authorityStrength: "binding_on_courts" },
      { authorityStrength: "binding_on_courts" },
    ]);
    const result = await computeTierCeiling(["cit-1", "cit-2"]);
    expect(result).toBe("will");
  });

  it("returns 'will' for 3+ binding_on_courts citations", async () => {
    mockRows([
      { authorityStrength: "binding_on_courts" },
      { authorityStrength: "binding_on_courts" },
      { authorityStrength: "binding_on_courts" },
    ]);
    const result = await computeTierCeiling(["cit-1", "cit-2", "cit-3"]);
    expect(result).toBe("will");
  });

  it("returns 'more_likely_than_not' for 1 binding_on_irs_only citation", async () => {
    mockRows([{ authorityStrength: "binding_on_irs_only" }]);
    const result = await computeTierCeiling(["cit-1"]);
    expect(result).toBe("more_likely_than_not");
  });

  it("returns 'more_likely_than_not' for multiple binding_on_irs_only citations", async () => {
    mockRows([
      { authorityStrength: "binding_on_irs_only" },
      { authorityStrength: "binding_on_irs_only" },
    ]);
    const result = await computeTierCeiling(["cit-1", "cit-2"]);
    expect(result).toBe("more_likely_than_not");
  });

  it("returns 'substantial_authority' for only non_binding_persuasive citations", async () => {
    mockRows([
      { authorityStrength: "non_binding_persuasive" },
      { authorityStrength: "non_binding_persuasive" },
    ]);
    const result = await computeTierCeiling(["cit-1", "cit-2"]);
    expect(result).toBe("substantial_authority");
  });

  it("returns 'reasonable_basis' when DB rows have no recognised strength values", async () => {
    mockRows([{ authorityStrength: "unknown_type" }]);
    const result = await computeTierCeiling(["cit-1"]);
    expect(result).toBe("reasonable_basis");
  });

  it("prefers binding_on_courts over binding_on_irs_only when mixed", async () => {
    mockRows([
      { authorityStrength: "binding_on_courts" },
      { authorityStrength: "binding_on_irs_only" },
    ]);
    const result = await computeTierCeiling(["cit-1", "cit-2"]);
    // 1 binding_on_courts → "should" (not more_likely_than_not)
    expect(result).toBe("should");
  });
});

// ── exceedsCeiling ────────────────────────────────────────────────────────────

describe("exceedsCeiling", () => {
  it("returns true when requested tier is more optimistic than ceiling", () => {
    // "will" (index 0) requested, ceiling is "should" (index 1)
    expect(exceedsCeiling("will", "should")).toBe(true);
  });

  it("returns true when requested is 'will' and ceiling is 'reasonable_basis'", () => {
    expect(exceedsCeiling("will", "reasonable_basis")).toBe(true);
  });

  it("returns false when requested tier equals the ceiling", () => {
    expect(exceedsCeiling("reasonable_basis", "reasonable_basis")).toBe(false);
  });

  it("returns true when requested tier is more optimistic than the ceiling (substantial_authority > reasonable_basis)", () => {
    // "substantial_authority" (index 3) requested, ceiling is "reasonable_basis" (index 4)
    // substantial_authority IS more optimistic than reasonable_basis → exceeds ceiling
    expect(exceedsCeiling("substantial_authority", "reasonable_basis")).toBe(true);
  });

  it("returns false for an unknown requested tier string", () => {
    expect(exceedsCeiling("unknown_tier", "reasonable_basis")).toBe(false);
  });

  it("returns false when 'should' is requested and ceiling is 'will'", () => {
    // "should" (index 1) is less optimistic than "will" (index 0) ceiling → ok
    expect(exceedsCeiling("should", "will")).toBe(false);
  });

  it("returns true when 'more_likely_than_not' is requested and ceiling is 'substantial_authority'", () => {
    expect(exceedsCeiling("more_likely_than_not", "substantial_authority")).toBe(true);
  });
});
