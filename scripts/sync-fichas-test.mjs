// Test sync-fichas: scrape CMF fichas and save to Supabase
// Usage: node scripts/sync-fichas-test.mjs [agf_name] [limit]

import { createClient } from "@supabase/supabase-js";
import { extractText } from "unpdf";
import { config } from "dotenv";
config({ path: ".env.local" });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const AGF_RUT_MAP = {
  "BANCHILE": "96667040",
  "BTG PACTUAL": "96966250",
  "SCOTIA": "96634320",
  "SECURITY": "91999000",
  "SURA": "96762810",
  "PRINCIPAL": "96932590",
  "CREDICORP CAPITAL": "96489000",
  "ZURICH": "97023000",
  "TOESCA": "76196803",
  "COMPASS GROUP": "76191023",
  "EUROAMERICA": "96511750",
  "FYNSA": "96630230",
  "BCI": "96066560",
  "ITAU": "76645030",
  "SANTANDER": "97036000",
  "LARRAINVIAL": "80537000",
};

function findRutAdmin(nombreAgf) {
  const upper = nombreAgf.toUpperCase();
  for (const [key, rut] of Object.entries(AGF_RUT_MAP)) {
    if (upper.includes(key)) return rut;
  }
  return null;
}

async function discoverFromCmfPage(foRun) {
  const url = "https://www.cmfchile.cl/institucional/mercados/entidad.php?mercado=V&rut=" + foRun + "&tipoentidad=RGFMU&vig=VI&control=svs&pestania=68";
  const res = await fetch(url);
  const html = await res.text();
  const matches = [...html.matchAll(/verFolleto\('\d+','([^']+)','(\d+)'\)/g)];
  if (matches.length === 0) return null;
  const rutAdmin = matches[0][2];
  const series = [...new Set(matches.map(m => m[1]))];
  return { rutAdmin, series };
}

async function scrapeFicha(foRun, serie, rutAdmin) {
  const res = await fetch("https://www.cmfchile.cl/institucional/inc/ver_folleto_fm.php", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", "X-Requested-With": "XMLHttpRequest" },
    body: "runFondo=" + foRun + "&serie=" + encodeURIComponent(serie) + "&rutAdmin=" + rutAdmin,
  });
  const pdfPath = (await res.text()).trim();
  if (pdfPath === "ERROR" || pdfPath.includes("DOCTYPE")) return null;

  const dlRes = await fetch("https://www.cmfchile.cl" + pdfPath);
  if (!dlRes.ok) return null;
  const buffer = await dlRes.arrayBuffer();

  const result = await extractText(new Uint8Array(buffer));
  const text = result.text.join("\n");

  const tacMatch = text.match(/TAC\s+Serie\s+\(?(?:IVA\s+incluido|Exento\s+de\s+IVA)\)?\s+([\d,]+)%/i);
  const headerMatch = text.match(/FONDO\s+MUTUO\s+([^|]+)\|\s*SERIE\s+(\S+)/i);
  const rescMatch = text.match(/Fondo\s+es\s+Rescatable:\s*(SI|NO)/i);
  const plazoMatch = text.match(/Plazo\s+Rescates:\s*([^\n]+)/i);
  const horizMatch = text.match(/((?:Corto|Mediano|Largo)(?:\s+(?:o|y|a)\s+(?:corto|mediano|largo))*\s+plazo)/i);
  const tolMatch = text.match(/Nivel\s+(alto|medio|bajo|moderado)/i);
  const parseRent = (label) => {
    const re = new RegExp(label + "\\s+(-?[\\d,.]+)%", "i");
    const m = text.match(re);
    return m ? parseFloat(m[1].replace(",", ".")) : null;
  };
  const objIdx = text.indexOf("Objetivo del Fondo");
  const tolIdx = text.indexOf("Tolerancia al Riesgo");
  const objetivo = objIdx >= 0 && tolIdx > objIdx
    ? text.substring(objIdx + "Objetivo del Fondo".length, tolIdx).replace(/\n/g, " ").trim().substring(0, 500)
    : null;

  return {
    tac_serie: tacMatch ? parseFloat(tacMatch[1].replace(",", ".")) : null,
    nombre_fondo_pdf: headerMatch ? headerMatch[1].trim() : null,
    serie_detectada: headerMatch ? headerMatch[2].trim() : null,
    rent_1m: parseRent("1\\s*Mes"),
    rent_3m: parseRent("3\\s*Meses"),
    rent_6m: parseRent("6\\s*Meses"),
    rent_12m: parseRent("1\\s*Año"),
    rescatable: rescMatch ? rescMatch[1].toUpperCase() === "SI" : null,
    plazo_rescate: plazoMatch ? plazoMatch[1].trim() : null,
    horizonte_inversion: horizMatch ? horizMatch[1].trim() : null,
    tolerancia_riesgo: tolMatch ? tolMatch[0].trim() : null,
    objetivo,
  };
}

