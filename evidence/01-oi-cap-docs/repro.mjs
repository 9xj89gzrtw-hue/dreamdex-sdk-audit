#!/usr/bin/env node
/**
 * Issue 01 — The published "Open interest cap" column is 2x or 4x lower than
 * the cap the chain actually enforces, for 20 of the 21 perp markets.
 *
 * Source of the published numbers:
 *   https://dreamdex.io/trading/perps-testnet  (table "Open interest cap")
 * Source of the enforced numbers:
 *   PerpPool.getPerpPoolParameters().maxOpenInterest, read through the SDK client.
 *
 * Run: node evidence/01-oi-cap-docs/repro.mjs
 */
import { makeExchange, perpMarkets } from '../../audit.config.mjs';

// Verbatim from the docs table (whitespace normalised, thousands separators removed).
const DOCS_OI_CAP = {
  BTC: 246.81545, ETH: 3995.6125, HYPE: 23812.72, SOL: 47654.44, XRP: 344632,
  ADA: 2254678, AVAX: 66672.2, BNB: 693.975, DOGE: 5613590, LINK: 42643.6,
  NEAR: 250410, SUI: 635009, XLM: 2677780, '1000PEPE': 130285600, LIT: 138896.6,
  PUMP: 87993700, TAO: 2185.491, VVV: 21786.14, WLD: 1264000, ZEC: 420,
  ZRO: 250599.5,
};

const ex = makeExchange();
await ex.loadMarkets();

const rows = [];
for (const m of perpMarkets(ex)) {
  const base = m.symbol.split('/')[0];
  const p = await ex.client.getPerpRiskParams(m.info.poolAddress);
  const onchain = Number(p.maxOpenInterest) / 10 ** m.info.baseDecimals;
  const docs = DOCS_OI_CAP[base];
  const ratio = docs === undefined ? null : onchain / docs;
  rows.push({ base, docs, onchain, ratio });
}

const bad = rows.filter((r) => r.ratio !== null && Math.abs(r.ratio - 1) > 0.001);
console.log('market      docs cap          on-chain cap      on-chain/docs');
for (const r of rows) {
  const flag = r.ratio !== null && Math.abs(r.ratio - 1) > 0.001 ? '  <-- MISMATCH' : '';
  console.log(
    r.base.padEnd(11),
    String(r.docs).padStart(16),
    String(Number(r.onchain.toFixed(6))).padStart(17),
    String(r.ratio === null ? 'n/a' : r.ratio.toFixed(4)).padStart(13) + flag,
  );
}

const factors = [...new Set(bad.map((r) => Math.round(r.ratio)))].sort();
console.log(
  `\nRESULT: ${bad.length}/${rows.length} markets disagree with the published cap; ` +
    `observed factors: ${factors.join('x, ')}x.`,
);
console.log(
  `Only ${rows.length - bad.length} market (${rows
    .filter((r) => !bad.includes(r))
    .map((r) => r.base)
    .join(', ')}) still matches the docs.`,
);
process.exit(bad.length === 0 ? 1 : 0);
