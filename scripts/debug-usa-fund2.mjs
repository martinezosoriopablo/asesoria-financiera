import { createClient } from '@supabase/supabase-js';

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const fondoId = '3071887a-6094-4566-8244-3b4cdbeb0fcc'; // INDEX FUND US serie B

// Get ALL prices for this fund
const { data: prices, error } = await sb.from('fondos_rentabilidades_diarias')
  .select('fecha, valor_cuota')
  .eq('fondo_id', fondoId)
  .order('fecha', { ascending: true });

if (error) { console.error(error); process.exit(1); }
console.log(`Total prices: ${prices.length}`);

// Print all and highlight jumps
let prev = null;
for (const p of prices) {
  const jump = prev ? p.valor_cuota / prev.valor_cuota : 1;
  const marker = (jump > 2 || jump < 0.5) ? ' <<< JUMP x' + jump.toFixed(0) : '';
  if (marker || !prev) {
    console.log(`${p.fecha}: ${p.valor_cuota}${marker}`);
  }
  prev = p;
}

console.log(`\nFirst 5 prices:`);
for (const p of prices.slice(0, 5)) console.log(`  ${p.fecha}: ${p.valor_cuota}`);
console.log(`\nLast 5 prices:`);
for (const p of prices.slice(-5)) console.log(`  ${p.fecha}: ${p.valor_cuota}`);

// Now check: what does current-prices return for this holding?
// The cartola says unitCost=607.95 (USD), marketPrice=659.74 (USD), quantity=126.95
// Latest DB price = 762.95 (USD)
// So currentPrice should be 762.95 USD * 126.95 qty = ? but we need CLP conversion
console.log('\n=== Price range analysis ===');
const vals = prices.map(p => p.valor_cuota);
const min = Math.min(...vals);
const max = Math.max(...vals);
const median = vals.sort((a,b) => a-b)[Math.floor(vals.length/2)];
console.log(`Min: ${min}, Max: ${max}, Median: ${median}`);
console.log(`Max/Min ratio: ${(max/min).toFixed(2)}`);

// If max/min > 500, there's definitely a CLP/USD mix
if (max/min > 500) {
  console.log('\n!!! DETECTED CLP/USD MIX in price history !!!');
  // Find the boundary
  for (let i = 1; i < prices.length; i++) {
    const ratio = prices[i].valor_cuota / prices[i-1].valor_cuota;
    if (ratio > 500 || ratio < 0.002) {
      console.log(`Boundary at: ${prices[i-1].fecha} (${prices[i-1].valor_cuota}) -> ${prices[i].fecha} (${prices[i].valor_cuota})`);
    }
  }
}
