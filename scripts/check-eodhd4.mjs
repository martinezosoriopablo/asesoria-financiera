const API_KEY = '6a218882e15de0.07020278';

// Best candidates from search results:
const tickers = [
  // DWS — no A2 class found, but USD LC and USD TFC exist
  { name: 'DWS LatAm USD LC', ticker: 'LU0813337184.EUFUND', cartola: 205.53, ccy: 'USD' },
  { name: 'DWS LatAm USD TFC', ticker: 'LU2032727740.EUFUND', cartola: 205.53, ccy: 'USD' },
  { name: 'DWS LatAm LC (EUR)', ticker: 'LU0399356780.EUFUND', cartola: 205.53, ccy: 'EUR' },

  // BNY — W Inc USD exists! Plus C Acc for comparison
  { name: 'BNY HY W Inc USD', ticker: 'IE00BD5CV971.EUFUND', cartola: 1.6209, ccy: 'USD' },
  { name: 'BNY HY C Acc USD', ticker: 'IE00BD5CTV53.EUFUND', cartola: 1.6209, ccy: 'USD' },

  // Jupiter — L EUR Hedged exists, but no L USD. Try B USD and I USD
  { name: 'Jupiter B USD', ticker: 'IE0031332822.EUFUND', cartola: 4.0413, ccy: 'USD' },
  { name: 'Jupiter I USD', ticker: 'IE00B42HMS87.EUFUND', cartola: 4.0413, ccy: 'USD' },
  { name: 'Jupiter L EUR Hdg', ticker: 'IE00B2899S33.EUFUND', cartola: 4.0413, ccy: 'EUR' },

  // UBAM — AC USD found!
  { name: 'UBAM AC USD', ticker: 'LU0029761532.EUFUND', cartola: 278.354, ccy: 'USD' },
];

console.log('=== EOD Prices from EODHD ===\n');
for (const { name, ticker, cartola, ccy } of tickers) {
  try {
    const url = `https://eodhd.com/api/eod/${ticker}?api_token=${API_KEY}&fmt=json&period=d&from=2026-03-25&to=2026-04-05`;
    const res = await fetch(url);
    if (res.ok) {
      const json = await res.json();
      if (json.length > 0) {
        const last = json[json.length - 1];
        const diff = Math.abs(last.close - cartola) / cartola * 100;
        const match = diff < 5 ? ' ✅' : diff < 15 ? ' ⚠️' : '';
        console.log(`${name.padEnd(22)} | ${ticker.padEnd(25)} | ${ccy} | close: ${String(last.close).padStart(10)} | cartola: ${cartola} | diff: ${diff.toFixed(1)}%${match}`);
      } else {
        console.log(`${name}: no data points`);
      }
    } else {
      console.log(`${name}: HTTP ${res.status}`);
    }
  } catch (err) {
    console.log(`${name}: ${err.message}`);
  }
}
