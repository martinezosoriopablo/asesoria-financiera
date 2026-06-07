// scripts/diagnose-fichas.mjs
// Diagnose fund_fichas data quality — check serie mismatches, missing data, duplicates
// Usage: node scripts/diagnose-fichas.mjs

import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function main() {
  console.log("=== DIAGNOSTICO DE FICHAS ===\n");

  // 1. Total fichas
  const { data: allFichas, error } = await supabase
    .from("fund_fichas")
    .select("fo_run, fm_serie, serie_detectada, tac_serie, nombre_fondo_pdf, rent_1m, rent_3m, rent_6m, rent_12m, horizonte_inversion, tolerancia_riesgo, updated_at")
    .order("fo_run");

  if (error) {
    console.error("Error querying fund_fichas:", error.message);
    return;
  }

  console.log(`Total fichas en BD: ${allFichas.length}\n`);

  // 2. Serie mismatch: fm_serie != serie_detectada
  const mismatches = allFichas.filter(f => f.serie_detectada && f.fm_serie !== f.serie_detectada);
  console.log(`--- SERIE MISMATCH (fm_serie != serie_detectada del PDF) ---`);
  console.log(`Total: ${mismatches.length}`);
  if (mismatches.length > 0) {
    console.table(mismatches.slice(0, 30).map(f => ({
      fo_run: f.fo_run,
      fm_serie_bd: f.fm_serie,
      serie_pdf: f.serie_detectada,
      tac: f.tac_serie,
      nombre: f.nombre_fondo_pdf?.substring(0, 40),
    })));
  }
  console.log();

  // 3. Fichas sin TAC (extraction probably failed)
  const noTac = allFichas.filter(f => f.tac_serie == null);
  console.log(`--- FICHAS SIN TAC ---`);
  console.log(`Total: ${noTac.length} de ${allFichas.length} (${(noTac.length / allFichas.length * 100).toFixed(1)}%)`);
  if (noTac.length > 0) {
    console.table(noTac.slice(0, 20).map(f => ({
      fo_run: f.fo_run,
      fm_serie: f.fm_serie,
      nombre: f.nombre_fondo_pdf?.substring(0, 40) || "(sin nombre)",
      tiene_rent: f.rent_12m != null ? "si" : "no",
    })));
  }
  console.log();

  // 4. Fichas sin rentabilidades
  const noRent = allFichas.filter(f => f.rent_1m == null && f.rent_3m == null && f.rent_12m == null);
  console.log(`--- FICHAS SIN RENTABILIDADES ---`);
  console.log(`Total: ${noRent.length}`);
  console.log();

  // 5. Fichas sin nombre de fondo
  const noName = allFichas.filter(f => !f.nombre_fondo_pdf);
  console.log(`--- FICHAS SIN NOMBRE ---`);
  console.log(`Total: ${noName.length}`);
  console.log();

  // 6. Duplicates: same fo_run with multiple series — check if TAC differs (expected) or is same (suspicious)
  const byRun = new Map();
  for (const f of allFichas) {
    if (!byRun.has(f.fo_run)) byRun.set(f.fo_run, []);
    byRun.get(f.fo_run).push(f);
  }

  const multiSerie = [...byRun.entries()].filter(([, fichas]) => fichas.length > 1);
  console.log(`--- FONDOS CON MULTIPLES SERIES ---`);
  console.log(`Fondos con >1 serie: ${multiSerie.length}`);

  // Check for suspicious: same TAC across different series (probably same PDF scraped twice)
  const suspiciousSameTac = [];
  for (const [run, fichas] of multiSerie) {
    const tacs = fichas.filter(f => f.tac_serie != null).map(f => Number(f.tac_serie));
    const uniqueTacs = new Set(tacs);
    if (tacs.length > 1 && uniqueTacs.size === 1) {
      suspiciousSameTac.push({ fo_run: run, series: fichas.map(f => f.fm_serie).join(", "), tac: tacs[0], nombre: fichas[0].nombre_fondo_pdf?.substring(0, 40) });
    }
  }
  console.log(`\nSospechosos (mismo TAC en todas las series — posible PDF duplicado): ${suspiciousSameTac.length}`);
  if (suspiciousSameTac.length > 0) {
    console.table(suspiciousSameTac.slice(0, 20));
  }
  console.log();

  // 7. Check serie_detectada consistency — does the PDF header match what we think?
  const serieConfirmed = allFichas.filter(f => f.serie_detectada && f.fm_serie === f.serie_detectada);
  const serieUnconfirmed = allFichas.filter(f => !f.serie_detectada);
  console.log(`--- CONFIRMACION DE SERIE ---`);
  console.log(`Serie confirmada (fm_serie == PDF header): ${serieConfirmed.length}`);
  console.log(`Serie no confirmada (sin serie_detectada): ${serieUnconfirmed.length}`);
  console.log(`Serie mismatch: ${mismatches.length}`);
  console.log();

  // 8. Cross-check with cmf_valores_cuota — fichas for runs that don't exist in cmf
  const fichaRuns = [...new Set(allFichas.map(f => f.fo_run))];
  const { data: cmfFondos } = await supabase
    .from("cmf_valores_cuota")
    .select("fo_run, fm_serie")
    .in("fo_run", fichaRuns.slice(0, 500));

  const cmfRunSeries = new Set((cmfFondos || []).map(f => `${f.fo_run}-${f.fm_serie}`));
  const fichaNotInCmf = allFichas.filter(f => !cmfRunSeries.has(`${f.fo_run}-${f.fm_serie}`));
  console.log(`--- FICHAS SIN MATCH EN CMF_VALORES_CUOTA (run+serie) ---`);
  console.log(`Total: ${fichaNotInCmf.length}`);
  if (fichaNotInCmf.length > 0) {
    // Show which CMF series exist for these runs
    const orphanRuns = [...new Set(fichaNotInCmf.map(f => f.fo_run))];
    const cmfForOrphans = (cmfFondos || []).filter(f => orphanRuns.includes(f.fo_run));
    const cmfSeriesByRun = new Map();
    for (const f of cmfForOrphans) {
      if (!cmfSeriesByRun.has(f.fo_run)) cmfSeriesByRun.set(f.fo_run, []);
      cmfSeriesByRun.get(f.fo_run).push(f.fm_serie);
    }
    console.table(fichaNotInCmf.slice(0, 20).map(f => ({
      fo_run: f.fo_run,
      ficha_serie: f.fm_serie,
      serie_pdf: f.serie_detectada,
      cmf_series: (cmfSeriesByRun.get(f.fo_run) || []).join(", ") || "(no existe en CMF)",
      nombre: f.nombre_fondo_pdf?.substring(0, 40),
    })));
  }
  console.log();

  // 9. Summary
  console.log("=== RESUMEN ===");
  console.log(`Total fichas: ${allFichas.length}`);
  console.log(`Fondos unicos: ${byRun.size}`);
  console.log(`Con TAC: ${allFichas.length - noTac.length} (${((allFichas.length - noTac.length) / allFichas.length * 100).toFixed(0)}%)`);
  console.log(`Con rentabilidades: ${allFichas.length - noRent.length} (${((allFichas.length - noRent.length) / allFichas.length * 100).toFixed(0)}%)`);
  console.log(`Serie confirmada por PDF: ${serieConfirmed.length}`);
  console.log(`Serie mismatch: ${mismatches.length}`);
  console.log(`Sin match en CMF (run+serie): ${fichaNotInCmf.length}`);
  console.log(`Sospechosos (mismo TAC multi-serie): ${suspiciousSameTac.length}`);
}

main().catch(console.error);
