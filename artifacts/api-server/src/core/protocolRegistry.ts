import { db, chainsTable, protocolsTable, type RawTransaction, type Chain } from "@workspace/db";
import { BaseProtocolAdapter, type ParsedEvent } from "./adapters/base.js";
import { AaveAdapter } from "./adapters/aave.js";
import { UniswapV3Adapter } from "./adapters/uniswap.js";

/**
 * Protocol slug → adapter class.
 * Register new adapters here when built — the registry wires them up to the
 * right chain automatically from the protocols table.
 */
const ADAPTER_CLASSES: Record<string, new (chain: Chain) => BaseProtocolAdapter> = {
  aave_v3: AaveAdapter,
  uniswap_v3: UniswapV3Adapter,
};

export class ProtocolRegistry {
  // protocol_id (uuid) → adapter instance
  private adapters = new Map<string, BaseProtocolAdapter>();
  private chainsById = new Map<string, Chain>();
  private initialized = false;

  async initialize(): Promise<void> {
    // Reset before the async work so that if we throw mid-way, ensureInitialized()
    // will retry on the next call rather than serving a stale / partial adapter map.
    this.initialized = false;

    const [allChains, allProtocols] = await Promise.all([
      db.select().from(chainsTable),
      db.select().from(protocolsTable),
    ]);

    this.chainsById = new Map(allChains.map((c) => [c.id, c]));
    this.adapters.clear();

    let registered = 0;
    for (const protocol of allProtocols) {
      const AdapterClass = ADAPTER_CLASSES[protocol.slug];
      const chain = this.chainsById.get(protocol.chainId);
      if (!AdapterClass || !chain) continue;
      this.adapters.set(protocol.id, new AdapterClass(chain));
      registered++;
    }

    this.initialized = true;
    return;
  }

  /**
   * Ensures the registry is initialized before use. Called automatically by
   * parseTransaction so callers don't have to track initialization state.
   */
  private async ensureInitialized(): Promise<void> {
    if (!this.initialized) await this.initialize();
  }

  /**
   * Returns classified events for a raw transaction, or an empty array if no
   * adapter is registered for its protocol_id. Callers should leave those rows
   * with processed=false rather than guessing at classification.
   */
  async parseTransaction(tx: RawTransaction): Promise<ParsedEvent[]> {
    await this.ensureInitialized();
    if (!tx.protocolId) return [];
    const adapter = this.adapters.get(tx.protocolId);
    if (!adapter) return [];
    return adapter.parse(tx);
  }

  /** Returns the number of registered adapters (useful for health checks / logging). */
  get adapterCount(): number {
    return this.adapters.size;
  }
}

export const registry = new ProtocolRegistry();
