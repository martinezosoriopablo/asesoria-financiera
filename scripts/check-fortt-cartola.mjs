import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

// Check all snapshots
const { data } = await sb.from('portfolio_snapshots')
  .select('snapshot_date, source, institution, holdings')
  .eq('client_id', '0f0e0931-977f-4e1f-b506-d3a120e06124')
  .order('snapshot_date', { ascending: false })
  .limit(3);

console.log('Snapshots:', (data || []).length);
for (const s of data || []) {
  const h = Array.isArray(s.holdings) ? s.holdings : [];
  console.log('\n' + s.snapshot_date, s.source, 'institution:', s.institution, 'holdings:', h.length);
  h.forEach(x => console.log('  ', (x.fundName || '').substring(0, 50), '| market:', x.market, '| inst:', x.institution));
}

// Also check client_cartolas
const { data: cartolas } = await sb.from('client_cartolas')
  .select('id, filename, created_at, institution, parsed_data')
  .eq('client_id', '0f0e0931-977f-4e1f-b506-d3a120e06124')
  .order('created_at', { ascending: false })
  .limit(3);

console.log('\n\nCartolas:', (cartolas || []).length);
for (const c of cartolas || []) {
  const pd = c.parsed_data || {};
  console.log(c.filename, '| institution:', c.institution || pd.institution, '| holdings:', (pd.holdings || []).length);
}
