import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

// FM
const PAGE = 1000;
let all = [];
for (let off = 0; ; off += PAGE) {
  const { data } = await sb.from('fund_fichas').select('fo_run, fm_serie').order('fo_run').range(off, off + PAGE - 1);
  if (!data || data.length === 0) break;
  all.push(...data);
  if (data.length < PAGE) break;
}
const seen = new Set();
const dupes = [];
for (const r of all) {
  const k = `${r.fo_run}-${r.fm_serie}`;
  if (seen.has(k)) dupes.push(k);
  seen.add(k);
}
console.log(`fund_fichas: ${all.length} rows, ${dupes.length} duplicates`, dupes.length > 0 ? dupes.slice(0, 10) : '');

// FI
let allFi = [];
for (let off = 0; ; off += PAGE) {
  const { data } = await sb.from('fi_fichas').select('fi_rut, fi_serie').order('fi_rut').range(off, off + PAGE - 1);
  if (!data || data.length === 0) break;
  allFi.push(...data);
  if (data.length < PAGE) break;
}
const seenFi = new Set();
const dupesFi = [];
for (const r of allFi) {
  const k = `${r.fi_rut}-${r.fi_serie}`;
  if (seenFi.has(k)) dupesFi.push(k);
  seenFi.add(k);
}
console.log(`fi_fichas: ${allFi.length} rows, ${dupesFi.length} duplicates`, dupesFi.length > 0 ? dupesFi.slice(0, 10) : '');
