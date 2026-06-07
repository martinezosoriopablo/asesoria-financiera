// Search Yahoo Finance for these funds by name
const funds = [
  'DWS Invest Latin American Equities',
  'BNY Mellon Global Short Dated High Yield',
  'Jupiter Merian World Equity',
  'UBAM Dynamic US Dollar Bond',
];

for (const name of funds) {
  console.log(`\n=== Searching: ${name} ===`);
  try {
    const q = encodeURIComponent(name);
    const url = `https://query2.finance.yahoo.com/v1/finance/search?q=${q}&quotesCount=5&newsCount=0`;
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
    });
    if (res.ok) {
      const json = await res.json();
      const quotes = json.quotes || [];
      if (quotes.length === 0) {
        console.log('  No results');
      }
      for (const q of quotes) {
        console.log(`  ${q.symbol} | ${q.shortname || q.longname || ''} | Exchange: ${q.exchange} | Type: ${q.quoteType}`);
      }
    } else {
      console.log(`  HTTP ${res.status}`);
    }
  } catch (err) {
    console.log(`  Error: ${err.message}`);
  }
}

// Also try direct v8 chart with some Morningstar-style tickers
console.log('\n=== Direct ticker tests ===');
const tickers = [
  '0P0000KWHZ.F',  // DWS LatAm on Frankfurt
  '0P0000KWHY.F',  // DWS LatAm variant
  '0P00001DKE.L',  // Jupiter Merian on London
  '0P0000WHP7.SW', // UBAM on Swiss
  '0P0001B9VL.L',  // BNY on London
];

for (const ticker of tickers) {
  try {
    const url = `https://query2.finance.yahoo.com/v8/finance/chart/${ticker}?range=5d&interval=1d`;
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
    });
    if (res.ok) {
      const json = await res.json();
      const result = json?.chart?.result?.[0];
      if (result) {
        const meta = result.meta;
        const closes = result.indicators?.quote?.[0]?.close?.filter(c => c != null);
        console.log(`  ✓ ${ticker} → ${meta.currency} | Last: ${closes?.pop()} | Exchange: ${meta.exchangeName}`);
      } else {
        console.log(`  ✗ ${ticker} → no result`);
      }
    } else {
      console.log(`  ✗ ${ticker} → HTTP ${res.status}`);
    }
  } catch (err) {
    console.log(`  ✗ ${ticker} → ${err.message}`);
  }
}
