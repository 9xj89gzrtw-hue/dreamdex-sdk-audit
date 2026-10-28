# Docs: the "Open interest cap" table understates the cap the chain enforces by exactly 2x or 4x on 20 of 21 perp markets
Severity: normal
Area: Docs / risk parameters

> **Summary.** `https://dreamdex.io/trading/perps-testnet` publishes a per-market "Open interest cap". Read the same
> parameter from the chain (`PerpPool.getPerpPoolParameters().maxOpenInterest`, exposed to SDK users as
> `client.getPerpRiskParams(pool).maxOpenInterest`) and the two disagree on every perp market except TAO. The ratio is
> exactly `2.0` on BTC, ETH, SOL and HYPE and exactly `4.0` on the other sixteen — a clean parameter split, not drift
> from trading. The docs also state the per-account cap is "a tenth of the market's open interest cap"; on BTC the chain
> allows `maxPositionSize = 100 BTC`, which is 20.3% of the enforced cap, not 10%.

**Environment.** Somnia Hideki testnet, chain id `50383`; `@somnia-chain/markets-sdk@0.32.1` (npm `latest` on
2026-10-28); docs page fetched 2026-10-28T05:37Z.

**Steps to reproduce.**

```bash
node evidence/01-oi-cap-docs/repro.mjs     # prints docs vs chain for all 21 markets
```

**Expected.** The published cap equals `maxOpenInterest / 10^baseDecimals` for each market, and the "tenth" rule
describes `maxPositionSize`.

**Actual.** 20 of 21 markets differ:

| Market | Docs cap | On-chain cap | Ratio |
|---|---:|---:|---:|
| BTC | 246.81545 | 493.6309 | 2x |
| ETH | 3,995.6125 | 7,991.225 | 2x |
| SOL | 47,654.44 | 95,308.88 | 2x |
| HYPE | 23,812.72 | 47,625.44 | 2x |
| XRP | 344,632 | 1,378,528 | 4x |
| ADA | 2,254,678 | 9,018,712 | 4x |
| ZEC | 420 | 1,680 | 4x |
| DOGE | 5,613,590 | 22,454,360 | 4x |
| TAO | 2,185.491 | 2,185.491 | 1x |

`TAO` matching exactly is what rules out a stale snapshot: if the table were merely old, every market would drift by a
different, activity-dependent amount. Two constant multipliers mean the table and the pools were initialised from
different parameter sets.

**Why it matters.** The table is the only published per-market risk limit. Any sizing model, stress test, exposure
dashboard or counterparty report built from it is wrong by 2–4x, and the documented per-account rule no longer predicts
`maxPositionSize`.

**Evidence.** `evidence/01-oi-cap-docs/repro.mjs` and `output.txt`; docs table extracted verbatim from the page;
on-chain values from `client.getPerpRiskParams` for all 21 pools.

**Fix.** Regenerate the table from `getPerpPoolParameters()` at docs build time, or state the block at which it was
captured and re-publish it whenever a pool's parameters change.
