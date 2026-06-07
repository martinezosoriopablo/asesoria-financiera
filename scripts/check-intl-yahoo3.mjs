// Test the specific tickers found in Yahoo search results
// Need to match: A2 USD, W USD, L USD, AC USD classes
const candidates = [
  // DWS Invest Latin American Equities - A2 Acc USD
  { fund: 'DWS LatAm A2', tickers: ['0P0001DBHZ.F', 'FP7Y.F', 'FP7W.MU', 'FGMI.MU', 'FGMH.MU'] },
  // BNY Mellon Global Short Dated HY - W USD
  { fund: 'BNY HY W', tickers: ['0P00019BP0', '0P0001AGX2', '0P00019BOW.F', '0P00019MJR.F', '0P00019MJP.F'] },
  // Jupiter Merian World Equity - L USD
  { fund: 'Jupiter L', tickers: ['0P00016ARZ.F', '0P00016ARW.F', '0P00015E9M.L', '0P0000U88M.F', '0P00000T47'] },
  // UBAM Dynamic USD Bond - AC USD
  { fund: 'UBAM AC', tickers: ['0P00000AZP', '0P00001RJK', '0P0001OSG3', '0P0001OSFZ.F', '0P00015OFZ'] },
];

for (const { fund, tickers } of candidates) {
  console.log(`\n=== ${fund} ===`);
  for (const ticker of tickers) {
    try {
      const url = `https://query2.finance.yahoo.com/v8/finance/chart/${ticker}?range=1mo&interval=1d`;
      const res = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
      });
      if (res.ok) {
        const json = await res.json();
        const result = json?.chart?.result?.[0];
        if (result) {
          const meta = result.meta;
          const closes = result.indicators?.quote?.[0]?.close?.filter(c => c != null);
          const lastClose = closes?.length ? closes[closes.length - 1] : null;
          console.log(`  ✓ ${ticker.padEnd(16)} | ${(meta.currency || '???').padEnd(4)} | Last: ${lastClose?.toFixed(4)} | ${meta.longName || meta.shortName || ''}`);
        } else {
          console.log(`  ✗ ${ticker} → empty result`);
        }
      } else {
        console.log(`  ✗ ${ticker} → HTTP ${res.status}`);
      }
    } catch (err) {
      console.log(`  ✗ ${ticker} → ${err.message}`);
    }
  }
}
