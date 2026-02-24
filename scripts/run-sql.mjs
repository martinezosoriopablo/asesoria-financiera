// Script para ejecutar SQL en Supabase
import { createClient } from "@supabase/supabase-js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://zysotxkelepvotzujhxe.supabase.co";
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseServiceKey) {
  console.error("Error: SUPABASE_SERVICE_ROLE_KEY not found");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { persistSession: false }
});

async function runSQL() {
  console.log("Ejecutando SQL en Supabase...\n");

  // Ejecutar cada statement por separado
  const statements = [
    // Create portfolio_snapshots table
    `CREATE TABLE IF NOT EXISTS portfolio_snapshots (
      id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
      client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
      snapshot_date DATE NOT NULL,
      total_value DECIMAL(15, 2) NOT NULL,
      total_cost_basis DECIMAL(15, 2),
      unrealized_gain_loss DECIMAL(15, 2),
      equity_percent DECIMAL(5, 2),
      fixed_income_percent DECIMAL(5, 2),
      alternatives_percent DECIMAL(5, 2),
      cash_percent DECIMAL(5, 2),
      equity_value DECIMAL(15, 2),
      fixed_income_value DECIMAL(15, 2),
      alternatives_value DECIMAL(15, 2),
      cash_value DECIMAL(15, 2),
      holdings JSONB,
      daily_return DECIMAL(8, 4),
      cumulative_return DECIMAL(8, 4),
      source VARCHAR(50) DEFAULT 'manual',
      created_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(client_id, snapshot_date)
    )`,

    // Create portfolio_metrics table
    `CREATE TABLE IF NOT EXISTS portfolio_metrics (
      id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
      client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
      period VARCHAR(20) NOT NULL,
      total_return DECIMAL(8, 4),
      annualized_return DECIMAL(8, 4),
      volatility DECIMAL(8, 4),
      max_drawdown DECIMAL(8, 4),
      sharpe_ratio DECIMAL(8, 4),
      sortino_ratio DECIMAL(8, 4),
      benchmark_return DECIMAL(8, 4),
      alpha DECIMAL(8, 4),
      beta DECIMAL(8, 4),
      calculated_at TIMESTAMPTZ DEFAULT NOW(),
      start_date DATE,
      end_date DATE,
      UNIQUE(client_id, period)
    )`,
  ];

  // Use rpc to execute raw SQL
  for (let i = 0; i < statements.length; i++) {
    console.log(`Ejecutando statement ${i + 1}/${statements.length}...`);

    const { error } = await supabase.rpc('exec_sql', { sql: statements[i] });

    if (error) {
      // Try alternative: direct table check
      console.log(`  - RPC no disponible, verificando tabla directamente...`);
    }
  }

  // Verify tables exist by querying them
  console.log("\nVerificando tablas...");

  const { data: snapshots, error: snapshotsErr } = await supabase
    .from("portfolio_snapshots")
    .select("id")
    .limit(1);

  if (snapshotsErr && snapshotsErr.code === "42P01") {
    console.log("❌ Tabla portfolio_snapshots NO existe");
    console.log("\n⚠️  Debes ejecutar el SQL manualmente en Supabase SQL Editor:");
    console.log("   https://supabase.com/dashboard/project/zysotxkelepvotzujhxe/sql");
    console.log("\n   Copia el contenido de: scripts/create-portfolio-snapshots.sql");
  } else if (snapshotsErr) {
    console.log("❌ Error verificando portfolio_snapshots:", snapshotsErr.message);
  } else {
    console.log("✓ Tabla portfolio_snapshots existe");
  }

  const { data: metrics, error: metricsErr } = await supabase
    .from("portfolio_metrics")
    .select("id")
    .limit(1);

  if (metricsErr && metricsErr.code === "42P01") {
    console.log("❌ Tabla portfolio_metrics NO existe");
  } else if (metricsErr) {
    console.log("❌ Error verificando portfolio_metrics:", metricsErr.message);
  } else {
    console.log("✓ Tabla portfolio_metrics existe");
  }

  // Check cartera_recomendada column
  const { data: client, error: clientErr } = await supabase
    .from("clients")
    .select("cartera_recomendada")
    .limit(1);

  if (clientErr && clientErr.message.includes("cartera_recomendada")) {
    console.log("❌ Columna cartera_recomendada NO existe en clients");
  } else {
    console.log("✓ Columna cartera_recomendada existe en clients");
  }

  console.log("\n¡Verificación completada!");
}

runSQL().catch(console.error);
