#!/usr/bin/env node
/**
 * Issue 06 — The exported market-type guards reject every market that
 * `loadMarkets()` produces.
 *
 * `isPerpMarket` / `isSpotMarket` / `isBinaryMarket` are typed `(m: Market)`
 * and test `m.marketType` — the RAW indexer row. `exchange.markets` holds
 * `UnifiedMarket` rows, which carry `type` instead. Calling the documented
 * guards on the documented collection returns false for all 30 markets.
 *
 * Run: node evidence/06-market-guards/repro.mjs
 */
import { isPerpMarket, isSpotMarket, isBinaryMarket } from '@somnia-chain/markets-sdk';
import { makeExchange } from '../../audit.config.mjs';

const ex = makeExchange();
await ex.loadMarkets();

const markets = Object.values(ex.markets);
const counts = { perp: 0, spot: 0, binary: 0 };
for (const m of markets) {
  if (isPerpMarket(m)) counts.perp++;
  if (isSpotMarket(m)) counts.spot++;
  if (isBinaryMarket(m)) counts.binary++;
}

const byType = markets.reduce((acc, m) => ((acc[m.type] = (acc[m.type] ?? 0) + 1), acc), {});
const sample = markets.find((m) => m.type === 'swap');

console.log('exchange.markets            ', markets.length, JSON.stringify(byType));
console.log('isPerpMarket  matches       ', counts.perp);
console.log('isSpotMarket  matches       ', counts.spot);
console.log('isBinaryMarket matches      ', counts.binary);
console.log('');
console.log('sample unified row: .type        =', sample.type);
console.log('sample unified row: .marketType  =', sample.marketType);
console.log('sample raw row:     .marketType  =', sample.info.marketType);
console.log('isPerpMarket(unified row)        =', isPerpMarket(sample));
console.log('isPerpMarket(unified row.info)   =', isPerpMarket(sample.info));

const total = counts.perp + counts.spot + counts.binary;
console.log(
  `\nRESULT: ${total}/${markets.length} markets match any of the three guards, ` +
    `although every row has a valid .type.`,
);
process.exit(total === 0 ? 0 : 1);
