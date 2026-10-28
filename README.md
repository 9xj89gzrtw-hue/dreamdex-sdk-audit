# dreamDEX Perps SDK — read-only audit

Six reproducible defects in `@somnia-chain/markets-sdk@0.32.1` and the perps
documentation that ships with it.

Every finding below has a runnable script under `evidence/` and a captured
console transcript in the same folder. Nothing here writes to the chain, moves
funds, or touches an account you do not own: all reads are against the public
Hideki testnet (chain id `50383`).

- SDK: `@somnia-chain/markets-sdk@0.32.1` (npm)
- Network: Hideki testnet, chain id `50383`
- Indexer: `https://hideki-dev.smk.somnia.host/v1/graphql`
- RPC: `https://api.hideki2.infra.testnet.somnia.network`
- Probe account: `0x47537e3a3ea6e9391f3b26ea45618db6828c8bff`
  (21 open perp positions, ~1.43M USDso cross-margin collateral)

## Reproduce

```bash
npm install
node evidence/01-oi-cap-docs/repro.mjs
node evidence/02-statsasof-future/repro.mjs
node evidence/03-since-not-a-cursor/repro.mjs
node evidence/04-position-timestamp-zero/repro.mjs
node evidence/05-balance-omits-margin/repro.mjs
node evidence/06-market-guards/repro.mjs
```

Each script prints the observed values next to the documented/expected ones and
exits `0` when the defect reproduces. `evidence/*/output.txt` is the transcript
from the run committed with this repository.

## Summary

| # | Severity | Area | Finding |
|---|----------|------|---------|
| 01 | Medium | docs / risk params | Published open-interest cap is 2x or 4x lower than the cap the chain enforces, for 20 of 21 perp markets |
| 02 | Medium | `fetchTicker` | `statsAsOf` is a timestamp **in the future** (end of the still-open candle bucket), so staleness checks never fire |
| 03 | High | `fetchOHLCV` | `since` is a post-filter, not a cursor: candles older than the newest `limit` buckets are unreachable; a 48h request over `1m` returns 17h |
| 04 | Medium | `fetchPositions` | `UnifiedPosition.timestamp` is always `0` and `datetime` is always `1970-01-01`, including on a position filled seconds earlier |
| 05 | Medium | `fetchBalance` | Reports `total: 0` for USDso on an account holding 1.43M USDso of margin; no unified read exposes perp collateral |
| 06 | Low | market guards | `isPerpMarket` / `isSpotMarket` / `isBinaryMarket` match **0 of 30** `exchange.markets` rows |

## Findings

### 01 — The published open-interest cap is 2x/4x wrong on 20 of 21 markets

`https://dreamdex.io/trading/perps-testnet` publishes an "Open interest cap"
column. `PerpPool.getPerpPoolParameters().maxOpenInterest` disagrees with it on
every market except TAO, and the ratio is exactly 2.0 or 4.0:

| Market | Docs cap | On-chain cap | Ratio |
|---|---:|---:|---:|
| BTC | 246.81545 | 493.6309 | 2x |
| ETH | 3,995.6125 | 7,991.225 | 2x |
| SOL | 47,654.44 | 95,308.88 | 2x |
| HYPE | 23,812.72 | 47,625.44 | 2x |
| XRP | 344,632 | 1,378,528 | 4x |
| ADA | 2,254,678 | 9,018,712 | 4x |
| ZEC | 420 | 1,680 | 4x |
| TAO | 2,185.491 | 2,185.491 | 1x |

The clean 2x/4x pattern on 20 markets plus one exact match is not drift from
trading activity: these are two different parameter sets. Any sizing model,
stress test or risk dashboard built from the published table is wrong by that
factor, and the documented rule "a tenth of the market's open interest cap" no
longer describes `maxPositionSize` either (`BTC` allows 100 BTC per account,
20.3% of the enforced cap, not 10%).

Evidence: `evidence/01-oi-cap-docs/`.

### 02 — `fetchTicker().statsAsOf` is in the future

`statsAsOf` is documented as "the end of the window the 24h statistics were
folded over" and "the statistics' own as-of", to be compared against
`lastSource.timestamp` for freshness. It is computed as
`(lastCandle.bucketStart + 3600) * 1000`, i.e. the **end** of the hourly bucket
that is still open. Observed: `statsAsOf = 2026-10-28T06:00:00Z` at
`05:38:39Z`, 21 minutes ahead of wall clock.

Consequences: `Date.now() - statsAsOf` is negative, so any staleness guard reads
"fresh"; and the 24h `baseVolume`/`high`/`low` include the still-forming bucket,
which the field does not disclose.

