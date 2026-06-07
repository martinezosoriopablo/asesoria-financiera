// scripts/finra-historical4.mjs
// Navigate to bond detail page in FINRA portal and intercept API calls
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
const browser = await chromium.launch({ headless: false }); // VISIBLE to debug
const context = await browser.newContext();
const page = await context.newPage();

// Capture ALL API responses
const apiCalls = [];
page.on('response', async (response) => {
  const url = response.url();
  if (url.includes('dynarep') || url.includes('reporting') || url.includes('bond') || url.includes('trade')) {
    let body = '';
    try { body = await response.text(); } catch {}
    apiCalls.push({ url: url.substring(0, 150), status: response.status(), body: body.substring(0, 500) });
    console.log(`[API] ${response.status()} ${url.substring(0, 120)}`);
    if (body.length > 0 && response.status() === 200) {
      console.log(`  Body: ${body.substring(0, 300)}`);
    }
  }
});

// LOGIN
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
console.log('[LOGIN] Waiting for SPA...');
await page.waitForTimeout(12000);
console.log('[LOGIN] Done:', page.url());

// Navigate to a bond detail page — Boeing 097023CU7
const cusip = '097023CU7';
console.log(`\n[NAV] Opening bond detail for ${cusip}...`);

// Try different URL patterns for bond detail
const bondUrls = [
  `https://gateway.finra.org/app/data/bond/${cusip}`,
  `https://gateway.finra.org/app/data/fixed-income/bond/${cusip}`,
  `https://gateway.finra.org/app/data/fixed-income/${cusip}`,
];

for (const url of bondUrls) {
  console.log(`Trying: ${url}`);
  await page.goto(url, { waitUntil: 'networkidle', timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(5000);

  const bodyText = await page.evaluate(() => document.body.innerText);
  if (bodyText.includes('Boeing') || bodyText.includes('097023') || bodyText.includes('Trade')) {
    console.log('Found bond page!');
    console.log('Text preview:', bodyText.substring(0, 500));
    break;
  }
}

// Wait to see what loads and what API calls are made
console.log('\nWaiting 10s for more API calls...');
await page.waitForTimeout(10000);

console.log(`\n=== Total API calls captured: ${apiCalls.length} ===`);
for (const call of apiCalls) {
  console.log(`\n${call.status} ${call.url}`);
  if (call.body) console.log(`  ${call.body.substring(0, 400)}`);
}

// Keep open for inspection
console.log('\n=== Browser open for 60s ===');
await page.waitForTimeout(60000);

await browser.close();
