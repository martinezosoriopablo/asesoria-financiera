import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
config({ path: '.env.local' });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

// 1. Total records in fondos_rentabilidades_diarias
const { count: totalPrices } = await supabase
  .from('fondos_rentabilidades_diarias')
  .select('id', { count: 'exact', head: true });
console.log('Total precios en fondos_rentabilidades_diarias:', totalPrices);

// 2. Date range of all data
const { data: firstAll } = await supabase
  .from('fondos_rentabilidades_diarias')
  .select('fecha')
  .order('fecha', { ascending: true })
  .limit(1);

const { data: lastAll } = await supabase
  .from('fondos_rentabilidades_diarias')
  .select('fecha')
  .order('fecha', { ascending: false })
  .limit(1);

console.log('Rango global:', firstAll?.[0]?.fecha, '→', lastAll?.[0]?.fecha);

// 3. How many distinct funds have data
const { data: distinctFunds } = await supabase
  .from('fondos_rentabilidades_diarias')
  .select('fondo_id')
  .limit(10000);

const uniqueFunds = new Set(distinctFunds?.map(d => d.fondo_id));
console.log('Fondos distintos con precios:', uniqueFunds.size);

// 4. Distribution by date
const { data: dateCounts } = await supabase
  .rpc('get_price_date_distribution')
  .limit(1);

// If RPC doesn't exist, do it manually - get unique dates
const { data: dates } = await supabase
  .from('fondos_rentabilidades_diarias')
  .select('fecha')
  .order('fecha', { ascending: true })
  .limit(10000);

const dateSet = new Set(dates?.map(d => d.fecha));
const sortedDates = [...dateSet].sort();
console.log('\nFechas con datos (' + sortedDates.length + ' días):');
if (sortedDates.length <= 30) {
  for (const d of sortedDates) console.log('  ' + d);
} else {
  console.log('  Primeras 5:', sortedDates.slice(0, 5).join(', '));
  console.log('  Últimas 5:', sortedDates.slice(-5).join(', '));
}

// 5. Check fund_cuota_history for more data
const { count: historyCount } = await supabase
  .from('fund_cuota_history')
  .select('id', { count: 'exact', head: true });
console.log('\nTotal en fund_cuota_history:', historyCount);

if (historyCount > 0) {
  const { data: hFirst } = await supabase
    .from('fund_cuota_history')
    .select('fecha, source')
    .order('fecha', { ascending: true })
    .limit(1);
  const { data: hLast } = await supabase
    .from('fund_cuota_history')
    .select('fecha, source')
    .order('fecha', { ascending: false })
    .limit(1);
  console.log('  Rango:', hFirst?.[0]?.fecha, '→', hLast?.[0]?.fecha);
  console.log('  Source primer registro:', hFirst?.[0]?.source);
}

// 6. Check CMF import history
const { data: cmfImports } = await supabase
  .from('fund_cuota_history')
  .select('fecha, source')
  .eq('source', 'cmf_cartola')
  .order('fecha', { ascending: true })
  .limit(5);
console.log('\nPrimeras importaciones CMF:', cmfImports?.map(r => r.fecha).join(', ') || 'ninguna');

const { data: cmfLast } = await supabase
  .from('fund_cuota_history')
  .select('fecha, source')
  .eq('source', 'cmf_cartola')
  .order('fecha', { ascending: false })
  .limit(5);
console.log('Últimas importaciones CMF:', cmfLast?.map(r => r.fecha).join(', ') || 'ninguna');
