// scripts/finra-historical3.mjs
// Query FINRA Corporate Bond Trade Activity via template composite endpoint
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

console.log('[LOGIN]...');
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

// Template IDs from discovery
const TEMPLATES = {
  tradeActivity: 'template-4be2bd56-523d-4623-a401-031dfeadde1e',
  corpBonds: 'template-e07aeeca-d6b8-4356-bd2a-0ca58e1e5bea',
  bondSentiment: 'template-ea9803c2-20d4-49a9-b408-c7eaa75dccdd',
  corpBondActivity: 'template-bfb38ac6-3c00-4678-b405-f4e66f4003b4',
};

const cusip = '097023CU7'; // Boeing

// 1. Get template metadata (fields, filters)
for (const [name, tid] of Object.entries(TEMPLATES)) {
  console.log(`\n=== ${name} (${tid}) ===`);

  // GET metadata
  try {
    const metaRes = await fetch(`${BASE}/public/reporting/v2/template/${tid}`, { headers });
    if (metaRes.ok) {
      const meta = await metaRes.json();
      console.log('META:', JSON.stringify(meta).substring(0, 600));
    } else {
      console.log('META status:', metaRes.status);
    }
  } catch (e) { console.log('META error:', e.message); }

  // POST composite with minimal params
  try {
    const res = await fetch(`${BASE}/public/reporting/v2/template/${tid}/composite`, {
      method: 'POST', headers,
      body: JSON.stringify({ limit: 3 }),
    });
    console.log('COMPOSITE status:', res.status);
    if (res.ok) {
      const data = await res.json();
      console.log('COMPOSITE:', JSON.stringify(data).substring(0, 800));
    } else {
      const text = await res.text();
      console.log('COMPOSITE error:', text.substring(0, 300));
    }
  } catch (e) { console.log('COMPOSITE error:', e.message); }

  // POST composite filtered by CUSIP
  try {
    const res = await fetch(`${BASE}/public/reporting/v2/template/${tid}/composite`, {
      method: 'POST', headers,
      body: JSON.stringify({
        domainFilters: [{ fieldName: 'cusip', values: [cusip] }],
        limit: 10,
      }),
    });
    if (res.ok) {
      const data = await res.json();
      console.log('CUSIP FILTER:', JSON.stringify(data).substring(0, 800));
    } else {
      console.log('CUSIP FILTER status:', res.status);
    }
  } catch (e) { console.log('CUSIP FILTER error:', e.message); }
}

await browser.close();
console.log('\nDone!');
