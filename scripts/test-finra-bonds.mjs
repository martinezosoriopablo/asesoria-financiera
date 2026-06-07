// scripts/test-finra-bonds.mjs
// Open FINRA portal visible, capture watchlist add requests
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

console.log('Launching browser (VISIBLE)...');
const browser = await chromium.launch({ headless: false });
const context = await browser.newContext();
const page = await context.newPage();

// Capture ALL requests (especially POST/PUT to watchlist)
page.on('request', (request) => {
  const method = request.method();
  if (method === 'POST' || method === 'PUT' || method === 'PATCH') {
    const url = request.url();
    if (url.includes('watchlist') || url.includes('bond') || url.includes('watch')) {
      console.log(`\n[REQUEST] ${method} ${url}`);
      console.log(`  Headers: ${JSON.stringify(Object.fromEntries(Object.entries(request.headers()).filter(([k]) => !k.startsWith('sec-') && k !== 'user-agent')))}`);
      const body = request.postData();
      if (body) console.log(`  Body: ${body.substring(0, 500)}`);
    }
  }
});

page.on('response', async (response) => {
  const url = response.url();
  if (url.includes('watchlist') || (url.includes('bond') && url.includes('dynarep'))) {
    let body = '';
    try { body = (await response.text()).substring(0, 500); } catch {}
    console.log(`[RESPONSE] ${response.status()} ${url.substring(0, 120)}`);
    if (body) console.log(`  ${body.substring(0, 300)}`);
  }
});

// LOGIN
await page.goto('https://gateway.finra.org/app/data', { waitUntil: 'networkidle', timeout: 30000 });
await page.click('#individual-username');
await page.type('#individual-username', user, { delay: 20 });
await page.click('#password');
await page.type('#password', pass, { delay: 20 });
await page.waitForTimeout(300);
await page.evaluate(() => { document.querySelector('#submit-button').disabled = false; document.querySelector('#submit-button').click(); });
await page.waitForTimeout(3000);
const pt = await page.evaluate(() => document.body.innerText);
if (pt.includes('Security Question')) {
  await page.click('#securityQuestionAnswer');
  await page.type('#securityQuestionAnswer', findAnswer(pt), { delay: 20 });
  await page.$('#bindDevice').then(cb => cb?.check({ force: true }).catch(() => {}));
  await page.evaluate(() => { document.querySelector('#submit-button').disabled = false; document.querySelector('#submit-button').click(); });
  await page.waitForTimeout(5000);
}

console.log('Logged in. URL:', page.url());
console.log('\n==================================================================');
console.log('INSTRUCTIONS: Navigate to your Bond Watchlist in the portal,');
console.log('then ADD a bond (e.g. Boeing 097023CU7). I will capture the');
console.log('API request to see the exact format needed.');
console.log('==================================================================\n');

// Keep open for 5 minutes for manual interaction
await page.waitForTimeout(300000);

await browser.close();
console.log('Done!');
