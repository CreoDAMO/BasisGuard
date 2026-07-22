import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock @workspace/db before any module that imports it is resolved.
// initialize() does: db.select().from(chainsTable) + db.select().from(protocolsTable)
// Both return Promise<[]> in this mock — no chains, no protocols.
vi.mock("@workspace/db", () => {
  const selectBuilder = {
    from: vi.fn(() => Promise.resolve([])),
  };
  return {
    db: {
      select: vi.fn(() => selectBuilder),
    },
    chainsTable: {},
    protocolsTable: {},
    // other named exports used by other modules — not needed here but avoids
    // "not a module" errors if the import is re-used transitively
    positionRecordsTable: {},
    positionCitationsTable: {},
    authorityCitationsTable: {},
    rawTransactionsTable: {},
  };
});

import { ProtocolRegistry } from "../core/protocolRegistry.js";

describe("ProtocolRegistry", () => {
  let registry: ProtocolRegistry;

  beforeEach(() => {
    registry = new ProtocolRegistry();
  });

  it("starts with adapterCount of 0 before initialization", () => {
    expect(registry.adapterCount).toBe(0);
  });

  it("initializes successfully with an empty protocols table", async () => {
    await registry.initialize();
    expect(registry.adapterCount).toBe(0);
  });

  it("resets initialized flag to false at the start of initialize()", async () => {
    // First init — succeeds, sets initialized = true
    await registry.initialize();

    // Make the DB call fail on the second attempt
    const { db } = await import("@workspace/db");
    const selectMock = vi.mocked(db.select);
    selectMock.mockImplementationOnce(() => {
      throw new Error("simulated DB failure");
    });

    // Second init — should throw, but not leave a stale 'true' initialized flag
    await expect(registry.initialize()).rejects.toThrow("simulated DB failure");

    // Now a fresh init with a working DB should succeed again
    selectMock.mockImplementation(
      () => ({ from: vi.fn(() => Promise.resolve([])) }) as unknown as ReturnType<typeof db.select>,
    );
    await registry.initialize();
    expect(registry.adapterCount).toBe(0);
  });

  it("parseTransaction returns empty array for a tx with no protocolId", async () => {
    await registry.initialize();
    const result = await registry.parseTransaction({
      id: "tx-1",
      protocolId: null,
      txHash: null,
      txDate: null,
      walletAddress: "0x123",
      chainId: "chain-1",
      eventType: "crypto_swap",
      rawData: null,
      processed: false,
      positionRecordId: null,
      ingestedBy: null,
      createdAt: new Date(),
    } as any);
    expect(result).toEqual([]);
  });

  it("parseTransaction returns empty array for an unregistered protocolId", async () => {
    await registry.initialize();
    const result = await registry.parseTransaction({
      id: "tx-2",
      protocolId: "00000000-0000-0000-0000-000000000001",
      txHash: null,
      txDate: null,
      walletAddress: "0x123",
      chainId: "chain-1",
      eventType: "crypto_swap",
      rawData: null,
      processed: false,
      positionRecordId: null,
      ingestedBy: null,
      createdAt: new Date(),
    } as any);
    expect(result).toEqual([]);
  });
});
