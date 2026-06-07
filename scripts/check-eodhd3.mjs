const API_KEY = '6a218882e15de0.07020278';

// Search by fund name
const searches = [
  'DWS Latin American',
  'DWS Invest Latin',
  'BNY Mellon Short Dated',
  'BNY Mellon High Yield',
  'Jupiter Merian World',
  'Jupiter World Equity',
  'UBAM Dynamic Dollar',
  'UBAM Dollar Bond',
];

console.log('=== EODHD Search by Name ===');
for (const q of searches) {
  try {
    const url = `https://eodhd.com/api/search/${encodeURIComponent(q)}?api_token=${API_KEY}&fmt=json`;
    const res = await fetch(url);
    if (res.ok) {
      const json = await res.json();
      const funds = (json || []).filter(r => r.Type === 'FUND' || r.Type === 'ETF');
      if (funds.length > 0) {
        console.log(`\n"${q}": ${funds.length} fund results`);
        for (const r of funds.slice(0, 8)) {
          console.log(`  ${r.Code}.${r.Exchange} | ${r.Name} | ${r.Currency} | ISIN: ${r.ISIN}`);
        }
      } else {
        console.log(`"${q}": ${json.length} total results, 0 funds`);
        for (const r of (json || []).slice(0, 3)) {
          console.log(`  ${r.Code}.${r.Exchange} | ${r.Name} | Type: ${r.Type}`);
        }
      }
    } else {
      console.log(`"${q}": HTTP ${res.status}`);
    }
  } catch (err) {
    console.log(`"${q}": ${err.message}`);
  }
}

// Also check what exchanges EODHD has for funds
console.log('\n\n=== EODHD Exchange list (fund exchanges) ===');
try {
  const url = `https://eodhd.com/api/exchanges-list/?api_token=${API_KEY}&fmt=json`;
  const res = await fetch(url);
  if (res.ok) {
    const json = await res.json();
    const fundExchanges = json.filter(e =>
      e.Code?.includes('FUND') || e.Name?.toLowerCase().includes('fund') || e.Name?.toLowerCase().includes('mutual')
    );
    console.log(`Fund-related exchanges: ${fundExchanges.length}`);
    for (const e of fundExchanges) {
      console.log(`  ${e.Code} | ${e.Name} | ${e.Country}`);
    }
  }
} catch (err) {
  console.log(`Error: ${err.message}`);
}
