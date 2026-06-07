// Check if Raymond James international funds have Yahoo Finance tickers
// Try ISINs and common ticker patterns

const funds = [
  {
    name: 'DWS Invest Latin American Equities Cl A2 Acc USD',
    secId: 'L2R330245',
    // Known ISIN: LU0399027886
    candidates: ['LU0399027886.LU', 'DWS2R3.DE', 'DWS2R3.F', '0P0000KWHZ.F'],
  },
  {
    name: 'BNY Mellon Global Short Dated High Yield Cl W USD Acc',
    secId: 'G1R06N212',
    // Known ISIN: IE00BF5FX037
    candidates: ['IE00BF5FX037.IR', '0P0001B9VL.F', 'BNYHYWU.IR'],
  },
  {
    name: 'Jupiter Merian World Equity Cl L Acc USD',
    secId: 'G6016L337',
    // Known ISIN: IE0033029430 (old Merian, now Jupiter)
    candidates: ['IE0033029430.IR', '0P00001DKE.F', '0P00001DKE.L'],
  },
  {
    name: 'UBAM Dynamic U S Dollar Bond Cl AC Acc USD',
    secId: 'L9381G101',
    // Known ISIN: LU0862297826
    candidates: ['LU0862297826.LU', '0P0000WHP7.F', 'UBAMDUAC.LU'],
  },
];

for (const fund of funds) {
  console.log(`\n=== ${fund.name} ===`);
  console.log(`  SecId: ${fund.secId}`);

  for (const ticker of fund.candidates) {
    try {
      const url = `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?range=5d&interval=1d`;
      const res = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0' },
      });

      if (res.ok) {
        const json = await res.json();
        const result = json?.chart?.result?.[0];
        if (result) {
          const meta = result.meta;
          const closes = result.indicators?.quote?.[0]?.close || [];
          const lastClose = closes.filter(c => c != null).pop();
          console.log(`  ✓ ${ticker} → ${meta.currency} | Last: ${lastClose} | Exchange: ${meta.exchangeName}`);
        } else {
          console.log(`  ✗ ${ticker} → no data`);
        }
      } else {
        console.log(`  ✗ ${ticker} → HTTP ${res.status}`);
      }
    } catch (err) {
      console.log(`  ✗ ${ticker} → ${err.message}`);
    }
  }
}
