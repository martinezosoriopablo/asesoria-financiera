const API_KEY = '6a218882e15de0.07020278';

const FUNDS = [
  { name: 'DWS LatAm A2 USD', isin: 'LU0399027613', price: 205.53 },
  { name: 'BNY HY W USD', isin: 'IE00BDTJQX52', price: 1.6209 },
  { name: 'Jupiter L USD', isin: 'IE0033029430', price: 4.0413 },
  { name: 'UBAM AC USD', isin: 'LU0862297826', price: 278.354 },
];

// 1. Search by ISIN
console.log('=== Search by ISIN ===');
for (const fund of FUNDS) {
  try {
    const url = `https://eodhd.com/api/search/${fund.isin}?api_token=${API_KEY}&fmt=json`;
    const res = await fetch(url);
    if (res.ok) {
      const json = await res.json();
      console.log(`\n${fund.name} (${fund.isin}): ${json.length || 0} results`);
      for (const r of (json || []).slice(0, 5)) {
        console.log(`  ${r.Code}.${r.Exchange} | ${r.Name} | ${r.Currency} | ISIN: ${r.ISIN} | Type: ${r.Type}`);
      }
    } else {
      console.log(`${fund.name}: HTTP ${res.status}`);
    }
  } catch (err) {
    console.log(`${fund.name}: ${err.message}`);
  }
}

// 2. If tickers found, get EOD prices
console.log('\n\n=== EOD Prices ===');
// Try ISIN-based tickers on Luxembourg/Ireland exchanges
const tickerTests = [
  { name: 'DWS (LU)', ticker: 'LU0399027613.XETRA' },
  { name: 'DWS (LU fund)', ticker: 'LU0399027613.FUND' },
  { name: 'UBAM (LU)', ticker: 'LU0862297826.FUND' },
  { name: 'Jupiter (IE)', ticker: 'IE0033029430.FUND' },
  { name: 'BNY (IE)', ticker: 'IE00BDTJQX52.FUND' },
];
for (const { name, ticker } of tickerTests) {
  try {
    const url = `https://eodhd.com/api/eod/${ticker}?api_token=${API_KEY}&fmt=json&period=d&from=2026-05-01`;
    const res = await fetch(url);
    if (res.ok) {
      const json = await res.json();
      console.log(`${name} (${ticker}): ${json.length} points`);
      for (const d of (json || []).slice(-3)) {
        console.log(`  ${d.date} | close: ${d.close}`);
      }
    } else {
      console.log(`${name}: HTTP ${res.status}`);
    }
  } catch (err) {
    console.log(`${name}: ${err.message}`);
  }
}
