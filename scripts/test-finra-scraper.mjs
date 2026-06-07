// scripts/test-finra-scraper.mjs
// Quick test of the FINRA watchlist scraper
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const { scrapeBondPrices } = await import('../lib/finra/scraper.ts');

console.log('Starting FINRA scraper...');
const result = await scrapeBondPrices();
console.log('Success:', result.success);
console.log('Bonds:', result.bonds.length);
console.log('Login time:', result.loginTimeMs, 'ms');
console.log('Query time:', result.queryTimeMs, 'ms');
if (result.error) console.log('Error:', result.error);
for (const b of result.bonds) {
  console.log(`  ${b.cusip} | ${b.issuerName} | price: ${b.lastSalePrice} | yield: ${b.lastSaleYield} | date: ${b.lastTradeDate}`);
}
