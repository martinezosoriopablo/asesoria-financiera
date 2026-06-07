// scripts/finra-historical.mjs
// Test fetching historical bond trade data from FINRA DynRep API
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const { chromium } = await import('playwright');

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

// LOGIN (same as scraper)
console.log('[LOGIN] Starting...');
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
});
const page = await context.newPage();

let xsrfToken = '';
let dxtId = '';

page.on('response', async (response) => {
  const sc = response.headers()['set-cookie'] || '';
  const m = sc.match(/XSRF-TOKEN=([^;]+)/);
  if (m) xsrfToken = m[1];
});
page.on('request', (req) => {
  const h = req.headers();
  if (h['x-xsrf-token'] && !xsrfToken) xsrfToken = h['x-xsrf-token'];
  if (h['dxt-id'] && !dxtId) dxtId = h['dxt-id'];
});

await page.goto('https://gateway.finra.org/app/data', { waitUntil: 'networkidle', timeout: 30000 });
await page.click('#individual-username');
await page.type('#individual-username', user, { delay: 20 });
await page.click('#password');
await page.type('#password', pass, { delay: 20 });
await page.waitForTimeout(300);
await page.evaluate(() => { const b = document.querySelector('#submit-button'); if (b) { b.disabled = false; b.click(); } });
await page.waitForTimeout(3000);

const pt = await page.evaluate(() => document.body.innerText);
if (pt.includes('Security Question')) {
  const answer = findAnswer(pt);
  if (answer) {
    await page.click('#securityQuestionAnswer');
    await page.type('#securityQuestionAnswer', answer, { delay: 20 });
    const cb = await page.$('#bindDevice');
    if (cb) await cb.check({ force: true }).catch(() => {});
    await page.evaluate(() => { const b = document.querySelector('#submit-button'); if (b) { b.disabled = false; b.click(); } });
    await page.waitForTimeout(5000);
  }
}
await page.waitForTimeout(10000);

const allCookies = await context.cookies();
const cookieStr = allCookies.map(c => `${c.name}=${c.value}`).join('; ');
if (!xsrfToken) {
  const xc = allCookies.find(c => c.name === 'XSRF-TOKEN');
  if (xc) xsrfToken = xc.value;
}
if (!dxtId) dxtId = crypto.randomUUID();
await page.close();

console.log('[LOGIN] Done. XSRF:', xsrfToken.substring(0, 12) + '...');

const BASE = 'https://services-dynarep.ddwa.finra.org';
const headers = {
  'Cookie': cookieStr,
  'Accept': 'application/json',
  'Content-Type': 'application/json',
  'x-xsrf-token': xsrfToken,
  'dxt-id': `${dxtId},${dxtId}`,
  'Referer': 'https://gateway.finra.org/',
};

// Test CUSIP: Boeing 097023CU7
const testCusip = '097023CU7';

// Attempt 1: Query the trade activity dataset
console.log('\n--- Attempt 1: Trade Activity dataset ---');
const tradeBody = {
  fields: ['tradeDate', 'cusip', 'issuerName', 'lastSalePrice', 'lastSaleYield', 'volume'],
  dateRangeFilters: [{
    fieldName: 'tradeDate',
    startDate: '2026-04-01',
    endDate: '2026-05-19',
  }],
  domainFilters: [{
    fieldName: 'cusip',
    values: [testCusip],
  }],
  limit: 50,
  sortFields: ['-tradeDate'],
};

try {
  const res = await fetch(`${BASE}/public/reporting/v2/data/group/FixedIncomeMarket/name/CorporateAndAgencyTradeActivity`, {
    method: 'POST', headers, body: JSON.stringify(tradeBody),
  });
  console.log('Status:', res.status);
  const text = await res.text();
  console.log('Response:', text.substring(0, 500));
} catch (e) { console.log('Error:', e.message); }

// Attempt 2: Different dataset name
console.log('\n--- Attempt 2: CorporateAndAgencySecurities ---');
const secBody = {
  fields: ['cusip', 'issuerName', 'couponRate', 'maturityDate', 'lastSalePrice', 'lastSaleYield', 'lastSaleDate'],
  domainFilters: [{
    fieldName: 'cusip',
    values: [testCusip],
  }],
  limit: 10,
};

try {
  const res = await fetch(`${BASE}/public/reporting/v2/data/group/FixedIncomeMarket/name/CorporateAndAgencySecurities`, {
    method: 'POST', headers, body: JSON.stringify(secBody),
  });
  console.log('Status:', res.status);
  const text = await res.text();
  console.log('Response:', text.substring(0, 500));
} catch (e) { console.log('Error:', e.message); }

// Attempt 3: List available templates to find the right dataset
console.log('\n--- Attempt 3: List templates ---');
try {
  const res = await fetch(`${BASE}/reporting/v1/templates`, { headers });
  console.log('Status:', res.status);
  const data = await res.json();
  const templates = data.returnBody || data;
  if (Array.isArray(templates)) {
    console.log(`Found ${templates.length} templates:`);
    for (const t of templates.slice(0, 30)) {
      console.log(`  ${t.groupName}/${t.datasetName} — ${t.description || ''}`);
    }
  } else {
    console.log(JSON.stringify(data).substring(0, 500));
  }
} catch (e) { console.log('Error:', e.message); }

// Attempt 4: Try the composite endpoint which the portal uses
console.log('\n--- Attempt 4: Template composite for bond detail ---');
try {
  // First find the template ID for corporate bonds
  const res = await fetch(`${BASE}/reporting/v1/templates`, { headers });
  const data = await res.json();
  const templates = data.returnBody || [];
  const bondTemplate = templates.find(t =>
    t.datasetName?.includes('CorporateAndAgency') && t.datasetName?.includes('Trade')
  );
  if (bondTemplate) {
    console.log('Found template:', bondTemplate.templateId, bondTemplate.datasetName);

    // Query using template
    const compRes = await fetch(`${BASE}/public/reporting/v2/template/${bondTemplate.templateId}/composite`, {
      method: 'POST', headers,
      body: JSON.stringify({
        fields: ['tradeDate', 'cusip', 'issuerName', 'price', 'yield', 'volume', 'tradeCount'],
        dateRangeFilters: [{
          fieldName: 'tradeDate',
          startDate: '2026-05-01',
          endDate: '2026-05-19',
        }],
        domainFilters: [{ fieldName: 'cusip', values: [testCusip] }],
        limit: 20,
      }),
    });
    console.log('Composite status:', compRes.status);
    const compText = await compRes.text();
    console.log('Response:', compText.substring(0, 800));
  }
} catch (e) { console.log('Error:', e.message); }

await browser.close();
console.log('\nDone!');
