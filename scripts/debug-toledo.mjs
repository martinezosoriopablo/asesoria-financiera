import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const { data: clients } = await sb.from('clients').select('id, nombre, apellido').or('nombre.ilike.%francisco%,apellido.ilike.%toledo%');
console.log('=== Clients matching Toledo ===');
console.log(JSON.stringify(clients, null, 2));

for (const c of clients || []) {
  console.log(`\n=== ${c.nombre} ${c.apellido} (${c.id}) ===`);

  // All snapshots (not just latest)
  const { data: snaps } = await sb.from('portfolio_snapshots')
    .select('id, snapshot_date, source, total_value, equity_value, fixed_income_value, alternatives_value, cash_value, holdings')
    .eq('client_id', c.id)
    .order('snapshot_date', { ascending: false })
    .limit(5);

  if (!snaps || snaps.length === 0) { console.log('  No snapshots'); continue; }

  console.log(`\n  Snapshots (${snaps.length}):`);
  for (const s of snaps) {
    console.log(`  ${s.snapshot_date} [${s.source}] total=$${Math.round(s.total_value/1e6)}M  RV=$${Math.round(s.equity_value/1e6)}M  RF=$${Math.round(s.fixed_income_value/1e6)}M  Alt=$${Math.round(s.alternatives_value/1e6)}M  Cash=$${Math.round(s.cash_value/1e6)}M`);
  }

  // Latest cartola (not api-prices)
  const cartola = snaps.find(s => s.source !== 'api-prices');
  if (!cartola) { console.log('  No cartola snapshot'); continue; }

  const holdings = Array.isArray(cartola.holdings) ? cartola.holdings : [];
  console.log(`\n  Holdings from ${cartola.snapshot_date} (${holdings.length} positions):`);
  console.log('  ' + '-'.repeat(120));
  console.log(`  ${'Fund'.padEnd(35)} ${'Type'.padEnd(10)} ${'Class'.padEnd(15)} ${'SecId'.padEnd(12)} ${'Qty'.padStart(12)} ${'Price'.padStart(12)} ${'MV'.padStart(14)} ${'MV_CLP'.padStart(14)} ${'Cur'.padEnd(5)}`);
  console.log('  ' + '-'.repeat(120));

  let sumMV = 0, sumCLP = 0;
  for (const h of holdings) {
    const mv = h.marketValue || 0;
    const mvCLP = h.marketValueCLP || 0;
    sumMV += mv;
    sumCLP += mvCLP;
    console.log(`  ${(h.fundName || '?').padEnd(35).slice(0,35)} ${(h.assetType || '-').padEnd(10)} ${(h.assetClass || '-').padEnd(15)} ${(h.securityId || '-').padEnd(12)} ${String(Math.round(h.quantity || 0)).padStart(12)} ${String(Math.round(h.marketPrice || 0)).padStart(12)} ${String(Math.round(mv)).padStart(14)} ${String(Math.round(mvCLP)).padStart(14)} ${(h.currency || '-').padEnd(5)}`);
  }
  console.log('  ' + '-'.repeat(120));
  console.log(`  ${'TOTAL'.padEnd(35)} ${''.padEnd(10)} ${''.padEnd(15)} ${''.padEnd(12)} ${''.padStart(12)} ${''.padStart(12)} ${String(Math.round(sumMV)).padStart(14)} ${String(Math.round(sumCLP)).padStart(14)}`);
  console.log(`  Snapshot total_value: $${Math.round(cartola.total_value)}`);

  // Check price availability for each holding
  console.log('\n  === Price Availability Check ===');
  for (const h of holdings) {
    const secId = (h.securityId || '').trim();
    const serie = (h.serie || '').trim();

    if (/^\d{3,6}$/.test(secId)) {
      // Chilean fund by RUN
      const { data: fm } = await sb.from('fondos_mutuos')
        .select('id, fo_run, fm_serie, fm_nombre')
        .eq('fo_run', secId)
        .limit(5);
      const matchedFm = fm?.find(f => f.fm_serie?.toUpperCase() === serie.toUpperCase()) || fm?.[0];
      if (matchedFm) {
        const { data: prices } = await sb.from('fondos_rentabilidades_diarias')
          .select('fecha, valor_cuota')
          .eq('fondo_id', matchedFm.id)
          .order('fecha', { ascending: false })
          .limit(1);
        const latest = prices?.[0];
        console.log(`  ✅ ${(h.fundName || '?').slice(0,30).padEnd(30)} RUN=${secId} serie=${serie} → FM: ${matchedFm.fm_nombre?.slice(0,25)} | Latest price: ${latest ? `${latest.fecha} = $${latest.valor_cuota}` : 'NO PRICES'}`);
      } else {
        console.log(`  ❌ ${(h.fundName || '?').slice(0,30).padEnd(30)} RUN=${secId} serie=${serie} → NOT FOUND in fondos_mutuos`);
      }
    } else if (/^CFI/i.test(secId)) {
      // FI by nemotécnico
      const { data: fi } = await sb.from('fondos_inversion')
        .select('id, nemo, nombre')
        .ilike('nemo', secId)
        .limit(3);
      console.log(`  ${fi?.length ? '✅' : '❌'} ${(h.fundName || '?').slice(0,30).padEnd(30)} FI nemo=${secId} → ${fi?.length ? fi[0].nombre?.slice(0,30) : 'NOT FOUND'}`);
    } else if (secId) {
      // International
      const { data: intPrices } = await sb.from('international_prices')
        .select('price_date, close_price')
        .eq('symbol', secId)
        .order('price_date', { ascending: false })
        .limit(1);
      console.log(`  ${intPrices?.length ? '✅' : '⚠️'} ${(h.fundName || '?').slice(0,30).padEnd(30)} INT symbol=${secId} → ${intPrices?.length ? `${intPrices[0].price_date} = $${intPrices[0].close_price}` : 'No cached prices (will fetch on-demand)'}`);
    } else {
      console.log(`  ⚠️  ${(h.fundName || '?').slice(0,30).padEnd(30)} NO securityId — will try name matching`);
    }
  }
}
