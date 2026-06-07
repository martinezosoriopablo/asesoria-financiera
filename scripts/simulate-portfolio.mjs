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

// Cartola total
const cartolaTotal = holdings.reduce((s, h) => s + h.quantity * h.cartolaPrice, 0);
console.log(`Cartola total: $${Math.round(cartolaTotal).toLocaleString()}`);

// Get latest prices and simulate
for (const h of holdings) {
  const { data: fondo } = await supabase
    .from('fondos_mutuos').select('id')
    .eq('fo_run', h.run).eq('fm_serie', h.serie).single();
  if (!fondo) continue;

  const { data: latest } = await supabase
    .from('fondos_rentabilidades_diarias')
    .select('fecha, valor_cuota')
    .eq('fondo_id', fondo.id)
    .order('fecha', { ascending: false })
    .limit(1).single();

  if (!latest) continue;

  const dbPrice = latest.valor_cuota;
  const ratio = h.cartolaPrice / dbPrice;
  const isUSD = ratio >= 500 && ratio <= 1500;

  let effectivePrice = dbPrice;
  if (isUSD) {
    // Fetch dolar observado
    const [y, m, d] = latest.fecha.split('-');
    const res = await fetch(`https://mindicador.cl/api/dolar/${d}-${m}-${y}`);
    const data = await res.json();
    const dolar = data.serie?.[0]?.valor || 950;
    effectivePrice = dbPrice * dolar;
    console.log(`${h.fundName}: DB=${dbPrice} USD × ${dolar} = ${Math.round(effectivePrice)} CLP, value=${Math.round(h.quantity * effectivePrice).toLocaleString()}`);
  } else {
    console.log(`${h.fundName}: DB=${dbPrice} CLP, value=${Math.round(h.quantity * effectivePrice).toLocaleString()}`);
  }
}

// Simulate for a specific date to check
console.log('\n--- Simulating 2026-04-22 portfolio value ---');
let total = 0;
for (const h of holdings) {
  const { data: fondo } = await supabase
    .from('fondos_mutuos').select('id')
    .eq('fo_run', h.run).eq('fm_serie', h.serie).single();
  if (!fondo) continue;

  const { data: price } = await supabase
    .from('fondos_rentabilidades_diarias')
    .select('valor_cuota')
    .eq('fondo_id', fondo.id)
    .eq('fecha', '2026-04-22')
    .single();

  if (!price) {
    console.log(`${h.fundName}: NO price for 2026-04-22`);
    continue;
  }

  const ratio = h.cartolaPrice / price.valor_cuota;
  const isUSD = ratio >= 500 && ratio <= 1500;
  let val = h.quantity * price.valor_cuota;
  if (isUSD) {
    val = val * 950; // approximate
    console.log(`${h.fundName}: ${price.valor_cuota} USD × 950 × ${h.quantity.toFixed(0)} = $${Math.round(val).toLocaleString()}`);
  } else {
    console.log(`${h.fundName}: ${price.valor_cuota} × ${h.quantity.toFixed(0)} = $${Math.round(val).toLocaleString()}`);
  }
  total += val;
}
console.log(`\nTotal portfolio value: $${Math.round(total).toLocaleString()}`);
console.log(`Cartola value:        $${Math.round(cartolaTotal).toLocaleString()}`);
console.log(`Diferencia:           ${((total/cartolaTotal - 1) * 100).toFixed(2)}%`);
