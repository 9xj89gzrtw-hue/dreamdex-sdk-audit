# dreamDEX Perps — feedback track: 6 reproducible reports

Six read-only reports on `@somnia-chain/markets-sdk@0.32.1`, the dreamDEX perps documentation and
the Hideki testnet it points at. One major, five normal. Each report has a one-command
reproduction and a saved console transcript.

- Network: Somnia Hideki testnet, chain id `50383` (the docs and SDK call it "Hideki")
- SDK: `@somnia-chain/markets-sdk@0.32.1`, npm `latest` as of 2026-10-28
- Docs: `https://dreamdex.io/trading/perps-testnet`, `https://app.dreamdex.io/docs`
- Indexer: `https://hideki-dev.smk.somnia.host/v1/graphql`
- RPC: `https://api.hideki2.infra.testnet.somnia.network`
- Probe account: `0x47537e3a3ea6e9391f3b26ea45618db6828c8bff` — 21 open perp positions,
  179 resting orders, ~1.43M USDso cross-margin collateral, `marginStatus: Healthy`
- Reproduced: 2026-10-27 and again 2026-10-28, 05:30–06:50 UTC

## Reports

| # | Sev | Area | Report |
|---|-----|------|--------|
| 01 | normal | Docs / risk params | [Open-interest cap table is 2x/4x wrong on 20 of 21 markets](feedback/01-docs-open-interest-cap-2x-4x-wrong.md) |
| 02 | normal | SDK `fetchTicker` | [`statsAsOf` is a timestamp in the future](feedback/02-sdk-ticker-statsasof-in-the-future.md) |
| 03 | **major** | SDK `fetchOHLCV` | [`since` is a post-filter, not a cursor — history older than `limit` buckets is unreachable](feedback/03-sdk-fetchohlcv-since-is-not-a-cursor.md) |
| 04 | normal | SDK `fetchPositions` | [`timestamp` is always 0, `datetime` always 1970-01-01](feedback/04-sdk-position-timestamp-always-zero.md) |
| 05 | normal | SDK `fetchBalance` | [Returns `total: 0` for USDso on an account with 1.43M USDso of margin](feedback/05-sdk-fetchbalance-reports-zero-for-perp-accounts.md) |
| 06 | normal | SDK guards | [`isPerpMarket`/`isSpotMarket`/`isBinaryMarket` match 0 of 30 markets](feedback/06-sdk-market-guards-reject-unified-markets.md) |

## Quick start

```bash
npm install
./run-all.sh          # runs every repro, refreshes evidence/*/output.txt
```

```
01-oi-cap-docs                     reproduced
02-statsasof-future                reproduced
03-since-not-a-cursor              reproduced
04-position-timestamp-zero         reproduced
05-balance-omits-margin            reproduced
06-market-guards                   reproduced
```

Individual repros:

```bash
node evidence/01-oi-cap-docs/repro.mjs
node evidence/02-statsasof-future/repro.mjs
node evidence/03-since-not-a-cursor/repro.mjs
node evidence/04-position-timestamp-zero/repro.mjs
node evidence/05-balance-omits-margin/repro.mjs
node evidence/06-market-guards/repro.mjs
```

Every script asserts the defect and exits `0` when it reproduces, so the suite is a regression
test as well as evidence. `evidence/*/output.txt` are the transcripts committed with this repo.

## Checked and found correct

Probed and **not** claimed as bugs, so the list above is not padded:

- Funding scale and sign: `fetchFundingRate`, `fetchTicker().fundingRate` and
  `fetchFundingRateHistory` all agree on the same per-8h axis (`0.001425387556284271` at the time
  of the run), matching `fundingRate8h(fundingRate, fundingWindowSec)`.
- PnL sign on shorts: `unrealizedPnl` is correct on all 21 open positions, including a short whose
  mark moved both for and against it.
- `precision.price` / `precision.amount` equal `tickSize` / `lotSize` on all 21 perp markets, and
  `priceToPrecision` / `amountToPrecision` truncate toward zero.
- `getMaxPerpOrderSize` at its reported `maxQuantity` is accepted by `previewPerpOrderMargin`
  (`sufficient: true`, `placeable: true`), as documented.
- `fetchTrades(since, limit)` is correct: eligible rows are a prefix of the newest-first page, so
  post-filtering cannot under-deliver.
- `fetchStatus()` returning `"ok"` with `watchCount: 0` matches its docstring.
- `fetchOpenOrders()` mapped all 179 resting orders with valid symbol/side/price/amount/remaining.
- `getLiquidationPrice` and `fetchPositions().liquidationPrice` agree once both are read at the same
  block and in the same units.

## Operational note (not a report)

The public Hideki indexer answered `IndexerError: indexer Portfolio failed: database query error`
intermittently between 05:44Z and 06:44Z on 2026-10-28, failing `fetchBalance()` and
`fetchOpenOrders()` outright. 20 consecutive `fetchBalance()` calls across two accounts succeeded
after 06:44Z, so this is recorded as indexer availability rather than a code defect. The repro for
report 05 retries so its result is about the balance shape, not the outage.

## Scope

Read-only. No private keys, no signed transactions, no state changes, no funded accounts. Not
affiliated with Somnia or dreamDEX.
