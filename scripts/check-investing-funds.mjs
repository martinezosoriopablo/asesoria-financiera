// Check if Investing.com has these funds via their unofficial API
// Investing.com uses a search endpoint we can query

const funds = [
  { name: 'DWS Invest Latin American Equities A2 USD', price: 205.53 },
  { name: 'BNY Mellon Global Short Dated High Yield W USD', price: 1.6209 },
  { name: 'Jupiter Merian World Equity L USD', price: 4.0413 },
  { name: 'UBAM Dynamic US Dollar Bond AC USD', price: 278.354 },
];

for (const { name, price } of funds) {
  console.log(`\n=== ${name} (cartola: ${price}) ===`);
  try {
    const q = encodeURIComponent(name.split(' ').slice(0, 4).join(' '));
    const url = `https://api.investing.com/api/search/v2/search?q=${q}&t=Funds&limit=10`;
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
        'Accept': 'application/json',
        'domain-id': 'www',
      },
    });
    if (res.ok) {
      const json = await res.json();
      const articles = json.quotes || json.articles || json.data || [];
      // Investing.com may return different structures
      console.log('Response keys:', Object.keys(json));
      const items = Array.isArray(json) ? json : (json.quotes || json.hits || json.results || []);
      if (items.length === 0) {
        // Try printing raw
        const text = JSON.stringify(json).substring(0, 500);
        console.log('  Raw:', text);
      }
      for (const item of items.slice(0, 5)) {
        console.log(`  ${JSON.stringify(item).substring(0, 200)}`);
      }
    } else {
      console.log(`  HTTP ${res.status}`);
      const text = await res.text();
      console.log('  ', text.substring(0, 200));
    }
  } catch (err) {
    console.log(`  Error: ${err.message}`);
  }
}
