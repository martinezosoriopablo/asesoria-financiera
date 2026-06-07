// Cross-reference cartola prices with Yahoo results to find exact matches
// Cartola prices (2026-03-31):
// DWS LatAm A2 USD: 205.53
// BNY HY W USD: 1.6209
// Jupiter L USD: 4.0413
// UBAM AC USD: 278.354

// Search more broadly for each, then check USD prices
const searches = [
  { fund: 'DWS LatAm', query: 'DWS Latin American', cartolaPrice: 205.53 },
  { fund: 'BNY HY', query: 'BNY Mellon Short Dated High Yield', cartolaPrice: 1.6209 },
  { fund: 'Jupiter', query: 'Jupiter Merian World Equity', cartolaPrice: 4.0413 },
  { fund: 'UBAM', query: 'UBAM Dynamic Dollar Bond', cartolaPrice: 278.354 },
];

for (const { fund, query, cartolaPrice } of searches) {
  console.log(`\n=== ${fund} (cartola: ${cartolaPrice} USD) ===`);
  try {
    const q = encodeURIComponent(query);
    const url = `https://query2.finance.yahoo.com/v1/finance/search?q=${q}&quotesCount=20&newsCount=0`;
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
    });
    if (!res.ok) { console.log(`  Search HTTP ${res.status}`); continue; }
    const json = await res.json();
    const quotes = json.quotes || [];

    for (const qt of quotes) {
      try {
        const url2 = `https://query2.finance.yahoo.com/v8/finance/chart/${qt.symbol}?range=1mo&interval=1d`;
        const res2 = await fetch(url2, {
          headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
        });
        if (!res2.ok) continue;
        const json2 = await res2.json();
        const r = json2?.chart?.result?.[0];
        if (!r) continue;
        const ccy = r.meta.currency || '?';
        const closes = r.indicators?.quote?.[0]?.close?.filter(c => c != null) || [];
        const last = closes.length ? closes[closes.length - 1] : null;
        if (!last) continue;
        // Check price proximity (within 5% of cartola)
        const diff = Math.abs(last - cartolaPrice) / cartolaPrice;
        const match = diff < 0.05 ? '✓ MATCH' : '';
        if (ccy === 'USD' || match) {
          console.log(`  ${qt.symbol.padEnd(16)} | ${ccy.padEnd(4)} | ${last.toFixed(4).padStart(10)} | diff: ${(diff*100).toFixed(1)}% ${match} | ${r.meta.longName || qt.shortname || ''}`);
        }
      } catch {}
    }
  } catch (err) {
    console.log(`  Error: ${err.message}`);
  }
}
