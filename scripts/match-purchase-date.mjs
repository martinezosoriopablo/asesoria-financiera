// Match bond unitCost against TRACE historical prices to estimate purchase date
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const hdrs = { apikey: KEY, Authorization: `Bearer ${KEY}` };

async function main() {
  // 1. Get all TRACE prices
  const rows = await fetch(
    `${URL}/rest/v1/bond_prices?select=cusip,issuer,price_date,last_price&order=price_date.asc&limit=5000`,
    { headers: hdrs }
  ).then(r => r.json());

  const byCusip = {};
  for (const r of rows) {
    if (!byCusip[r.cusip]) byCusip[r.cusip] = { issuer: r.issuer, prices: [] };
    byCusip[r.cusip].prices.push({ date: r.price_date, price: Number(r.last_price) });
  }

  // 2. Get manual snapshot with full bond data
  const snaps = await fetch(
    `${URL}/rest/v1/portfolio_snapshots?select=snapshot_date,holdings&source=eq.manual&order=snapshot_date.desc&limit=1`,
    { headers: hdrs }
  ).then(r => r.json());

  const bonds = (snaps[0]?.holdings || []).filter(h => h.assetType === 'bond');

  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║  Estimación de fecha de compra via TRACE price matching     ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');
  console.log(`Snapshot: ${snaps[0]?.snapshot_date} | Bonds: ${bonds.length}`);
  console.log(`TRACE data: ${rows.length} price points, ${Object.keys(byCusip).length} CUSIPs`);
  console.log();

  for (const b of bonds) {
    const cusip = b.securityId;
    console.log(`▸ ${b.fundName} (${cusip})`);
    console.log(`  Cupón: ${b.couponRate}% | Maturity: ${b.maturityDate} | Rating: ${b.creditRating}`);
    console.log(`  Unit Cost (precio compra): ${b.unitCost}%`);
    console.log(`  Market Price (actual):     ${b.marketPrice}%`);

    if (!cusip || !byCusip[cusip]) {
      console.log(`  ⚠ No TRACE data for ${cusip}`);
      console.log();
      continue;
    }

    const prices = byCusip[cusip].prices;
    console.log(`  TRACE: ${prices.length} days (${prices[0].date} → ${prices[prices.length - 1].date})`);

    // Find closest price to unitCost
    let bestMatch = null;
    let bestDiff = Infinity;
    const closeMatches = [];

    for (const p of prices) {
      const diff = Math.abs(p.price - b.unitCost);
      if (diff < bestDiff) {
        bestDiff = diff;
        bestMatch = p;
      }
      if (diff <= 0.25) closeMatches.push(p);
    }

    console.log();
    console.log(`  ★ Best match: ${bestMatch.date} @ ${bestMatch.price}% (diff: ${bestDiff.toFixed(4)})`);

    if (closeMatches.length > 0) {
      console.log(`  Matches within ±0.25%:`);
      for (const m of closeMatches) {
        const diff = (m.price - b.unitCost).toFixed(4);
        console.log(`    ${m.date} @ ${m.price}% (${diff > 0 ? '+' : ''}${diff})`);
      }
      console.log(`  → Estimated purchase window: ${closeMatches[0].date} to ${closeMatches[closeMatches.length - 1].date}`);
    } else {
      console.log(`  No prices within ±0.25 of unitCost ${b.unitCost}`);
      // Show the 3 closest
      const sorted = prices.map(p => ({ ...p, diff: Math.abs(p.price - b.unitCost) }))
        .sort((a, c) => a.diff - c.diff)
        .slice(0, 3);
      console.log(`  3 closest:`);
      for (const s of sorted) {
        console.log(`    ${s.date} @ ${s.price}% (diff: ${s.diff.toFixed(4)})`);
      }
    }

    // Also show price trend around the best match
    const bestIdx = prices.findIndex(p => p.date === bestMatch.date);
    if (bestIdx >= 0) {
      console.log(`  Price context around best match:`);
      const start = Math.max(0, bestIdx - 2);
      const end = Math.min(prices.length - 1, bestIdx + 2);
      for (let i = start; i <= end; i++) {
        const marker = i === bestIdx ? ' ◄─' : '';
        console.log(`    ${prices[i].date} @ ${prices[i].price}%${marker}`);
      }
    }

    console.log('─'.repeat(65));
  }

  // Summary: what we'd need
  console.log();
  console.log('RESUMEN:');
  console.log(`TRACE actual cubre: ${rows.length > 0 ? rows[0].price_date : '?'} → ${rows.length > 0 ? rows[rows.length - 1].price_date : '?'}`);
  console.log('Si unitCost cae fuera de ese rango, necesitamos más historia TRACE.');
  console.log('fetchHistoricalPrices() soporta un parámetro "days" para ampliar el rango.');
}

main().catch(console.error);
