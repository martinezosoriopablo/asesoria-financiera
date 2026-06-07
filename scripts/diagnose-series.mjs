import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
config({ path: '.env.local' });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const holdings = [
  { fundName: 'BALANCEADO EST', run: 8336, serie: 'B', quantity: 69176.6282, cartolaPrice: 2644.9353 },
  { fundName: 'GOLD', run: 8118, serie: 'B', quantity: 57252.6105, cartolaPrice: 5179.314 },
  { fundName: 'MID TERM', run: 8881, serie: 'B', quantity: 71295.3144, cartolaPrice: 1888.6764 },
  { fundName: 'MID TERM UF', run: 8986, serie: 'B', quantity: 135817.7586, cartolaPrice: 1931.2171 },
  { fundName: 'ACCIONES EEUU', run: 8987, serie: 'B', quantity: 126.9504, cartolaPrice: 611888.396 },
  { fundName: 'FI RTA DINAMICA', run: 9607, serie: 'B', quantity: 87431.2472, cartolaPrice: 1519.9686 },
  { fundName: 'AGRESIVO EST', run: 8253, serie: 'C', quantity: 12940.0255, cartolaPrice: 3587.4882 },
];

const fromDate = '2025-04-16'; // 1 year ago

// Resolve fondo_ids
const fundMap = new Map();
for (const h of holdings) {
  const { data } = await supabase
    .from('fondos_mutuos')
    .select('id')
    .eq('fo_run', h.run)
    .eq('fm_serie', h.serie)
    .single();
  if (data) {
    fundMap.set(data.id, h);
    h.fondoId = data.id;
    console.log(`${h.fundName}: fondo_id=${data.id}`);
  } else {
    console.log(`${h.fundName}: NOT FOUND in DB`);
  }
}

// Check prices for each fund
for (const h of holdings) {
  if (!h.fondoId) continue;

  const { data: prices } = await supabase
    .from('fondos_rentabilidades_diarias')
    .select('fecha, valor_cuota')
    .eq('fondo_id', h.fondoId)
    .gte('fecha', fromDate)
    .order('fecha', { ascending: true })
    .limit(5);

  const { data: latest } = await supabase
    .from('fondos_rentabilidades_diarias')
    .select('fecha, valor_cuota')
    .eq('fondo_id', h.fondoId)
    .gte('fecha', fromDate)
    .order('fecha', { ascending: false })
    .limit(3);

  const { count } = await supabase
    .from('fondos_rentabilidades_diarias')
    .select('id', { count: 'exact', head: true })
    .eq('fondo_id', h.fondoId)
    .gte('fecha', fromDate);

  console.log(`\n${h.fundName} (${count} precios desde ${fromDate}):`);
  console.log(`  Cartola price: ${h.cartolaPrice}`);
  if (prices?.[0]) {
    const dbPrice = prices[0].valor_cuota;
    const ratio = h.cartolaPrice / dbPrice;
    console.log(`  First DB price: ${prices[0].fecha} = ${dbPrice}`);
    console.log(`  Ratio cartola/DB: ${ratio.toFixed(2)}x`);
    if (ratio > 500) console.log(`  >>> MONEDA DISTINTA: cartola CLP, DB USD`);
    console.log(`  Value if CLP: qty*price = ${(h.quantity * dbPrice).toLocaleString()}`);
    if (ratio > 500) {
      console.log(`  Value if USD*950: qty*price*950 = ${(h.quantity * dbPrice * 950).toLocaleString()}`);
    }
  }
  if (latest?.[0]) {
    console.log(`  Latest DB price: ${latest[0].fecha} = ${latest[0].valor_cuota}`);
  }
}
