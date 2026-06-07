import { config } from 'dotenv';
config({ path: '.env.local' });

// Test Yahoo Finance fallback for CFI funds
import yahooFinance from 'yahoo-finance2';

const nemos = ['CFIBAIN11A.SN', 'CFIBICE01A.SN', 'CFIBAIN11.SN'];

for (const nemo of nemos) {
  console.log(`\n=== Yahoo quote: ${nemo} ===`);
  try {
    const quote = await yahooFinance.quote(nemo);
    if (quote) {
      console.log('Price:', quote.regularMarketPrice);
      console.log('Currency:', quote.currency);
      console.log('Name:', quote.shortName || quote.longName);
      console.log('Date:', quote.regularMarketTime);
    } else {
      console.log('No quote returned');
    }
  } catch (e) {
    console.log('Error:', e.message?.substring(0, 100));
  }
}

// Also try historical
console.log('\n=== Yahoo historical: CFIBAIN11A.SN (last 30 days) ===');
try {
  const to = new Date();
  const from = new Date(Date.now() - 30*24*60*60*1000);
  const result = await yahooFinance.chart('CFIBAIN11A.SN', {
    period1: from,
    period2: to,
    interval: '1d',
  });
  if (result?.quotes?.length) {
    console.log('Got', result.quotes.length, 'data points');
    console.log('First:', result.quotes[0].date, result.quotes[0].close);
    console.log('Last:', result.quotes[result.quotes.length - 1].date, result.quotes[result.quotes.length - 1].close);
  } else {
    console.log('No data');
  }
} catch (e) {
  console.log('Error:', e.message?.substring(0, 200));
}
