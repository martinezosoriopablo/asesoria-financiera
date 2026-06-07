// Investigate price providers for international UCITS funds
// Test: DWS LatAm A2 USD, BNY HY W USD, Jupiter L USD, UBAM AC USD

const FUNDS = [
  { name: 'DWS LatAm A2 USD', isin: 'LU0399027613', cusip: 'L2R330245', price: 205.53 },
  { name: 'BNY HY W USD', isin: 'IE00BDTJQX52', cusip: 'G1R06N212', price: 1.6209 },
  { name: 'Jupiter L USD', isin: 'IE0033029430', cusip: 'G6016L337', price: 4.0413 },
  { name: 'UBAM AC USD', isin: 'LU0862297826', cusip: 'L9381G101', price: 278.354 },
];

// ============================================================
// 1. OpenFIGI — Free ISIN→ticker mapping (no prices, but useful)
// ============================================================
console.log('=== 1. OpenFIGI (free ISIN mapping) ===');
try {
  const body = FUNDS.map(f => ({ idType: 'ID_ISIN', idValue: f.isin }));
  const res = await fetch('https://api.openfigi.com/v3/mapping', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (res.ok) {
    const json = await res.json();
    for (let i = 0; i < json.length; i++) {
      const fund = FUNDS[i];
      const results = json[i].data || [];
      console.log(`  ${fund.name} (${fund.isin}):`);
      if (results.length === 0) {
        console.log(`    No results (warning: ${json[i].warning || 'none'})`);
      }
      for (const r of results.slice(0, 3)) {
        console.log(`    ticker: ${r.ticker} | exchange: ${r.exchCode} | name: ${r.name} | mktSector: ${r.marketSector}`);
      }
    }
  } else {
    console.log(`  HTTP ${res.status}: ${await res.text()}`);
  }
} catch (err) {
  console.log(`  Error: ${err.message}`);
}

// ============================================================
// 2. Financial Modeling Prep (FMP) — $19-79/mo, has mutual funds
// ============================================================
console.log('\n=== 2. Financial Modeling Prep (checking free tier) ===');
const FMP_KEY = 'demo'; // free demo key
for (const fund of FUNDS.slice(0, 2)) {
  try {
    const url = `https://financialmodelingprep.com/api/v3/search?query=${encodeURIComponent(fund.isin)}&apikey=${FMP_KEY}`;
    const res = await fetch(url);
    const json = await res.json();
    console.log(`  ${fund.name}: ${json.length || 0} results`);
    for (const r of (json || []).slice(0, 3)) {
      console.log(`    ${r.symbol} | ${r.name} | ${r.currency} | ${r.stockExchange}`);
    }
  } catch (err) {
    console.log(`  ${fund.name}: ${err.message}`);
  }
}

// ============================================================
// 3. Twelve Data — has mutual fund NAVs, $29-399/mo
// ============================================================
console.log('\n=== 3. Twelve Data (checking search) ===');
for (const fund of FUNDS.slice(0, 2)) {
  try {
    const q = fund.name.split(' ').slice(0, 3).join(' ');
    const url = `https://api.twelvedata.com/mutual_funds/search?query=${encodeURIComponent(q)}&outputsize=5`;
    const res = await fetch(url);
    if (res.ok) {
      const json = await res.json();
      console.log(`  ${fund.name}: ${json.result?.length || json.count || 0} results`);
      for (const r of (json.result || json.data || []).slice(0, 3)) {
        console.log(`    ${JSON.stringify(r).substring(0, 150)}`);
      }
    } else {
      console.log(`  ${fund.name}: HTTP ${res.status}`);
    }
  } catch (err) {
    console.log(`  ${fund.name}: ${err.message}`);
  }
}

// ============================================================
// 4. Morningstar Direct API — enterprise, but check if ISIN resolves
// ============================================================
console.log('\n=== 4. Morningstar (checking public search) ===');
for (const fund of FUNDS) {
  try {
    const url = `https://www.morningstar.com/api/v2/search/securities/5/usearch-v2?q=${fund.isin}&pageSize=3`;
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
    });
    if (res.ok) {
      const json = await res.json();
      const results = json.hits || json.results || [];
      console.log(`  ${fund.name}: ${results.length} results`);
      for (const r of results.slice(0, 2)) {
        console.log(`    ${JSON.stringify(r).substring(0, 200)}`);
      }
    } else {
      console.log(`  ${fund.name}: HTTP ${res.status}`);
    }
  } catch (err) {
    console.log(`  ${fund.name}: ${err.message}`);
  }
}

// ============================================================
// 5. Fund manager websites — direct NAV feeds (free)
// ============================================================
console.log('\n=== 5. Direct from fund managers ===');

// DWS
try {
  const url = 'https://api.dws.com/fundFinder/v1/funds?isin=LU0399027613';
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  console.log(`  DWS API: HTTP ${res.status}`);
  if (res.ok) {
    const json = await res.json();
    console.log(`  DWS: ${JSON.stringify(json).substring(0, 300)}`);
  }
} catch (err) {
  console.log(`  DWS: ${err.message}`);
}

// UBP/UBAM
try {
  const url = 'https://www.ubp.com/api/funds?isin=LU0862297826';
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  console.log(`  UBP API: HTTP ${res.status}`);
} catch (err) {
  console.log(`  UBP: ${err.message}`);
}
