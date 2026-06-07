import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

// Mapping: cartola fundName substring → correct RUN
const FIXES = [
  { match: 'CARTERA DOLAR BALANCEADA', run: '10071' },
  { match: 'AMERICA LATINA', run: '8434' },
  { match: 'DEUDA CORPORATIVA', run: '9226' },
];

// Get ALL snapshots for Fortt
const { data: snapshots } = await sb.from('portfolio_snapshots')
  .select('id, snapshot_date, source, holdings')
  .eq('client_id', '0f0e0931-977f-4e1f-b506-d3a120e06124')
  .neq('source', 'api-prices')
  .order('snapshot_date', { ascending: false });

console.log(`Found ${snapshots?.length || 0} snapshots`);

let totalFixed = 0;
for (const snap of snapshots || []) {
  const holdings = snap.holdings || [];
  let changed = false;

  for (const h of holdings) {
    const name = (h.fundName || '').toUpperCase();
    if (h.securityId) continue; // already has securityId

    for (const fix of FIXES) {
      if (name.includes(fix.match)) {
        console.log(`  ${snap.snapshot_date}: "${h.fundName}" → securityId ${fix.run}`);
        h.securityId = fix.run;
        changed = true;
        totalFixed++;
        break;
      }
    }
  }

  if (changed) {
    const { error } = await sb.from('portfolio_snapshots')
      .update({ holdings })
      .eq('id', snap.id);
    if (error) {
      console.log(`  ERROR updating ${snap.id}:`, error.message);
    } else {
      console.log(`  Updated snapshot ${snap.snapshot_date}`);
    }
  }
}

console.log(`\nDone. Fixed ${totalFixed} holdings across ${snapshots?.length || 0} snapshots.`);
