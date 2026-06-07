import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import { createClient } from '@supabase/supabase-js';

const { scrapeBondPrices } = await import('../lib/finra/scraper.ts');

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

console.log('Running FINRA scraper...');
const result = await scrapeBondPrices();

if (!result.success) {
  console.error('Scraper failed:', result.error);
  process.exit(1);
}

console.log(`Got ${result.bonds.length} bonds. Upserting to DB...`);

let ok = 0, fail = 0;
for (const bond of result.bonds) {
  const priceDate = bond.lastTradeDate || new Date().toISOString().split('T')[0];
  const { error } = await supabase.from('bond_prices').upsert({
    cusip: bond.cusip,
    issuer: bond.issuerName,
    price_date: priceDate,
    last_price: bond.lastSalePrice,
    yield_to_maturity: bond.lastSaleYield,
    source: 'finra',
    raw_data: bond,
    fetched_at: new Date().toISOString(),
  }, { onConflict: 'cusip,price_date,source' });

  if (error) { console.log(`  FAIL ${bond.cusip}: ${error.message}`); fail++; }
  else { ok++; }
}

console.log(`\nDone: ${ok} OK, ${fail} failed`);

const { data } = await supabase.from('bond_prices').select('cusip, issuer, last_price, yield_to_maturity, price_date').order('issuer');
console.log(`\nDB has ${data.length} rows:`);
for (const r of data) {
  console.log(`  ${r.cusip} | ${r.issuer} | $${r.last_price} | ytm: ${r.yield_to_maturity || '-'} | ${r.price_date}`);
}
