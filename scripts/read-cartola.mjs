import fs from 'fs';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const pdfPath = 'C:/Users/marti/Downloads/cartola_decrypted.pdf';
const buf = fs.readFileSync(pdfPath);
const base64 = buf.toString('base64');

const res = await fetch(
  `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
  {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{
        parts: [
          { inlineData: { mimeType: 'application/pdf', data: base64 } },
          {
            text: `Extract ALL holdings from this Chilean brokerage statement (cartola).
For EACH position I need: instrument name, nemotecnico, cantidad (quantity), precio costo (cost price per unit), monto costo (total cost), precio mercado (market price per unit at Feb 28 2026), monto mercado (total market value).
Also extract the TOTALS row.
Return ONLY a JSON object like:
{"holdings": [{"instrument": "...", "nemo": "...", "qty": 123, "costPrice": 1.23, "costAmount": 456, "marketPrice": 1.45, "marketAmount": 789}], "totals": {"costTotal": 999, "marketTotal": 888}}
Keep ALL decimals exactly as they appear in the document. Return raw JSON, no markdown fences.`
          }
        ]
      }],
      generationConfig: { temperature: 0, maxOutputTokens: 16384 }
    })
  }
);

const data = await res.json();
if (!data.candidates?.[0]?.content?.parts?.[0]?.text) {
  console.log('Gemini response:', JSON.stringify(data, null, 2).slice(0, 1000));
  process.exit(1);
}

let text = data.candidates[0].content.parts[0].text;
// Strip markdown fences
text = text.replace(/^```json\s*\n?/, '').replace(/\n?```\s*$/, '');

try {
  const parsed = JSON.parse(text);
  console.log(JSON.stringify(parsed, null, 2));
} catch {
  console.log('Raw text:', text);
}
