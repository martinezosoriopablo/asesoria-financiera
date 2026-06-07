// Refine search for exact share classes
const searches = [
  { fund: 'DWS LatAm A2 USD', query: 'DWS Latin American Equities A2 USD' },
  { fund: 'BNY HY W USD', query: 'BNY Mellon Short Dated High Yield W USD' },
  { fund: 'Jupiter L USD', query: 'Jupiter Merian World Equity L USD' },
  { fund: 'UBAM Dynamic USD Bond AC', query: 'UBAM Dynamic US Dollar Bond AC' },
];

for (const { fund, query } of searches) {
  console.log(`\n=== ${fund} ===`);
  try {
    const q = encodeURIComponent(query);
    const url = `https://query2.finance.yahoo.com/v1/finance/search?q=${q}&quotesCount=10&newsCount=0`;
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
    });
    if (res.ok) {
      const json = await res.json();
      for (const q of (json.quotes || [])) {
        // For each, get the price to check currency
        try {
          const url2 = `https://query2.finance.yahoo.com/v8/finance/chart/${q.symbol}?range=5d&interval=1d`;
          const res2 = await fetch(url2, {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
          });
          if (res2.ok) {
            const json2 = await res2.json();
            const r = json2?.chart?.result?.[0];
            if (r) {
              const closes = r.indicators?.quote?.[0]?.close?.filter(c => c != null);
              const last = closes?.length ? closes[closes.length - 1] : null;
              console.log(`  ${q.symbol.padEnd(16)} | ${(r.meta.currency || '?').padEnd(4)} | ${last?.toFixed(4).padStart(10)} | ${r.meta.longName || r.meta.shortName || q.shortname || ''}`);
            }
          }
        } catch {}
      }
    }
  } catch (err) {
    console.log(`  Error: ${err.message}`);
  }
}
