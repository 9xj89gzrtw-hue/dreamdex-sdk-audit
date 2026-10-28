# SDK: `isPerpMarket` / `isSpotMarket` / `isBinaryMarket` return `false` for all 30 markets in `exchange.markets`
Severity: normal
Area: SDK (market guards)

> **Summary.** The three exported guards are typed `(m: Market)` and test `m.marketType` — the raw indexer row
> (`src/markets.ts:481`, `:503`, `:512`). `exchange.markets` holds `UnifiedMarket` rows, which carry `type` instead.
> Called on the collection the docs introduce them beside, all three return `false` for every market:
> `0/30` matched on a fully loaded exchange (21 swap, 3 spot, 6 binary). `isPerpMarket(market.info)` returns `true`,
> which pins the mismatch to the two different `Market` shapes sharing one name.

**Environment.** Hideki testnet `50383`, SDK `0.32.1`, 2026-10-28T06:40Z.

**Steps to reproduce.**

```bash
node evidence/06-market-guards/repro.mjs
```

**Expected.** A guard named `isPerpMarket` narrows the perp members of whatever market union the exchange exposes, or
throws when handed a shape it does not understand. Silently returning `false` for a valid perp is the worst option: a
filter written as `markets.filter(isPerpMarket)` yields an empty list with no error.

**Actual.**

```
exchange.markets             30 {binary: 6, swap: 21, spot: 3}
isPerpMarket  matches        0
isSpotMarket  matches        0
isBinaryMarket matches       0

sample unified row: .type        = swap
sample unified row: .marketType  = undefined
sample raw row:     .marketType  = PERP
isPerpMarket(unified row)      = false
isPerpMarket(unified row.info) = true
```

**Why it matters.** `docs/PERPS.md` opens with "`Market` is a three-way discriminated union — `SpotMarket | PerpMarket |
BinaryMarket`, keyed on `marketType` (guards: `isSpotMarket` / `isPerpMarket` / `isBinaryMarket`)" and then tells
readers to iterate `exchange.markets`. Those are two different unions with two different discriminants. TypeScript
catches the call at compile time; plain JavaScript — including every `node script.mjs` probe in the official docs —
gets a silent `false`. The bug class is a footgun that produces an empty result rather than an error.

**Evidence.** `evidence/06-market-guards/repro.mjs` and `output.txt`.

**Fix.** Either accept `Market | UnifiedMarket` and branch on `"type" in m ? m.type : m.marketType`, or export
`isPerpUnifiedMarket`-style guards for the unified union and rename the raw ones to make the distinction explicit.