Evidence: `evidence/02-statsasof-future/`.

### 03 — `fetchOHLCV` cannot reach anything older than `limit` buckets

`getCandles(pool, interval, { limit })` always returns the **newest** `limit`
buckets and `since` is applied afterwards as a filter. The requested window is
silently replaced by "the last `limit` buckets", and there is no `until` /
cursor parameter to page backwards.

Observed:

- `fetchOHLCV("1h", since = now − 7d, limit = 5)` returns the five newest hours,
  skipping 6.8 days of the requested history.
- `fetchOHLCV("1m", since = now − 2d, limit = 1000)` returns 17.0 hours of the
  requested 48; the other 31 hours are unreachable at any `limit`.

`fetchFundingRateHistory(since, limit)` on the same exchange **does** treat
`since` as a cursor and starts exactly at the requested instant, so the two
reads disagree on what the third positional argument means.

Evidence: `evidence/03-since-not-a-cursor/`.

### 04 — `UnifiedPosition.timestamp` is always 0

Documented as "When the position last changed on-chain (ms)". The probe account
sold BTC at `2026-10-28T05:39:46Z`; `fetchPositions()` still reports
`timestamp: 0` and `datetime: "1970-01-01T00:00:00.000Z"`.

Root cause is upstream: `PerpPool.getPosition()` returns
`(int128 size, uint128 avgEntryPrice, int256 entryFundingIndex,
uint64 lastUpdatedTimestampNs)` and `lastUpdatedTimestampNs` is `0` for every
account/pool pair tested. The SDK then publishes that `uint64` sentinel as a
real Unix millisecond timestamp instead of omitting the field.

Evidence: `evidence/04-position-timestamp-zero/`.

### 05 — `fetchBalance()` reports zero for a funded perp account

The probe account holds `1,425,758.80` USDso of cross-margin equity across 21
pools (`MarginBank.getMarginAccount`, `marginStatus: "Healthy"`).
`fetchBalance()` returns 26 currencies, **all** with `free = used = total = 0`,
including `USDso`.

The docstring says "wallet balances", and collateral really does live in the
MarginBank rather than the wallet — but the unified balance shape has no
perp-margin figure at all, and nothing in the returned object marks the omission.
A bot that gates order size on `(await exchange.fetchBalance()).USDso.free`
concludes it can trade nothing.

Evidence: `evidence/05-balance-omits-margin/`.

### 06 — The market-type guards reject every unified market

`isPerpMarket` / `isSpotMarket` / `isBinaryMarket` are typed `(m: Market)` and
test `m.marketType` — the raw indexer row. `exchange.markets` holds
`UnifiedMarket` rows keyed on `type`. On the loaded exchange:

```
exchange.markets              30 {binary: 6, swap: 21, spot: 3}
isPerpMarket  matches          0
isSpotMarket  matches          0
isBinaryMarket matches         0
```

`isPerpMarket(market.info)` returns `true`, which identifies the mismatch. The
docs introduce the guards in the same breath as the market union, so the
collision between the two `Market` shapes is easy to walk into. TypeScript
catches it at compile time; plain JavaScript does not, and the runtime answer is
a silent `false` rather than a throw.

Evidence: `evidence/06-market-guards/`.

## Checked and found correct

These were probed and did **not** reproduce, so they are not claimed as bugs:

- Funding-rate scale and sign: `fetchFundingRate` and `fetchTicker` both report
  the same per-8h value, and `fetchFundingRateHistory` continues that axis.
- PnL sign for shorts: `unrealizedPnl` is correct on all 21 open positions.
- `precision.price` / `precision.amount` match `tickSize` / `lotSize` on all 21
  perp markets, and `priceToPrecision` / `amountToPrecision` truncate toward zero.
- `getMaxPerpOrderSize` at the reported `maxQuantity` is accepted by
  `previewPerpOrderMargin` (`sufficient: true`), as documented.
- `fetchTrades(since, limit)` is correct: eligible rows are a prefix of the
  newest-first page, so post-filtering cannot under-deliver.
- `fetchStatus()` returning `"ok"` with `watchCount: 0` matches its docstring.
- `fetchOpenOrders()` mapped all 179 resting orders with valid
  symbol/side/price/amount/remaining.

Two transient indexer failures were seen (`indexer Portfolio failed: database
query error`) and are reported separately as operational instability, not as a
code defect: both calls succeeded on retry.

## Scope and disclosure

Read-only. No private keys, no signed transactions, no state changes. Findings
were produced against public testnet endpoints between 2026-10-27 and
2026-10-28. Not affiliated with Somnia or dreamDEX.
