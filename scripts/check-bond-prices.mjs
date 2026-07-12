// Usage: node --env-file=.env.local scripts/check-bond-prices.mjs [sync]
// Without args: check status. With "sync": fetch and upsert last 35 days.
import { createClient } from '@supabase/supabase-js';
import { fetchHistoricalPrices } from '../lib/finra/historical.ts';

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const doSync = process.argv.includes('sync');

// Get all CUSIPs from DB
const { data: existing } = await sb.from('bond_prices').select('cusip');
const cusips = [...new Set((existing || []).map(r => r.cusip))];

if (!doSync) {
  // Status check
  const { data } = await sb.from('bond_prices')
    .select('cusip, issuer, price_date, last_price')
    .order('price_date', { ascending: false })
    .limit(15);
  console.log('Latest bond_prices:');
  for (const r of data || []) {
    console.log(`  ${r.cusip}  ${r.price_date}  ${r.last_price}  ${(r.issuer || '').slice(0,30)}`);
  }
  console.log(`\nTotal unique CUSIPs: ${cusips.length}`);
  process.exit(0);
}

// Sync mode
console.log(`Syncing ${cusips.length} CUSIPs, last 35 days...`);
const results = await fetchHistoricalPrices(cusips, 35);

let totalInserted = 0;
for (const result of results) {
  if (!result.success || result.prices.length === 0) {
    console.log(`  SKIP ${result.cusip} ${result.error || 'no prices'}`);
    continue;
  }
  const rows = result.prices.map(p => ({
    cusip: p.cusip,
    issuer: p.issuer,
    price_date: p.date,
    last_price: p.price,
    yield_to_maturity: p.yield,
    volume: p.totalVolume,
    source: 'finra',
    raw_data: { tradeCount: p.tradeCount, totalVolume: p.totalVolume },
    fetched_at: new Date().toISOString(),
  }));
  const { error: upsertError } = await sb
    .from('bond_prices')
    .upsert(rows, { onConflict: 'cusip,price_date,source' });
  if (upsertError) {
    console.error(`  ERROR ${result.cusip} ${upsertError.message}`);
  } else {
    totalInserted += rows.length;
    console.log(`  OK ${result.cusip} ${(result.issuer || '').slice(0,20)} ${rows.length} days`);
  }
}
console.log(`\nDone. Total rows upserted: ${totalInserted}`);
