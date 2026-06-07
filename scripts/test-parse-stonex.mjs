// scripts/test-parse-stonex.mjs
// Test the parse-portfolio-statement API with Abr26RS.pdf
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import fs from 'fs';

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const pdfPath = 'C:/Users/marti/Downloads/Abr26RS.pdf';
const buffer = fs.readFileSync(pdfPath);
const base64 = buffer.toString('base64');

console.log(`PDF size: ${buffer.length} bytes`);
console.log('Sending to Claude Sonnet...');

const response = await fetch('https://api.anthropic.com/v1/messages', {
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
        { type: 'text', text: `Analiza esta cartola de inversiones y extrae TODOS los holdings como JSON.
IMPORTANTE: Este documento tiene MÚLTIPLES PÁGINAS con diferentes tipos de activos:
- Cash/Money Market
- Equities (acciones y ETFs)
- Fixed Income (bonos corporativos)

Debes extraer TODOS los holdings de TODAS las secciones y páginas.

RESPONDE ÚNICAMENTE con JSON válido:
{
  "clientName": "string",
  "accountNumber": "string",
  "period": "string",
  "beginningValue": number,
  "endingValue": number,
  "cashBalance": number,
  "holdings": [
    {
      "fundName": "string",
      "securityId": "string (ticker o CUSIP)",
      "assetType": "fund | etf | stock | bond | cash",
      "quantity": number,
      "unitCost": number,
      "costBasis": number,
      "marketPrice": number,
      "marketValue": number,
      "unrealizedGainLoss": number,
      "couponRate": number | null,
      "maturityDate": "YYYY-MM-DD | null",
      "creditRating": "string | null",
      "currency": "USD"
    }
  ]
}

REGLAS:
- Extrae TODAS las posiciones: cash, acciones, ETFs y bonos
- Para acciones/ETFs: securityId = ticker (CRDO, QQQ, MU, etc.)
- Para bonos: securityId = CUSIP, incluye couponRate, maturityDate, creditRating
- Para cash: assetType = "cash"
- Todos los valores en USD
- RESPONDE SOLO CON JSON` }
      ],
    }],
  }),
});

const data = await response.json();
const text = data.content?.find(c => c.type === 'text')?.text || '';

let jsonText = text.trim();
if (jsonText.startsWith('```json')) jsonText = jsonText.replace(/```json\n?/g, '').replace(/```\n?$/g, '');
else if (jsonText.startsWith('```')) jsonText = jsonText.replace(/```\n?/g, '');

try {
  const parsed = JSON.parse(jsonText);
  console.log('\nClient:', parsed.clientName);
  console.log('Account:', parsed.accountNumber);
  console.log('Period:', parsed.period);
  console.log('Beginning:', parsed.beginningValue);
  console.log('Ending:', parsed.endingValue);
  console.log('Cash:', parsed.cashBalance);
  console.log('\nHoldings:', parsed.holdings?.length);

  for (const h of parsed.holdings || []) {
    const extra = h.assetType === 'bond' ? ` cpn=${h.couponRate}% mat=${h.maturityDate} rat=${h.creditRating}` : '';
    console.log(`  [${h.assetType}] ${h.securityId || '?'} — ${h.fundName?.substring(0, 50)} qty=${h.quantity} price=${h.marketPrice} val=${h.marketValue}${extra}`);
  }
} catch (e) {
  console.log('Parse error:', e.message);
  console.log('Raw response:', jsonText.substring(0, 2000));
}
