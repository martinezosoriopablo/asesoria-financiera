// Try Investing.com with simpler search terms and different endpoints
const queries = ['DWS Latin American', 'BNY Mellon High Yield', 'Jupiter Merian', 'UBAM Dynamic Dollar'];

for (const query of queries) {
  console.log(`\n=== ${query} ===`);

  // Try the autocomplete endpoint
  try {
    const url = `https://api.investing.com/api/search/v2/search?q=${encodeURIComponent(query)}&limit=5`;
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
        'Accept': 'application/json',
        'domain-id': 'www',
      },
    });
    const json = await res.json();
    const quotes = json.quotes || [];
    if (quotes.length > 0) {
      for (const q of quotes) {
        console.log(`  ${q.symbol || q.ticker || ''} | ${q.description || q.name || ''} | ${q.exchange || ''} | type: ${q.type || q.asset_type || ''}`);
      }
    } else {
      console.log('  No quotes');
    }
  } catch (err) {
    console.log(`  Error: ${err.message}`);
  }

  // Also try the website search (scrape-friendly)
  try {
    const url2 = `https://www.investing.com/search/?q=${encodeURIComponent(query)}&tab=funds`;
    const res2 = await fetch(url2, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
        'Accept': 'text/html',
      },
      redirect: 'follow',
    });
    const html = await res2.text();
    // Extract fund links
    const matches = html.match(/\/funds\/[^"]+/g) || [];
    const unique = [...new Set(matches)].slice(0, 5);
    if (unique.length > 0) {
      console.log('  Fund links found:');
      for (const m of unique) console.log(`    https://www.investing.com${m}`);
    }
  } catch {}
}
