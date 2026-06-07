import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const { data } = await sb.from('portfolio_snapshots')
  .select('snapshot_date, source, total_value, holdings')
  .eq('client_id', '0f0e0931-977f-4e1f-b506-d3a120e06124')
  .neq('source', 'api-prices')
  .order('snapshot_date', { ascending: false })
  .limit(1);

const s = data && data[0];
if (!s) { console.log('No snapshot'); process.exit(); }
console.log('Date:', s.snapshot_date, 'Total:', s.total_value);
console.log('---');
const h = s.holdings || [];
for (const x of h) {
  const name = x.fundName || '';
  if (name.includes('BCI') || name.toLowerCase().includes('dws')) {
    console.log('Name:', name);
    console.log('  securityId:', x.securityId);
    console.log('  quantity:', x.quantity);
    console.log('  marketPrice:', x.marketPrice);
    console.log('  marketValue:', x.marketValue);
    console.log('  marketValueCLP:', x.marketValueCLP);
    console.log('  currency:', x.currency);
    console.log('  assetClass:', x.assetClass);
    console.log('  serie:', x.serie);
    console.log('  institution:', x.institution);
    console.log('---');
  }
}

// Also show ALL holdings briefly
console.log('\nAll holdings:');
for (const x of h) {
  console.log(`  ${(x.fundName || '').substring(0, 55).padEnd(55)} | qty: ${String(x.quantity || '').padStart(10)} | price: ${String(x.marketPrice || '').padStart(12)} | MV: ${String(x.marketValue || '').padStart(14)} | curr: ${x.currency || 'CLP'}`);
}
