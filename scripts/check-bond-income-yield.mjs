// Query real bond holdings from Supabase to compare estIncomeYield vs calculated YTM/YoC
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

async function query(sql) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/exec_sql`, {
    method: 'POST',
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query: sql }),
  });
  if (!res.ok) return null;
  return res.json();
}

// Supabase REST API — query portfolio_snapshots for bonds
async function fetchBondHoldings() {
  // Get recent snapshots that have holdings
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/portfolio_snapshots?select=id,client_id,snapshot_date,holdings,source&order=snapshot_date.desc&limit=20`,
    {
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json',
      },
    }
  );
  if (!res.ok) {
    console.error('Failed to fetch snapshots:', res.status, await res.text());
    return;
  }
  const snapshots = await res.json();

  console.log(`Found ${snapshots.length} recent snapshots\n`);

  // Find bond holdings with estIncomeYield
  const bonds = [];
  for (const snap of snapshots) {
    if (!snap.holdings) continue;
    const holdings = typeof snap.holdings === 'string' ? JSON.parse(snap.holdings) : snap.holdings;
    for (const h of holdings) {
      if (h.assetClass === 'bond' || h.assetType === 'bond' ||
          (h.couponRate && h.maturityDate)) {
        bonds.push({
          snapshotDate: snap.snapshot_date,
          source: snap.source,
          fundName: h.fundName,
          couponRate: h.couponRate,
          maturityDate: h.maturityDate,
          quantity: h.quantity,
          unitCost: h.unitCost,
          marketPrice: h.marketPrice,
          marketValue: h.marketValue,
          costBasis: h.costBasis,
          estIncomeYield: h.estIncomeYield,
          estAnnualIncome: h.estAnnualIncome,
          creditRating: h.creditRating,
        });
      }
    }
  }

  if (bonds.length === 0) {
    console.log('No bond holdings found in recent snapshots.');
    return;
  }

  console.log(`Found ${bonds.length} bond holdings across snapshots\n`);
  console.log("═".repeat(100));

  // Analyze each unique bond (deduplicate by fundName)
  const seen = new Set();
  for (const b of bonds) {
    const key = b.fundName;
    if (seen.has(key)) continue;
    seen.add(key);

    console.log(`\n▸ ${b.fundName}`);
    console.log(`  Snapshot: ${b.snapshotDate} | Source: ${b.source}`);
    console.log(`  Cupón: ${b.couponRate}% | Maturity: ${b.maturityDate} | Rating: ${b.creditRating}`);
    console.log(`  Unit Cost: ${b.unitCost} | Market Price: ${b.marketPrice}`);
    console.log(`  Quantity (face): ${b.quantity} | Market Value: $${b.marketValue?.toLocaleString()}`);
    console.log(`  Cost Basis: $${b.costBasis?.toLocaleString()}`);
    console.log(`  Est Income Yield: ${b.estIncomeYield}%`);
    console.log(`  Est Annual Income: $${b.estAnnualIncome}`);

    // Calculate metrics
    if (b.couponRate && b.unitCost && b.maturityDate) {
      const couponRateDecimal = b.couponRate / 100;
      const purchasePrice = b.unitCost;  // % of par
      const faceValue = b.quantity || (b.marketValue / (b.marketPrice / 100));
      const freq = 2;

      // 1. Yield on cost simple
      const yoc = couponRateDecimal * 100 / purchasePrice * 100;

      // 2. Est Annual Income / Cost Basis
      const incomeOverCost = b.estAnnualIncome && b.costBasis
        ? (b.estAnnualIncome / b.costBasis * 100) : null;

      // 3. Coupon / face value (nominal)
      const nominalYield = couponRateDecimal * 100;

      // 4. Current yield (coupon / market price)
      const currentYield = b.marketPrice ? couponRateDecimal * 100 / b.marketPrice * 100 : null;

      // 5. YTM at purchase price (Newton-Raphson)
      const ytmAtPurchase = calcYTM(faceValue, couponRateDecimal, freq, b.maturityDate, purchasePrice, b.snapshotDate);

      // 6. Income / Face Value check
      const incomeOverFace = b.estAnnualIncome && faceValue
        ? (b.estAnnualIncome / faceValue * 100) : null;

      console.log();
      console.log("  ┌─ Comparación de tasas ────────────────────────────");
      console.log(`  │ Cupón nominal:          ${nominalYield.toFixed(4)}%`);
      console.log(`  │ Yield on cost (cup/px):  ${yoc.toFixed(4)}%`);
      console.log(`  │ Current yield (cup/mkt): ${currentYield?.toFixed(4) || 'N/A'}%`);
      console.log(`  │ TIR de compra (YTM):     ${isNaN(ytmAtPurchase) ? 'N/A' : (ytmAtPurchase * 100).toFixed(4) + '%'}`);
      console.log(`  │ Income/CostBasis:        ${incomeOverCost?.toFixed(4) || 'N/A'}%`);
      console.log(`  │ Income/FaceValue:        ${incomeOverFace?.toFixed(4) || 'N/A'}%`);
      console.log(`  │ Est Income Yield (cart):  ${b.estIncomeYield}%`);
      console.log("  └──────────────────────────────────────────────────");

      // Identify closest match
      const eiy = b.estIncomeYield;
      if (eiy) {
        const diffs = [
          { name: 'Cupón nominal', diff: Math.abs(eiy - nominalYield) },
          { name: 'Yield on cost', diff: Math.abs(eiy - yoc) },
          { name: 'Current yield', diff: currentYield ? Math.abs(eiy - currentYield) : 999 },
          { name: 'TIR compra', diff: !isNaN(ytmAtPurchase) ? Math.abs(eiy - ytmAtPurchase * 100) : 999 },
          { name: 'Income/CostBasis', diff: incomeOverCost ? Math.abs(eiy - incomeOverCost) : 999 },
          { name: 'Income/FaceValue', diff: incomeOverFace ? Math.abs(eiy - incomeOverFace) : 999 },
        ];
        diffs.sort((a, b) => a.diff - b.diff);
        console.log(`  ★ Mejor match: ${diffs[0].name} (diff: ${diffs[0].diff.toFixed(4)}%)`);
      }
    }
    console.log("─".repeat(100));
  }
}

