import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const filePath = process.argv[2];
const monthOverride = process.argv[3]; // optional YYYY-MM

if (!filePath) {
  console.log('Usage: node scripts/upload-monthly-report.mjs <path-to-html> [YYYY-MM]');
  process.exit(1);
}

const htmlContent = readFileSync(filePath, 'utf-8');

// Auto-detect month from filename
let month = monthOverride;
if (!month) {
  const match = filePath.match(/(\d{4}-\d{2})/);
  if (match) month = match[1];
}

if (!month) {
  // Try from HTML content
  const monthNames = {
    enero: '01', febrero: '02', marzo: '03', abril: '04',
    mayo: '05', junio: '06', julio: '07', agosto: '08',
    septiembre: '09', octubre: '10', noviembre: '11', diciembre: '12'
  };
  const titleMatch = htmlContent.match(/(ENERO|FEBRERO|MARZO|ABRIL|MAYO|JUNIO|JULIO|AGOSTO|SEPTIEMBRE|OCTUBRE|NOVIEMBRE|DICIEMBRE)\s+(\d{4})/i);
  if (titleMatch) {
    const mNum = monthNames[titleMatch[1].toLowerCase()];
    if (mNum) month = `${titleMatch[2]}-${mNum}`;
  }
}

if (!month) {
  console.error('Could not detect month. Pass it as second argument: node script.mjs file.html 2026-05');
  process.exit(1);
}

// Extract title
const titleMatch = htmlContent.match(/<title[^>]*>([^<]+)<\/title>/i);
const title = titleMatch?.[1] || `Reporte Mensual ${month}`;

console.log(`Uploading report: month=${month}, title="${title}", size=${Math.round(htmlContent.length/1024)}KB`);

const { data, error } = await sb
  .from('monthly_reports')
  .upsert({
    month,
    title,
    html_content: htmlContent,
    updated_at: new Date().toISOString()
  }, { onConflict: 'month' })
  .select('id, month, title')
  .single();

if (error) {
  console.error('Error:', error.message);
  // Check if table exists
  if (error.message.includes('monthly_reports')) {
    console.log('\nTable may not exist yet. Run the migration SQL in Supabase dashboard first.');
  }
  process.exit(1);
}

console.log('Uploaded successfully:', data);
