import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
config({ path: '.env.local' });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const holdings = [
  { name: 'SECURITY EQUILIBRIO', run: 8336, serie: 'B' },
  { name: 'GOLD', run: 8118, serie: 'B' },
  { name: 'MID TERM', run: 8881, serie: 'B' },
  { name: 'MID TERM UF', run: 8986, serie: 'B' },
  { name: 'INDEX FUND US', run: 8987, serie: 'B' },
  { name: 'ACTIVO 2025 (FI)', run: 9607, serie: 'B' },
  { name: 'SECURITY PLUS', run: 8253, serie: 'C' },
];

const today = '2026-04-23';
const oneYearAgo = '2025-04-23';
const cartolaDate = '2026-03-31';

console.log(`Rango requerido: ${oneYearAgo} → ${today}`);
console.log(`Cartola: ${cartolaDate}\n`);

for (const h of holdings) {
  const { data: fondo } = await supabase
    .from('fondos_mutuos')
    .select('id')
    .eq('fo_run', h.run)
    .eq('fm_serie', h.serie)
    .single();

  if (!fondo) { console.log(`${h.name} (${h.run}-${h.serie}): NO ENCONTRADO\n`); continue; }

  // Total count
  const { count: total } = await supabase
    .from('fondos_rentabilidades_diarias')
    .select('id', { count: 'exact', head: true })
    .eq('fondo_id', fondo.id);

  // Count in required range
  const { count: inRange } = await supabase
    .from('fondos_rentabilidades_diarias')
    .select('id', { count: 'exact', head: true })
    .eq('fondo_id', fondo.id)
    .gte('fecha', oneYearAgo)
    .lte('fecha', today);

  // First and last price
  const { data: first } = await supabase
    .from('fondos_rentabilidades_diarias')
    .select('fecha, valor_cuota')
    .eq('fondo_id', fondo.id)
    .order('fecha', { ascending: true })
    .limit(1);

  const { data: last } = await supabase
    .from('fondos_rentabilidades_diarias')
    .select('fecha, valor_cuota')
    .eq('fondo_id', fondo.id)
    .order('fecha', { ascending: false })
    .limit(1);

  // Check around 1Y ago
  const { data: aroundYear } = await supabase
    .from('fondos_rentabilidades_diarias')
    .select('fecha, valor_cuota')
    .eq('fondo_id', fondo.id)
    .gte('fecha', oneYearAgo)
    .order('fecha', { ascending: true })
    .limit(1);

  const firstDate = first?.[0]?.fecha || 'N/A';
  const lastDate = last?.[0]?.fecha || 'N/A';
  const yearStart = aroundYear?.[0]?.fecha || 'NO HAY';

  const hasFullYear = firstDate <= oneYearAgo;
  const hasToday = lastDate >= '2026-04-21'; // Allow 1-2 day lag

  console.log(`${h.name} (${h.run}-${h.serie})`);
  console.log(`  Total precios: ${total} | En rango 1Y: ${inRange}`);
  console.log(`  Primer precio: ${firstDate} | Último: ${lastDate}`);
  console.log(`  Precio más cercano a 1Y atrás: ${yearStart}`);
  console.log(`  ✓ Serie 1Y completa: ${hasFullYear ? 'SÍ' : 'NO — FALTAN DATOS'}`);
  console.log(`  ✓ Precio reciente: ${hasToday ? 'SÍ' : 'NO — DESACTUALIZADO'}`);
  console.log();
}
