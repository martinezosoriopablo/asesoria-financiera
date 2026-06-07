import { createClient } from '@supabase/supabase-js';

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const cusips = [
  '09261HBW6', '097023CY9', '172967PF2', '279158AV1',
  '71647NBN8', '80282KBJ4', '86960YAA0', '88163VAD1', '91911TAS2'
];

const { data: prices, error } = await sb
  .from('bond_prices')
  .select('cusip, issuer, price_date, last_price, yield_to_maturity, raw_data')
  .in('cusip', cusips)
  .order('price_date', { ascending: false });

if (error) { console.error('Error:', error.message); process.exit(1); }

console.log(`Found ${prices?.length || 0} rows in bond_prices`);

// Show unique cusips with raw_data
const seen = new Set();
for (const p of (prices || [])) {
  if (seen.has(p.cusip)) continue;
  seen.add(p.cusip);
  console.log(`\n${p.cusip} — ${p.issuer} — price=${p.last_price} date=${p.price_date}`);
  if (p.raw_data) {
    console.log('  raw_data keys:', Object.keys(p.raw_data));
    // Print relevant fields
    const rd = p.raw_data;
    console.log('  coupon:', rd.couponRate || rd.coupon || rd.coupon_rate || rd.interestRate);
    console.log('  maturity:', rd.maturityDate || rd.maturity || rd.maturity_date);
    console.log('  rating:', rd.creditRating || rd.rating || rd.moodyRating || rd.spRating);
  }
}

const foundCusips = new Set((prices || []).map(p => p.cusip));
const missing = cusips.filter(c => !foundCusips.has(c));
if (missing.length > 0) console.log('\nMissing CUSIPs:', missing);
