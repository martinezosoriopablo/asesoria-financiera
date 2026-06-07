// scripts/sample-fichas.mjs
// Random sample of 50 fichas for manual review
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

const s = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function main() {
  const { data: all } = await s.from("fund_fichas")
    .select("fo_run, fm_serie, serie_detectada, tac_serie, nombre_fondo_pdf, rent_1m, rent_3m, rent_6m, rent_12m, horizonte_inversion, tolerancia_riesgo, objetivo, rescatable, plazo_rescate, beneficio_107lir, beneficio_108lir, beneficio_apv, beneficio_57bis");

  // Random 50
  const sample = all.sort(() => Math.random() - 0.5).slice(0, 50);
  const runs = [...new Set(sample.map(f => f.fo_run))];

  const { data: vw } = await s.from("vw_fondos_completo")
    .select("fo_run, fm_serie, nombre_fondo, nombre_agf, familia_estudios, tac_sintetica, rent_12m_nominal")
    .in("fo_run", runs);

  const vwMap = new Map();
  for (const v of (vw || [])) vwMap.set(v.fo_run + "-" + v.fm_serie, v);

  const rows = sample.map((f, i) => {
    const v = vwMap.get(f.fo_run + "-" + f.fm_serie);
    return {
      "#": i + 1,
      RUN: f.fo_run,
      "Serie BD": f.fm_serie,
      "Serie PDF": f.serie_detectada || "-",
      "Nombre Ficha": (f.nombre_fondo_pdf || "").substring(0, 30) || "(vacio)",
      "Nombre VW": (v ? v.nombre_fondo : "").substring(0, 30) || "(no match)",
      AGF: v ? v.nombre_agf : "-",
      Familia: v ? v.familia_estudios : "-",
      "TAC Ficha": f.tac_serie != null ? Number(f.tac_serie).toFixed(2) : "NULL",
      "TAC VW": v && v.tac_sintetica != null ? Number(v.tac_sintetica).toFixed(2) : "NULL",
      "R1M": f.rent_1m != null ? Number(f.rent_1m).toFixed(1) : "-",
      "R3M": f.rent_3m != null ? Number(f.rent_3m).toFixed(1) : "-",
      "R12M": f.rent_12m != null ? Number(f.rent_12m).toFixed(1) : "-",
      "R12M VW": v && v.rent_12m_nominal != null ? Number(v.rent_12m_nominal).toFixed(1) : "-",
      Horizonte: f.horizonte_inversion || "-",
      Tolerancia: f.tolerancia_riesgo || "-",
      Rescatable: f.rescatable != null ? (f.rescatable ? "SI" : "NO") : "-",
    };
  });

  console.table(rows);

  // Summary
  const withTac = sample.filter(f => f.tac_serie != null).length;
  const withRent = sample.filter(f => f.rent_12m != null).length;
  const withName = sample.filter(f => f.nombre_fondo_pdf).length;
  const withHorizonte = sample.filter(f => f.horizonte_inversion).length;
  const inVw = sample.filter(f => vwMap.has(f.fo_run + "-" + f.fm_serie)).length;

  console.log("\n=== RESUMEN MUESTRA ===");
  console.log(`Con TAC: ${withTac}/50`);
  console.log(`Con Rent 12M: ${withRent}/50`);
  console.log(`Con nombre PDF: ${withName}/50`);
  console.log(`Con horizonte: ${withHorizonte}/50`);
  console.log(`Match en vw_fondos: ${inVw}/50`);
}

main().catch(console.error);