function calcYTM(faceValue, couponRate, freq, maturityDate, price, asOfDateStr) {
  const coupon = faceValue * couponRate / freq;
  const monthsPerPeriod = 12 / freq;
  const maturity = new Date(maturityDate + "T00:00:00");
  const ref = new Date(asOfDateStr + "T00:00:00");
  if (maturity <= ref) return NaN;

  let d = new Date(maturity);
  let N = 0;
  while (d > ref) { N++; d.setMonth(d.getMonth() - monthsPerPeriod); }
  if (N === 0) return NaN;

  const marketPrice = price / 100 * faceValue;

  function priceFn(y) {
    let pv = 0;
    for (let i = 1; i <= N; i++) pv += coupon / Math.pow(1 + y, i);
    pv += faceValue / Math.pow(1 + y, N);
    return pv;
  }
  function dPriceFn(y) {
    let dpv = 0;
    for (let i = 1; i <= N; i++) dpv -= i * coupon / Math.pow(1 + y, i + 1);
    dpv -= N * faceValue / Math.pow(1 + y, N + 1);
    return dpv;
  }

  let y = couponRate / freq;
  for (let iter = 0; iter < 200; iter++) {
    const p = priceFn(y);
    const dp = dPriceFn(y);
    if (Math.abs(dp) < 1e-12) break;
    const diff = p - marketPrice;
    if (Math.abs(diff) < 0.0001) break;
    y -= diff / dp;
    if (y <= -1) y = 0.001;
  }
  return y * freq;
}

fetchBondHoldings().catch(console.error);
