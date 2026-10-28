#!/usr/bin/env node
/**
 * Issue 02 — `fetchTicker().statsAsOf` is a timestamp in the FUTURE.
 *
 * Documented as "The end of the window the 24h statistics were folded over (ms)"
 * and "the statistics' own as-of", which readers are told to use for freshness
 * ("Read it against statsAsOf, not against timestamp").
 *
 * Implemented as `(lastCandle.bucketStart + 3600) * 1000` — the END of the
 * still-open hourly bucket. Whenever the current hour is in progress, that is
 * up to 59m59s ahead of wall-clock time, so any `now - statsAsOf` staleness
 * check returns a negative age and never fires.
 *
 * Run: node evidence/02-statsasof-future/repro.mjs
 */
import { makeExchange, perpMarkets } from '../../audit.config.mjs';

const ex = makeExchange();
await ex.loadMarkets();
const symbol = perpMarkets(ex).find((m) => m.symbol.startsWith('BTC/')).symbol;

const ticker = await ex.fetchTicker(symbol);
const now = Date.now();
const candles = await ex.fetchOHLCV(symbol, '1h', undefined, 3);
const lastBucketStart = candles.at(-1)[0];

const ageMs = now - ticker.statsAsOf;
const aheadMs = ticker.statsAsOf - now;

console.log('symbol            ', symbol);
console.log('wall clock (now)  ', new Date(now).toISOString());
console.log('last 1h bucket    ', new Date(lastBucketStart).toISOString());
console.log('ticker.statsAsOf  ', new Date(ticker.statsAsOf).toISOString());
console.log('statsAsOf - now   ', `${(aheadMs / 1000).toFixed(1)}s`);
console.log('naive age now-AsOf', `${(ageMs / 1000).toFixed(1)}s`, '(negative => "fresh")');
console.log('statsState        ', ticker.statsState);
console.log('baseVolume        ', ticker.baseVolume, '(includes the still-open bucket)');
console.log(
  '\nRESULT: statsAsOf is',
  aheadMs > 0 ? `${(aheadMs / 1000).toFixed(1)}s IN THE FUTURE` : 'in the past',
  '=> a documented as-of timestamp cannot be used to detect staleness.',
);
process.exit(aheadMs > 0 ? 0 : 1);
