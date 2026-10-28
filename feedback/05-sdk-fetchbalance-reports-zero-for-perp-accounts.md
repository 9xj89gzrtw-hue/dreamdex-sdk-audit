# SDK: `fetchBalance()` returns `total: 0` for USDso on an account holding 1.43M USDso of perp collateral
Severity: normal
Area: SDK (`fetchBalance`)

> **Summary.** The probe account holds `1,425,758.80` USDso of cross-margin equity across 21 pools
> (`MarginBank.getMarginAccount`, `marginStatus: "Healthy"`). `fetchBalance()` returns 26 currencies with
> `free = used = total = 0` on every one of them, including `USDso`. The read never touches the MarginBank — `add()` in
> `src/unified/exchange.ts:2783` sets `used: 0` unconditionally and only wallet/ERC-20/portfolio balances feed it — so
> the CCXT-shaped "what can I trade with" call answers zero for the only account type the perps product has.

**Environment.** Hideki testnet `50383`, SDK `0.32.1`, account `0x47537e3a3ea6e9391f3b26ea45618db6828c8bff`,
margin bank `0x478769E1177C0773c43A593DCCc4Ad15F15F1394`, 2026-10-28T06:45Z.

**Steps to reproduce.**

```bash
node evidence/05-balance-omits-margin/repro.mjs
```

**Expected.** Either `USDso.total` reflects cross-margin collateral, or the returned object carries an explicit marker
that perp margin is excluded, so a caller cannot mistake `0` for "no funds".

**Actual.**

```
currencies returned       26
currencies with any value 0
balance.USDso             {"free":0,"used":0,"total":0,"byChain":{"50383":{...}}}

MarginBank.getMarginAccount:
  equity                  1424347.51 USDso
  unlockedCollateral      1409435.08 USDso
  lockedCollateral        132599.66 USDso
  activePerpPools         21
  marginStatus            Healthy
```

**Why it matters.** The docstring does say "wallet balances", and it is true that collateral lives in the MarginBank
rather than the wallet — but `fetchBalance()` is the only balance entry point on the unified exchange, and its shape
(`free`/`used`/`total` per currency) invites exactly the wrong inference. `src/balances.ts:5-6` notes that "margin
collateral is perp/margin.ts", i.e. the split is deliberate; the problem is that the unified caller has no equivalent.
A bot that gates order size on `(await exchange.fetchBalance()).USDso.free` concludes it can trade nothing, and pays an
RPC round-trip per market to discover otherwise.

**Evidence.** `evidence/05-balance-omits-margin/repro.mjs` and `output.txt`. Note the indexer's `Portfolio` operation
intermittently answers `database query error` (observed twice during this audit, both times recovering on retry); the
repro retries so that this finding is about the balance shape, not indexer availability.

**Fix.** Add a perp-margin entry to `UnifiedBalances` (e.g. `USDso.margin = { free, locked, equity }` sourced from
`getMarginAccount`), or a documented `fetchPerpBalance()` that returns `equity`/`lockedCollateral`/`withdrawable`. If
neither, put the exclusion in the field docs, not only in the method docstring.
