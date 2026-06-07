import { createClient } from '@supabase/supabase-js';

const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const { data: clients } = await s.from('clients').select('id, nombre').ilike('nombre', '%francisco%').limit(3);
console.log('Clients:', JSON.stringify(clients));

if (clients && clients.length > 0) {
  const id = clients[0].id;
  const { data: snap } = await s.from('portfolio_snapshots')
    .select('id, holdings')
    .eq('client_id', id)
    .neq('source', 'api-prices')
    .order('snapshot_date', { ascending: false })
    .limit(1)
    .single();

  if (snap) {
    const holdings = snap.holdings || [];
    console.log('Total holdings:', holdings.length);

    for (const h of holdings) {
      const sid = (h.securityId || '').trim();
      const isNumeric = /^\d+$/.test(sid);
      const isStock = sid && !isNumeric && /^[A-Z]{1,6}$/.test(sid);
      console.log(`  ${sid || '(none)'} -> numeric=${isNumeric} stock=${isStock} name=${h.fundName}`);
    }
  }

  // Check stock_profiles table
  const { data: profiles, error } = await s.from('stock_profiles').select('ticker, sector').limit(10);
  console.log('\nstock_profiles table:', error ? `ERROR: ${error.message}` : `${(profiles||[]).length} rows`);
  if (profiles) profiles.forEach(p => console.log(`  ${p.ticker}: ${p.sector}`));
}
