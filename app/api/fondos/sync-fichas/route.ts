// app/api/fondos/sync-fichas/route.ts
// Scrape fichas PDF from CMF and extract structured data
// Flow: get session → get rutAdmin from page → POST for PDF URL → download → extract → save

import { NextRequest, NextResponse } from "next/server";
import { requireAdvisor, createAdminClient } from "@/lib/auth/api-auth";
import { applyRateLimit } from "@/lib/rate-limit";
import { extractText } from "unpdf";

export const maxDuration = 120;

// Known AGF RUT mappings (CMF uses these for folleto download)
// Discovered by scraping the folleto page for each AGF
const AGF_RUT_MAP: Record<string, string> = {
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

interface ExtractedFichaData {
  tac_serie: number | null;
  nombre_fondo_pdf: string | null;
  serie_detectada: string | null;
  rent_1m: number | null;
  rent_3m: number | null;
  rent_6m: number | null;
  rent_12m: number | null;
  rescatable: boolean | null;
  plazo_rescate: string | null;
  horizonte_inversion: string | null;
  tolerancia_riesgo: string | null;
  objetivo: string | null;
}

async function extractFromPdf(buffer: ArrayBuffer): Promise<ExtractedFichaData> {
  const result = await extractText(new Uint8Array(buffer));
  const text = (result.text as string[]).join("\n");

  // TAC Serie — handles both "IVA incluido" and "Exento de IVA" formats
  let tac_serie: number | null = null;
  const tacMatch = text.match(/TAC\s+Serie\s+\(?(?:IVA\s+incluido|Exento\s+de\s+IVA)\)?\s+([\d,]+)%/i);
  if (tacMatch) {
    tac_serie = parseFloat(tacMatch[1].replace(",", "."));
  }

  // Rentabilidades
  const parseRent = (label: string): number | null => {
    const re = new RegExp(label + "\\s+(-?[\\d,.]+)%", "i");
    const m = text.match(re);
    if (m) return parseFloat(m[1].replace(",", "."));
    return null;
  };

  // Fund name + serie from header
  let nombre_fondo_pdf: string | null = null;
  let serie_detectada: string | null = null;
  const headerMatch = text.match(/FONDO\s+MUTUO\s+([^|]+)\|\s*SERIE\s+(\S+)/i);
  if (headerMatch) {
    nombre_fondo_pdf = headerMatch[1].trim();
    serie_detectada = headerMatch[2].trim();
  }

  // Rescatable
  const rescatableMatch = text.match(/Fondo\s+es\s+Rescatable:\s*(SI|NO)/i);
  const rescatable = rescatableMatch ? rescatableMatch[1].toUpperCase() === "SI" : null;

  // Plazo rescates
  const plazoMatch = text.match(/Plazo\s+Rescates:\s*([^\n]+)/i);
  const plazo_rescate = plazoMatch ? plazoMatch[1].trim() : null;

  // Horizonte
  const horizonteMatch = text.match(/((?:Corto|Mediano|Largo)(?:\s+(?:o|y|a)\s+(?:corto|mediano|largo))*\s+plazo)/i);
  const horizonte_inversion = horizonteMatch ? horizonteMatch[1].trim() : null;

  // Tolerancia
  const toleranciaMatch = text.match(/Nivel\s+(alto|medio|bajo|moderado)/i);
  const tolerancia_riesgo = toleranciaMatch ? toleranciaMatch[0].trim() : null;

  // Objetivo
  const objIdx = text.indexOf("Objetivo del Fondo");
  const tolIdx = text.indexOf("Tolerancia al Riesgo");
  const objetivo = objIdx >= 0 && tolIdx > objIdx
    ? text.substring(objIdx + "Objetivo del Fondo".length, tolIdx).replace(/\n/g, " ").trim().substring(0, 500)
    : null;

  return {
    tac_serie,
    nombre_fondo_pdf,
    serie_detectada,
    rent_1m: parseRent("1\\s*Mes"),
    rent_3m: parseRent("3\\s*Meses"),
    rent_6m: parseRent("6\\s*Meses"),
    rent_12m: parseRent("1\\s*Año"),
    rescatable,
    plazo_rescate,
    horizonte_inversion,
    tolerancia_riesgo,
    objetivo,
  };
}

// Discover rutAdmin and available series for a given fo_run
async function discoverFromCmfPage(foRun: number): Promise<{ rutAdmin: string; series: string[] } | null> {
  const url = `https://www.cmfchile.cl/institucional/mercados/entidad.php?mercado=V&rut=${foRun}&tipoentidad=RGFMU&vig=VI&control=svs&pestania=68`;
  const res = await fetch(url);
  const html = await res.text();
  const matches = [...html.matchAll(/verFolleto\('\d+','([^']+)','(\d+)'\)/g)];
  if (matches.length === 0) return null;
  const rutAdmin = matches[0][2];
  const series = [...new Set(matches.map(m => m[1]))];
  return { rutAdmin, series };
}

// Get PDF URL from CMF (no session needed)
async function getPdfUrl(foRun: number, serie: string, rutAdmin: string): Promise<string | null> {
  const res = await fetch("https://www.cmfchile.cl/institucional/inc/ver_folleto_fm.php", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "X-Requested-With": "XMLHttpRequest",
    },
    body: `runFondo=${foRun}&serie=${encodeURIComponent(serie)}&rutAdmin=${rutAdmin}`,
  });
  const text = await res.text();
  if (text === "ERROR" || text.includes("DOCTYPE")) return null;
  return text.trim();
}

