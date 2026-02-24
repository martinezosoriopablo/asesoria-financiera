import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function check() {
  const { data } = await supabase.from('advisors').select('id, email, nombre, rol, parent_advisor_id');
  console.log('Asesores:\n');
  data.forEach(a => {
    console.log(`  ${a.nombre} (${a.email})`);
    console.log(`    - rol: ${a.rol}`);
    console.log(`    - parent_advisor_id: ${a.parent_advisor_id || 'null'}`);
    console.log('');
  });
}
check();
