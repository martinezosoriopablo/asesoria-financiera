import { createClient } from '@supabase/supabase-js';

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

// Find all funds where the name suggests USD but moneda_funcional is null
const { data: funds } = await sb.from('fondos_mutuos')
  .select('id, fo_run, fm_serie, nombre_fondo, moneda_funcional')
  .is('moneda_funcional', null)
  .or('nombre_fondo.ilike.%usa%,nombre_fondo.ilike.%eeuu%,nombre_fondo.ilike.%us equity%,nombre_fondo.ilike.%dollar%,nombre_fondo.ilike.%dolar%,nombre_fondo.ilike.%usd%')
  .order('fo_run');

console.log(`Fondos USD sin moneda_funcional: ${funds?.length || 0}`);
for (const f of (funds || [])) {
  // Check latest price to see if it's in USD range
  const { data: price } = await sb.from('fondos_rentabilidades_diarias')
    .select('valor_cuota, fecha')
    .eq('fondo_id', f.id)
    .order('fecha', { ascending: false })
    .limit(1)
    .single();

  const p = price?.valor_cuota || 0;
  const likelyUSD = p > 0 && p < 50000; // USD fund cuotas are typically < 50k
  console.log(`  ${f.fo_run}/${f.fm_serie} "${f.nombre_fondo}" latest=${p} ${likelyUSD ? '(likely USD)' : '(likely CLP)'}`);
}

// Also: how many total fondos have null moneda_funcional?
const { count } = await sb.from('fondos_mutuos').select('id', { count: 'exact', head: true }).is('moneda_funcional', null);
console.log(`\nTotal fondos con moneda_funcional = null: ${count}`);
