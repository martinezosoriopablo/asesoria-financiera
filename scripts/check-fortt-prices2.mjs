import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

// Check what fondos_mutuos has for BCI Cartera Dolar
const { data: bci } = await sb.from('fondos_mutuos')
  .select('run, serie, nombre, moneda_funcional, valor_cuota')
  .ilike('nombre', '%BCI%CARTERA%DOLAR%BALANC%')
  .limit(10);

console.log('=== fondos_mutuos matches for BCI Cartera Dolar ===');
for (const f of bci || []) {
  console.log(`  RUN: ${f.run} | Serie: ${f.serie} | Nombre: ${f.nombre} | Moneda: ${f.moneda_funcional} | Cuota: ${f.valor_cuota}`);
}

// Check DWS in international_prices
const { data: dws } = await sb.from('international_prices')
  .select('ticker, price_date, close_price')
  .ilike('ticker', '%DWS%')
  .order('price_date', { ascending: false })
  .limit(5);

console.log('\n=== international_prices for DWS ===');
for (const p of dws || []) {
  console.log(`  ${p.ticker} | ${p.price_date} | ${p.close_price}`);
}
if (!dws || dws.length === 0) console.log('  (none found)');

// Check DWS with securityId L2R330245
const { data: dwsAlt } = await sb.from('international_prices')
  .select('ticker, price_date, close_price')
  .eq('ticker', 'L2R330245')
  .order('price_date', { ascending: false })
  .limit(5);

console.log('\n=== international_prices for L2R330245 ===');
for (const p of dwsAlt || []) {
  console.log(`  ${p.ticker} | ${p.price_date} | ${p.close_price}`);
}
if (!dwsAlt || dwsAlt.length === 0) console.log('  (none found)');

// Check BNY Mellon too
const { data: bny } = await sb.from('international_prices')
  .select('ticker, price_date, close_price')
  .ilike('ticker', '%BNY%')
  .order('price_date', { ascending: false })
  .limit(5);

console.log('\n=== international_prices for BNY ===');
for (const p of bny || []) {
  console.log(`  ${p.ticker} | ${p.price_date} | ${p.close_price}`);
}
if (!bny || bny.length === 0) console.log('  (none found)');

// Check Jupiter
const { data: jup } = await sb.from('international_prices')
  .select('ticker, price_date, close_price')
  .ilike('ticker', '%Jupiter%')
  .order('price_date', { ascending: false })
  .limit(5);

console.log('\n=== international_prices for Jupiter ===');
for (const p of jup || []) {
  console.log(`  ${p.ticker} | ${p.price_date} | ${p.close_price}`);
}
if (!jup || jup.length === 0) console.log('  (none found)');

// Check UBAM
const { data: ubam } = await sb.from('international_prices')
  .select('ticker, price_date, close_price')
  .ilike('ticker', '%UBAM%')
  .order('price_date', { ascending: false })
  .limit(5);

console.log('\n=== international_prices for UBAM ===');
for (const p of ubam || []) {
  console.log(`  ${p.ticker} | ${p.price_date} | ${p.close_price}`);
}
if (!ubam || ubam.length === 0) console.log('  (none found)');

// Check what RUN BCI Cartera Dolar has
const { data: bciRun } = await sb.from('fondos_mutuos')
  .select('run, serie, nombre, moneda_funcional, valor_cuota')
  .ilike('nombre', '%BCI%CARTERA%DOLAR%')
  .limit(10);

console.log('\n=== All BCI Cartera Dolar funds ===');
for (const f of bciRun || []) {
  console.log(`  RUN: ${f.run} | Serie: ${f.serie} | Nombre: ${f.nombre} | Moneda: ${f.moneda_funcional} | Cuota: ${f.valor_cuota}`);
}
