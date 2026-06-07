const { createClient } = require('@supabase/supabase-js');
const sb = createClient(
  'https://zysotxkelepvotzujhxe.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp5c290eGtlbGVwdm90enVqaHhlIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NjUyNjk3NCwiZXhwIjoyMDgyMTAyOTc0fQ.Ansi89kIfptszv0I3DzmPJdqrEpi7tLbckiobvw6QRM'
);

async function check(run, serie) {
  const { data: fm } = await sb.from('fondos_mutuos')
    .select('id, fo_run, fm_serie, nombre_fondo')
    .eq('fo_run', run)
    .eq('fm_serie', serie)
    .limit(1);

  if (!fm || fm.length === 0) {
    console.log('RUN ' + run + ' serie ' + serie + ': NOT FOUND');
    return;
  }

  const fondoId = fm[0].id;
  console.log('\nRUN ' + run + ' serie=' + serie + ' → id=' + fondoId.substring(0, 8) + ' (' + fm[0].nombre_fondo + ')');

  // fondos_rentabilidades_diarias
  const { count: dCount } = await sb.from('fondos_rentabilidades_diarias')
    .select('*', { count: 'exact', head: true })
    .eq('fondo_id', fondoId);

  const { data: diarias } = await sb.from('fondos_rentabilidades_diarias')
    .select('fecha, valor_cuota')
    .eq('fondo_id', fondoId)
    .order('fecha', { ascending: false })
    .limit(3);

  console.log('  rentabilidades_diarias: ' + (dCount || 0) + ' rows');
  if (diarias) diarias.forEach(r => console.log('    ' + r.fecha + ' cuota=' + r.valor_cuota));

  // fund_cuota_history
  const { count: hCount } = await sb.from('fund_cuota_history')
    .select('*', { count: 'exact', head: true })
    .eq('fondo_id', fondoId);

  const { data: hist } = await sb.from('fund_cuota_history')
    .select('fecha, valor_cuota, source')
    .eq('fondo_id', fondoId)
    .order('fecha', { ascending: false })
    .limit(3);

  console.log('  fund_cuota_history: ' + (hCount || 0) + ' rows');
  if (hist) hist.forEach(r => console.log('    ' + r.fecha + ' cuota=' + r.valor_cuota + ' src=' + r.source));
}

async function main() {
  await check(10071, 'BPRIV');
  await check(8434, 'ALPAT');
  await check(9226, 'ALPAT');

  // Also check a fund that DOES work (e.g. a common BCI fund)
  console.log('\n--- Control: a BCI fund that should have prices ---');
  await check(8036, 'BCI');
}

main().catch(console.error);
