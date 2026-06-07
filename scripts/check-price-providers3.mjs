// Check RapidAPI Morningstar wrapper and Mboum Finance
// These provide Morningstar data at lower cost

// ============================================================
// 1. Check if Yahoo Finance has a "similar funds" search we missed
// Search by CUSIP (Raymond James IDs)
// ============================================================
console.log('=== Yahoo: Search by CUSIP ===');
const cusips = [
  { name: 'DWS LatAm A2', cusip: 'L2R330245' },
  { name: 'BNY HY W', cusip: 'G1R06N212' },
  { name: 'Jupiter L', cusip: 'G6016L337' },
  { name: 'UBAM AC', cusip: 'L9381G101' },
];
for (const { name, cusip } of cusips) {
  try {
    const url = `https://query2.finance.yahoo.com/v1/finance/search?q=${cusip}&quotesCount=5&newsCount=0`;
    const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' } });
    if (res.ok) {
      const json = await res.json();
      const quotes = json.quotes || [];
      console.log(`  ${name} (${cusip}): ${quotes.length} results`);
      for (const q of quotes) {
        console.log(`    ${q.symbol} | ${q.shortname || q.longname || ''} | ${q.exchange} | ${q.quoteType}`);
      }
    }
  } catch (err) {
    console.log(`  ${name}: ${err.message}`);
  }
}

// ============================================================
// 2. Try more specific Yahoo searches for missing classes
// ============================================================
console.log('\n=== Yahoo: Targeted class search ===');

// DWS LatAm — search for ALL classes, find A2
const dwsSearch = ['DWS Latin American A2', 'DWS Invest Latin A2', 'DWS Latin USD'];
for (const q of dwsSearch) {
  try {
    const url = `https://query2.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(q)}&quotesCount=10&newsCount=0`;
    const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' } });
    if (res.ok) {
      const json = await res.json();
      const quotes = json.quotes || [];
      if (quotes.length > 0) {
        console.log(`  "${q}": ${quotes.length} results`);
        for (const qt of quotes) {
          console.log(`    ${qt.symbol} | ${qt.shortname || qt.longname || ''} | ${qt.exchange}`);
        }
      }
    }
  } catch {}
}

// BNY — search for W class specifically
const bnySearch = ['BNY Mellon Short Dated W USD', 'BNY Short Dated High Yield W'];
for (const q of bnySearch) {
  try {
    const url = `https://query2.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(q)}&quotesCount=10&newsCount=0`;
    const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' } });
    if (res.ok) {
      const json = await res.json();
      const quotes = json.quotes || [];
      if (quotes.length > 0) {
        console.log(`  "${q}": ${quotes.length} results`);
        for (const qt of quotes) {
          console.log(`    ${qt.symbol} | ${qt.shortname || qt.longname || ''} | ${qt.exchange}`);
        }
      }
    }
  } catch {}
}

// Jupiter — search for L class
const jupSearch = ['Jupiter Merian World Equity L USD', 'Merian World Equity L'];
for (const q of jupSearch) {
  try {
    const url = `https://query2.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(q)}&quotesCount=10&newsCount=0`;
    const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' } });
    if (res.ok) {
      const json = await res.json();
      const quotes = json.quotes || [];
      if (quotes.length > 0) {
        console.log(`  "${q}": ${quotes.length} results`);
        for (const qt of quotes) {
          console.log(`    ${qt.symbol} | ${qt.shortname || qt.longname || ''} | ${qt.exchange}`);
        }
      }
    }
  } catch {}
}

// ============================================================
// 3. Check fund manager NAV pages (scrape-able endpoints)
// ============================================================
console.log('\n=== Fund manager direct NAV pages ===');

// DWS — try their global site
try {
  const url = 'https://www.dws.com/solutions/products/detail/?isin=LU0399027613';
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)', 'Accept': 'text/html' },
    redirect: 'follow',
  });
  console.log(`  DWS page: HTTP ${res.status}, redirected: ${res.redirected}, url: ${res.url}`);
  if (res.ok) {
    const html = await res.text();
    // Look for NAV/price in the page
    const navMatch = html.match(/nav[^>]*>[\s\S]*?(\d+[.,]\d+)/i) || html.match(/price[^>]*>[\s\S]*?(\d+[.,]\d+)/i);
    if (navMatch) console.log(`  Found value: ${navMatch[1]}`);
    // Check if there's an API endpoint in the page
    const apiMatch = html.match(/api[^"']*funds[^"']*/gi);
    if (apiMatch) console.log(`  API endpoints found: ${apiMatch.slice(0, 3).join(', ')}`);
  }
} catch (err) {
  console.log(`  DWS: ${err.message}`);
}

// BNY Mellon — try their fund center
try {
  const url = 'https://www.bnymellonim.com/api/funddata/v2/fund?isin=IE00BDTJQX52';
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'application/json' } });
  console.log(`  BNY API: HTTP ${res.status}`);
  if (res.ok) {
    const text = await res.text();
    console.log(`  ${text.substring(0, 300)}`);
  }
} catch (err) {
  console.log(`  BNY: ${err.message}`);
}
