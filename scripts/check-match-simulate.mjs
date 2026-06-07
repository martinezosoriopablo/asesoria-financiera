import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
config({ path: '.env.local' });

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const { data: snap } = await sb
  .from('portfolio_snapshots')
  .select('holdings, snapshot_date')
  .eq('client_id', 'e78758a9-604e-482b-94a9-faa382aa5e57')
  .order('snapshot_date', { ascending: false })
  .limit(1)
  .single();

const holdings = snap.holdings;
const cartolaDate = snap.snapshot_date;

const { data: agfFunds } = await sb
  .from('vw_fondos_completo')
  .select('id, fo_run, fm_serie, nombre_fondo, nombre_agf, familia_estudios')
  .ilike('nombre_agf', '%security%')
  .limit(1000);
if (!agfFunds) { console.log('No AGF funds found'); process.exit(1); }

const windowStart = new Date(new Date(cartolaDate + 'T12:00:00Z').getTime() - 7 * 86400000).toISOString().split('T')[0];

const { data: prices } = await sb
  .from('fondos_rentabilidades_diarias')
  .select('fondo_id, valor_cuota, fecha')
  .in('fondo_id', agfFunds.map(f => f.id))
  .lte('fecha', cartolaDate)
  .gte('fecha', windowStart)
  .order('fecha', { ascending: false });

const priceMap = new Map();
for (const p of prices) {
  if (!priceMap.has(p.fondo_id)) priceMap.set(p.fondo_id, p.valor_cuota);
}

console.log(`Simulating WITH currency detection fix:\n`);

for (let i = 0; i < holdings.length; i++) {
  const h = holdings[i];
  const holdingPrice = h.marketPrice;
  if (!holdingPrice || holdingPrice <= 0) continue;

  let bestMatch = null;
  let bestScore = -1;

  for (const fondo of agfFunds) {
    const dbPrice = priceMap.get(fondo.id);
    if (!dbPrice || dbPrice <= 0) continue;

    const priceDiff = Math.abs(dbPrice - holdingPrice) / holdingPrice;

    // Name scoring
    const hWords = h.fundName.toLowerCase().split(/\s+/).filter(w => w.length > 3);
    const fLower = fondo.nombre_fondo.toLowerCase();
    let nameScore = 0;
    for (const w of hWords) { if (fLower.includes(w)) nameScore++; }

    let matched = false;
    let matchType = '';

    if (priceDiff < 0.01 || Math.abs(dbPrice - holdingPrice) < 1) {
      matched = true;
      matchType = 'PRICE';
    } else {
      // Currency detection: CLP/USD
      const ratio = holdingPrice / dbPrice;
      if (ratio >= 700 && ratio <= 1200) {
        matched = true;
        matchType = 'CURRENCY (CLP/USD)';
        nameScore += 1;
      }
    }

    if (matched && nameScore > bestScore) {
      bestScore = nameScore;
      bestMatch = { fondo, dbPrice, matchType };
    }
  }

  if (bestMatch) {
    console.log(`#${i} ${h.fundName.substring(0, 30).padEnd(30)} -> ${bestMatch.fondo.nombre_fondo} ${bestMatch.fondo.fm_serie} | ${bestMatch.matchType}`);
  } else {
    console.log(`#${i} ${h.fundName.substring(0, 30).padEnd(30)} -> NO MATCH`);
  }
}
