import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
config({ path: '.env.local' });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

// Test exact match
const pairs = [
  [8118, 'B'],
  [8881, 'B'],
  [8986, 'B'],
  [8253, 'C'],
  [8336, 'B'],
  [8987, 'B'],
  [9607, 'B'],
];

for (const [run, serie] of pairs) {
  const { data, error } = await supabase
    .from('fondos_mutuos')
    .select('id, fo_run, fm_serie, nombre_fondo')
    .eq('fo_run', run)
    .eq('fm_serie', serie)
    .single();
  
  console.log(`${run}-${serie}:`, data ? `FOUND: ${data.nombre_fondo} (${data.fm_serie})` : `NOT FOUND`, error?.message || '');
}

// Check what's the actual type of fo_run
const { data: sample } = await supabase
  .from('fondos_mutuos')
  .select('fo_run, fm_serie')
  .limit(1);
console.log('\nSample fo_run type:', typeof sample?.[0]?.fo_run, 'value:', sample?.[0]?.fo_run);
