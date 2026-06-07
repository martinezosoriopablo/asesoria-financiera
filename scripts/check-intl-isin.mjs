// Search Yahoo by ISIN for exact share classes
// ISINs from Raymond James / Morningstar:
const isins = [
  { fund: 'DWS LatAm A2 USD', isin: 'LU0399027613', price: 205.53 },  // A2 USD share class
  { fund: 'BNY HY W USD Acc', isin: 'IE00BDTJQX52', price: 1.6209 },  // W USD Acc
  { fund: 'Jupiter L USD Acc', isin: 'IE0033029430', price: 4.0413 },  // L USD Acc (old Merian)
  { fund: 'UBAM Dyn USD AC', isin: 'LU0862297826', price: 278.354 },  // AC USD Acc
];

for (const { fund, isin, price } of isins) {
  console.log(`\n=== ${fund} (ISIN: ${isin}, cartola: ${price}) ===`);
  // Try searching by ISIN
  try {
    const url = `https://query2.finance.yahoo.com/v1/finance/search?q=${isin}&quotesCount=5&newsCount=0`;
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
    });
    if (res.ok) {
      const json = await res.json();
      for (const q of (json.quotes || [])) {
        // Get price
        try {
          const url2 = `https://query2.finance.yahoo.com/v8/finance/chart/${q.symbol}?range=6mo&interval=1d`;
          const res2 = await fetch(url2, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' } });
          if (res2.ok) {
            const json2 = await res2.json();
            const r = json2?.chart?.result?.[0];
            if (r) {
              const closes = r.indicators?.quote?.[0]?.close?.filter(c => c != null) || [];
              const last = closes.length ? closes[closes.length - 1] : null;
              // Find near 2026-03-31
              const ts = r.timestamp || [];
              const target = new Date('2026-03-31').getTime() / 1000;
              let bi = 0, bd = Infinity;
              for (let i = 0; i < ts.length; i++) { const d = Math.abs(ts[i]-target); if (d<bd){bd=d;bi=i;} }
              const atDate = r.indicators?.quote?.[0]?.close?.[bi];
              const diff = atDate ? Math.abs(atDate - price) / price * 100 : 999;
              console.log(`  ${q.symbol.padEnd(16)} | ${r.meta.currency} | @date: ${atDate?.toFixed(4)} | now: ${last?.toFixed(4)} | diff: ${diff.toFixed(1)}% | ${r.meta.longName || ''}`);
            }
          }
        } catch {}
      }
      if ((json.quotes || []).length === 0) console.log('  No results for ISIN');
    }
  } catch (err) {
    console.log(`  Error: ${err.message}`);
  }
}

// Also try alternative ISINs
console.log('\n=== Alternative ISINs ===');
const altIsins = [
  { fund: 'DWS LatAm A2 USD alt', isin: 'LU0399027886' },
  { fund: 'BNY HY W USD alt', isin: 'IE00BF5FX037' },
  { fund: 'Jupiter L USD alt', isin: 'IE00B3V48W57' },
];

for (const { fund, isin } of altIsins) {
  const url = `https://query2.finance.yahoo.com/v1/finance/search?q=${isin}&quotesCount=5&newsCount=0`;
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' } });
  if (res.ok) {
    const json = await res.json();
    const quotes = json.quotes || [];
    console.log(`${fund} (${isin}): ${quotes.length} results`);
    for (const q of quotes) console.log(`  ${q.symbol} | ${q.shortname || q.longname || ''} | ${q.exchange}`);
  }
}
