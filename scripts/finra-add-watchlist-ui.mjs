// scripts/finra-add-watchlist-ui.mjs
// Add bonds to FINRA watchlist via UI automation (visible browser)
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

// CUSIPs to add
const CUSIPS = [
  '03938LBG8', '00206RMT6', '09261HBX4', '097023CU7', '15089QAM6',
  '172967PF2', '279158AN9', '279158AW9', 'U37818BQ0', '472140AF9',
  '71647NAZ2', '86960YAA0', '87927VAR9', '88163VAD1',
  '87264ADF9', '95000U3F8',
];

console.log('Launching VISIBLE browser for UI automation...\n');

const browser = await chromium.launch({ headless: false, slowMo: 100 });
const context = await browser.newContext();
const page = await context.newPage();

// LOGIN
console.log('[LOGIN] Navigating...');
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

const pt = await page.evaluate(() => document.body.innerText);
if (pt.includes('Security Question')) {
  const answer = findAnswer(pt);
  if (answer) {
    console.log('[LOGIN] Security question...');
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

console.log('[LOGIN] Waiting for SPA...');
await page.waitForTimeout(12000);
console.log('[LOGIN] Done. URL:', page.url());

// Navigate to bond watchlist
console.log('\n[NAV] Going to bond watchlist...');

// Try navigating to the watchlist page
await page.goto('https://gateway.finra.org/app/data/bond/watchlist', {
  waitUntil: 'networkidle',
  timeout: 15000,
}).catch(() => {});

await page.waitForTimeout(3000);

// Take screenshot to see current state
await page.screenshot({ path: '/tmp/finra-watchlist.png', fullPage: true });
console.log('[NAV] Screenshot saved to /tmp/finra-watchlist.png');

// Try to find the "Add" button or search functionality
const pageText = await page.evaluate(() => document.body.innerText);
console.log('[NAV] Page text (first 500 chars):', pageText.substring(0, 500));

// Look for any search input or add button
const searchInputs = await page.$$('input[type="text"], input[type="search"], input[placeholder*="search" i], input[placeholder*="CUSIP" i], input[placeholder*="symbol" i]');
console.log(`[NAV] Found ${searchInputs.length} search-like inputs`);

for (const input of searchInputs) {
  const attrs = await input.evaluate(el => ({
    placeholder: el.placeholder,
    id: el.id,
    name: el.name,
    'aria-label': el.getAttribute('aria-label'),
    class: el.className.substring(0, 80),
  }));
  console.log('  Input:', JSON.stringify(attrs));
}

// Look for buttons
const buttons = await page.$$('button, a[role="button"]');
for (const btn of buttons) {
  const text = await btn.evaluate(el => el.textContent?.trim());
  if (text && (text.toLowerCase().includes('add') || text.toLowerCase().includes('search') || text.toLowerCase().includes('watch'))) {
    console.log('  Button:', text.substring(0, 60));
  }
}

// If we found a search input, try adding one CUSIP as a test
if (searchInputs.length > 0) {
  const testCusip = '097023CU7'; // Boeing
  console.log(`\n[TEST] Trying to add ${testCusip} via first search input...`);

  await searchInputs[0].click();
  await searchInputs[0].fill('');
  await searchInputs[0].type(testCusip, { delay: 30 });
  await page.waitForTimeout(1000);
  await searchInputs[0].press('Enter');
  await page.waitForTimeout(3000);

  await page.screenshot({ path: '/tmp/finra-after-search.png', fullPage: true });
  console.log('[TEST] Screenshot after search saved');

  // Look for "Add to watchlist" button
  const addBtns = await page.$$('button');
  for (const btn of addBtns) {
    const text = await btn.evaluate(el => el.textContent?.trim());
    if (text && (text.includes('Add') || text.includes('Watch') || text.includes('+') || text.includes('add'))) {
      console.log(`  Found button: "${text.substring(0, 40)}" — clicking...`);
      await btn.click();
      await page.waitForTimeout(2000);
      break;
    }
  }

  await page.screenshot({ path: '/tmp/finra-after-add.png', fullPage: true });
  console.log('[TEST] Screenshot after add attempt saved');
}

// Keep browser open for manual inspection
console.log('\n=== Browser stays open for 120s — inspect and add bonds manually if needed ===');
await page.waitForTimeout(120000);

await browser.close();
console.log('Done!');
