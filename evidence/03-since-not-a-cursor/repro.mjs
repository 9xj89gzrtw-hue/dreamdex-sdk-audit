#!/usr/bin/env node
/**
 * Issue 03 — `fetchOHLCV`'s `since` is a post-filter, not a cursor: it cannot
 * reach candles older than the newest `limit` buckets.
 *
 * `getCandles(pool, interval, { limit })` always returns the NEWEST `limit`
 * buckets; `since` is applied afterwards. So the requested window is silently
 * replaced by "the last `limit` buckets", and there is no `until`/cursor to
 * page backwards through.
 *
 * Contrast: `fetchFundingRateHistory(since, limit)` in the same exchange DOES
 * use `since` as a cursor (pages from the requested instant forward). The two
 * reads disagree on what the third positional argument means.
 *
 * Run: node evidence/03-since-not-a-cursor/repro.mjs
 */
import { makeExchange, perpMarkets } from '../../audit.config.mjs';

const ex = makeExchange();
await ex.loadMarkets();
const symbol = perpMarkets(ex).find((m) => m.symbol.startsWith('BTC/')).symbol;
const now = Date.now();
const align = (t, tf) => Math.floor(t / tf) * tf;

// (a) Ask for the 5 hourly candles starting a week ago.
const since7d = now - 7 * 86400_000;
const hourly = await ex.fetchOHLCV(symbol, '1h', since7d, 5);
const expectedFirst = align(since7d, 3600_000);
console.log('(a) fetchOHLCV("1h", since=-7d, limit=5)');
console.log('    requested from ', new Date(expectedFirst).toISOString());
console.log('    got            ', hourly.length, 'rows,',
  new Date(hourly[0][0]).toISOString(), '->', new Date(hourly.at(-1)[0]).toISOString());
console.log('    skipped        ', ((hourly[0][0] - expectedFirst) / 86400_000).toFixed(1), 'days of requested history');

// (b) Ask for 1m candles covering the last two days.
const since2d = now - 2 * 86400_000;
const minute = await ex.fetchOHLCV(symbol, '1m', since2d, 1000);
const coveredHours = (minute.at(-1)[0] - minute[0][0]) / 3600_000;
console.log('\n(b) fetchOHLCV("1m", since=-2d, limit=1000)');
console.log('    requested span ', '48.0h');
console.log('    got span       ', coveredHours.toFixed(1) + 'h',
  `(${new Date(minute[0][0]).toISOString()} -> ${new Date(minute.at(-1)[0]).toISOString()})`);
console.log('    unreachable    ', (48 - coveredHours).toFixed(1), 'h of the requested window');

// (c) Same exchange, funding history, same argument position: honoured.
const funding = await ex.fetchFundingRateHistory(symbol, since7d, 3);
console.log('\n(c) fetchFundingRateHistory(since=-7d, limit=3)');
console.log('    got            ', funding.length, 'rows,',
  new Date(funding[0].timestamp).toISOString(), '->', new Date(funding.at(-1).timestamp).toISOString());
console.log('    starts at the requested instant?',
  Math.abs(funding[0].timestamp - since7d) < 3600_000 ? 'YES' : 'NO');

const broken = hourly[0][0] > expectedFirst + 3600_000 && coveredHours < 20;
console.log(
  `\nRESULT: OHLCV treats "since" as a tail filter (${coveredHours.toFixed(1)}h of 48h reachable), ` +
    `while funding history treats it as a cursor. Backfill older than \`limit\` buckets is impossible.`,
);
process.exit(broken ? 0 : 1);
