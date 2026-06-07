#!/usr/bin/env node
// Re-sync ALL fichas from CMF for every fund+serie in vw_fondos_completo
// Uses DB series directly (no CMF page scraping needed) — just fetches PDFs
// Usage: node scripts/resync-all-fichas.mjs [--force] [--agf "BANCHILE"]

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://zysotxkelepvotzujhxe.supabase.co";
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp5c290eGtlbGVwdm90enVqaHhlIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NjUyNjk3NCwiZXhwIjoyMDgyMTAyOTc0fQ.Ansi89kIfptszv0I3DzmPJdqrEpi7tLbckiobvw6QRM";

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const AGF_RUT_MAP = {
  "BANCHILE": "96667040",
  "BTG PACTUAL": "96966250",
  "SCOTIA": "96634320",
  "SECURITY": "91999000",
  "SURA": "96762810",
  "PRINCIPAL": "96932590",
  "CREDICORP CAPITAL": "96489000",
  "CREDICORP": "96489000",
  "ZURICH": "97023000",
  "TOESCA": "76196803",
  "COMPASS GROUP": "76191023",
  "COMPASS": "76191023",
  "EUROAMERICA": "96511750",
  "FYNSA": "96630230",
  "BCI": "96066560",
  "ITAU": "76645030",
  "SANTANDER": "97036000",
  "LARRAINVIAL": "80537000",
  "LARRAIN VIAL": "80537000",
  "FINTUAL": "76862780",
  "BICE": "97004000",
  "PRUDENTIAL": "76464483",
  "MBI": "96516310",
  "AMERIS": "76230987",
};

const args = process.argv.slice(2);
const forceMode = args.includes("--force");
const agfFilter = args.find((a, i) => args[i - 1] === "--agf");

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
};

// --- PDF extraction (uses unpdf) ---
async function extractFromPdf(buffer) {
  const { extractText } = await import("unpdf");
  const result = await extractText(new Uint8Array(buffer));
  const text = result.text.join("\n");

  let tac_serie = null;
  const tacMatch = text.match(/TAC\s+Serie\s+\(?(?:IVA\s+incluido|Exento\s+de\s+IVA)\)?\s+([\d,]+)%/i);
  if (tacMatch) tac_serie = parseFloat(tacMatch[1].replace(",", "."));

  const parseRent = (label) => {
    const re = new RegExp(label + "\\s+(-?[\\d,.]+)%", "i");
    const m = text.match(re);
    if (m) return parseFloat(m[1].replace(",", "."));
    return null;
  };

  let nombre_fondo_pdf = null, serie_detectada = null;
  const headerMatch = text.match(/FONDO\s+MUTUO\s+([^|]+)\|\s*SERIE\s+(\S+)/i);
  if (headerMatch) {
    nombre_fondo_pdf = headerMatch[1].trim();
    serie_detectada = headerMatch[2].trim();
  }

  const rescatableMatch = text.match(/Fondo\s+es\s+Rescatable:\s*(SI|NO)/i);
  const rescatable = rescatableMatch ? rescatableMatch[1].toUpperCase() === "SI" : null;

  const plazoMatch = text.match(/Plazo\s+Rescates:\s*([^\n]+)/i);
  const plazo_rescate = plazoMatch ? plazoMatch[1].trim() : null;

  const horizonteMatch = text.match(/((?:Corto|Mediano|Largo)(?:\s+(?:o|y|a)\s+(?:corto|mediano|largo))*\s+plazo)/i);
  const horizonte_inversion = horizonteMatch ? horizonteMatch[1].trim() : null;

  const toleranciaMatch = text.match(/Nivel\s+(alto|medio|bajo|moderado)/i);
  const tolerancia_riesgo = toleranciaMatch ? toleranciaMatch[0].trim() : null;

  const objIdx = text.indexOf("Objetivo del Fondo");
  const tolIdx = text.indexOf("Tolerancia al Riesgo");
  const objetivo = objIdx >= 0 && tolIdx > objIdx
    ? text.substring(objIdx + "Objetivo del Fondo".length, tolIdx).replace(/\n/g, " ").trim().substring(0, 500)
    : null;

  return {
    tac_serie, nombre_fondo_pdf, serie_detectada,
    rent_1m: parseRent("1\\s*Mes"),
    rent_3m: parseRent("3\\s*Meses"),
    rent_6m: parseRent("6\\s*Meses"),
    rent_12m: parseRent("1\\s*Año"),
    rescatable, plazo_rescate, horizonte_inversion, tolerancia_riesgo, objetivo,
  };
}

// --- CMF direct PDF access (no page scraping needed) ---
async function getPdfUrl(foRun, serie, rutAdmin) {
  const res = await fetch("https://www.cmfchile.cl/institucional/inc/ver_folleto_fm.php", {
    method: "POST",
    headers: { ...HEADERS, "Content-Type": "application/x-www-form-urlencoded", "X-Requested-With": "XMLHttpRequest" },
    body: `runFondo=${foRun}&serie=${encodeURIComponent(serie)}&rutAdmin=${rutAdmin}`,
  });
  const text = await res.text();
  if (text === "ERROR" || text.includes("DOCTYPE")) return null;
  return text.trim();
}

async function downloadPdf(pdfPath) {
  const url = `https://www.cmfchile.cl${pdfPath}`;
  const res = await fetch(url, { headers: HEADERS });
  if (!res.ok) return null;
  return res.arrayBuffer();
}

