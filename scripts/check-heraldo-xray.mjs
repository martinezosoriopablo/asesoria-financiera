import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const { data: clients } = await sb.from('clients').select('id').ilike('nombre', '%Heraldo%').limit(1);
const cid = clients[0].id;
console.log('Client ID:', cid);

const { data: snaps } = await sb.from('portfolio_snapshots')
  .select('snapshot_date, source, holdings, total_value')
  .eq('client_id', cid)
  .order('snapshot_date', { ascending: false })
  .limit(3);

for (const s of snaps) {
  console.log(`\n=== ${s.snapshot_date} (${s.source}) total_value: ${s.total_value} ===`);
  let sum = 0;
  for (const h of s.holdings) {
    const mv = h.marketValue || 0;
    sum += mv;
    const name = (h.fundName || '').substring(0, 40).padEnd(40);
    console.log(`  ${name} mv: ${String(mv).padStart(14)}  cur: ${(h.currency || '-').padEnd(4)}  mvCLP: ${h.marketValueCLP || '-'}`);
  }
  console.log(`  SUM marketValue: ${sum}`);
}
