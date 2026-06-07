// scripts/finra-public-trace2.mjs
import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: false });
const context = await browser.newContext({
  userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
});
const page = await context.newPage();

const apiCalls = [];
page.on('response', async (response) => {
  const url = response.url();
  if (url.includes('.js') || url.includes('.css') || url.includes('.png') || url.includes('.svg') || url.includes('.woff') || url.includes('analytics') || url.includes('google') || url.includes('facebook') || url.includes('cookie') || url.includes('consent')) return;

  let body = '';
  try { body = await response.text(); } catch {}

  // Only log interesting responses (JSON data, not HTML pages)
  if (response.status() === 200 && (body.startsWith('[') || body.startsWith('{'))) {
    const req = response.request();
    let postData = '';
    try { postData = req.postData() || ''; } catch {}
    console.log(`\n[API] ${req.method()} ${response.status()} ${url}`);
    if (postData) console.log(`  POST: ${postData.substring(0, 500)}`);
    console.log(`  BODY: ${body.substring(0, 1000)}`);
    apiCalls.push({ url, body: body.substring(0, 2000) });
  }
});

console.log('Loading...');
await page.goto('https://www.finra.org/finra-data/fixed-income/trade-history?symbol=SAN5728073&bondType=CA', {
  waitUntil: 'networkidle',
  timeout: 30000,
});

console.log('Page loaded, waiting for data...');
await page.waitForTimeout(10000);

console.log(`\nTotal data API calls: ${apiCalls.length}`);

// Also check page text for any trade data
const text = await page.evaluate(() => document.body.innerText);
if (text.includes('Price') || text.includes('Trade') || text.includes('Date')) {
  console.log('\nPage text with trade data:');
  const lines = text.split('\n').filter(l => l.trim().length > 0);
  for (const line of lines.slice(0, 50)) {
    console.log('  ' + line.trim().substring(0, 120));
  }
}

await page.waitForTimeout(30000);
await browser.close();