function findRutAdmin(nombreAgf) {
  const upper = nombreAgf.toUpperCase();
  for (const [key, rut] of Object.entries(AGF_RUT_MAP)) {
    if (upper.includes(key)) return rut;
  }
  return null;
}

// --- Main ---
async function main() {
  console.log("=== RESYNC FICHAS (Direct PDF mode) ===");
  console.log(`Mode: ${forceMode ? "FORCE (re-download all)" : "INCREMENTAL (skip existing)"}`);
  if (agfFilter) console.log(`Filter: AGF = ${agfFilter}`);
  console.log("");

  // Get ALL fund+serie combos from vw_fondos_completo
  let allFondos = [];
  let offset = 0;
  const pageSize = 1000;
  while (true) {
    let q = supabase
      .from("vw_fondos_completo")
      .select("fo_run, fm_serie, nombre_agf")
      .order("nombre_agf")
      .range(offset, offset + pageSize - 1);
    if (agfFilter) q = q.ilike("nombre_agf", `%${agfFilter}%`);
    const { data, error } = await q;
    if (error) { console.error("Error:", error.message); return; }
    if (!data || data.length === 0) break;
    allFondos = allFondos.concat(data);
    if (data.length < pageSize) break;
    offset += pageSize;
  }

  console.log(`Total fund+serie combos in DB: ${allFondos.length}`);

  // Get existing fichas to skip
  let existingFichas = [];
  if (!forceMode) {
    let fichaOffset = 0;
    while (true) {
      const { data } = await supabase
        .from("fund_fichas")
        .select("fo_run, fm_serie")
        .range(fichaOffset, fichaOffset + pageSize - 1);
      if (!data || data.length === 0) break;
      existingFichas = existingFichas.concat(data);
      if (data.length < pageSize) break;
      fichaOffset += pageSize;
    }
  }
  const alreadySynced = new Set(existingFichas.map(f => `${f.fo_run}-${f.fm_serie}`));
  console.log(`Already synced: ${alreadySynced.size}`);

  // Filter to only what needs syncing
  const toSync = forceMode
    ? allFondos
    : allFondos.filter(f => !alreadySynced.has(`${f.fo_run}-${f.fm_serie}`));

  // Filter to only AGFs with known RUT
  const syncable = toSync.filter(f => findRutAdmin(f.nombre_agf));
  const noRut = toSync.filter(f => !findRutAdmin(f.nombre_agf));

  if (noRut.length > 0) {
    const unknownAgfs = [...new Set(noRut.map(f => f.nombre_agf))];
    console.log(`\nAGFs sin RUT conocido (${unknownAgfs.length}):`);
    unknownAgfs.forEach(a => console.log(`  - ${a}`));
  }

  console.log(`\nTo sync: ${syncable.length} fund+serie combos`);
  console.log(`Skipped (no RUT): ${noRut.length}`);
  console.log("---\n");

  let synced = 0, errors = 0, noPdf = 0;
  let consecutiveErrors = 0;

  for (let i = 0; i < syncable.length; i++) {
    const f = syncable[i];
    const rutAdmin = findRutAdmin(f.nombre_agf);
    const key = `${f.fo_run}-${f.fm_serie}`;

    // Progress
    if (i % 10 === 0 || i === syncable.length - 1) {
      process.stdout.write(`\r[${i + 1}/${syncable.length}] Synced: ${synced} | NoPDF: ${noPdf} | Errors: ${errors}  `);
    }

    try {
      // Rate limit: 2s between requests
      await sleep(2000);

      const pdfUrl = await getPdfUrl(f.fo_run, f.fm_serie, rutAdmin);
      if (!pdfUrl) {
        noPdf++;
        consecutiveErrors = 0;
        continue;
      }

      await sleep(1000);
      const pdfBuffer = await downloadPdf(pdfUrl);
      if (!pdfBuffer) { errors++; consecutiveErrors++; }
      else {
        const extracted = await extractFromPdf(pdfBuffer);
        const { error: upsertError } = await supabase.from("fund_fichas").upsert({
          fo_run: f.fo_run, fm_serie: f.fm_serie, ...extracted,
          updated_at: new Date().toISOString(),
        }, { onConflict: "fo_run,fm_serie" });
        if (upsertError) { errors++; console.log(`\n  DB error ${key}: ${upsertError.message}`); }
        else { synced++; consecutiveErrors = 0; }
      }

      // If too many consecutive errors, CMF might be blocking us
      if (consecutiveErrors >= 5) {
        console.log("\n\n!!! 5 consecutive errors — CMF may be rate-limiting. Waiting 60s...");
        await sleep(60000);
        consecutiveErrors = 0;
      }
    } catch (err) {
      errors++;
      consecutiveErrors++;
      if (consecutiveErrors >= 5) {
        console.log(`\n\n!!! 5 consecutive errors — CMF may be rate-limiting. Waiting 60s...`);
        await sleep(60000);
        consecutiveErrors = 0;
      }
    }
  }

  console.log("\n\n=== DONE ===");
  console.log(`Synced: ${synced} new fichas`);
  console.log(`No PDF available: ${noPdf}`);
  console.log(`Errors: ${errors}`);
  console.log(`Total processed: ${syncable.length}`);
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

main().catch(console.error);
