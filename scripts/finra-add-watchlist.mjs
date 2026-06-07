// scripts/finra-add-watchlist.mjs
// Add bonds to FINRA watchlist automatically using Playwright login + REST API
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
  for (const [key, answer] of Object.entries(SECURITY_ANSWERS)) {
    if (q.includes(key)) return answer;
  }
  return null;
}

// CUSIPs from Stonex cartola (minus Pemex 71654QDP4 already in watchlist)
const CUSIPS_TO_ADD = [
  '03938LBG8', '00206RMT6', '09261HBX4', '097023CU7', '15089QAM6',
  '172967PF2', '279158AN9', '279158AW9', 'U37818BQ0', '472140AF9',
  '71647NAZ2', '86960YAA0', '87927VAR9', '88163VAD1',
  '87264ADF9', '95000U3F8',
];

console.log(`Adding ${CUSIPS_TO_ADD.length} bonds to FINRA watchlist...\n`);

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
});
const page = await context.newPage();

// Capture XSRF token and dxt-id from requests
let xsrfToken = '';
let dxtId = '';

page.on('response', async (response) => {
  const setCookies = response.headers()['set-cookie'] || '';
  const xsrfMatch = setCookies.match(/XSRF-TOKEN=([^;]+)/);
  if (xsrfMatch) xsrfToken = xsrfMatch[1];
});

page.on('request', (request) => {
  const h = request.headers();
  if (h['x-xsrf-token'] && !xsrfToken) xsrfToken = h['x-xsrf-token'];
  if (h['dxt-id'] && !dxtId) dxtId = h['dxt-id'];
});

// LOGIN
console.log('[LOGIN] Navigating to FINRA...');
await page.goto('https://gateway.finra.org/app/data', { waitUntil: 'networkidle', timeout: 30000 });

await page.click('#individual-username');
await page.type('#individual-username', user, { delay: 20 });
await page.click('#password');
await page.type('#password', pass, { delay: 20 });
await page.waitForTimeout(300);
await page.evaluate(() => {
  const btn = document.querySelector('#submit-button');
  if (btn) { btn.disabled = false; btn.click(); }
});
await page.waitForTimeout(3000);

// Security question
const pt = await page.evaluate(() => document.body.innerText);
if (pt.includes('Security Question')) {
  const answer = findAnswer(pt);
  if (answer) {
    console.log('[LOGIN] Answering security question...');
    await page.click('#securityQuestionAnswer');
    await page.type('#securityQuestionAnswer', answer, { delay: 20 });
    const cb = await page.$('#bindDevice');
    if (cb) await cb.check({ force: true }).catch(() => {});
    await page.evaluate(() => {
      const btn = document.querySelector('#submit-button');
      if (btn) { btn.disabled = false; btn.click(); }
    });
    await page.waitForTimeout(5000);
  }
}

// Wait for SPA to load
console.log('[LOGIN] Waiting for SPA...');
await page.waitForTimeout(10000);

// Get cookies
const allCookies = await context.cookies();
const cookieStr = allCookies.map(c => `${c.name}=${c.value}`).join('; ');

if (!xsrfToken) {
  const xsrfCookie = allCookies.find(c => c.name === 'XSRF-TOKEN');
  if (xsrfCookie) xsrfToken = xsrfCookie.value;
}
if (!dxtId) dxtId = crypto.randomUUID();

console.log(`[LOGIN] Done. XSRF token: ${xsrfToken ? xsrfToken.substring(0, 12) + '...' : 'NOT FOUND'}`);
console.log(`[LOGIN] dxt-id: ${dxtId.substring(0, 12)}...`);

if (!xsrfToken) {
  console.error('No XSRF token captured — cannot add to watchlist');
  await browser.close();
  process.exit(1);
}

await page.close();

// Now try adding each CUSIP to the watchlist
const BASE = 'https://services-dynarep.ddwa.finra.org';
const headers = {
  'Cookie': cookieStr,
  'Accept': 'application/json',
  'Content-Type': 'application/json',
  'x-xsrf-token': xsrfToken,
  'dxt-id': `${dxtId},${dxtId}`,
  'Referer': 'https://gateway.finra.org/',
};

// First, read current watchlist to see what's already there
console.log('\n[WATCHLIST] Reading current watchlist...');
const wlRes = await fetch(`${BASE}/reporting/v1/watchlist/`, { headers });
const wl = await wlRes.json();
const existing = (wl.returnBody?.watchlistItems || []).map(i => i.cusip || i.productSymbol);
console.log(`[WATCHLIST] Currently ${existing.length} bonds: ${existing.join(', ')}`);

// Try different add endpoints
let added = 0;
let failed = 0;

for (const cusip of CUSIPS_TO_ADD) {
  if (existing.includes(cusip)) {
    console.log(`  SKIP ${cusip} (already in watchlist)`);
    continue;
  }

  // Try POST to watchlist with the CUSIP
  const attempts = [
    // Attempt 1: POST with cusip in body
    {
      url: `${BASE}/reporting/v1/watchlist/`,
      body: { cusip, productType: 'CORP' },
    },
    // Attempt 2: POST with productSymbol
    {
      url: `${BASE}/reporting/v1/watchlist/`,
      body: { productSymbol: cusip, productType: 'CORP' },
    },
    // Attempt 3: PUT
    {
      url: `${BASE}/reporting/v1/watchlist/${cusip}`,
      method: 'PUT',
      body: { cusip, productType: 'CORP' },
    },
  ];

  let success = false;
  for (const attempt of attempts) {
    try {
      const res = await fetch(attempt.url, {
        method: attempt.method || 'POST',
        headers,
        body: JSON.stringify(attempt.body),
      });

      if (res.ok) {
        const data = await res.json().catch(() => ({}));
        console.log(`  ADD ${cusip} — ${res.status} OK`);
        success = true;
        added++;
        break;
      } else if (res.status === 409) {
        // Already exists
        console.log(`  ADD ${cusip} — already exists (409)`);
        success = true;
        break;
      } else {
        const text = await res.text().catch(() => '');
        if (attempt === attempts[attempts.length - 1]) {
          console.log(`  FAIL ${cusip} — ${res.status}: ${text.substring(0, 150)}`);
        }
      }
    } catch (e) {
      if (attempt === attempts[attempts.length - 1]) {
        console.log(`  FAIL ${cusip} — ${e.message}`);
      }
    }
  }

  if (!success) failed++;

  // Small delay between requests
  await new Promise(r => setTimeout(r, 500));
}

console.log(`\nDone: ${added} added, ${failed} failed, ${existing.length} already existed`);

// Verify final watchlist
console.log('\n[VERIFY] Reading updated watchlist...');
const wl2Res = await fetch(`${BASE}/reporting/v1/watchlist/`, { headers });
const wl2 = await wl2Res.json();
const final = wl2.returnBody?.watchlistItems || [];
console.log(`Final watchlist: ${final.length} bonds`);
for (const b of final) {
  console.log(`  ${b.cusip || b.productSymbol} | ${b.issuerName} | price: ${b.lastSalePrice} | yield: ${b.lastSaleYield}`);
}

await browser.close();
console.log('\nDone!');
