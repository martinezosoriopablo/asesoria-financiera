import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
);

const today = '2026-06-01';

// Cartola data extracted from PDF by Gemini
const cartola = [
  { nemo: "CFIETFCC", qty: 404536, costPrice: 1367.26, costAmount: 554093276, marketPrice: 1493.1003, marketAmount: 604012823 },
  { nemo: "CFIETFIPSA", qty: 84954, costPrice: 1173.30, costAmount: 99854451, marketPrice: 1321.80, marketAmount: 112292197 },
  { nemo: "CFIETFLP", qty: 604599, costPrice: 1143.15, costAmount: 692383352, marketPrice: 1168.80, marketAmount: 706655311 },
  { nemo: "CFIFALCFIW", qty: 119325, costPrice: 1459.01, costAmount: 174407278, marketPrice: 1488.8233, marketAmount: 177653840 },
  { nemo: "CFIFALCTAC", qty: 58715, costPrice: 3419.99, costAmount: 201163731, marketPrice: 3993.9512, marketAmount: 234504845 },
  { nemo: "CFIIMDLAT", qty: 915, costPrice: 189693.87, costAmount: 173879714, marketPrice: 181160.8757, marketAmount: 165762201 },
  { nemo: "CFIBAIN11A", qty: 4849, costPrice: 38209.72, costAmount: 185278933, marketPrice: 28122.9252, marketAmount: 136368064 },
  { nemo: "AGUAS-A", qty: 477090, costPrice: 276.56, costAmount: 131944008, marketPrice: 369.00, marketAmount: 176046210 },
  { nemo: "BSANTANDER", qty: 1159660, costPrice: 57.00, costAmount: 66218606, marketPrice: 75.00, marketAmount: 86974500 },
  { nemo: "CAP", qty: 39758, costPrice: 7047.90, costAmount: 280210408, marketPrice: 7107.00, marketAmount: 282560106 },
  { nemo: "CENCOSUD", qty: 13550, costPrice: 2868.76, costAmount: 38941207, marketPrice: 2727.40, marketAmount: 36956270 },
  { nemo: "CFMITNIPSA", qty: 48526, costPrice: 3262.53, costAmount: 158600443, marketPrice: 5256.6167, marketAmount: 255082582 },
  { nemo: "LTM", qty: 13142231, costPrice: 15.09, costAmount: 198555740, marketPrice: 24.56, marketAmount: 322773193 },
  { nemo: "MALLPLAZA", qty: 17950, costPrice: 1358.07, costAmount: 24377511, marketPrice: 4079.90, marketAmount: 73234205 },
  { nemo: "PARAUCO", qty: 18615, costPrice: 1949.90, costAmount: 36362179, marketPrice: 4145.00, marketAmount: 77159175 },
  { nemo: "DISPONIBLE-L", qty: 521.6512, costPrice: 51353.96, costAmount: 26788856, marketPrice: 51655.0631, marketAmount: 26945926 },
  { nemo: "PACP-L", qty: 23532.0826, costPrice: 1130.42, costAmount: 26601269, marketPrice: 1140.1068, marketAmount: 26829087 },
  { nemo: "UTILIDADES-L", qty: 21420.6698, costPrice: 2340.84, costAmount: 50142376, marketPrice: 3925.9892, marketAmount: 84097318 },
  { nemo: "BBNSBB0920", qty: 4000, costPrice: null, costAmount: null, marketPrice: 36187.2725, marketAmount: 144749090 },
  { nemo: "BCHIEV1117", qty: 3000, costPrice: null, costAmount: null, marketPrice: 39453.0497, marketAmount: 118359149 },
  { nemo: "BESTR50517", qty: 5000, costPrice: null, costAmount: null, marketPrice: 40493.2924, marketAmount: 202466462 },
  { nemo: "BFORU-CV", qty: 3500, costPrice: null, costAmount: null, marketPrice: 40974.7851, marketAmount: 143411748 },
  { nemo: "PADCP-L", qty: 379.3047, costPrice: 908100.0082, costAmount: 344790258, marketPrice: 932900.00, marketAmount: 353809226 },
];

