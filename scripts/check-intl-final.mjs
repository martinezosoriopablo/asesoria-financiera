// Final verification of candidate tickers with price matching
const candidates = [
  // Jupiter — found via CUSIP search
  { fund: 'Jupiter L USD (cartola: 4.0413)', ticker: '0P00000ICR' },
  // Jupiter — found via name "L EUR"
  { fund: 'Jupiter L EUR', ticker: '0P00016ARO.F' },
  // UBAM — confirmed
  { fund: 'UBAM AC USD (cartola: 278.354)', ticker: '0P00000AZP' },
  // BNY — proxy (C class vs W class)
  { fund: 'BNY C USD (cartola W: 1.6209)', ticker: '0P00019BP0' },
];

for (const { fund, ticker } of candidates) {
  try {
    const url = `https://query2.finance.yahoo.com/v8/finance/chart/${ticker}?range=6mo&interval=1d`;
    const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' } });
    if (!res.ok) { console.log(`${fund}: HTTP ${res.status}`); continue; }
    const json = await res.json();
    const r = json?.chart?.result?.[0];
    if (!r) { console.log(`${fund}: no data`); continue; }

    const ts = r.timestamp || [];
    const closes = r.indicators?.quote?.[0]?.close || [];

    // Price at 2026-03-31
    const target = new Date('2026-03-31').getTime() / 1000;
    let bi = 0, bd = Infinity;
    for (let i = 0; i < ts.length; i++) { const d = Math.abs(ts[i]-target); if (d<bd){bd=d;bi=i;} }
    const dateStr = new Date(ts[bi] * 1000).toISOString().split('T')[0];

    const lastCloses = closes.filter(c => c != null);

    console.log(`${fund}`);
    console.log(`  Ticker: ${ticker} | Currency: ${r.meta.currency} | Name: ${r.meta.longName || r.meta.shortName}`);
    console.log(`  @${dateStr}: ${closes[bi]?.toFixed(4)} | Now: ${lastCloses.pop()?.toFixed(4)}`);
    console.log('');
  } catch (err) {
    console.log(`${fund}: ${err.message}`);
  }
}

// Now let's also search for DWS LatAm specifically — try all DWS Invest Latin results
console.log('=== All DWS Latin American classes ===');
const url = `https://query2.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent('DWS Latin American')}&quotesCount=20&newsCount=0`;
const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' } });
const json = await res.json();
for (const qt of (json.quotes || [])) {
  try {
    const url2 = `https://query2.finance.yahoo.com/v8/finance/chart/${qt.symbol}?range=6mo&interval=1d`;
    const res2 = await fetch(url2, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' } });
    if (!res2.ok) continue;
    const json2 = await res2.json();
    const r = json2?.chart?.result?.[0];
    if (!r) continue;
    const closes = r.indicators?.quote?.[0]?.close?.filter(c => c != null) || [];
    const last = closes.pop();
    // Check: cartola was 205.53 USD. If EUR, would be ~190 EUR at EURUSD ~1.08
    console.log(`  ${qt.symbol.padEnd(16)} | ${(r.meta.currency||'?').padEnd(4)} | ${last?.toFixed(2).padStart(10)} | ${r.meta.longName || qt.shortname || ''}`);
  } catch {}
}
