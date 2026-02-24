// Script para ver todos los clientes con perfil de riesgo y su asesor asignado
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Faltan variables de entorno');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { autoRefreshToken: false, persistSession: false }
});

async function checkClients() {
  console.log('🔍 Clientes con perfil de riesgo:\n');

  // Get all advisors for reference
  const { data: advisors } = await supabase
    .from('advisors')
    .select('id, email, nombre, apellido');

  const advisorMap = new Map(advisors?.map(a => [a.id, `${a.nombre} ${a.apellido} (${a.email})`]) || []);

  // Get clients with risk profile
  const { data: clients, error } = await supabase
    .from('clients')
    .select('id, email, nombre, apellido, perfil_riesgo, puntaje_riesgo, asesor_id, created_at')
    .not('puntaje_riesgo', 'is', null)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }

  console.log(`Encontrados ${clients.length} clientes con perfil:\n`);

  clients.forEach((c, i) => {
    const name = `${c.nombre} ${c.apellido}`.trim() || c.email;
    const advisor = c.asesor_id ? advisorMap.get(c.asesor_id) || 'Asesor desconocido' : '❌ SIN ASESOR';
    console.log(`${i + 1}. ${name}`);
    console.log(`   Email: ${c.email}`);
    console.log(`   Perfil: ${c.perfil_riesgo} (${c.puntaje_riesgo}/100)`);
    console.log(`   Asesor: ${advisor}`);
    console.log('');
  });

  // Summary
  console.log('--- RESUMEN ---');
  const withAdvisor = clients.filter(c => c.asesor_id).length;
  const withoutAdvisor = clients.filter(c => !c.asesor_id).length;
  console.log(`Con asesor: ${withAdvisor}`);
  console.log(`Sin asesor: ${withoutAdvisor}`);
}

checkClients();
