// scripts/finra-public-trace4.mjs
// Login to gateway.finra.org, then navigate to bond trade history via the SPA
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

const browser = await chromium.launch({ headless: false });
const context = await browser.newContext();
const page = await context.newPage();

// Capture ALL interesting API calls
page.on('response', async (response) => {
  const url = response.url();
  if (url.includes('.js') || url.includes('.css') || url.includes('.png') || url.includes('.svg') || url.includes('.woff') || url.includes('fonts') || url.includes('analytics')) return;

  let body = '';
  try { body = await response.text(); } catch {}

  if (body && (body.startsWith('[') || body.startsWith('{')) && body.length > 50) {
    const req = response.request();
    let postData = '';
    try { postData = req.postData() || ''; } catch {}
    console.log(`\n[API] ${req.method()} ${response.status()} ${url.substring(0, 150)}`);
    if (postData) console.log(`  POST: ${postData.substring(0, 500)}`);
    console.log(`  RESP: ${body.substring(0, 600)}`);
  }
});

// LOGIN
console.log('[LOGIN]...');
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
await page.waitForTimeout(12000);
console.log('[LOGIN] Done:', page.url());

// Now navigate to Fixed Income data section
// Look for any "Fixed Income" or "Corporate Bonds" link in the SPA
console.log('\n[NAV] Looking for Fixed Income link...');
const links = await page.$$('a, button');
for (const link of links) {
  const text = await link.evaluate(el => el.textContent?.trim());
  if (text && (text.includes('Fixed Income') || text.includes('Bond') || text.includes('Corporate') || text.includes('Trade') || text.includes('TRACE'))) {
    console.log(`  Found: "${text.substring(0, 60)}"`);
  }
}

// Try clicking "Fixed Income Data" link
const fiLink = await page.$('a:has-text("Fixed Income")');
if (fiLink) {
  console.log('\nClicking Fixed Income Data...');
  await fiLink.click();
  await page.waitForTimeout(5000);
}

// Look for what's in the navigation/sidebar
const navText = await page.evaluate(() => {
  const nav = document.querySelector('nav') || document.querySelector('[role="navigation"]');
  return nav?.innerText || '';
});
console.log('\nNav:', navText.substring(0, 500));

// Look for "Corporate and Agency" or "Trade Activity" dataset links
const dataLinks = await page.$$('a, button, [role="link"], [role="button"]');
for (const dl of dataLinks) {
  const text = await dl.evaluate(el => el.textContent?.trim());
  if (text && (text.includes('Corporate') || text.includes('Trade Activity') || text.includes('Bond'))) {
    console.log(`  Dataset: "${text.substring(0, 80)}"`);
  }
}

// Try clicking "Corporate and Agency Trade Activity"
const tradeLink = await page.$(':text("Corporate and Agency Trade Activity"), :text("Trade Activity")');
if (tradeLink) {
  console.log('\nClicking Trade Activity...');
  await tradeLink.click();
  await page.waitForTimeout(8000);

  // Now search for a CUSIP
  const searchInput = await page.$('input[type="text"], input[type="search"]');
  if (searchInput) {
    console.log('Found search input, typing CUSIP...');
    await searchInput.fill('097023CU7');
    await searchInput.press('Enter');
    await page.waitForTimeout(5000);
  }
}

console.log('\n=== Browser open for 60s — navigate manually to see what API is used ===');
await page.waitForTimeout(60000);

await browser.close();
