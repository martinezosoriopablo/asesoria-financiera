import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const { data } = await sb.from('portfolio_snapshots')
  .select('snapshot_date, source, fixed_income_value, holdings')
  .eq('client_id', '390cb815-36c3-4ee0-a3f9-636e34d9af46')
  .order('snapshot_date', { ascending: true });

// Track Boeing value over time as representative bond
console.log('Boeing Co marketValue across snapshots:');
for (const s of data) {
  const holdings = s.holdings || [];
  const boeing = holdings.find(h => h.fundName === 'Boeing Co');
  if (boeing) {
    console.log(s.snapshot_date, s.source, '→ mv:', boeing.marketValue, '| mvCLP:', boeing.marketValueCLP, '| currency:', boeing.currency);
  }
}
