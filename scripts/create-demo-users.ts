// Create demo users for platform presentation
// Run: npx tsx scripts/create-demo-users.ts

import { createClient } from "@supabase/supabase-js";

const DEMO_PASSWORD = "Demo2026!";

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  if (!url || !key) { console.error("Missing env vars"); process.exit(1); }

  const supabase = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false }
  });

  // 1. Create ADMIN user
  console.log("\n--- Creating ADMIN ---");
  const { data: adminAuth, error: adminErr } = await supabase.auth.admin.createUser({
    email: "admin@demo.cl",
    password: DEMO_PASSWORD,
    email_confirm: true,
  });
  if (adminErr) {
    console.error("Auth error:", adminErr.message);
  } else {
    console.log("Auth user created:", adminAuth.user.id);
    const { error } = await supabase.from("advisors").upsert({
      id: adminAuth.user.id,
      email: "admin@demo.cl",
      nombre: "Carlos",
      apellido: "Mendoza",
      company_name: "Mendoza & Asociados",
      rol: "admin",
      activo: true,
    }, { onConflict: "id" });
    if (error) console.error("Advisor insert error:", error.message);
    else console.log("Admin advisor created: Carlos Mendoza");
  }

  // 2. Create ADVISOR user (subordinate of admin)
  console.log("\n--- Creating ADVISOR ---");
  const { data: advisorAuth, error: advErr } = await supabase.auth.admin.createUser({
    email: "asesor@demo.cl",
    password: DEMO_PASSWORD,
    email_confirm: true,
  });
  if (advErr) {
    console.error("Auth error:", advErr.message);
  } else {
    console.log("Auth user created:", advisorAuth.user.id);
    const adminId = adminAuth?.user?.id;
    const { error } = await supabase.from("advisors").upsert({
      id: advisorAuth.user.id,
      email: "asesor@demo.cl",
      nombre: "María",
      apellido: "González",
      rol: "advisor",
      parent_advisor_id: adminId || null,
      activo: true,
    }, { onConflict: "id" });
    if (error) console.error("Advisor insert error:", error.message);
    else console.log("Advisor created: María González (subordinate of admin)");
  }

  // 3. Create CLIENT user (with portal access)
  console.log("\n--- Creating CLIENT ---");
  const { data: clientAuth, error: cliErr } = await supabase.auth.admin.createUser({
    email: "cliente@demo.cl",
    password: DEMO_PASSWORD,
    email_confirm: true,
  });
  if (cliErr) {
    console.error("Auth error:", cliErr.message);
  } else {
    console.log("Auth user created:", clientAuth.user.id);
    // Assign client to the advisor
    const advisorId = advisorAuth?.user?.id || adminAuth?.user?.id;
    const { error } = await supabase.from("clients").upsert({
      nombre: "Andrés",
      apellido: "Rodríguez",
      email: "cliente@demo.cl",
      rut: "12.345.678-5",
      telefono: "+56912345678",
      patrimonio_estimado: 150000000,
      ingreso_mensual: 5000000,
      perfil_riesgo: "moderado",
      status: "activo",
      asesor_id: advisorId || null,
      auth_user_id: clientAuth.user.id,
      portal_enabled: true,
      objetivo_inversion: "Crecimiento patrimonial a largo plazo",
      horizonte_temporal: "largo_plazo",
    }, { onConflict: "email" });
    if (error) console.error("Client insert error:", error.message);
    else console.log("Client created: Andrés Rodríguez (portal enabled)");
  }

  console.log("\n========================================");
  console.log("  USUARIOS DE DEMO CREADOS");
  console.log("========================================");
  console.log(`  Password para todos: ${DEMO_PASSWORD}`);
  console.log("");
  console.log("  ADMIN:   admin@demo.cl");
  console.log("    → Login: /login");
  console.log("    → Rol: Administrador (ve todo)");
  console.log("");
  console.log("  ASESOR:  asesor@demo.cl");
  console.log("    → Login: /login");
  console.log("    → Rol: Asesor (ve solo sus clientes)");
  console.log("");
  console.log("  CLIENTE: cliente@demo.cl");
  console.log("    → Login: /portal/login");
  console.log("    → Rol: Cliente (portal de cliente)");
  console.log("========================================\n");
}

main();
