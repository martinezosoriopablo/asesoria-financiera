// scripts/finra-historical5.mjs
// Use the authenticated session to query trade activity via /reporting/v1/ endpoints
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import { chromium } from 'playwright';

const user = process.env.FINRA_USER;
const pass = process.env.FINRA_PASSWORD;
const SECURITY_ANSWERS = {
  'high school': 'Santiago', 'city': 'Santiago',
  'first boss': 'Martin', 'supervisor': 'Martin', 'boss': 'Martin',
  'middle name': 'Aurora', 'mother': 'Aurora',
};
function findAnswer(text) {
  const q = text.toLowerCase();
  for (const [key, answer] of Object.entries(SECURITY_ANSWERS)) { if (q.includes(key)) return answer; }
  return null;
}

// Quick login
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' });
const page = await context.newPage();
let xsrfToken = '', dxtId = '';
page.on('response', async (r) => { const sc = r.headers()['set-cookie'] || ''; const m = sc.match(/XSRF-TOKEN=([^;]+)/); if (m) xsrfToken = m[1]; });
page.on('request', (r) => { const h = r.headers(); if (h['x-xsrf-token']) xsrfToken = h['x-xsrf-token']; if (h['dxt-id']) dxtId = h['dxt-id']; });
await page.goto('https://gateway.finra.org/app/data', { waitUntil: 'networkidle', timeout: 30000 });
await page.click('#individual-username'); await page.type('#individual-username', user, { delay: 20 });
await page.click('#password'); await page.type('#password', pass, { delay: 20 });
await page.waitForTimeout(300);
await page.evaluate(() => { const b = document.querySelector('#submit-button'); if (b) { b.disabled = false; b.click(); } });
await page.waitForTimeout(3000);
const pt = await page.evaluate(() => document.body.innerText);
if (pt.includes('Security Question')) {
  const answer = findAnswer(pt);
  if (answer) {
    await page.click('#securityQuestionAnswer'); await page.type('#securityQuestionAnswer', answer, { delay: 20 });
    await page.$('#bindDevice').then(cb => cb?.check({ force: true }).catch(() => {}));
    await page.evaluate(() => { const b = document.querySelector('#submit-button'); if (b) { b.disabled = false; b.click(); } });
    await page.waitForTimeout(5000);
  }
}
await page.waitForTimeout(10000);
const allCookies = await context.cookies();
const cookieStr = allCookies.map(c => `${c.name}=${c.value}`).join('; ');
if (!xsrfToken) { const xc = allCookies.find(c => c.name === 'XSRF-TOKEN'); if (xc) xsrfToken = xc.value; }
if (!dxtId) dxtId = crypto.randomUUID();
await page.close();
console.log('[LOGIN] OK');

const BASE = 'https://services-dynarep.ddwa.finra.org';
const headers = {
  'Cookie': cookieStr, 'Accept': 'application/json', 'Content-Type': 'application/json',
  'x-xsrf-token': xsrfToken, 'dxt-id': `${dxtId},${dxtId}`, 'Referer': 'https://gateway.finra.org/',
};

const cusip = '097023CU7'; // Boeing

// The working watchlist endpoint pattern:
// POST /reporting/v1/watchlist/group/FixedIncomeMarket/name/BondWatchlist
// Let's try the same pattern for trade activity datasets

const endpoints = [
  // Pattern: /reporting/v1/{category}/group/{group}/name/{dataset}
  { url: `${BASE}/reporting/v1/data/group/FixedIncomeMarket/name/CorporateAndAgencyTradeActivity`, label: 'v1 data' },
  { url: `${BASE}/reporting/v2/data/group/FixedIncomeMarket/name/CorporateAndAgencyTradeActivity`, label: 'v2 data' },
  // Maybe it needs the template prefix
  { url: `${BASE}/reporting/v1/template/group/FixedIncomeMarket/name/CorporateAndAgencyTradeActivity`, label: 'v1 template' },
  // Try just /reporting/v1/ like the watchlist
  { url: `${BASE}/reporting/v1/group/FixedIncomeMarket/name/CorporateAndAgencyTradeActivity`, label: 'v1 group' },
  // Try the composite with actual template IDs
  { url: `${BASE}/public/reporting/v2/template/template-4be2bd56-523d-4623-a401-031dfeadde1e/composite`, label: 'v2 composite trade' },
  // Try v1 composite
  { url: `${BASE}/reporting/v1/template/template-4be2bd56-523d-4623-a401-031dfeadde1e/composite`, label: 'v1 composite trade' },
  // The bond securities screener
  { url: `${BASE}/reporting/v1/template/template-e07aeeca-d6b8-4356-bd2a-0ca58e1e5bea/composite`, label: 'v1 composite bonds' },
  { url: `${BASE}/public/reporting/v2/template/template-e07aeeca-d6b8-4356-bd2a-0ca58e1e5bea/composite`, label: 'v2 composite bonds' },
];

const body = {
  fields: ['cusip', 'issuerName', 'lastSalePrice', 'lastSaleYield', 'tradeDate', 'volume'],
  domainFilters: [{ fieldName: 'cusip', values: [cusip] }],
  limit: 10,
  offset: 0,
};

for (const ep of endpoints) {
  try {
    // Try POST
    const res = await fetch(ep.url, { method: 'POST', headers, body: JSON.stringify(body) });
    const text = await res.text();
    console.log(`\nPOST ${res.status} [${ep.label}]`);
    if (res.ok && text.length > 10) console.log(`  ${text.substring(0, 600)}`);
    else if (text.length > 0) console.log(`  ${text.substring(0, 200)}`);

    // Also try GET for composites
    if (ep.url.includes('composite')) {
      const getRes = await fetch(ep.url, { headers });
      if (getRes.ok) {
        const getData = await getRes.text();
        console.log(`GET ${getRes.status} [${ep.label}]`);
        console.log(`  ${getData.substring(0, 600)}`);
      }
    }
  } catch (e) { console.log(`ERR [${ep.label}]: ${e.message}`); }
}

await browser.close();
console.log('\nDone!');