// --- Helper: get current price (CLP) ---
async function getCurrentPrice(c) {
  const nemo = c.nemo;

  // Fondos mutuos by RUN
  const runMap = { 'DISPONIBLE-L': 8052, 'PACP-L': 10519, 'UTILIDADES-L': null, 'PADCP-L': 10632 };
  if (runMap[nemo] !== undefined) {
    const run = runMap[nemo];
    if (!run) {
      // Utilidades - search by name
      const { data: fondos } = await sb.from('fondos_mutuos')
        .select('id, fm_serie, nombre_fondo').ilike('nombre_fondo', '%utilidades%').eq('fm_serie', 'L').limit(5);
      if (fondos?.length) {
        const minD = new Date(today); minD.setDate(minD.getDate() - 7);
        const { data: p } = await sb.from('fondos_rentabilidades_diarias')
          .select('valor_cuota, fecha').eq('fondo_id', fondos[0].id)
          .gte('fecha', minD.toISOString().split('T')[0]).lte('fecha', today)
          .order('fecha', { ascending: false }).limit(1).single();
        if (p?.valor_cuota > 0) return { price: p.valor_cuota, source: 'cmf-fm' };
      }
      return null;
    }
    const serie = nemo.match(/-([A-Z])$/)?.[1] || 'L';
    let q = sb.from('fondos_mutuos').select('id, fm_serie').eq('fo_run', run);
    if (serie) q = q.eq('fm_serie', serie);
    const { data: fondos } = await q.limit(5);
    if (fondos?.length) {
      const minD = new Date(today); minD.setDate(minD.getDate() - 7);
      const { data: p } = await sb.from('fondos_rentabilidades_diarias')
        .select('valor_cuota, fecha').eq('fondo_id', fondos[0].id)
        .gte('fecha', minD.toISOString().split('T')[0]).lte('fecha', today)
        .order('fecha', { ascending: false }).limit(1).single();
      if (p?.valor_cuota > 0) return { price: p.valor_cuota, source: 'cmf-fm' };
    }
    return null;
  }

  // CFIBAIN11A → CMF FI
  if (nemo === 'CFIBAIN11A') {
    const { data: fi } = await sb.from('fondos_inversion')
      .select('id').ilike('nombre', '%inmobiliario%xi%').eq('activo', true).limit(1);
    if (fi?.length) {
      const minD = new Date(today); minD.setDate(minD.getDate() - 7);
      const { data: prices } = await sb.from('fondos_inversion_precios')
        .select('valor_libro, fecha').eq('fondo_id', fi[0].id).eq('serie', 'A')
        .gte('fecha', minD.toISOString().split('T')[0]).lte('fecha', today)
        .order('fecha', { ascending: false }).limit(1);
      if (prices?.[0]?.valor_libro > 0) return { price: prices[0].valor_libro, source: 'cmf-fi' };
    }
    return null;
  }

  // Bonds UF — no live price source
  if (/^B[A-Z]{2,}/.test(nemo) && !nemo.startsWith('BSANTANDER')) {
    return null;
  }

  // CFI* / CFIETF* / Stocks → Yahoo .SN
  const ticker = nemo.toUpperCase().endsWith('.SN') ? nemo.toUpperCase() : nemo.toUpperCase() + '.SN';
  return await yahooPrice(ticker);
}

