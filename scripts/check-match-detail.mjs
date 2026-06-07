import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
config({ path: '.env.local' });

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const targetRuns = [8336, 8118, 8881, 8986, 8987, 8253];
const cartolaDate = '2026-03-31';
const cartolaPrices = {
  8336: 2644.9353,
  8118: 5179.314,
  8881: 1888.6764,
  8986: 1931.2171,
  8987: 611888.396144,
  8253: 3587.4882,
};

// For each target RUN, check ALL series in vw_fondos_completo
for (const run of targetRuns) {
  const { data: fondos } = await sb
    .from('vw_fondos_completo')
    .select('id, fo_run, fm_serie, nombre_fondo, nombre_agf, familia_estudios')
    .eq('fo_run', run);

  console.log(`\n=== RUN ${run} (cartola price: ${cartolaPrices[run]}) ===`);
  console.log(`  Series in DB: ${fondos?.length}`);

  for (const f of (fondos || [])) {
    // Get price at cartola date
    const { data: priceRow } = await sb
      .from('fondos_rentabilidades_diarias')
      .select('valor_cuota, fecha')
      .eq('fondo_id', f.id)
      .lte('fecha', cartolaDate)
      .order('fecha', { ascending: false })
      .limit(1)
      .single();

    const dbPrice = priceRow?.valor_cuota || 0;
    const diff = cartolaPrices[run] > 0 ? Math.abs(dbPrice - cartolaPrices[run]) / cartolaPrices[run] : 999;
    const match = diff < 0.01 ? 'MATCH' : '';

    console.log(`  ${f.fm_serie.padEnd(8)} | ${f.nombre_fondo.substring(0, 35).padEnd(35)} | DB price: ${dbPrice?.toFixed(4)} | diff: ${(diff * 100).toFixed(2)}% ${match}`);
  }
}
