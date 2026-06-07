import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
config({ path: '.env.local' });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

// 1. Find the latest client with snapshots
const { data: clients } = await supabase
  .from('clients')
  .select('id, nombre, apellido')
  .limit(10);

console.log('=== CLIENTES ===');
for (const c of clients || []) {
  const { count } = await supabase
    .from('portfolio_snapshots')
    .select('id', { count: 'exact', head: true })
    .eq('client_id', c.id);
  if (count > 0) console.log(`  ${c.nombre} ${c.apellido} (${c.id}) — ${count} snapshots`);
}

// 2. Get the first client with snapshots
const clientWithSnaps = clients?.find(async c => {
  const { count } = await supabase.from('portfolio_snapshots').select('id', { count: 'exact', head: true }).eq('client_id', c.id);
  return count > 0;
});

// Get all snapshots for first client
const { data: snapshots } = await supabase
  .from('portfolio_snapshots')
  .select('id, snapshot_date, source, total_value, holdings')
  .eq('client_id', clients[0].id)
  .order('snapshot_date', { ascending: true });

console.log(`\n=== SNAPSHOTS para ${clients[0].nombre} (${snapshots?.length || 0}) ===`);
const cartola = snapshots?.find(s => s.source === 'statement' || s.source === 'manual' || s.source === 'excel');
if (cartola) {
  console.log(`Cartola: ${cartola.snapshot_date} — $${cartola.total_value?.toLocaleString()}`);
  const holdings = cartola.holdings || [];
  console.log(`Holdings: ${holdings.length}`);

  for (const h of holdings) {
    const run = h.securityId;
    const serie = h.serie;
    console.log(`\n  --- ${h.fundName} ---`);
    console.log(`  RUN: ${run}, Serie: ${serie}, Qty: ${h.quantity}, Price: ${h.marketPrice}, Value: ${h.marketValue}`);

    if (run && /^\d+$/.test(run)) {
      // Check fund in DB
      const { data: fondo } = await supabase
        .from('fondos_mutuos')
        .select('id, fo_run, fm_serie, nombre_fondo')
        .eq('fo_run', parseInt(run))
        .eq('fm_serie', serie)
        .single();

      if (fondo) {
        console.log(`  DB Match: ${fondo.nombre_fondo} (id: ${fondo.id})`);

        // Check price history
        const { data: prices, count } = await supabase
          .from('fondos_rentabilidades_diarias')
          .select('fecha, valor_cuota', { count: 'exact' })
          .eq('fondo_id', fondo.id)
          .order('fecha', { ascending: true })
          .limit(5);

        const { data: latestPrices } = await supabase
          .from('fondos_rentabilidades_diarias')
          .select('fecha, valor_cuota')
          .eq('fondo_id', fondo.id)
          .order('fecha', { ascending: false })
          .limit(5);

        console.log(`  Precios en BD: ${count} registros`);
        if (prices?.length > 0) {
          console.log(`  Más antiguo: ${prices[0].fecha} — $${prices[0].valor_cuota}`);
        }
        if (latestPrices?.length > 0) {
          console.log(`  Más reciente: ${latestPrices[0].fecha} — $${latestPrices[0].valor_cuota}`);
        }

        // Check for big jumps (currency change)
        if (prices?.length > 0 && latestPrices?.length > 0) {
          const first = prices[0].valor_cuota;
          const last = latestPrices[0].valor_cuota;
          const ratio = first / last;
          if (ratio > 500 || ratio < 0.002) {
            console.log(`  ⚠️ POSIBLE CAMBIO DE MONEDA: ratio ${ratio.toFixed(1)}x`);
          }
        }
      } else {
        console.log(`  ❌ NO encontrado en fondos_mutuos`);
      }
    }
  }
}

// Show all snapshots summary
console.log('\n=== TODOS LOS SNAPSHOTS ===');
for (const s of snapshots || []) {
  console.log(`  ${s.snapshot_date} | ${s.source.padEnd(12)} | $${s.total_value?.toLocaleString()}`);
}
