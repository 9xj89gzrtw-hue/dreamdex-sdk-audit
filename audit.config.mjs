// Shared, read-only configuration for every repro in this repository.
// Everything here is public testnet infrastructure; no keys, no writes.
import { SomniaMarkets, SOMNIA_HIDEKI_TESTNET_ADDRESSES } from '@somnia-chain/markets-sdk';
import { hidekiTestnet } from '@somnia-chain/markets-sdk/chains';

export const SDK_VERSION = '0.32.1';
export const CHAIN_ID = 50383;
export const INDEXER = 'https://hideki-dev.smk.somnia.host/v1/graphql';
export const RPC = 'https://api.hideki2.infra.testnet.somnia.network';
export const WS = 'wss://api.hideki2.infra.testnet.somnia.network/ws';
export const ADDRESSES = SOMNIA_HIDEKI_TESTNET_ADDRESSES;

// A real, active testnet account used by the bounty's own demo data:
// 21 open perp positions, ~1.4M USDso cross-margin collateral.
export const ACTIVE_ACCOUNT = '0x47537e3a3ea6e9391f3b26ea45618db6828c8bff';

export function makeExchange({ account } = {}) {
  return new SomniaMarkets({
    indexerUrl: INDEXER,
    chain: hidekiTestnet,
    wsRpcUrl: WS,
    addresses: ADDRESSES,
    ...(account ? { account } : {}),
  });
}

export function perpMarkets(exchange) {
  return Object.values(exchange.markets).filter((m) => m.type === 'swap');
}

/**
 * The public Hideki indexer intermittently answers the `Portfolio` operation
 * with a Hasura "database query error". Retry so a repro reports the SDK's
 * behaviour rather than the indexer's availability.
 */
export async function retry(fn, attempts = 6, delayMs = 1500) {
  let last;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      last = err;
      if (i < attempts - 1) await new Promise((r) => setTimeout(r, delayMs));
    }
  }
  throw last;
}
