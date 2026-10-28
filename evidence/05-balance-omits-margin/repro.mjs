#!/usr/bin/env node
/**
 * Issue 05 — `fetchBalance()` reports `total: 0` for USDso on an account
 * holding seven figures of USDso cross-margin collateral.
 *
 * The docs describe fetchBalance as wallet balances, but the unified balance
 * shape has no perp-margin figure at all, so the CCXT-shaped "how much can I
 * trade with" read returns zero for the only account type the perps product
 * has. Nothing in the returned object says the collateral was excluded.
 *
 * Run: node evidence/05-balance-omits-margin/repro.mjs
 */
import { makeExchange, retry, ACTIVE_ACCOUNT, ADDRESSES } from '../../audit.config.mjs';

const ex = makeExchange({ account: ACTIVE_ACCOUNT });
await ex.loadMarkets();

const balance = await retry(() => ex.fetchBalance());
const usdso = balance.USDso;
const nonZero = Object.entries(balance).filter(([, v]) => v && (v.total || v.free || v.used));

const margin = await retry(() => ex.client.getMarginAccount(ADDRESSES.marginBank, ACTIVE_ACCOUNT));
const human = (raw) => Number(raw) / 1e18;

console.log('currencies returned      ', Object.keys(balance).length);
console.log('currencies with any value', nonZero.length);
console.log('balance.USDso            ', JSON.stringify(usdso));
console.log('');
console.log('MarginBank.getMarginAccount:');
console.log('  equity                 ', human(margin.equity).toFixed(2), 'USDso');
console.log('  unlockedCollateral     ', human(margin.unlockedCollateralBalance).toFixed(2), 'USDso');
console.log('  lockedCollateral       ', human(margin.lockedCollateral).toFixed(2), 'USDso');
console.log('  activePerpPools        ', margin.activePerpPools.length);
console.log('  marginStatus           ', margin.marginStatus);

const bad = (!usdso || usdso.total === 0) && margin.equity > 0n;
console.log(
  `\nRESULT: fetchBalance().USDso.total = ${usdso ? usdso.total : 'absent'} while the account holds ` +
    `${human(margin.equity).toFixed(2)} USDso of margin. A bot sizing from fetchBalance() trades zero.`,
);
process.exit(bad ? 0 : 1);
