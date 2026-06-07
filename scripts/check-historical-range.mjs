import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const { data: snaps } = await sb.from('portfolio_snapshots')
  .select('id, client_id, snapshot_date, holdings')
  .order('snapshot_date', { ascending: false })
  .limit(5);

for (const snap of snaps) {
  const holdings = snap.holdings || [];
  console.log(`\n=== Client ${snap.client_id} | ${snap.snapshot_date} | ${holdings.length} holdings ===`);

  for (const h of holdings) {
    const run = h.securityId ? parseInt(h.securityId) : NaN;
    if (isNaN(run)) {
      console.log(`  ${h.fundName} -> NO securityId (not matched)`);
      continue;
    }

    const { data: fondos } = await sb.from('fondos_mutuos')
      .select('id, fm_serie')
      .eq('fo_run', run)
      .eq('fm_serie', h.serie || 'X');

    if (!fondos || fondos.length === 0) {
      console.log(`  ${h.fundName} (RUN ${run}, serie ${h.serie}) -> NOT FOUND in fondos_mutuos`);
      continue;
    }

    const fondoId = fondos[0].id;

    const { data: minD } = await sb.from('fondos_rentabilidades_diarias')
      .select('fecha')
      .eq('fondo_id', fondoId)
      .order('fecha', { ascending: true })
      .limit(1);
    const { data: maxD } = await sb.from('fondos_rentabilidades_diarias')
      .select('fecha')
      .eq('fondo_id', fondoId)
      .order('fecha', { ascending: false })
      .limit(1);

    const from = minD?.[0]?.fecha || 'N/A';
    const to = maxD?.[0]?.fecha || 'N/A';
    const days = (from !== 'N/A' && to !== 'N/A')
      ? Math.round((new Date(to).getTime() - new Date(from).getTime()) / 86400000)
      : 0;

    const hasYear = days >= 365 ? 'OK' : `SOLO ${days}d`;
    console.log(`  ${h.fundName} (RUN ${run}, serie ${h.serie}) -> ${from} to ${to} (${days}d) ${hasYear}`);
  }
}
