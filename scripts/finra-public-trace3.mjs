// scripts/finra-public-trace3.mjs
import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: false });
const context = await browser.newContext({
  userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
});
const page = await context.newPage();

page.on('response', async (response) => {
  const url = response.url();
  if (url.includes('.js') || url.includes('.css') || url.includes('.png') || url.includes('.svg') || url.includes('.woff') || url.includes('analytics') || url.includes('google') || url.includes('facebook') || url.includes('cookie') || url.includes('consent') || url.includes('fonts')) return;

  let body = '';
  try { body = await response.text(); } catch {}

  if (response.status() === 200 && (body.startsWith('[') || body.startsWith('{'))) {
    const req = response.request();
    let postData = '';
    try { postData = req.postData() || ''; } catch {}
    console.log(`\n[API] ${req.method()} ${url.substring(0, 150)}`);
    if (postData) console.log(`  POST: ${postData.substring(0, 500)}`);
    console.log(`  BODY: ${body.substring(0, 1000)}`);
  }
});

console.log('Loading (domcontentloaded)...');
await page.goto('https://www.finra.org/finra-data/fixed-income/trade-history?symbol=SAN5728073&bondType=CA', {
  waitUntil: 'domcontentloaded',
  timeout: 60000,
});

console.log('Page loaded, waiting 15s for API calls...');
await page.waitForTimeout(15000);

// Check page content
const text = await page.evaluate(() => document.body.innerText);
const lines = text.split('\n').filter(l => l.trim());
console.log('\nPage text (first 40 lines):');
for (const l of lines.slice(0, 40)) console.log('  ' + l.trim().substring(0, 120));

await page.waitForTimeout(20000);
await browser.close();
