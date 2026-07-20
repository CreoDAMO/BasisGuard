-- Seed chains and DeFi protocol rows for BasisGuard.
-- Idempotent: ON CONFLICT DO NOTHING throughout.
-- Chain UUIDs: bb000001-...-{01-05}
-- Protocol UUIDs: cc000001-...-{01-10}
--
-- Adapters key on chains.slug to pick the viem chain client (see VIEM_CHAINS
-- in aave.ts / uniswap.ts). The metadata->rpc_url field is used as the RPC
-- endpoint on the slow path (on-chain receipt fetch). Leave it null to fall
-- back to the public viem default.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── Chains ────────────────────────────────────────────────────────────────────

INSERT INTO chains (id, name, slug, is_l2, parent_chain_id, metadata) VALUES
  (
    'bb000001-0000-0000-0000-000000000001',
    'Ethereum Mainnet',
    'ethereum',
    false,
    NULL,
    '{"chain_id": 1, "evm_chain_id": 1, "explorer": "https://etherscan.io"}'
  ),
  (
    'bb000001-0000-0000-0000-000000000002',
    'Arbitrum One',
    'arbitrum',
    true,
    'bb000001-0000-0000-0000-000000000001',
    '{"chain_id": 42161, "evm_chain_id": 42161, "explorer": "https://arbiscan.io"}'
  ),
  (
    'bb000001-0000-0000-0000-000000000003',
    'Base',
    'base',
    true,
    'bb000001-0000-0000-0000-000000000001',
    '{"chain_id": 8453, "evm_chain_id": 8453, "explorer": "https://basescan.org"}'
  ),
  (
    'bb000001-0000-0000-0000-000000000004',
    'OP Mainnet',
    'optimism',
    true,
    'bb000001-0000-0000-0000-000000000001',
    '{"chain_id": 10, "evm_chain_id": 10, "explorer": "https://optimistic.etherscan.io"}'
  ),
  (
    'bb000001-0000-0000-0000-000000000005',
    'Polygon',
    'polygon',
    true,
    'bb000001-0000-0000-0000-000000000001',
    '{"chain_id": 137, "evm_chain_id": 137, "explorer": "https://polygonscan.com"}'
  )
ON CONFLICT (id) DO NOTHING;

-- ── Aave V3 ───────────────────────────────────────────────────────────────────
-- Key contract: Pool (proxy) — the address that emits Supply / Borrow / Repay /
-- Withdraw / LiquidationCall events. Verified addresses from Aave docs.

INSERT INTO protocols (id, chain_id, name, slug, contract_addresses, adapter_version, metadata) VALUES
  (
    'cc000001-0000-0000-0000-000000000001',
    'bb000001-0000-0000-0000-000000000001',  -- ethereum
    'Aave V3',
    'aave_v3',
    '{"pool": "0x87870Bca3F3fD6335C3F4ce8392D69350B4fA4E2"}',
    '3.0',
    '{"docs": "https://docs.aave.com/developers/core-contracts/pool", "audited": true}'
  ),
  (
    'cc000001-0000-0000-0000-000000000002',
    'bb000001-0000-0000-0000-000000000002',  -- arbitrum
    'Aave V3',
    'aave_v3',
    '{"pool": "0x794a61358D6845594F94dc1DB02A252b5b4814aD"}',
    '3.0',
    '{"docs": "https://docs.aave.com/developers/core-contracts/pool", "audited": true}'
  ),
  (
    'cc000001-0000-0000-0000-000000000003',
    'bb000001-0000-0000-0000-000000000003',  -- base
    'Aave V3',
    'aave_v3',
    '{"pool": "0xA238Dd80C259a72e81d7e4664a9801593F98d1c5"}',
    '3.0',
    '{"docs": "https://docs.aave.com/developers/core-contracts/pool", "audited": true}'
  ),
  (
    'cc000001-0000-0000-0000-000000000004',
    'bb000001-0000-0000-0000-000000000004',  -- optimism
    'Aave V3',
    'aave_v3',
    '{"pool": "0x794a61358D6845594F94dc1DB02A252b5b4814aD"}',
    '3.0',
    '{"docs": "https://docs.aave.com/developers/core-contracts/pool", "audited": true}'
  ),
  (
    'cc000001-0000-0000-0000-000000000005',
    'bb000001-0000-0000-0000-000000000005',  -- polygon
    'Aave V3',
    'aave_v3',
    '{"pool": "0x794a61358D6845594F94dc1DB02A252b5b4814aD"}',
    '3.0',
    '{"docs": "https://docs.aave.com/developers/core-contracts/pool", "audited": true}'
  )
ON CONFLICT (id) DO NOTHING;

-- ── Uniswap V3 ────────────────────────────────────────────────────────────────
-- Key contracts: Factory (deploys Pool pairs) + SwapRouter02 (routes swaps,
-- emits Swap events via the underlying pool). The adapter decodes Swap events
-- from any pool, not just router calls, so both addresses are documented here.

INSERT INTO protocols (id, chain_id, name, slug, contract_addresses, adapter_version, metadata) VALUES
  (
    'cc000001-0000-0000-0000-000000000006',
    'bb000001-0000-0000-0000-000000000001',  -- ethereum
    'Uniswap V3',
    'uniswap_v3',
    '{
      "factory": "0x1F98431c8aD98523631AE4a59f267346ea31F984",
      "swap_router_02": "0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45",
      "swap_router_v1": "0xE592427A0AEce92De3Edee1F18E0157C05861564"
    }',
    '3.0',
    '{"docs": "https://docs.uniswap.org/contracts/v3/reference/overview", "audited": true}'
  ),
  (
    'cc000001-0000-0000-0000-000000000007',
    'bb000001-0000-0000-0000-000000000002',  -- arbitrum
    'Uniswap V3',
    'uniswap_v3',
    '{
      "factory": "0x1F98431c8aD98523631AE4a59f267346ea31F984",
      "swap_router_02": "0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45"
    }',
    '3.0',
    '{"docs": "https://docs.uniswap.org/contracts/v3/reference/overview", "audited": true}'
  ),
  (
    'cc000001-0000-0000-0000-000000000008',
    'bb000001-0000-0000-0000-000000000003',  -- base
    'Uniswap V3',
    'uniswap_v3',
    '{
      "factory": "0x33128a8fC17869897dcE68Ed026d694621f6FDfD",
      "swap_router_02": "0x2626664c2603336E57B271c5C0b26F421741e481"
    }',
    '3.0',
    '{"docs": "https://docs.uniswap.org/contracts/v3/reference/overview", "audited": true}'
  ),
  (
    'cc000001-0000-0000-0000-000000000009',
    'bb000001-0000-0000-0000-000000000004',  -- optimism
    'Uniswap V3',
    'uniswap_v3',
    '{
      "factory": "0x1F98431c8aD98523631AE4a59f267346ea31F984",
      "swap_router_02": "0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45"
    }',
    '3.0',
    '{"docs": "https://docs.uniswap.org/contracts/v3/reference/overview", "audited": true}'
  ),
  (
    'cc000001-0000-0000-0000-000000000010',
    'bb000001-0000-0000-0000-000000000005',  -- polygon
    'Uniswap V3',
    'uniswap_v3',
    '{
      "factory": "0x1F98431c8aD98523631AE4a59f267346ea31F984",
      "swap_router_02": "0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45"
    }',
    '3.0',
    '{"docs": "https://docs.uniswap.org/contracts/v3/reference/overview", "audited": true}'
  )
ON CONFLICT (id) DO NOTHING;
