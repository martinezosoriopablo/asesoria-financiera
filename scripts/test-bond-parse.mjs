import fs from 'fs';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const buf = fs.readFileSync('C:/Users/marti/Downloads/LMAbr26.pdf');
const base64 = buf.toString('base64');
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

// Extract prompt from route.ts
const routeCode = fs.readFileSync('app/api/parse-portfolio-statement/route.ts', 'utf8');
const start = routeCode.indexOf('Analiza esta cartola');
const end = routeCode.indexOf('RESPONDE SOLO CON EL JSON, NADA MÁS.');
const promptText = routeCode.slice(start, end + 'RESPONDE SOLO CON EL JSON, NADA MÁS.'.length);

const res = await fetch('https://api.anthropic.com/v1/messages', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'x-api-key': ANTHROPIC_API_KEY,
    'anthropic-version': '2023-06-01',
  },
  body: JSON.stringify({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 16384,
    messages: [{
      role: 'user',
      content: [
        { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64 } },
        { type: 'text', text: promptText }
      ]
    }]
  })
});

const d = await res.json();
const text = d.content?.find(c => c.type === 'text')?.text;
if (!text) { console.log(JSON.stringify(d, null, 2)); process.exit(1); }

let jsonText = text.trim();
if (jsonText.startsWith('```json')) jsonText = jsonText.replace(/```json\n?/g, '').replace(/```\n?$/g, '');
else if (jsonText.startsWith('```')) jsonText = jsonText.replace(/```\n?/g, '');

const parsed = JSON.parse(jsonText);
console.log('Client:', parsed.clientName);
console.log('Period:', parsed.period);
console.log('Holdings:', parsed.holdings?.length);
console.log('Bonds:', parsed.holdings?.filter(h => h.assetType === 'bond').length);
console.log('Cash:', parsed.holdings?.filter(h => h.assetType === 'cash').length);
console.log('');

for (const h of parsed.holdings || []) {
  console.log(`[${h.assetType}] ${h.fundName}`);
  if (h.assetType === 'bond') {
    console.log(`  CUSIP: ${h.securityId} | Coupon: ${h.couponRate}% | Maturity: ${h.maturityDate} | Rating: ${h.creditRating}`);
  }
  console.log(`  Qty: ${h.quantity} | Price: ${h.marketPrice} | MktVal: ${h.marketValue} | Cost: ${h.costBasis}`);
  console.log('');
}