// Download PDF (no session needed)
async function downloadPdf(pdfPath: string): Promise<ArrayBuffer | null> {
  const url = `https://www.cmfchile.cl${pdfPath}`;
  const res = await fetch(url);
  if (!res.ok) return null;
  return res.arrayBuffer();
}

// Match AGF name to known RUT
function findRutAdmin(nombreAgf: string): string | null {
  const upper = nombreAgf.toUpperCase();
  for (const [key, rut] of Object.entries(AGF_RUT_MAP)) {
    if (upper.includes(key)) return rut;
  }
  return null;
}

// POST - Sync fichas for a batch of fondos
export async function POST(request: NextRequest) {
  const blocked = await applyRateLimit(request, "sync-fichas", { limit: 3, windowSeconds: 60 });
  if (blocked) return blocked;

  const { user, error: authError } = await requireAdvisor();
  if (authError) return authError;

  const supabase = createAdminClient();
  const body = await request.json();

  // Options: sync by AGF name, by specific fo_runs, or discover all
  const { nombre_agf, fo_runs, limit: batchLimit = 20 } = body;

  if (!nombre_agf && !fo_runs) {
    return NextResponse.json({
      success: false,
      error: "Debe especificar nombre_agf o fo_runs",
    }, { status: 400 });
  }

  // Get fondos to sync
  let fondosToSync: { fo_run: number; fm_serie: string; nombre_agf: string }[] = [];

  if (fo_runs && Array.isArray(fo_runs)) {
    const { data } = await supabase
      .from("vw_fondos_completo")
      .select("fo_run, fm_serie, nombre_agf")
      .in("fo_run", fo_runs);
    fondosToSync = data || [];
  } else if (nombre_agf) {
    const { data } = await supabase
      .from("vw_fondos_completo")
      .select("fo_run, fm_serie, nombre_agf")
      .ilike("nombre_agf", `%${nombre_agf}%`)
      .limit(batchLimit);
    fondosToSync = data || [];
  }

  if (fondosToSync.length === 0) {
    return NextResponse.json({ success: true, message: "No se encontraron fondos", synced: 0 });
  }

  // Deduplicate by fo_run to discover series once per fund
  const uniqueRuns = new Map<number, { fo_run: number; fm_serie: string; nombre_agf: string }>();
  for (const f of fondosToSync) {
    if (!uniqueRuns.has(f.fo_run)) {
      uniqueRuns.set(f.fo_run, f);
    }
  }

  const results: { fo_run: number; serie: string; status: string; extracted?: ExtractedFichaData }[] = [];
  let synced = 0;
  let errors = 0;

  for (const [foRun, fondo] of uniqueRuns) {
    try {
      // Discover rutAdmin and ALL available series from CMF
      const cmfData = await discoverFromCmfPage(foRun);
      if (!cmfData) {
        const rutAdmin = findRutAdmin(fondo.nombre_agf);
        if (!rutAdmin) {
          results.push({ fo_run: foRun, serie: fondo.fm_serie, status: "no_rut_admin" });
          errors++;
          continue;
        }
        // Fallback: try single serie from DB
        const pdfUrl = await getPdfUrl(foRun, fondo.fm_serie, rutAdmin);
        if (!pdfUrl) {
          results.push({ fo_run: foRun, serie: fondo.fm_serie, status: "no_pdf_url" });
          errors++;
          continue;
        }
        const pdfBuffer = await downloadPdf(pdfUrl);
        if (!pdfBuffer) { results.push({ fo_run: foRun, serie: fondo.fm_serie, status: "download_failed" }); errors++; continue; }
        const extracted = await extractFromPdf(pdfBuffer);
        const { error: upsertError } = await supabase.from("fund_fichas").upsert({
          fo_run: foRun, fm_serie: fondo.fm_serie, ...extracted,
          updated_at: new Date().toISOString(), updated_by: user!.id,
        }, { onConflict: "fo_run,fm_serie" });
        if (upsertError) { results.push({ fo_run: foRun, serie: fondo.fm_serie, status: `db_error: ${upsertError.message}` }); errors++; }
        else { results.push({ fo_run: foRun, serie: fondo.fm_serie, status: "ok" }); synced++; }
        await new Promise(r => setTimeout(r, 500));
        continue;
      }

      // Process EVERY serie — each has its own TAC/costs
      for (const serie of cmfData.series) {
        try {
          const pdfUrl = await getPdfUrl(foRun, serie, cmfData.rutAdmin);
          if (!pdfUrl) {
            results.push({ fo_run: foRun, serie, status: "no_pdf" });
            errors++;
            continue;
          }

          const pdfBuffer = await downloadPdf(pdfUrl);
          if (!pdfBuffer) {
            results.push({ fo_run: foRun, serie, status: "download_failed" });
            errors++;
            continue;
          }

          const extracted = await extractFromPdf(pdfBuffer);

          const { error: upsertError } = await supabase
            .from("fund_fichas")
            .upsert({
              fo_run: foRun,
              fm_serie: serie,
              tac_serie: extracted.tac_serie,
              nombre_fondo_pdf: extracted.nombre_fondo_pdf,
              serie_detectada: extracted.serie_detectada,
              rent_1m: extracted.rent_1m,
              rent_3m: extracted.rent_3m,
              rent_6m: extracted.rent_6m,
              rent_12m: extracted.rent_12m,
              rescatable: extracted.rescatable,
              plazo_rescate: extracted.plazo_rescate,
              horizonte_inversion: extracted.horizonte_inversion,
              tolerancia_riesgo: extracted.tolerancia_riesgo,
              objetivo: extracted.objetivo,
              updated_at: new Date().toISOString(),
              updated_by: user!.id,
            }, { onConflict: "fo_run,fm_serie" });

          if (upsertError) {
            results.push({ fo_run: foRun, serie, status: `db_error: ${upsertError.message}` });
            errors++;
          } else {
            results.push({ fo_run: foRun, serie, status: "ok" });
            synced++;
          }

          // Small delay to be polite to CMF
          await new Promise(r => setTimeout(r, 300));
        } catch (err) {
          results.push({ fo_run: foRun, serie, status: `error: ${err instanceof Error ? err.message : "unknown"}` });
          errors++;
        }
      }
    } catch (err) {
      results.push({ fo_run: foRun, serie: fondo.fm_serie, status: `error: ${err instanceof Error ? err.message : 'unknown'}` });
      errors++;
    }
  }

  return NextResponse.json({
    success: true,
    synced,
    errors,
    total: uniqueRuns.size,
    results,
  });
}

