// scripts/finra-public-trace.mjs
// Capture API calls from the PUBLIC finra.org trade history page (no auth needed)
import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();

const apiCalls = [];
page.on('response', async (response) => {
  const url = response.url();
  // Capture any data API calls
  if (url.includes('api') || url.includes('data') || url.includes('trade') || url.includes('dynarep') || url.includes('reporting')) {
    if (!url.includes('.js') && !url.includes('.css') && !url.includes('.png') && !url.includes('analytics') && !url.includes('google')) {
      let body = '';
      try { body = await response.text(); } catch {}
      const req = response.request();
      let postData = '';
      try { postData = req.postData() || ''; } catch {}
      apiCalls.push({
        method: req.method(),
        url,
        status: response.status(),
        postData: postData.substring(0, 500),
        body: body.substring(0, 800),
      });
    }
  }
});

console.log('Loading public FINRA trade history page...');
await page.goto('https://www.finra.org/finra-data/fixed-income/trade-history?symbol=SAN5728073&bondType=CA', {
  waitUntil: 'networkidle',
  timeout: 30000,
});

await page.waitForTimeout(5000);

console.log(`\nCaptured ${apiCalls.length} API calls:\n`);
for (const call of apiCalls) {
  console.log(`${call.method} ${call.status} ${call.url}`);
  if (call.postData) console.log(`  POST: ${call.postData}`);
  if (call.body && call.status === 200 && !call.body.startsWith('<!')) {
    console.log(`  BODY: ${call.body}`);
  }
  console.log('');
}

await browser.close();
console.log('Done!');
