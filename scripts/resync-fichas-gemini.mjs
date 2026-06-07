#!/usr/bin/env node
// Re-sync fichas using Gemini 2.5 Flash for PDF extraction
// Usage: node scripts/resync-fichas-gemini.mjs [--force] [--limit 500] [--agf "BANCHILE"]
// Free tier: 500 req/day, 10 RPM → 6s between requests

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://zysotxkelepvotzujhxe.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp5c290eGtlbGVwdm90enVqaHhlIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NjUyNjk3NCwiZXhwIjoyMDgyMTAyOTc0fQ.Ansi89kIfptszv0I3DzmPJdqrEpi7tLbckiobvw6QRM";
const GEMINI_KEY = "AIzaSyA2WdLHMp9Ma1S_JYp4hI7tmE2fhBwbD34";
const GEMINI_MODEL = "gemini-2.5-flash";

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
};

const PROMPT = `Extrae datos de esta ficha de fondo mutuo chileno (CMF).

IMPORTANTE sobre Beneficio Tributario: Cada serie tiene UN SOLO beneficio tributario marcado con un checkmark/tick visual. Los posibles valores son: "APV", "APVC", "57 LIR", "107 LIR", "108 LIR", o null si no tiene. Identifica CUAL es el unico que esta marcado/destacado visualmente.

Responde SOLO JSON valido sin markdown ni backticks. Porcentajes como numeros (5.00 no "5.00%"). Serie solo el codigo (ej: "B", "AFP", no incluir fecha ni "Serie").

{"nombre_fondo": "str", "serie": "str", "tac_serie_pct": "num o null", "rent_1m_pct": "num o null", "rent_3m_pct": "num o null", "rent_6m_pct": "num o null", "rent_12m_pct": "num o null", "rescatable": "bool o null", "plazo_rescate": "str o null", "horizonte_inversion": "str o null", "tolerancia_riesgo": "str o null", "objetivo": "str max 500 o null", "beneficio_tributario": "str (APV/APVC/57 LIR/107 LIR/108 LIR) o null"}`;

// Parse args
const args = process.argv.slice(2);
const forceMode = args.includes("--force");
const limitIdx = args.indexOf("--limit");
const batchLimit = limitIdx >= 0 ? parseInt(args[limitIdx + 1]) : 500;
const agfIdx = args.indexOf("--agf");
const agfFilter = agfIdx >= 0 ? args[agfIdx + 1] : null;

// --- CMF helpers ---
async function discoverFromCmfPage(foRun) {
  const url = `https://www.cmfchile.cl/institucional/mercados/entidad.php?mercado=V&rut=${foRun}&tipoentidad=RGFMU&vig=VI&control=svs&pestania=68`;
  const res = await fetch(url, { headers: HEADERS });
  const html = await res.text();
  const matches = [...html.matchAll(/verFolleto\('\d+','([^']+)','(\d+)'\)/g)];
  if (matches.length === 0) return null;
  return { rutAdmin: matches[0][2], series: [...new Set(matches.map(m => m[1]))] };
}

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
  const res = await fetch(`https://www.cmfchile.cl${pdfPath}`, { headers: HEADERS });
  if (!res.ok) return null;
  return res.arrayBuffer();
}

// --- Gemini extraction ---
async function extractWithGemini(pdfBuffer) {
  const base64 = Buffer.from(pdfBuffer).toString("base64");
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{
          parts: [
            { inlineData: { mimeType: "application/pdf", data: base64 } },
            { text: PROMPT },
          ],
        }],
        generationConfig: { temperature: 0, maxOutputTokens: 4000 },
      }),
    }
  );

  if (res.status === 429) {
    return { error: "rate_limit", retryAfter: 60 };
  }
  if (!res.ok) {
    return { error: `http_${res.status}` };
  }

  const data = await res.json();
  let text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) return { error: "no_response" };

  // Clean markdown wrapper
  text = text.replace(/^```json\s*/i, "").replace(/```\s*$/, "").trim();

  try {
    const parsed = JSON.parse(text);
    return { data: parsed, tokens: data.usageMetadata?.totalTokenCount || 0 };
  } catch {
    return { error: "json_parse", raw: text.substring(0, 200) };
  }
}

// Map Gemini output to fund_fichas columns
function mapToDbRow(foRun, fmSerie, extracted) {
  // Map beneficio_tributario to boolean columns
  const ben = (extracted.beneficio_tributario || "").toUpperCase();
  return {
    fo_run: foRun,
    fm_serie: fmSerie,
    tac_serie: extracted.tac_serie_pct ?? null,
    nombre_fondo_pdf: extracted.nombre_fondo || null,
    serie_detectada: extracted.serie || null,
    rent_1m: extracted.rent_1m_pct ?? null,
    rent_3m: extracted.rent_3m_pct ?? null,
    rent_6m: extracted.rent_6m_pct ?? null,
    rent_12m: extracted.rent_12m_pct ?? null,
    rescatable: extracted.rescatable ?? null,
    plazo_rescate: extracted.plazo_rescate || null,
    horizonte_inversion: extracted.horizonte_inversion || null,
    tolerancia_riesgo: extracted.tolerancia_riesgo || null,
    objetivo: extracted.objetivo || null,
    beneficio_apv: ben === "APV" || ben === "APVC",
    beneficio_57bis: ben === "57 LIR" || ben === "57BIS",
    beneficio_107lir: ben === "107 LIR",
    beneficio_108lir: ben === "108 LIR",
    notas_tributarias: extracted.beneficio_tributario || null,
    updated_at: new Date().toISOString(),
  };
}

