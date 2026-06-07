// Direct test of likely candidates based on price proximity
const tests = [
  // DWS LatAm A2 USD (cartola: 205.53) — try EUR tickers and convert
  { fund: 'DWS LatAm A2', cartola: 205.53, ccy: 'USD', tickers: ['0P0001DBHZ.F', 'FP7Y.F'] },

  // BNY HY W USD (cartola: 1.6209)
  { fund: 'BNY HY W', cartola: 1.6209, ccy: 'USD', tickers: ['0P00019BP0', '0P0001AGX2'] },

  // Jupiter L USD (cartola: 4.0413)
  { fund: 'Jupiter L', cartola: 4.0413, ccy: 'USD', tickers: ['0P00000T47', '0P0000K0QN'] },

  // UBAM AC USD (cartola: 278.354)
  { fund: 'UBAM AC', cartola: 278.354, ccy: 'USD', tickers: ['0P00000AZP', '0P00001RJK', '0P0001OSG3', '0P00015OFZ'] },
];

for (const { fund, cartola, ccy, tickers } of tests) {
  console.log(`\n=== ${fund} (cartola: ${cartola} ${ccy}) ===`);
  for (const ticker of tickers) {
    try {
      // Get 3 months of data to compare
      const url = `https://query2.finance.yahoo.com/v8/finance/chart/${ticker}?range=6mo&interval=1d`;
      const res = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
      });
      if (!res.ok) { console.log(`  ✗ ${ticker} → HTTP ${res.status}`); continue; }
      const json = await res.json();
      const r = json?.chart?.result?.[0];
      if (!r) { console.log(`  ✗ ${ticker} → no data`); continue; }

      const meta = r.meta;
      const timestamps = r.timestamp || [];
      const closes = r.indicators?.quote?.[0]?.close || [];

      // Find price near 2026-03-31
      const target = new Date('2026-03-31').getTime() / 1000;
      let bestIdx = 0;
      let bestDiff = Infinity;
      for (let i = 0; i < timestamps.length; i++) {
        const d = Math.abs(timestamps[i] - target);
        if (d < bestDiff) { bestDiff = d; bestIdx = i; }
      }
      const dateStr = new Date(timestamps[bestIdx] * 1000).toISOString().split('T')[0];
      const priceAtDate = closes[bestIdx];
      const lastClose = closes.filter(c => c != null).pop();
      const diff = priceAtDate ? Math.abs(priceAtDate - cartola) / cartola * 100 : 999;

      console.log(`  ${ticker.padEnd(16)} | ${(meta.currency||'?').padEnd(4)} | @${dateStr}: ${priceAtDate?.toFixed(4)} | now: ${lastClose?.toFixed(4)} | diff: ${diff.toFixed(1)}% | ${meta.longName || meta.shortName || ''}`);
    } catch (err) {
      console.log(`  ✗ ${ticker} → ${err.message}`);
    }
  }
}

// Also try to find the exact DWS A2 USD class
console.log('\n=== Extra search: DWS A2 ===');
for (const q of ['DWS Latin American A2', 'DWS Invest Latin A2 USD']) {
  const url = `https://query2.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(q)}&quotesCount=10&newsCount=0`;
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' } });
  if (!res.ok) continue;
  const json = await res.json();
  for (const qt of (json.quotes || [])) {
    console.log(`  ${qt.symbol} | ${qt.shortname || qt.longname || ''} | ${qt.exchange}`);
  }
}

// Jupiter L specifically
console.log('\n=== Extra search: Jupiter L ===');
for (const q of ['Jupiter Merian World Equity L Acc USD', 'Merian World Equity L USD']) {
  const url = `https://query2.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(q)}&quotesCount=10&newsCount=0`;
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' } });
  if (!res.ok) continue;
  const json = await res.json();
  for (const qt of (json.quotes || [])) {
    console.log(`  ${qt.symbol} | ${qt.shortname || qt.longname || ''} | ${qt.exchange}`);
  }
}
