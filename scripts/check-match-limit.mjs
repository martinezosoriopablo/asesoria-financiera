import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
config({ path: '.env.local' });

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

// 1. Count Security AGF funds
const { data: agfFunds } = await sb
  .from('vw_fondos_completo')
  .select('id, fo_run, fm_serie, nombre_fondo')
  .ilike('nombre_agf', '%security%')
  .limit(1000);
console.log('Security AGF funds:', agfFunds?.length);

// 2. Check how many price rows for 7-day window around 2026-03-31
const fondoIds = (agfFunds || []).map(f => f.id);
const { data: prices, error } = await sb
  .from('fondos_rentabilidades_diarias')
  .select('fondo_id, valor_cuota, fecha')
  .in('fondo_id', fondoIds)
  .lte('fecha', '2026-03-31')
  .gte('fecha', '2026-03-24')
  .order('fecha', { ascending: false });

console.log('Price rows returned (no limit):', prices?.length);
if (error) console.log('Error:', error.message);

// 3. Check which of our 7 funds are in the priceMap
const targetRuns = [8336, 8118, 8881, 8986, 8987, 9607, 8253];
const priceMap = new Map();
if (prices) {
  for (const p of prices) {
    if (!priceMap.has(p.fondo_id)) priceMap.set(p.fondo_id, p.valor_cuota);
  }
}
console.log('Unique funds with price:', priceMap.size, '/', fondoIds.length);

for (const run of targetRuns) {
  const fund = agfFunds?.find(f => f.fo_run === run);
  if (fund) {
    const hasPrice = priceMap.has(fund.id);
    console.log('  RUN', run, fund.nombre_fondo.substring(0, 30), '-> price:', hasPrice ? priceMap.get(fund.id) : 'MISSING');
  } else {
    console.log('  RUN', run, '-> NOT IN AGF LIST');
  }
}