async function yahooPrice(ticker) {
  const minD = new Date(today); minD.setDate(minD.getDate() - 7);
  const from = Math.floor(minD.getTime() / 1000);
  const to = Math.floor(new Date(today).getTime() / 1000) + 86400;
  try {
    const res = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?period1=${from}&period2=${to}&interval=1d`, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (!data.chart?.result?.length) return null;
    const closes = data.chart.result[0].indicators?.quote?.[0]?.close || [];
    if (!closes.length) return null;
    return { price: closes[closes.length - 1], source: 'yahoo' };
  } catch { return null; }
}

// --- Build table ---
const fmt = (n) => n == null ? '-' : Math.round(Number(n)).toLocaleString('en-US');
const fmtP = (n) => n == null ? '-' : Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

console.log(`${'#'.padStart(2)} | ${'Nemo'.padEnd(16)} | ${'Qty'.padStart(14)} | ${'P.Costo'.padStart(12)} | ${'MV Costo'.padStart(16)} | ${'P.28Feb'.padStart(12)} | ${'MV 28Feb'.padStart(16)} | ${'P.Hoy'.padStart(12)} | ${'MV Hoy'.padStart(16)} | ${'G/P Costo'.padStart(10)} | ${'Fuente'.padEnd(7)}`);
console.log('-'.repeat(175));

let totalCosto = 0;
let totalFeb = 0;
let totalHoy = 0;
let totalCostoKnown = 0;
let totalFebKnown = 0;

for (let i = 0; i < cartola.length; i++) {
  const c = cartola[i];
  const qty = c.qty;
  const hasCost = c.costAmount != null;

  // Current price
  const current = await getCurrentPrice(c);
  const mvHoy = current ? qty * current.price : null;

  if (hasCost) {
    totalCosto += c.costAmount;
    totalCostoKnown += c.costAmount;
    totalFebKnown += c.marketAmount;
  }
  totalFeb += c.marketAmount;
  totalHoy += mvHoy || c.marketAmount; // fallback to Feb value if no current price

  const gpCosto = hasCost && mvHoy ? ((mvHoy / c.costAmount - 1) * 100).toFixed(1) + '%' : '-';

  console.log(
    `${String(i+1).padStart(2)} | ${c.nemo.slice(0,16).padEnd(16)} | ${fmtP(qty).padStart(14)} | ${(hasCost ? fmtP(c.costPrice) : '-').padStart(12)} | ${(hasCost ? fmt(c.costAmount) : '-').padStart(16)} | ${fmtP(c.marketPrice).padStart(12)} | ${fmt(c.marketAmount).padStart(16)} | ${(current ? fmtP(current.price) : '???').padStart(12)} | ${(mvHoy != null ? fmt(mvHoy) : '???').padStart(16)} | ${gpCosto.padStart(10)} | ${(current?.source || '-').padEnd(7)}`
  );
}

console.log('-'.repeat(175));
console.log(`   | ${'TOTALES'.padEnd(16)} | ${''.padStart(14)} | ${''.padStart(12)} | ${fmt(totalCosto).padStart(16)} | ${''.padStart(12)} | ${fmt(totalFeb).padStart(16)} | ${''.padStart(12)} | ${fmt(totalHoy).padStart(16)} |`);
console.log('');
console.log(`   Costo total (sin bonos):      $${fmt(totalCosto)}`);
console.log(`   Valor 28-Feb (cartola):        $${fmt(totalFeb)}`);
console.log(`   Valor Hoy (01-Jun):            $${fmt(totalHoy)}`);
console.log('');
console.log(`   Costo → 28-Feb:  ${((totalFeb / totalCosto - 1) * 100).toFixed(2)}%`);
console.log(`   28-Feb → Hoy:    ${((totalHoy / totalFeb - 1) * 100).toFixed(2)}%`);
console.log(`   Costo → Hoy:     ${((totalHoy / totalCosto - 1) * 100).toFixed(2)}%`);
console.log('');
console.log(`   Nota: Bonos UF (#19-22) sin precio hoy — se usa valor cartola 28-Feb como proxy.`);
console.log(`   Nota: PADCP-L (#23) es fondo en USD — precio cartola ya convertido a CLP.`);
