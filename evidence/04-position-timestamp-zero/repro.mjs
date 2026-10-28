#!/usr/bin/env node
/**
 * Issue 04 — `UnifiedPosition.timestamp` is always 0, and `datetime` is always
 * "1970-01-01T00:00:00.000Z", including on a position that traded seconds ago.
 *
 * Documented as "When the position last changed on-chain (ms)".
 * Root cause: PerpPool.getPosition() returns `lastUpdatedTimestampNs`, and that
 * field is 0 for every account/pool pair, so the SDK publishes the uint64
 * sentinel as a real Unix millisecond timestamp.
 *
 * Run: node evidence/04-position-timestamp-zero/repro.mjs
 */
import { createPublicClient, http, parseAbi } from 'viem';
import { makeExchange, perpMarkets, ACTIVE_ACCOUNT, ADDRESSES, RPC } from '../../audit.config.mjs';

const ABI = parseAbi([
  'function getPosition(address account, address perpPool) view returns ((int128 size, uint128 avgEntryPrice, int256 entryFundingIndex, uint64 lastUpdatedTimestampNs))',
]);

const rpc = createPublicClient({ transport: http(RPC) });
const ex = makeExchange({ account: ACTIVE_ACCOUNT });
await ex.loadMarkets();

const symbol = perpMarkets(ex).find((m) => m.symbol.startsWith('BTC/')).symbol;
const market = ex.markets[symbol];
const pool = market.info.poolAddress;

const position = (await ex.fetchPositions()).find((p) => p.symbol === symbol);
const raw = await rpc.readContract({
  address: ADDRESSES.marginBank,
  abi: ABI,
  functionName: 'getPosition',
  args: [ACTIVE_ACCOUNT, pool],
});

// The account traded this pool seconds ago; that is what "last changed" means.
const trades = await ex.fetchMyTrades(symbol, Date.now() - 7 * 86400_000, 1);
const lastTrade = trades[0];

console.log('account                 ', ACTIVE_ACCOUNT);
console.log('market                  ', symbol);
console.log('position size (raw)     ', raw.size.toString());
console.log('lastUpdatedTimestampNs  ', raw.lastUpdatedTimestampNs.toString(), '<- contract value');
console.log('UnifiedPosition.timestamp', position.timestamp, '<- SDK value');
console.log('UnifiedPosition.datetime ', position.datetime);
console.log(
  'newest fill on this pool ',
  lastTrade ? new Date(lastTrade.timestamp).toISOString() : 'n/a',
  lastTrade ? `(${lastTrade.side} ${lastTrade.amount})` : '',
);

const bad = raw.lastUpdatedTimestampNs === 0n && position.timestamp === 0;
console.log(
  `\nRESULT: the position last changed at ${lastTrade ? new Date(lastTrade.timestamp).toISOString() : 'n/a'}, ` +
    `yet both the contract field and UnifiedPosition.timestamp read ${position.timestamp} ` +
    `(${position.datetime}).`,
);
process.exit(bad ? 0 : 1);
