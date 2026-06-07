import { createClient } from '@supabase/supabase-js';

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

// Get Heraldo's latest snapshot
const { data: clients } = await sb.from('clients').select('id, nombre, apellido').ilike('nombre', '%heraldo%').limit(1);
const cid = clients[0].id;
const { data: snaps } = await sb.from('portfolio_snapshots').select('id, holdings, created_at')
  .eq('client_id', cid).order('created_at', { ascending: false }).limit(1);
const holdings = snaps[0].holdings;

console.log('Heraldo holdings — Cartola vs Latest DB price\n');
console.log('Fund'.padEnd(35), 'Qty'.padStart(12), 'Cartola MV'.padStart(15), 'Cartola CLP'.padStart(15), 'Curr', 'Run/Serie');
console.log('-'.repeat(110));

for (const h of holdings) {
  const run = parseInt(h.securityId || '0', 10);
  const serie = h.serie || '';

  // Get fondo
  const { data: fondos } = await sb.from('fondos_mutuos').select('id, moneda_funcional')
    .eq('fo_run', run).eq('fm_serie', serie).limit(1);

  let latestPrice = null;
  let latestDate = null;
  if (fondos?.length) {
    const { data: price } = await sb.from('fondos_rentabilidades_diarias')
      .select('valor_cuota, fecha')
      .eq('fondo_id', fondos[0].id)
      .order('fecha', { ascending: false })
      .limit(1)
      .single();
    if (price) {
      latestPrice = price.valor_cuota;
      latestDate = price.fecha;
    }
  }

  const isUsd = (h.currency || '').toUpperCase() === 'USD';
  const usdRate = 930; // approximate
  const cartolaUnitPrice = h.quantity > 0 ? h.marketValue / h.quantity : 0;

  let latestValueCLP = null;
  if (latestPrice) {
    latestValueCLP = isUsd
      ? latestPrice * h.quantity * usdRate
      : latestPrice * h.quantity;
  }

  console.log(
    h.fundName.substring(0, 34).padEnd(35),
    h.quantity.toFixed(2).padStart(12),
    h.marketValue.toFixed(0).padStart(15),
    (h.marketValueCLP || '—').toString().substring(0, 14).padStart(15),
    (h.currency || 'CLP').padStart(4),
    `${run}/${serie}`
  );
  if (latestPrice) {
    const gain = latestValueCLP - (h.marketValueCLP || h.marketValue * (isUsd ? usdRate : 1));
    console.log(
      '  → Latest price:'.padEnd(35),
      latestPrice.toFixed(4).padStart(12),
      `(${latestDate})`.padStart(15),
      `New CLP: ${latestValueCLP.toFixed(0)}`.padStart(15),
      `Δ: ${gain > 0 ? '+' : ''}${gain.toFixed(0)}`
    );
  } else {
    console.log('  → No DB price found'.padEnd(60));
  }
}
