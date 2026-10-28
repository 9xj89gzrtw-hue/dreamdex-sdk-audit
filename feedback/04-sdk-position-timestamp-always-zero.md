# SDK: `UnifiedPosition.timestamp` is always `0`, so `datetime` is always `1970-01-01T00:00:00.000Z`
Severity: normal
Area: SDK (`fetchPositions`)

> **Summary.** `UnifiedPosition.timestamp` is documented as "When the position last changed on-chain (ms)". It is `0`
> for every position of every account tested, including a position whose pool filled seconds earlier. The cause is
> upstream: `PerpPool.getPosition()` returns `lastUpdatedTimestampNs` and that field is `0` for every account/pool pair
> sampled, so the contract never maintains it. The SDK reads it straight through
> (`src/accountView/positionsRead.ts:521`, `src/perp/state.ts:503`) and publishes the `uint64` sentinel as a real Unix
> millisecond timestamp instead of omitting the field.

**Environment.** Hideki testnet `50383`, SDK `0.32.1`, margin bank `0x478769E1177C0773c43A593DCCc4Ad15F15F1394`,
account `0x47537e3a3ea6e9391f3b26ea45618db6828c8bff`, 2026-10-28T05:39Z.

**Steps to reproduce.**

```bash
node evidence/04-position-timestamp-zero/repro.mjs
```

**Expected.** Either a real millisecond timestamp of the last change, or `timestamp`/`datetime` absent — the same
treatment `markPrice` and `unrealizedPnl` already get when `perpState` is `"degraded"`. `1970-01-01` is not a valid
answer to "when did this change".

**Actual.**

```
account                   0x47537e3a3ea6e9391f3b26ea45618db6828c8bff
market                    BTC/USDso:USDso
position size (raw)       -9913878000
lastUpdatedTimestampNs    0        <- contract value
UnifiedPosition.timestamp 0        <- SDK value
UnifiedPosition.datetime  1970-01-01T00:00:00.000Z
newest fill on this pool  2026-10-28T05:39:46.000Z (sell 0.01237)
```

The account sold into this pool at `05:39:46Z`; the position is open (`size = -99.13878 BTC` at 8 decimals) and the
timestamp still reads the epoch.

**Why it matters.** Position age is the cheapest staleness signal a UI or a monitor has: "this row is 56 years old" is
indistinguishable from "this row never loaded". A consumer that sorts by age, greys out stale rows, or discards
positions older than N minutes either hides every real position or shows every one of them as ancient. `0` also
survives `Number.isFinite`, so it passes value checks that absence would fail.

**Evidence.** `evidence/04-position-timestamp-zero/repro.mjs` and `output.txt`; on-chain read via
`getPosition(address,address)` on the margin bank, same struct the SDK maps.

**Fix.** Treat `lastUpdatedTimestampNs === 0n` as "unknown" and omit `timestamp`/`datetime`, matching the existing
`perpState: "degraded"` convention. Longer term, have `PerpPool` write the field on every size change so the documented
field has data behind it.
