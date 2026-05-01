// Seed demo data for client portal presentation
// Run: npx tsx scripts/seed-demo-data.ts

import { createClient } from "@supabase/supabase-js";

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  if (!url || !key) { console.error("Missing env vars"); process.exit(1); }

  const supabase = createClient(url, key);

  // 1. Find the demo client
  const { data: client } = await supabase
    .from("clients")
    .select("id, asesor_id")
    .eq("email", "cliente@demo.cl")
    .single();

  if (!client) { console.error("Demo client not found"); process.exit(1); }
  console.log("Client:", client.id);

  // 2. Insert risk profile
  console.log("\nCreating risk profile...");
  const { error: rpErr } = await supabase.from("risk_profiles").upsert({
    client_id: client.id,
    global_score: 58,
    profile_label: "Moderado",
    capacity_score: 65,
    tolerance_score: 52,
    perception_score: 60,
    composure_score: 55,
    answers: {
      horizonte: "5-10 años",
      experiencia: "Intermedia",
      reaccion_caida: "Mantendría mi inversión",
      objetivo: "Crecimiento patrimonial",
    },
  }, { onConflict: "client_id" });

  if (rpErr) console.error("Risk profile error:", rpErr.message);
  else console.log("Risk profile: Moderado (58/100)");

  // 3. Insert portfolio snapshot
  console.log("\nCreating portfolio snapshot...");
  const today = new Date().toISOString().split("T")[0];
  const { error: snapErr } = await supabase.from("portfolio_snapshots").upsert({
    client_id: client.id,
    snapshot_date: today,
    total_value: 152345000,
    equity_percent: 42,
    fixed_income_percent: 35,
    alternatives_percent: 13,
    cash_percent: 10,
    twr_cumulative: 8.45,
    twr_period: 1.23,
    holdings: [
      { nombre: "Fondo BICE Target USA", tipo: "Renta Variable Internacional", valor: 32500000, porcentaje: 21.3 },
      { nombre: "Fondo Security Deuda Corporativa", tipo: "Renta Fija Nacional", valor: 28100000, porcentaje: 18.4 },
      { nombre: "Fondo Itaú Top Chile", tipo: "Renta Variable Nacional", valor: 22800000, porcentaje: 15.0 },
      { nombre: "Fondo BTG Pactual Renta Local", tipo: "Renta Fija Nacional", valor: 19500000, porcentaje: 12.8 },
      { nombre: "Fondo LarrainVial Ahorro Capital", tipo: "Money Market", valor: 15200000, porcentaje: 10.0 },
      { nombre: "Fondo Banchile Inmobiliario", tipo: "Alternativo", valor: 12400000, porcentaje: 8.1 },
      { nombre: "Fondo Scotia Deuda Soberana", tipo: "Renta Fija Internacional", valor: 11000000, porcentaje: 7.2 },
      { nombre: "Fondo Toesca Infraestructura", tipo: "Alternativo", valor: 10845000, porcentaje: 7.1 },
    ],
  }, { onConflict: "client_id,snapshot_date" });

  if (snapErr) console.error("Snapshot error:", snapErr.message);
  else console.log("Snapshot: $152.345.000 CLP, Retorno +8.45%");

  // 4. Insert a welcome message from advisor
  console.log("\nCreating welcome message...");
  const { error: msgErr } = await supabase.from("messages").insert({
    client_id: client.id,
    advisor_id: client.asesor_id,
    sender_role: "advisor",
    content: "Hola Andrés, bienvenido a tu portal de inversiones. Aquí podrás revisar tu portafolio, ver tu perfil de riesgo y comunicarte conmigo directamente. Cualquier duda, escríbeme por aquí.",
    sent_at: new Date().toISOString(),
  });

  if (msgErr) console.error("Message error:", msgErr.message);
  else console.log("Welcome message created");

  console.log("\n========================================");
  console.log("  DEMO DATA READY");
  console.log("========================================");
  console.log("  Cliente: Andrés Rodríguez");
  console.log("  Perfil: Moderado (58/100)");
  console.log("  Portafolio: $152.345.000 CLP");
  console.log("  Retorno acumulado: +8.45%");
  console.log("  Posiciones: 8 fondos");
  console.log("  Mensaje de bienvenida del asesor");
  console.log("========================================\n");
}

main();
