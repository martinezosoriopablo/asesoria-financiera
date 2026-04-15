// Script to re-fill prices for MFA Inversiones after fixing validation
require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const CLIENT_ID = 'dbf4a715-c39a-4e7b-abc5-f16e9fcea1a5';

// Fintual API helper
async function fetchFintualPrices(fintualId, fromDate, toDate) {
  try {
    const url = `https://fintual.cl/api/real_assets/${fintualId}/days?from_date=${fromDate}&to_date=${toDate}`;
    const res = await fetch(url);
    if (!res.ok) return [];
    const data = await res.json();
    return (data.data || []).map(d => ({
      date: d.attributes.date,
      price: d.attributes.price,
    }));
  } catch { return []; }
}

// Verified manual matches: fundName substring -> fintual_id
// These were validated by comparing cartola prices with Fintual API prices
const MANUAL_MATCHES = {
  'PATRIMONIAL BALANCEADA - B': 16138, // BPRIV serie, price ~1552
  'DOLAR BALANCEADA':           16540, // BPRIV serie, price ~130 USD
  'PATRIMONIAL BALANCEADA - A': 16136, // ALPAT serie, price ~1497
  'MEDIANO PLAZO':              16125, // BPRIV serie, price ~1338
  'DEUDA CORPORATIVA':           8783, // BPRIV serie, price ~1640
};

async function matchToFintual(fundName) {
  for (const [key, fintualId] of Object.entries(MANUAL_MATCHES)) {
    if (fundName.toUpperCase().includes(key)) {
      return { fintual_id: fintualId, fund_name: key, symbol: 'manual-match' };
    }
  }
  return null;
}

