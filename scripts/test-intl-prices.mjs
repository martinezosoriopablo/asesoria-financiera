// Test that the 4 international UCITS funds resolve and fetch prices correctly
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'https://zysotxkelepvotzujhxe.supabase.co',
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const EODHD_API_KEY = process.env.EODHD_API_KEY;
console.log('EODHD_API_KEY present:', !!EODHD_API_KEY);

// The 4 international funds from Fortt's Raymond James cartola
const funds = [
  { name: 'DWS LatAm A2 USD', cusip: 'L2R330245', eodhd: 'LU0813337184.EUFUND', yahoo: null },
  { name: 'BNY HY W USD', cusip: 'G1R06N212', eodhd: 'IE00BD5CTV53.EUFUND', yahoo: '0P00019BP0' },
  { name: 'Jupiter L USD', cusip: 'G6016L337', eodhd: null, yahoo: '0P00000ICR' },
  { name: 'UBAM AC USD', cusip: 'L9381G101', eodhd: 'LU0029761532.EUFUND', yahoo: '0P00000AZP' },
];

console.log('\n=== Testing EODHD API ===\n');
for (const fund of funds) {
  if (!fund.eodhd) {
    console.log(`${fund.name}: no EODHD ticker, skipping`);
    continue;
  }
  try {
    const from = '2026-05-01';
    const to = '2026-06-04';
    const url = `https://eodhd.com/api/eod/${fund.eodhd}?api_token=${EODHD_API_KEY}&fmt=json&period=d&from=${from}&to=${to}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data) && data.length > 0) {
        const last = data[data.length - 1];
        console.log(`${fund.name} (EODHD): ${data.length} points, last: ${last.date} = ${last.close}`);
      } else {
        console.log(`${fund.name} (EODHD): no data points`);
      }
    } else {
      console.log(`${fund.name} (EODHD): HTTP ${res.status}`);
    }
  } catch (err) {
    console.log(`${fund.name} (EODHD): ${err.message}`);
  }
}

console.log('\n=== Testing Yahoo Finance ===\n');
for (const fund of funds) {
  if (!fund.yahoo) {
    console.log(`${fund.name}: no Yahoo ticker, skipping`);
    continue;
  }
  try {
    const now = Math.floor(Date.now() / 1000);
    const monthAgo = now - 30 * 86400;
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${fund.yahoo}?period1=${monthAgo}&period2=${now}&interval=1d`;
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
      signal: AbortSignal.timeout(15000),
    });
    if (res.ok) {
      const data = await res.json();
      const r = data?.chart?.result?.[0];
      if (r) {
        const closes = (r.indicators?.quote?.[0]?.close || []).filter(c => c != null);
        const last = closes[closes.length - 1];
        console.log(`${fund.name} (Yahoo ${fund.yahoo}): ${closes.length} points, last: ${last?.toFixed(4)}, currency: ${r.meta?.currency}`);
      } else {
        console.log(`${fund.name} (Yahoo): no chart result`);
      }
    } else {
      console.log(`${fund.name} (Yahoo): HTTP ${res.status}`);
    }
  } catch (err) {
    console.log(`${fund.name} (Yahoo): ${err.message}`);
  }
}

// Check what's already in international_prices for these CUSIPs
console.log('\n=== DB: international_prices for these tickers ===\n');
const tickers = [
  ...funds.filter(f => f.eodhd).map(f => f.eodhd),
  ...funds.filter(f => f.yahoo).map(f => f.yahoo),
];
for (const ticker of tickers) {
  const { data, count } = await supabase
    .from('international_prices')
    .select('price_date, close_price', { count: 'exact' })
    .eq('ticker', ticker)
    .order('price_date', { ascending: false })
    .limit(3);

  const fund = funds.find(f => f.eodhd === ticker || f.yahoo === ticker);
  if (data && data.length > 0) {
    console.log(`${fund?.name} (${ticker}): ${count} rows, latest: ${data[0].price_date} = ${data[0].close_price}`);
  } else {
    console.log(`${fund?.name} (${ticker}): no rows in DB`);
  }
}
