import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const clientId = 'a70d7818-ae6d-44c9-8e5f-b0e7b8032bb4';

// Get ALL snapshots with source info
const { data: snaps, count } = await sb.from('portfolio_snapshots')
  .select('id, snapshot_date, source, total_value, equity_value, fixed_income_value, alternatives_value, cash_value', { count: 'exact' })
  .eq('client_id', clientId)
  .order('snapshot_date', { ascending: true });

console.log('Total snapshots:', count);
const sources = {};
for (const s of snaps) {
  sources[s.source] = (sources[s.source] || 0) + 1;
}
console.log('By source:', JSON.stringify(sources));

// Find manual ones
const manual = snaps.filter(s => s.source !== 'api-prices');
console.log('\nManual snapshots:', manual.length);
for (const m of manual) {
  console.log('  ', m.snapshot_date, m.source, 'total=$' + Math.round(m.total_value/1e6) + 'M');
}

// First and last
console.log('\nFirst:', snaps[0]?.snapshot_date, snaps[0]?.source);
console.log('Last:', snaps[snaps.length-1]?.snapshot_date, snaps[snaps.length-1]?.source);

// Get holdings from the manual snapshot
if (manual.length > 0) {
  const { data: full } = await sb.from('portfolio_snapshots')
    .select('holdings')
    .eq('id', manual[0].id)
    .single();

  const holdings = Array.isArray(full.holdings) ? full.holdings : [];
  console.log('\nManual snapshot holdings (' + holdings.length + '):');
  for (const h of holdings) {
    const secId = h.securityId || '-';
    console.log('  ' + (h.fundName || '?').padEnd(35).slice(0,35) + ' secId=' + secId.padEnd(10) + ' qty=' + Math.round(h.quantity || 0) + ' mv=$' + Math.round(h.marketValue || 0) + ' cur=' + (h.currency || '-'));
  }

  // Check international_prices for each holding
  console.log('\n=== Price check in international_prices ===');
  for (const h of holdings) {
    const secId = (h.securityId || '').trim();
    if (!secId) continue;

    const { data: prices } = await sb.from('international_prices')
      .select('price_date, close_price')
      .eq('symbol', secId)
      .order('price_date', { ascending: false })
      .limit(3);

    if (prices && prices.length > 0) {
      console.log('  OK ' + secId.padEnd(10) + ' latest=' + prices[0].price_date + ' $' + prices[0].close_price + ' (' + prices.length + ' recent)');
    } else {
      console.log('  MISSING ' + secId.padEnd(10) + ' no prices in international_prices');
    }
  }
}
