// Check more providers: EODHD, RapidAPI funds, fund manager direct pages

const FUNDS = [
  { name: 'DWS LatAm A2 USD', isin: 'LU0399027613', price: 205.53 },
  { name: 'BNY HY W USD', isin: 'IE00BDTJQX52', price: 1.6209 },
  { name: 'Jupiter L USD', isin: 'IE0033029430', price: 4.0413 },
  { name: 'UBAM AC USD', isin: 'LU0862297826', price: 278.354 },
];

// ============================================================
// 1. EOD Historical Data (eodhd.com) — $20-80/month, claims 150K+ mutual funds
// ============================================================
console.log('=== 1. EODHD — Search by ISIN ===');
const EODHD_KEY = 'demo'; // free demo
for (const fund of FUNDS) {
  try {
    const url = `https://eodhd.com/api/search/${fund.isin}?api_token=${EODHD_KEY}&type=fund`;
    const res = await fetch(url);
    if (res.ok) {
      const json = await res.json();
      console.log(`  ${fund.name}: ${(json || []).length} results`);
      for (const r of (json || []).slice(0, 3)) {
        console.log(`    ${r.Code}.${r.Exchange} | ${r.Name} | ${r.Currency} | ${r.ISIN}`);
      }
    } else {
      console.log(`  ${fund.name}: HTTP ${res.status}`);
    }
  } catch (err) {
    console.log(`  ${fund.name}: ${err.message}`);
  }
}

// Also search by name
console.log('\n=== 1b. EODHD — Search by name ===');
for (const fund of FUNDS.slice(0, 2)) {
  try {
    const q = fund.name.split(' ').slice(0, 3).join(' ');
    const url = `https://eodhd.com/api/search/${encodeURIComponent(q)}?api_token=${EODHD_KEY}&type=fund`;
    const res = await fetch(url);
    if (res.ok) {
      const json = await res.json();
      console.log(`  ${fund.name}: ${(json || []).length} results`);
      for (const r of (json || []).slice(0, 5)) {
        console.log(`    ${r.Code}.${r.Exchange} | ${r.Name} | ${r.Currency} | ISIN: ${r.ISIN}`);
      }
    }
  } catch (err) {
    console.log(`  ${err.message}`);
  }
}

// ============================================================
// 2. DWS Direct Website — check if they have a public NAV endpoint
// ============================================================
console.log('\n=== 2. DWS Direct Website ===');
try {
  // DWS fundcenter page
  const url = 'https://fundsus.dws.com/api/funddata/price?isin=LU0399027613';
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  console.log(`  DWS fundcenter: HTTP ${res.status}`);
  if (res.ok) {
    const text = await res.text();
    console.log(`  ${text.substring(0, 300)}`);
  }
} catch (err) {
  console.log(`  DWS: ${err.message}`);
}

// Try DWS EU API
try {
  const url = 'https://www.dws.com/api/fundFinder/funds?isin=LU0399027613&locale=en-lu';
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'application/json' } });
  console.log(`  DWS EU API: HTTP ${res.status}`);
  if (res.ok) {
    const json = await res.json();
    console.log(`  ${JSON.stringify(json).substring(0, 400)}`);
  }
} catch (err) {
  console.log(`  DWS EU: ${err.message}`);
}

// ============================================================
// 3. Scraping fund NAV from Morningstar.co.uk (public pages)
// ============================================================
console.log('\n=== 3. Morningstar.co.uk — Public fund pages ===');
// Morningstar SecIds from Yahoo (0P000... format)
const msIds = [
  { name: 'UBAM AC USD', msid: '0P00000AZP' },  // confirmed match
];
for (const { name, msid } of msIds) {
  try {
    const url = `https://www.morningstar.co.uk/uk/funds/snapshot/snapshot.aspx?id=${msid}&tab=1`;
    const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    console.log(`  ${name}: HTTP ${res.status}`);
  } catch (err) {
    console.log(`  ${name}: ${err.message}`);
  }
}

// ============================================================
// 4. Try Nasdaq Fund Network (NFNX) — free fund NAVs
// ============================================================
console.log('\n=== 4. Nasdaq Fund Network ===');
try {
  const url = 'https://api.nasdaq.com/api/quote/mutual-fund/summary?symbol=0P00000AZP';
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'application/json' },
  });
  console.log(`  Nasdaq: HTTP ${res.status}`);
  if (res.ok) {
    const json = await res.json();
    console.log(`  ${JSON.stringify(json).substring(0, 300)}`);
  }
} catch (err) {
  console.log(`  Nasdaq: ${err.message}`);
}

console.log('\n=== PRICING SUMMARY ===');
console.log(`
Provider               | Cobertura UCITS  | Precio/mes | API oficial
-----------------------|------------------|------------|------------
Yahoo Finance          | Parcial (~60%)   | Gratis     | Semi (v8 raw)
EODHD.com              | ~150K fondos     | USD 20-80  | Sí
Morningstar Direct     | Completa         | ~USD 2K+   | Sí (enterprise)
Refinitiv/LSEG         | Completa         | ~USD 5K+   | Sí (enterprise)
Bloomberg              | Completa         | ~USD 24K/a | Terminal
Xignite                | Buena            | ~USD 300   | Sí
Fund managers (scrape) | Solo sus fondos  | Gratis     | No (frágil)
`);