async function main() {
  const agfFilter = process.argv[2] || "BTG";
  const limit = parseInt(process.argv[3] || "10");

  console.log("\n=== Sync fichas for AGF: " + agfFilter + " (limit " + limit + ") ===\n");

  // Get fondos from DB
  const { data: fondos, error } = await supabase
    .from("vw_fondos_completo")
    .select("fo_run, fm_serie, nombre_agf")
    .ilike("nombre_agf", "%" + agfFilter + "%")
    .limit(limit);

  if (error) {
    console.error("DB error:", error.message);
    return;
  }

  console.log("Found " + fondos.length + " fondos in DB\n");

  // Deduplicate by fo_run
  const uniqueRuns = new Map();
  for (const f of fondos) {
    if (!uniqueRuns.has(f.fo_run)) uniqueRuns.set(f.fo_run, f);
  }

  console.log("Unique RUNs: " + uniqueRuns.size + "\n");

  let synced = 0;
  let errors = 0;

  for (const [foRun, fondo] of uniqueRuns) {
    process.stdout.write("RUN " + foRun + " (" + fondo.fm_serie + ") ... ");

    try {
      // Discover from CMF page
      const cmfData = await discoverFromCmfPage(foRun);
      if (!cmfData) {
        console.log("SKIP (no folleto page)");
        errors++;
        continue;
      }

      // Try each available serie until we get a PDF
      let extracted = null;
      let usedSerie = cmfData.series[0];
      for (const s of cmfData.series) {
        extracted = await scrapeFicha(foRun, s, cmfData.rutAdmin);
        if (extracted) { usedSerie = s; break; }
      }
      if (!extracted) {
        console.log("SKIP (no PDF for any serie)");
        errors++;
        continue;
      }

      // Save to DB
      const { error: upsertError } = await supabase
        .from("fund_fichas")
        .upsert({
          fo_run: foRun,
          fm_serie: usedSerie,
          ...extracted,
          updated_at: new Date().toISOString(),
        }, { onConflict: "fo_run,fm_serie" });

      if (upsertError) {
        console.log("DB ERROR: " + upsertError.message);
        errors++;
      } else {
        const tacStr = extracted.tac_serie ? extracted.tac_serie + "%" : "-";
        const rescStr = extracted.rescatable ? "SI" : extracted.rescatable === false ? "NO" : "-";
        console.log("OK  TAC:" + tacStr.padEnd(7) + " Resc:" + rescStr + " Plazo:" + (extracted.plazo_rescate || "-").substring(0, 25));
        synced++;
      }

      await new Promise(r => setTimeout(r, 500));
    } catch (e) {
      console.log("ERROR: " + e.message);
      errors++;
    }
  }

  console.log("\n=== Results: " + synced + " synced, " + errors + " errors out of " + uniqueRuns.size + " ===\n");
}

main().catch(console.error);
