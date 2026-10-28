# SDK: `fetchTicker().statsAsOf` is a timestamp in the future, so freshness checks on the 24h statistics can never fire
Severity: normal
Area: SDK (`fetchTicker`)

> **Summary.** `UnifiedTicker.statsAsOf` is documented as "The end of the window the 24h statistics were folded over
> (ms)" and "the statistics' own as-of", and `lastSource` is documented to be read "against `statsAsOf`". It is computed
> at `src/unified/exchange.ts:2642` as `(Number(lastCandle.bucketStart) + 3600) * 1000` — the **end** of the hourly
> bucket that is still open. During the current hour that instant is in the future (observed: `+1280.1s`), so
> `Date.now() - statsAsOf` is negative and every staleness guard reads "fresh". The folded 24h `baseVolume`, `high` and
> `low` also include that still-forming bucket, which the field does not disclose.

**Environment.** Hideki testnet `50383`, SDK `0.32.1`, `BTC/USDso:USDso`, 2026-10-28T05:38:39Z.

**Steps to reproduce.**

```bash
node evidence/02-statsasof-future/repro.mjs
```

**Expected.** A field described as the statistics' as-of is a wall-clock instant at or before `Date.now()`, so
`now - statsAsOf` is a usable age.

**Actual.**

```
wall clock (now)   2026-10-28T05:38:39.867Z
last 1h bucket     2026-10-28T05:00:00.000Z
ticker.statsAsOf   2026-10-28T06:00:00.000Z
statsAsOf - now    +1280.1s
naive age now-AsOf -1280.1s    (negative => "fresh")
statsState         ok
baseVolume         1476.00306  (includes the still-open bucket)
```

**Why it matters.** The documented use is staleness detection: show a banner, widen a spread, or refuse to quote when
the 24h block is old. With a future `statsAsOf` that branch is unreachable, and the failure is silent — the number looks
right, it is just never considered stale.

**Evidence.** `evidence/02-statsasof-future/repro.mjs` and `output.txt`.

**Fix.** Publish the newest candle's `bucketStart` (the last observation) rather than `bucketStart + interval`, or add a
separate `statsWindowEnd` and document `statsAsOf` as an exclusive bound. Either way, state whether the open bucket is
included in `baseVolume`/`high`/`low`.