// GET - Check sync status / list available AGFs
export async function GET(request: NextRequest) {
  const blocked = await applyRateLimit(request, "sync-fichas-get", { limit: 10, windowSeconds: 60 });
  if (blocked) return blocked;

  const { error: authError } = await requireAdvisor();
  if (authError) return authError;

  const supabase = createAdminClient();

  // Get count of fichas already synced
  const { count: fichasCount } = await supabase
    .from("fund_fichas")
    .select("*", { count: "exact", head: true })
    .not("tac_serie", "is", null);

  // Get distinct AGFs with fund count
  const { data: agfs } = await supabase
    .from("vw_fondos_completo")
    .select("nombre_agf");

  const agfCounts: Record<string, number> = {};
  agfs?.forEach(f => {
    if (f.nombre_agf) {
      agfCounts[f.nombre_agf] = (agfCounts[f.nombre_agf] || 0) + 1;
    }
  });

  const agfList = Object.entries(agfCounts)
    .map(([nombre, count]) => ({
      nombre,
      count,
      rut_known: !!findRutAdmin(nombre),
    }))
    .sort((a, b) => b.count - a.count);

  return NextResponse.json({
    success: true,
    fichas_synced: fichasCount || 0,
    agf_list: agfList,
    agf_rut_map: AGF_RUT_MAP,
  });
}
