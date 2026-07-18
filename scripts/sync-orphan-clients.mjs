// Script para asignar clientes huérfanos al admin principal
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const adminEmail = process.env.ADMIN_EMAIL;

if (!supabaseUrl || !supabaseServiceKey || !adminEmail) {
  console.error('❌ Faltan variables de entorno: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, ADMIN_EMAIL');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { autoRefreshToken: false, persistSession: false }
});

async function syncOrphanClients() {
  console.log('🔍 Buscando clientes sin asesor asignado...\n');

  // Buscar clientes huérfanos que tienen perfil de riesgo
  const { data: orphans, error } = await supabase
    .from('clients')
    .select('id, email, nombre, apellido, perfil_riesgo, puntaje_riesgo, asesor_id')
    .is('asesor_id', null);

  if (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }

  console.log(`📋 Encontrados ${orphans.length} clientes sin asesor:\n`);

  orphans.forEach((c, i) => {
    const name = `${c.nombre} ${c.apellido}`.trim() || c.email;
    const profile = c.perfil_riesgo ? `✅ ${c.perfil_riesgo} (${c.puntaje_riesgo})` : '❌ Sin perfil';
    console.log(`${i + 1}. ${name} - ${c.email} - ${profile}`);
  });

  // Buscar el admin principal
  const { data: admin } = await supabase
    .from('advisors')
    .select('id, email, nombre')
    .eq('email', adminEmail)
    .single();

  if (!admin) {
    console.log(`\n⚠️ No se encontró a ${adminEmail}`);

    // Listar asesores disponibles
    const { data: advisors } = await supabase
      .from('advisors')
      .select('id, email, nombre, apellido, rol')
      .eq('activo', true);

    console.log('\nAsesores disponibles:');
    advisors?.forEach(a => {
      console.log(`  - ${a.email} (${a.nombre} ${a.apellido}) [${a.rol}]`);
    });
    return;
  }

  console.log(`\n👤 Asignando a: ${admin.nombre} (${admin.email})\n`);

  // Asignar todos los huérfanos al admin
  if (orphans.length > 0) {
    const { error: updateError } = await supabase
      .from('clients')
      .update({ asesor_id: admin.id })
      .is('asesor_id', null);

    if (updateError) {
      console.error('❌ Error actualizando:', updateError.message);
    } else {
      console.log(`✅ ${orphans.length} clientes asignados a ${admin.nombre}`);
    }
  } else {
    console.log('✅ No hay clientes huérfanos');
  }
}

syncOrphanClients();