async function main() {
  // Get the cartola
  const { data: snapshots } = await supabase
    .from('portfolio_snapshots')
    .select('*')
    .eq('client_id', CLIENT_ID)
    .order('snapshot_date', { ascending: true });

  const cartola = snapshots.find(s => s.source === 'manual' || s.source === 'statement');
  if (!cartola) { console.error('No cartola found'); return; }

  console.log(`Cartola: ${cartola.snapshot_date}, value: ${cartola.total_value}`);
  const holdings = cartola.holdings || [];
  console.log(`Holdings: ${holdings.length}`);

  // Match each holding and get price series
  const startDate = cartola.snapshot_date;
  const endDate = new Date().toISOString().split('T')[0];
  const nextDay = new Date(new Date(startDate).getTime() + 86400000).toISOString().split('T')[0];

  console.log(`\nFilling prices from ${nextDay} to ${endDate}\n`);

  const holdingPrices = new Map(); // fundName -> Map<date, price>
  const basePrices = new Map(); // fundName -> cartola price (in original currency)
  const baseValuesCLP = new Map(); // fundName -> cartola marketValue in CLP

  // Implied USD/CLP from cartola: total_value - sum(CLP holdings) / USD_holding_value
  const clpSum = holdings.filter(h => h.currency !== 'USD').reduce((s, h) => s + h.marketValue, 0);
  const usdHolding = holdings.find(h => h.currency === 'USD');
  const impliedRate = usdHolding ? (cartola.total_value - clpSum) / usdHolding.marketValue : 1;
  console.log(`Implied USD/CLP rate: ${impliedRate.toFixed(2)}`);

  for (const h of holdings) {
    const cartolaPrice = h.quantity > 0 ? h.marketValue / h.quantity : 0;
    basePrices.set(h.fundName, cartolaPrice);
    // Store base CLP value for each holding
    const clpValue = h.currency === 'USD' ? h.marketValue * impliedRate : h.marketValue;
    baseValuesCLP.set(h.fundName, clpValue);

    const match = await matchToFintual(h.fundName);
    if (match) {
      console.log(`  ${h.fundName.substring(0, 50)}`);
      console.log(`    -> ${match.fund_name} (${match.fintual_id}) [${match.symbol}]`);
      console.log(`    Cartola price: ${cartolaPrice.toFixed(4)}, currency: ${h.currency || 'CLP'}`);

      const prices = await fetchFintualPrices(match.fintual_id, nextDay, endDate);
      console.log(`    Got ${prices.length} daily prices`);

      if (prices.length > 0) {
        // Validate first price against cartola
        const firstApiPrice = prices[0].price;
        const ratio = firstApiPrice / cartolaPrice;
        console.log(`    First API price: ${firstApiPrice.toFixed(4)}, ratio: ${ratio.toFixed(4)}`);

        if (ratio < 0.9 || ratio > 1.1) {
          console.log(`    *** REJECTED: price ratio ${ratio.toFixed(2)} is out of range [0.9, 1.1]`);
          console.log(`    *** Will use cartola price ${cartolaPrice.toFixed(4)} as fallback`);
          continue;
        }

        const priceMap = new Map();
        for (const p of prices) priceMap.set(p.date, p.price);
        holdingPrices.set(h.fundName, priceMap);
      }
    } else {
      console.log(`  ${h.fundName.substring(0, 50)}`);
      console.log(`    -> NO MATCH - will use cartola price ${cartolaPrice.toFixed(4)}`);
    }
  }

  // Collect all dates
  const allDates = new Set();
  for (const priceMap of holdingPrices.values()) {
    for (const date of priceMap.keys()) allDates.add(date);
  }
  const sortedDates = [...allDates].sort();
  console.log(`\nDates to fill: ${sortedDates.length}`);

  // Generate snapshots
  let filled = 0;
  let prevValue = cartola.total_value;
  let prevTwrCum = cartola.twr_cumulative || 0;
  const totalCuotas = holdings.reduce((s, h) => s + (h.quantity || 0), 0);

  for (const date of sortedDates) {
    let totalValue = 0;
    const dailyHoldings = [];

    for (const h of holdings) {
      const qty = h.quantity || 0;
      if (qty <= 0) continue;

      const cartolaPrice = basePrices.get(h.fundName) || 0;
      const priceMap = holdingPrices.get(h.fundName);
      const dayPrice = priceMap ? priceMap.get(date) : null;

      // Use API price if available, otherwise cartola price
      const price = dayPrice || cartolaPrice;
      // For USD holdings, scale the CLP base value by price change ratio
      // This avoids needing daily FX rates
      let value;
      if (h.currency === 'USD') {
        const baseCLP = baseValuesCLP.get(h.fundName) || 0;
        const priceRatio = cartolaPrice > 0 ? price / cartolaPrice : 1;
        value = baseCLP * priceRatio;
      } else {
        value = qty * price;
      }
      totalValue += value;

      // Return from base (cartola) price
      const returnFromBase = cartolaPrice > 0 ? Math.round(((price / cartolaPrice) - 1) * 10000) / 100 : 0;

      dailyHoldings.push({
        fundName: h.fundName,
        quantity: qty,
        marketPrice: price,
        marketValue: value,
        assetClass: h.assetClass || 'equity',
        currency: h.currency,
        returnFromBase,
        weight: 0, // will be set after totalValue is known
        source: dayPrice ? 'api' : 'cartola-fallback',
      });
    }

    if (totalValue <= 0) continue;

    // Set weights now that totalValue is known
    for (const dh of dailyHoldings) {
      dh.weight = totalValue > 0 ? Math.round((dh.marketValue / totalValue) * 10000) / 100 : 0;
    }

    // TWR
    const twrPeriod = prevValue > 0 ? ((totalValue / prevValue) - 1) * 100 : 0;
    const twrCum = ((1 + prevTwrCum / 100) * (1 + twrPeriod / 100) - 1) * 100;

    // Composition (balanced = 50/50)
    let eqVal = 0, fiVal = 0, altVal = 0, cashVal = 0;
    for (const dh of dailyHoldings) {
      const cls = dh.assetClass;
      if (cls === 'balanced') { eqVal += dh.marketValue * 0.5; fiVal += dh.marketValue * 0.5; }
      else if (cls === 'equity') eqVal += dh.marketValue;
      else if (cls === 'fixedIncome') fiVal += dh.marketValue;
      else if (cls === 'alternatives') altVal += dh.marketValue;
      else if (cls === 'cash') cashVal += dh.marketValue;
      else eqVal += dh.marketValue;
    }

    const { error } = await supabase.from('portfolio_snapshots').upsert({
      client_id: CLIENT_ID,
      snapshot_date: date,
      total_value: Math.round(totalValue * 100) / 100,
      equity_value: Math.round(eqVal * 100) / 100,
      fixed_income_value: Math.round(fiVal * 100) / 100,
      alternatives_value: Math.round(altVal * 100) / 100,
      cash_value: Math.round(cashVal * 100) / 100,
      equity_percent: totalValue > 0 ? Math.round(eqVal / totalValue * 10000) / 100 : 0,
      fixed_income_percent: totalValue > 0 ? Math.round(fiVal / totalValue * 10000) / 100 : 0,
      alternatives_percent: totalValue > 0 ? Math.round(altVal / totalValue * 10000) / 100 : 0,
      cash_percent: totalValue > 0 ? Math.round(cashVal / totalValue * 10000) / 100 : 0,
      daily_return: Math.round(twrPeriod * 10000) / 10000,
      twr_period: Math.round(twrPeriod * 10000) / 10000,
      twr_cumulative: Math.round(twrCum * 10000) / 10000,
      deposits: 0,
      withdrawals: 0,
      net_cash_flow: 0,
      total_cuotas: totalCuotas,
      cuotas_change: 0,
      holdings: dailyHoldings,
      source: 'api-prices',
    }, { onConflict: 'client_id,snapshot_date' });

    if (error) {
      console.error(`Error on ${date}:`, error.message);
    } else {
      filled++;
    }

    prevValue = totalValue;
    prevTwrCum = twrCum;
  }

  console.log(`\nDone! Filled ${filled} snapshots.`);

  // Show first few and last few
  const { data: newSnapshots } = await supabase
    .from('portfolio_snapshots')
    .select('snapshot_date, total_value, twr_cumulative, equity_percent, fixed_income_percent, source')
    .eq('client_id', CLIENT_ID)
    .order('snapshot_date', { ascending: true });

  console.log(`\nTotal snapshots: ${newSnapshots.length}`);
  console.log('\nFirst 5:');
  for (const s of newSnapshots.slice(0, 5)) {
    console.log(`  ${s.snapshot_date} [${s.source}] $${Math.round(s.total_value).toLocaleString()} TWR:${s.twr_cumulative}% RV:${s.equity_percent}% RF:${s.fixed_income_percent}%`);
  }
  console.log('\nLast 5:');
  for (const s of newSnapshots.slice(-5)) {
    console.log(`  ${s.snapshot_date} [${s.source}] $${Math.round(s.total_value).toLocaleString()} TWR:${s.twr_cumulative}% RV:${s.equity_percent}% RF:${s.fixed_income_percent}%`);
  }
}

main().catch(console.error);
