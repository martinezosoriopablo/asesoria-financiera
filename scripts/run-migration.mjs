// Script para ejecutar migración de multi-asesor
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://zysotxkelepvotzujhxe.supabase.co';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp5c290eGtlbGVwdm90enVqaHhlIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NjUyNjk3NCwiZXhwIjoyMDgyMTAyOTc0fQ.Ansi89kIfptszv0I3DzmPJdqrEpi7tLbckiobvw6QRM';

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function runMigration() {
  console.log('🚀 Ejecutando migración multi-asesor...\n');

  // 1. Verificar estructura actual de advisors
  console.log('1. Verificando estructura actual...');
  const { data: advisors, error: checkError } = await supabase
    .from('advisors')
    .select('*')
    .limit(1);

  if (checkError) {
    console.error('❌ Error verificando tabla:', checkError.message);
    return;
  }

  const currentColumns = advisors?.[0] ? Object.keys(advisors[0]) : [];
  console.log('   Columnas actuales:', currentColumns.join(', '));

  // Verificar qué columnas ya existen (usando nombres correctos de la DB)
  const hasRol = currentColumns.includes('rol');
  const hasLogoUrl = currentColumns.includes('logo_url');
  const hasCompanyName = currentColumns.includes('company_name');
  const hasParentAdvisorId = currentColumns.includes('parent_advisor_id');
  const hasActivo = currentColumns.includes('activo');

  console.log('\n2. Verificación de columnas:');
  console.log('   - rol:', hasRol ? '✅' : '❌');
  console.log('   - activo:', hasActivo ? '✅' : '❌');
  console.log('   - logo_url:', hasLogoUrl ? '✅' : '❌');
  console.log('   - company_name:', hasCompanyName ? '✅' : '❌');
  console.log('   - parent_advisor_id:', hasParentAdvisorId ? '✅' : '❌');

  if (hasLogoUrl && hasCompanyName && hasParentAdvisorId) {
    console.log('\n   ✅ Todas las columnas nuevas existen!');
  } else {
    console.log('\n⚠️  NOTA: Las columnas se deben agregar manualmente en Supabase Dashboard.');
    console.log('   Ve a: https://supabase.com/dashboard/project/zysotxkelepvotzujhxe/sql/new');
    console.log('   Y ejecuta el SQL del archivo: scripts/add-multi-advisor-fields.sql\n');
  }

  // 3. Actualizar el advisor principal como admin (si la columna rol existe)
  if (hasRol && hasLogoUrl && hasCompanyName) {
    console.log('\n3. Actualizando advisor principal como admin...');
    const { data: updated, error: updateError } = await supabase
      .from('advisors')
      .update({
        rol: 'admin',
        company_name: 'Greybark',
        logo_url: '/logo-greybark.png'
      })
      .eq('email', 'pmartinez@greybark.com')
      .select();

    if (updateError) {
      console.error('❌ Error actualizando:', updateError.message);
    } else if (updated?.length) {
      console.log('   ✅ Advisor actualizado como admin:', updated[0].email);
    } else {
      console.log('   ⚠️  No se encontró el advisor pmartinez@greybark.com');
    }
  }

  // 4. Mostrar estado final
  console.log('\n4. Estado final de advisors:');
  const { data: finalAdvisors, error: finalError } = await supabase
    .from('advisors')
    .select('id, email, nombre, apellido, rol, company_name, logo_url, activo, parent_advisor_id')
    .order('created_at', { ascending: true });

  if (finalError) {
    console.error('❌ Error:', finalError.message);
  } else {
    console.table(finalAdvisors);
  }

  console.log('\n✅ Migración completada!');
}

runMigration().catch(console.error);
