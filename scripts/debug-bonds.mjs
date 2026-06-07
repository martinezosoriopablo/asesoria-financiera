import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const { data } = await sb.from('portfolio_snapshots')
  .select('snapshot_date, fixed_income_value, holdings')
  .eq('client_id', '390cb815-36c3-4ee0-a3f9-636e34d9af46')
  .order('snapshot_date', { ascending: true });

// Check if fi_value ever changes
const fiValues = new Set(data.map(s => s.fixed_income_value));
console.log('Distinct fi_values:', [...fiValues]);
console.log('First fi:', data[0].fixed_income_value, 'Last fi:', data[data.length-1].fixed_income_value);

// Check if any bond holding marketValue changes across snapshots
const bondValues = new Map();
for (const s of data) {
  const holdings = s.holdings || [];
  for (const h of holdings) {
    if (h.assetClass === 'fixedIncome') {
      if (!bondValues.has(h.fundName)) bondValues.set(h.fundName, new Set());
      bondValues.get(h.fundName).add(h.marketValue);
    }
  }
}
console.log('\nBond value changes across all snapshots:');
for (const [name, vals] of bondValues) {
  const arr = [...vals];
  console.log(' ', name, '→', arr.length === 1 ? 'CONSTANT at ' + arr[0] : 'CHANGES: ' + arr.slice(0, 5).join(', '));
}
