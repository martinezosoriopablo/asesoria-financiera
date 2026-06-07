import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const { data: clients } = await sb.from('clients').select('id, nombre, apellido').ilike('nombre', '%heraldo%');
console.log('Clients:', JSON.stringify(clients, null, 2));

for (const c of clients || []) {
  const { data: snaps } = await sb.from('portfolio_snapshots')
    .select('snapshot_date, source, holdings, equity_value, fixed_income_value')
    .eq('client_id', c.id)
    .order('snapshot_date', { ascending: false })
    .limit(1);

  if (snaps && snaps.length > 0) {
    const s = snaps[0];
    console.log('\nSnapshot:', s.snapshot_date, s.source);
    console.log('  equity_value:', s.equity_value, 'fi_value:', s.fixed_income_value);
    const holdings = Array.isArray(s.holdings) ? s.holdings : [];
    console.log('  holdings:', holdings.length);
    holdings.forEach(h => {
      console.log('   ', h.fundName, '| assetClass:', h.assetClass, '| secId:', h.securityId, '| mv:', Math.round(h.marketValue));
    });
  }
}
