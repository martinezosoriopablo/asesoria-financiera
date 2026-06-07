// EODHD Free tier: 20 calls/day, past year data, personal use
// API docs: https://eodhd.com/financial-apis/
// Free API key from registration — let's test with demo key first

const API_KEY = 'demo';

const FUNDS = [
  { name: 'DWS LatAm A2 USD', isin: 'LU0399027613', price: 205.53 },
  { name: 'BNY HY W USD', isin: 'IE00BDTJQX52', price: 1.6209 },
  { name: 'Jupiter L USD', isin: 'IE0033029430', price: 4.0413 },
  { name: 'UBAM AC USD', isin: 'LU0862297826', price: 278.354 },
];

// 1. Search API — find tickers by ISIN
console.log('=== EODHD Search by ISIN ===');
for (const fund of FUNDS) {
  try {
    const url = `https://eodhd.com/api/search/${fund.isin}?api_token=${API_KEY}&fmt=json`;
    const res = await fetch(url);
    if (res.ok) {
      const json = await res.json();
      console.log(`\n${fund.name} (${fund.isin}):`);
      if (Array.isArray(json) && json.length > 0) {
        for (const r of json.slice(0, 5)) {
          console.log(`  ${r.Code}.${r.Exchange} | ${r.Name} | ${r.Currency} | ISIN: ${r.ISIN} | Type: ${r.Type}`);
        }
      } else {
        console.log(`  No results`);
      }
    } else {
      const text = await res.text();
      console.log(`${fund.name}: HTTP ${res.status} — ${text.substring(0, 200)}`);
    }
  } catch (err) {
    console.log(`${fund.name}: ${err.message}`);
  }
}

// 2. Also search by name
console.log('\n\n=== EODHD Search by name ===');
const nameSearches = [
  'DWS Latin American',
  'BNY Mellon High Yield',
  'Jupiter Merian World',
  'UBAM Dynamic Dollar',
];
for (const q of nameSearches) {
  try {
    const url = `https://eodhd.com/api/search/${encodeURIComponent(q)}?api_token=${API_KEY}&fmt=json&type=fund`;
    const res = await fetch(url);
    if (res.ok) {
      const json = await res.json();
      console.log(`\n"${q}": ${json.length || 0} results`);
      for (const r of (json || []).slice(0, 5)) {
        console.log(`  ${r.Code}.${r.Exchange} | ${r.Name} | ${r.Currency} | ISIN: ${r.ISIN}`);
      }
    } else {
      console.log(`"${q}": HTTP ${res.status}`);
    }
  } catch (err) {
    console.log(`"${q}": ${err.message}`);
  }
}

// 3. If we find tickers, get EOD prices
console.log('\n\n=== EODHD EOD Prices test ===');
// Try common EODHD mutual fund format: ISIN.FUND or ISIN.LSE etc
const testTickers = [
  'LU0399027613.FUND',
  'LU0862297826.FUND',
  'IE0033029430.FUND',
];
for (const ticker of testTickers) {
  try {
    const url = `https://eodhd.com/api/eod/${ticker}?api_token=${API_KEY}&fmt=json&period=d&from=2026-03-01&to=2026-04-01`;
    const res = await fetch(url);
    if (res.ok) {
      const json = await res.json();
      console.log(`${ticker}: ${json.length} data points`);
      for (const d of (json || []).slice(-3)) {
        console.log(`  ${d.date} | close: ${d.close} | ${d.currency || ''}`);
      }
    } else {
      console.log(`${ticker}: HTTP ${res.status}`);
    }
  } catch (err) {
    console.log(`${ticker}: ${err.message}`);
  }
}
