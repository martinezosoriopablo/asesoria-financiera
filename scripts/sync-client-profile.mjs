// Script para sincronizar perfil de riesgo de un cliente
// Uso: node scripts/sync-client-profile.mjs andres.auger11@gmail.com

import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";

config({ path: ".env.local" });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("Faltan variables de entorno SUPABASE");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

const email = process.argv[2];

if (!email) {
  console.error("Uso: node scripts/sync-client-profile.mjs <email>");
  process.exit(1);
}

async function syncClient() {
  console.log(`Buscando cliente: ${email}`);

  // Buscar cliente
  const { data: client, error: clientError } = await supabase
    .from("clients")
    .select("id, nombre, apellido, perfil_riesgo, puntaje_riesgo")
    .eq("email", email)
    .single();

  if (clientError || !client) {
    console.error("Cliente no encontrado:", clientError?.message);
    process.exit(1);
  }

  console.log(`Cliente encontrado: ${client.nombre} ${client.apellido} (ID: ${client.id})`);
  console.log(`Perfil actual: ${client.perfil_riesgo || "Sin perfil"}, Puntaje: ${client.puntaje_riesgo || "N/A"}`);

  // Buscar perfil de riesgo más reciente
  const { data: profile, error: profileError } = await supabase
    .from("risk_profiles")
    .select("*")
    .eq("client_id", client.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  if (profileError || !profile) {
    console.error("No se encontró perfil de riesgo para este cliente:", profileError?.message);
    process.exit(1);
  }

  console.log(`\nPerfil de riesgo encontrado:`);
  console.log(`  - Label: ${profile.profile_label}`);
  console.log(`  - Global: ${profile.global_score}`);
  console.log(`  - Capacidad: ${profile.capacity_score}`);
  console.log(`  - Tolerancia: ${profile.tolerance_score}`);
  console.log(`  - Percepción: ${profile.perception_score}`);
  console.log(`  - Comportamiento: ${profile.composure_score}`);

  // Actualizar cliente
  const perfilRiesgo = profile.profile_label.toLowerCase().replace(/ /g, "_");

  const { error: updateError } = await supabase
    .from("clients")
    .update({
      perfil_riesgo: perfilRiesgo,
      puntaje_riesgo: profile.global_score,
      status: "activo",
    })
    .eq("id", client.id);

  if (updateError) {
    console.error("Error actualizando cliente:", updateError.message);
    process.exit(1);
  }

  console.log(`\n✓ Cliente actualizado correctamente:`);
  console.log(`  - perfil_riesgo: ${perfilRiesgo}`);
  console.log(`  - puntaje_riesgo: ${profile.global_score}`);
  console.log(`  - status: activo`);
}

syncClient();