// --- Main ---
async function main() {
  console.log("=== RESYNC FICHAS WITH GEMINI ===");
  console.log(`Mode: ${forceMode ? "FORCE" : "INCREMENTAL"} | Limit: ${batchLimit}`);
  if (agfFilter) console.log(`AGF filter: ${agfFilter}`);

  // Get all fund+serie combos
  let allFondos = [];
  let offset = 0;
  while (true) {
    let q = supabase.from("vw_fondos_completo").select("fo_run, fm_serie, nombre_agf").order("nombre_agf").range(offset, offset + 999);
    if (agfFilter) q = q.ilike("nombre_agf", `%${agfFilter}%`);
    const { data } = await q;
    if (!data || data.length === 0) break;
    allFondos = allFondos.concat(data);
    if (data.length < 1000) break;
    offset += 1000;
  }
  console.log(`Total series in DB: ${allFondos.length}`);

  // Deduplicate by fo_run for CMF discovery
  const uniqueRuns = new Map();
  for (const f of allFondos) {
    if (!uniqueRuns.has(f.fo_run)) uniqueRuns.set(f.fo_run, f);
  }
  console.log(`Unique funds: ${uniqueRuns.size}`);

  // Get existing fichas
  let existingKeys = new Set();
  if (!forceMode) {
    let fo = 0;
    while (true) {
      const { data } = await supabase.from("fund_fichas").select("fo_run, fm_serie").range(fo, fo + 999);
      if (!data || data.length === 0) break;
      data.forEach(f => existingKeys.add(`${f.fo_run}-${f.fm_serie}`));
      if (data.length < 1000) break;
      fo += 1000;
    }
    console.log(`Already synced: ${existingKeys.size}`);
  }

  // Build work queue: discover series from CMF for each fund
  let queue = []; // { foRun, serie, rutAdmin }
  let discoveryErrors = 0;
  let idx = 0;
  for (const [foRun, fondo] of uniqueRuns) {
    idx++;
    if (queue.length >= batchLimit) break;

    // Rate limit CMF discovery: 2s between
    await sleep(2000);
    process.stdout.write(`\rDiscovering ${idx}/${uniqueRuns.size}... queue: ${queue.length}  `);

    try {
      const cmfData = await discoverFromCmfPage(foRun);
      if (!cmfData) { discoveryErrors++; continue; }

      for (const serie of cmfData.series) {
        if (queue.length >= batchLimit) break;
        const key = `${foRun}-${serie}`;
        if (!forceMode && existingKeys.has(key)) continue;
        queue.push({ foRun, serie, rutAdmin: cmfData.rutAdmin });
      }
    } catch {
      discoveryErrors++;
    }
  }

  console.log(`\n\nDiscovery done. Queue: ${queue.length} | Errors: ${discoveryErrors}`);
  if (queue.length === 0) { console.log("Nothing to sync!"); return; }

  // Process queue with Gemini
  let synced = 0, errors = 0, noPdf = 0, totalTokens = 0;
  const startTime = Date.now();

  for (let i = 0; i < queue.length; i++) {
    const { foRun, serie, rutAdmin } = queue[i];
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
    process.stdout.write(`\r[${i + 1}/${queue.length}] Synced: ${synced} | Errors: ${errors} | NoPDF: ${noPdf} | ${elapsed}s  `);

    try {
      // Get PDF URL from CMF
      const pdfUrl = await getPdfUrl(foRun, serie, rutAdmin);
      if (!pdfUrl) { noPdf++; await sleep(1000); continue; }

      // Download PDF
      await sleep(1000);
      const pdfBuffer = await downloadPdf(pdfUrl);
      if (!pdfBuffer) { errors++; continue; }

      // Extract with Gemini (respect 10 RPM = 7s between calls)
      await sleep(7000);
      const result = await extractWithGemini(pdfBuffer);

      if (result.error === "rate_limit") {
        console.log(`\n  Rate limited — waiting 90s...`);
        await sleep(90000);
        const retry = await extractWithGemini(pdfBuffer);
        if (retry.error === "rate_limit") {
          console.log(`\n  Still limited — waiting 120s...`);
          await sleep(120000);
          const retry2 = await extractWithGemini(pdfBuffer);
          if (retry2.error) { errors++; console.log(`\n  Retry2 failed: ${retry2.error}`); continue; }
          result.data = retry2.data;
          result.tokens = retry2.tokens;
          result.error = undefined;
        } else if (retry.error) {
          errors++; console.log(`\n  Retry failed: ${retry.error}`); continue;
        } else {
          result.data = retry.data;
          result.tokens = retry.tokens;
          result.error = undefined;
        }
      }

      if (result.error) {
        errors++;
        if (result.error === "json_parse") console.log(`\n  Parse error ${foRun}/${serie}: ${result.raw}`);
        continue;
      }

      totalTokens += result.tokens || 0;

      // Save to DB
      const row = mapToDbRow(foRun, serie, result.data);
      const { error: dbErr } = await supabase.from("fund_fichas").upsert(row, { onConflict: "fo_run,fm_serie" });
      if (dbErr) {
        errors++;
        console.log(`\n  DB error ${foRun}/${serie}: ${dbErr.message}`);
      } else {
        synced++;
      }
    } catch (err) {
      errors++;
      console.log(`\n  Error ${foRun}/${serie}: ${err.message}`);
    }
  }

  const totalTime = ((Date.now() - startTime) / 1000 / 60).toFixed(1);
  console.log(`\n\n=== DONE (${totalTime} min) ===`);
  console.log(`Synced: ${synced}`);
  console.log(`No PDF: ${noPdf}`);
  console.log(`Errors: ${errors}`);
  console.log(`Total tokens: ${totalTokens.toLocaleString()}`);
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

main().catch(console.error);
