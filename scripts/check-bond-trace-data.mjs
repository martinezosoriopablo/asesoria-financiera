// Check existing bond_prices (TRACE) and match against unitCost from cartola
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const hdrs = { apikey: KEY, Authorization: `Bearer ${KEY}` };

async function main() {
  // 1. All TRACE prices we have
  const rows = await fetch(
    `${URL}/rest/v1/bond_prices?select=cusip,issuer,price_date,last_price&order=price_date.asc&limit=5000`,
    { headers: hdrs }
  ).then(r => r.json());

  console.log(`bond_prices rows in DB: ${rows.length}`);

  const byCusip = {};
  for (const r of rows) {
    if (!byCusip[r.cusip]) byCusip[r.cusip] = { issuer: r.issuer, prices: [] };
    byCusip[r.cusip].prices.push({ date: r.price_date, price: Number(r.last_price) });
  }

  for (const [cusip, data] of Object.entries(byCusip)) {
    const p = data.prices;
    console.log(`  ${cusip} | ${data.issuer} | ${p.length} days | ${p[0].date} → ${p[p.length - 1].date}`);
  }

  // 2. Bond holdings from latest snapshot
  const snaps = await fetch(
    `${URL}/rest/v1/portfolio_snapshots?select=holdings&order=snapshot_date.desc&limit=1`,
    { headers: hdrs }
  ).then(r => r.json());

  const bonds = (snaps[0]?.holdings || []).filter(h => h.couponRate && h.maturityDate);

  console.log(`\n${'═'.repeat(90)}`);
  console.log('MATCHING unitCost contra historial TRACE');
  console.log('═'.repeat(90));

  for (const b of bonds) {
    const cusip = b.securityId;
    console.log(`\n▸ ${b.fundName} (${cusip || 'NO CUSIP'})`);
    console.log(`  unitCost: ${b.unitCost}% | marketPrice: ${b.marketPrice}%`);

    if (!cusip || !byCusip[cusip]) {
      console.log(`  ⚠ No TRACE data available`);
      continue;
    }

    const prices = byCusip[cusip].prices;
    let bestMatch = null;
    let bestDiff = Infinity;
    // Find all prices within 0.5 of unitCost
    const closeMatches = [];

    for (const p of prices) {
      const diff = Math.abs(p.price - b.unitCost);
      if (diff < bestDiff) {
        bestDiff = diff;
        bestMatch = p;
      }
      if (diff < 0.5) {
        closeMatches.push(p);
      }
    }

    console.log(`  TRACE range: ${prices[0].date} → ${prices[prices.length - 1].date} (${prices.length} days)`);
    console.log(`  Best match: ${bestMatch.date} @ ${bestMatch.price} (diff: ${bestDiff.toFixed(4)})`);

    if (closeMatches.length > 0) {
      console.log(`  Close matches (within 0.5):`);
      // Show first and last
      const first = closeMatches[0];
      const last = closeMatches[closeMatches.length - 1];
      console.log(`    First: ${first.date} @ ${first.price}`);
      if (closeMatches.length > 1) {
        console.log(`    Last:  ${last.date} @ ${last.price}`);
        console.log(`    Total: ${closeMatches.length} days within range`);
      }
    }

    // Show price on earliest date (to see if we need more history)
    console.log(`  Earliest TRACE price: ${prices[0].date} @ ${prices[0].price}`);
  }
}

main().catch(console.error);
