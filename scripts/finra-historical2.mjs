// scripts/finra-historical2.mjs
// Explore FINRA templates and try historical queries
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
const context = await browser.newContext({
  userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
});
const page = await context.newPage();
let xsrfToken = '', dxtId = '';
page.on('response', async (r) => { const sc = r.headers()['set-cookie'] || ''; const m = sc.match(/XSRF-TOKEN=([^;]+)/); if (m) xsrfToken = m[1]; });
page.on('request', (r) => { const h = r.headers(); if (h['x-xsrf-token']) xsrfToken = h['x-xsrf-token']; if (h['dxt-id']) dxtId = h['dxt-id']; });

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

// 1. Dump full template structure
console.log('\n=== Templates ===');
const tRes = await fetch(`${BASE}/reporting/v1/templates`, { headers });
const tData = await tRes.json();
const templates = tData.returnBody || tData;
console.log('Raw first template:', JSON.stringify(templates[0]).substring(0, 500));
console.log('\nAll templates:');
for (const t of templates) {
  console.log(JSON.stringify(t).substring(0, 300));
}

// 2. Try each template's composite endpoint to find one with bond history
console.log('\n=== Trying composites ===');
for (const t of templates) {
  const tid = t.templateId || t.id || t.template_id;
  if (!tid) continue;

  try {
    // First get the template metadata
    const metaRes = await fetch(`${BASE}/public/reporting/v2/template/${tid}/composite`, {
      method: 'POST', headers,
      body: JSON.stringify({ limit: 1 }),
    });

    if (metaRes.ok) {
      const metaData = await metaRes.json();
      console.log(`\nTemplate ${tid} (${metaRes.status}):`);
      console.log(JSON.stringify(metaData).substring(0, 500));
    } else {
      console.log(`Template ${tid}: ${metaRes.status}`);
    }
  } catch (e) {
    console.log(`Template ${tid}: ${e.message}`);
  }
}

// 3. Try the bond detail page URL pattern that the portal uses
console.log('\n=== Bond detail page API ===');
const cusip = '097023CU7';
const detailUrls = [
  `${BASE}/public/reporting/v2/data/group/fixedIncomeMarket/name/bondDetailTransaction?cusip=${cusip}`,
  `${BASE}/reporting/v1/data/bond/${cusip}`,
  `${BASE}/reporting/v1/bond/${cusip}/trades`,
  `${BASE}/reporting/v1/bond/${cusip}/history`,
];

for (const url of detailUrls) {
  try {
    const res = await fetch(url, { headers });
    console.log(`${res.status}: ${url}`);
    if (res.ok) {
      const text = await res.text();
      console.log(text.substring(0, 300));
    }
  } catch (e) { console.log(`ERR: ${url}`); }
}

await browser.close();
console.log('\nDone!');
