# SDK: `fetchOHLCV` treats `since` as a post-filter, so candles older than the newest `limit` buckets are unreachable
Severity: major
Area: SDK (`fetchOHLCV`)

> **Summary.** `fetchOHLCV(ref, timeframe, since, limit)` passes only `{ limit, market }` to `getCandles`
> (`src/unified/exchange.ts:2451`) and then filters the returned rows with `row[0] >= since` (line 2458). `getCandles`
> already supports `from`/`to` (`src/candles.ts:90-92`) but `fetchOHLCV` never passes `since` as `from`, so every call
> returns the **newest** `limit` buckets and `since` only trims that page. There is no `until`/cursor parameter, so a
> window older than `limit` intervals cannot be read at all. `fetchFundingRateHistory` in the same exchange *does* use
> `since` as a cursor and starts exactly at the requested instant — the two reads disagree on what the third positional
> argument means.

**Environment.** Hideki testnet `50383`, SDK `0.32.1`, `BTC/USDso:USDso`, 2026-10-28T05:40Z.

**Steps to reproduce.**

```bash
node evidence/03-since-not-a-cursor/repro.mjs
```

**Expected.** CCXT-style paging: `since` selects the start of the window and `limit` bounds how many buckets are
returned from there, so `fetchOHLCV("1h", now - 7d, 5)` starts seven days ago.

**Actual.**

```
(a) fetchOHLCV("1h", since=-7d, limit=5)
    requested from  2026-10-21T05:00:00.000Z
    got             5 rows, 2026-10-28T01:00:00.000Z -> 2026-10-28T05:00:00.000Z
    skipped         6.8 days of requested history

(b) fetchOHLCV("1m", since=-2d, limit=1000)
    requested span  48.0h
    got span        17.0h (2026-10-27T12:42:00.000Z -> 2026-10-28T05:40:00.000Z)
    unreachable     31.0 h of the requested window

(c) fetchFundingRateHistory(since=-7d, limit=3)
    got             3 rows, 2026-10-21T06:11:43.000Z -> 2026-10-21T08:11:43.000Z
    starts at the requested instant? YES
```

**Why it matters.** A backtest or an incident replay asks for a historical window and silently gets the most recent one
instead. At the default `limit = 500` the reachable history is 8.3 hours of `1m` candles, 20.8 days of `1h` candles and
500 days of `1d` candles — so `1m` and `5m` research is capped at hours no matter what `since` says. Nothing throws and
nothing warns; the returned array is well-formed and plausible.

**Root cause.** The plumbing exists one layer down and is simply not used:

```ts
// src/unified/exchange.ts:2451
const rows = await this.engineOf(t).getCandles(t.pool, interval, { limit, market: t.market.id });
// ...
// src/unified/exchange.ts:2458
.filter((row) => since === undefined || row[0] >= since);
```

`getCandles` accepts `opts.from` (converted to `bucketStart: { _gte: … }`) and `opts.to`, so the intended query is
already expressible.

**Evidence.** `evidence/03-since-not-a-cursor/repro.mjs` and `output.txt`.

**Fix.** Pass `from: Math.floor(since / 1000)` (the query's unit) when `since` is defined, and keep the post-filter only
as a safety net. Document that `limit` counts buckets from `since`, and add an `until` if forward paging is needed.
