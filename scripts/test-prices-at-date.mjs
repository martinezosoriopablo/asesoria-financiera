import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function getChileanFundPrice(run, serie, targetDate) {
  let query = sb.from('fondos_mutuos').select('id, fm_serie').eq('fo_run', run);
  if (serie) query = query.eq('fm_serie', serie);
  const { data: fondos } = await query.limit(5);
  if (fondos === null || fondos.length === 0) return null;
  const fondo = fondos[0];
  const minDate = new Date(targetDate);
  minDate.setDate(minDate.getDate() - 7);
  const minDateStr = minDate.toISOString().split('T')[0];
  const { data: priceRow } = await sb.from('fondos_rentabilidades_diarias')
    .select('valor_cuota, fecha').eq('fondo_id', fondo.id)
    .gte('fecha', minDateStr).lte('fecha', targetDate)
    .order('fecha', { ascending: false }).limit(1).single();
  if (priceRow && priceRow.valor_cuota > 0) return { price: priceRow.valor_cuota, date: priceRow.fecha };
  return null;
}

const holdings = [
  { fundName: 'BALANCEADO EST SERIE B', securityId: '8336', serie: 'B' },
  { fundName: 'GOLD SERIE B', securityId: '8118', serie: 'B' },
  { fundName: 'MID TERM SERIE B', securityId: '8881', serie: 'B' },
  { fundName: 'MID TERM UF SERIE B', securityId: '8986', serie: 'B' },
  { fundName: 'ACCIONES EEUU SERIE B', securityId: '8987', serie: 'B' },
];

for (const [startDate, endDate, label] of [
  ['2026-03-01', '2026-03-31', 'Marzo'],
  ['2026-04-01', '2026-04-30', 'Abril'],
  ['2026-05-01', '2026-05-26', 'Mayo'],
]) {
  console.log(`\n=== ${label} (${startDate} → ${endDate}) ===`);
  for (const h of holdings) {
    const run = parseInt(h.securityId);
    const sp = await getChileanFundPrice(run, h.serie, startDate);
    const ep = await getChileanFundPrice(run, h.serie, endDate);
    let ret = null;
    if (sp && ep && sp.price > 0) ret = ((ep.price / sp.price) - 1) * 100;
    console.log(
      h.fundName.padEnd(30),
      sp ? `${sp.date} ${sp.price.toFixed(2)}` : 'NO DATA',
      '=>',
      ep ? `${ep.date} ${ep.price.toFixed(2)}` : 'NO DATA',
      ret !== null ? `| ${ret.toFixed(2)}%` : '| N/A'
    );
  }
}
