require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function main() {
  const clientId = '0f0e0931-977f-4e1f-b506-d3a120e06124';

  const { data: snaps } = await sb.from('portfolio_snapshots')
    .select('id, snapshot_date, holdings')
    .eq('client_id', clientId)
    .neq('source', 'api-prices')
    .order('snapshot_date', { ascending: false })
    .limit(1);

  if (!snaps || snaps.length === 0) { console.log('No snapshots'); return; }
  const holdings = snaps[0].holdings;
  console.log('Snapshot:', snaps[0].snapshot_date);

  for (const h of holdings) {
    const id = (h.securityId || '').trim();
    if (['9226', '10071', '8434'].includes(id)) {
      const cartolaPrice = h.quantity > 0 ? (h.marketValue / h.quantity).toFixed(4) : 'N/A';
      console.log('  securityId=' + id +
        ' serie=' + JSON.stringify(h.serie) +
        ' fundName="' + h.fundName + '"' +
        ' qty=' + h.quantity +
        ' mktValue=' + h.marketValue +
        ' cartolaPrice=' + cartolaPrice);
    }
  }
}

main().catch(console.error);
