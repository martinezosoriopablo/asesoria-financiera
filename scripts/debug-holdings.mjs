import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const { data: clients } = await sb.from('clients').select('id, nombre, apellido').ilike('nombre', '%prueba%');
console.log('Clients matching prueba:', JSON.stringify(clients, null, 2));

for (const c of clients || []) {
  const { data: snaps } = await sb.from('portfolio_snapshots')
    .select('id, snapshot_date, source, holdings, equity_value, fixed_income_value, alternatives_value, cash_value')
    .eq('client_id', c.id)
    .order('snapshot_date', { ascending: false })
    .limit(2);

  if (snaps && snaps.length > 0) {
    console.log('\nClient:', c.nombre, c.apellido, '(', c.id, ')');
    for (const s of snaps) {
      console.log('  Snapshot:', s.snapshot_date, 'source:', s.source);
      console.log('    equity_value:', s.equity_value, 'fi_value:', s.fixed_income_value, 'alt_value:', s.alternatives_value, 'cash_value:', s.cash_value);
      const holdings = Array.isArray(s.holdings) ? s.holdings : [];
      console.log('    holdings count:', holdings.length);
      // Show all holdings, especially fixedIncome
      holdings.forEach(h => {
        console.log('      -', h.fundName, '| assetClass:', h.assetClass, '| securityId:', h.securityId, '| couponRate:', h.couponRate, '| maturityDate:', h.maturityDate, '| instrumentType:', h.instrumentType);
      });
    }
  }
}
