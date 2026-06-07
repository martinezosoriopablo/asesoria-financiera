import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

// ALL BCI funds with 'deuda' in name
const { data } = await sb.from('fondos_mutuos')
  .select('fo_run, fm_serie, nombre_fondo')
  .ilike('nombre_fondo', '%deuda%')
  .eq('nombre_agf', 'BCI')
  .limit(50);

console.log('BCI funds with DEUDA:');
const seen = new Set();
for (const f of data || []) {
  if (seen.has(f.fo_run)) continue;
  seen.add(f.fo_run);
  // Show all series for this RUN
  const series = data.filter(x => x.fo_run === f.fo_run).map(x => x.fm_serie);
  console.log(`  RUN: ${f.fo_run} | ${f.nombre_fondo} | Series: ${series.join(', ')}`);
}

// Get ALL unique BCI fund names
const { data: d3 } = await sb.from('fondos_mutuos')
  .select('fo_run, nombre_fondo')
  .eq('nombre_agf', 'BCI')
  .limit(500);

const uniqueByRun = new Map();
for (const f of d3 || []) {
  if (!uniqueByRun.has(f.fo_run)) uniqueByRun.set(f.fo_run, f.nombre_fondo);
}
console.log(`\nAll unique BCI funds (${uniqueByRun.size} total):`);
for (const [run, name] of [...uniqueByRun.entries()].sort((a, b) => a - b)) {
  console.log(`  RUN: ${run} | ${name}`);
}
