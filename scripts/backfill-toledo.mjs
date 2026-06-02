import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  db: { schema: 'public' },
  global: { headers: { 'x-my-custom-header': 'backfill' } }
});

// First, verify table exists and check schema
const { data: test, error: testErr } = await sb.from('international_prices').select('*').limit(1);
console.log('Table test:', { data: test, error: testErr?.message, code: testErr?.code, details: testErr?.details });

// Toledo's holdings - all US tickers
const holdings = [
  { symbol: 'T', name: 'AT&T' },
  { symbol: 'BKR', name: 'Baker Hughes' },
  { symbol: 'CGNX', name: 'Cognex' },
  { symbol: 'ELF', name: 'ELF Beauty' },
  { symbol: 'EA', name: 'Electronic Arts' },
  { symbol: 'HAL', name: 'Halliburton' },
  { symbol: 'IPGP', name: 'IPG Photonics' },
  { symbol: 'IRDM', name: 'Iridium' },
  { symbol: 'SLB', name: 'SLB Limited' },
  { symbol: 'WBD', name: 'Warner Bros Discovery' },
  { symbol: 'TGLS', name: 'Tecnoglass' },
  { symbol: 'BGR', name: 'BlackRock Energy' },
  { symbol: 'BCX', name: 'BlackRock Resources' },
  { symbol: 'MCN', name: 'XAI Madison' },
  { symbol: 'UFOX', name: 'Defiance Connective' },
  { symbol: 'JETS', name: 'US Global Jets' },
  { symbol: 'RDVY', name: 'First Trust NASDAQ Rising Div' },
  { symbol: 'SDVY', name: 'First Trust SMID Rising Div' },
  { symbol: 'QQQ', name: 'Invesco QQQ' },
  { symbol: 'SLV', name: 'iShares Silver' },
  { symbol: 'PTNQ', name: 'Pacer Trendpilot' },
  { symbol: 'SPY', name: 'SPDR S&P 500' },
  { symbol: 'GLD', name: 'SPDR Gold' },
  { symbol: 'DIA', name: 'SPDR Dow Jones' },
  { symbol: 'VOE', name: 'Vanguard Mid-Cap Value' },
  { symbol: 'VBR', name: 'Vanguard Small-Cap Value' },
];

const fromDate = '2025-12-01';
const today = new Date().toISOString().split('T')[0];

async function fetchYahooHistorical(ticker, from, to) {
  const fromTs = Math.floor(new Date(from).getTime() / 1000);
  const toTs = Math.floor(new Date(to).getTime() / 1000) + 86400;
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?period1=${fromTs}&period2=${toTs}&interval=1d`;

  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
    signal: AbortSignal.timeout(15000),
  });

  if (!res.ok) return [];
  const data = await res.json();
  if (data.chart?.error || !data.chart?.result?.length) return [];

  const result = data.chart.result[0];
  const timestamps = result.timestamp || [];
  const closes = result.indicators?.quote?.[0]?.close || [];

  const prices = [];
  for (let i = 0; i < timestamps.length; i++) {
    if (closes[i] != null) {
      const date = new Date(timestamps[i] * 1000).toISOString().split('T')[0];
      prices.push({ date, close: closes[i] });
    }
  }
  return prices.sort((a, b) => a.date.localeCompare(b.date));
}

// Use raw PostgREST insert via fetch to bypass schema cache
async function upsertPricesRaw(symbol, prices) {
  if (!prices.length) return 0;

  const rows = prices.map(p => ({
    ticker: symbol,
    price_date: p.date,
    close_price: p.close,
    currency: 'USD',
    source: 'yahoo'
  }));

  // Use Supabase REST API directly with Prefer: resolution=merge-duplicates
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  let total = 0;
  for (let i = 0; i < rows.length; i += 500) {
    const batch = rows.slice(i, i + 500);
    const res = await fetch(`${supabaseUrl}/rest/v1/international_prices`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': serviceKey,
        'Authorization': `Bearer ${serviceKey}`,
        'Prefer': 'resolution=merge-duplicates,return=minimal'
      },
      body: JSON.stringify(batch)
    });

    if (!res.ok) {
      const text = await res.text();
      console.error(`  Upsert error (${res.status}): ${text.slice(0, 120)}`);
    } else {
      total += batch.length;
    }
  }
  return total;
}

console.log(`\nBackfilling ${holdings.length} symbols from ${fromDate} to ${today}...\n`);

let totalRows = 0;

for (const h of holdings) {
  process.stdout.write(`${h.symbol.padEnd(6)} ${h.name.padEnd(30)} `);

  const prices = await fetchYahooHistorical(h.symbol, fromDate, today);

  if (prices.length > 0) {
    const stored = await upsertPricesRaw(h.symbol, prices);
    console.log(`${stored} prices (${prices[0].date} -> ${prices[prices.length-1].date})`);
    totalRows += stored;
  } else {
    console.log('NO PRICES');
  }

  await new Promise(r => setTimeout(r, 300));
}

console.log(`\nDone! Total rows stored: ${totalRows}`);

// Verify via raw API
const verifyRes = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/international_prices?select=ticker,price_date,close_price&limit=5&order=price_date.desc`, {
  headers: {
    'apikey': process.env.SUPABASE_SERVICE_ROLE_KEY,
    'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`
  }
});
const verifyData = await verifyRes.json();
console.log('Verify sample:', verifyData);
