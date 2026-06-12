// app/api/fondos/sync-fichas/route.ts
// Scrape fichas PDF from CMF and extract structured data
// Flow: get session → get rutAdmin from page → POST for PDF URL → download → extract → save

import { NextRequest, NextResponse } from "next/server";
import { requireAdvisor, createAdminClient } from "@/lib/auth/api-auth";
import { applyRateLimit } from "@/lib/rate-limit";
import { extractFromPdf, type ExtractedFichaData } from "@/lib/ficha-extract";
import { discoverFromCmfPage, getPdfUrl, downloadPdf } from "@/lib/cmf-fichas";
import { handleApiError } from "@/lib/api-response";

export const maxDuration = 300;

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

  return handleApiError("sync-fichas-post", async () => {
  const body = await request.json();

  // Options: sync by AGF name, by specific fo_runs, or discover all
  const { nombre_agf, fo_runs, limit: batchLimit = 200, force = false } = body;

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

  // Get already synced fo_run+serie pairs to skip them (unless force=true)
  const allRuns = [...uniqueRuns.keys()];
  let alreadySynced = new Set<string>();
  if (!force) {
    const { data: existingFichas } = await supabase
      .from("fund_fichas")
      .select("fo_run, fm_serie")
      .in("fo_run", allRuns);
    alreadySynced = new Set((existingFichas || []).map(f => `${f.fo_run}-${f.fm_serie}`));
  }

  const results: { fo_run: number; serie: string; status: string; extracted?: ExtractedFichaData }[] = [];
  let synced = 0;
  let errors = 0;
  let skipped = 0;
  let geminiExhausted = false;

  for (const [foRun, fondo] of uniqueRuns) {
    try {
      // Discover rutAdmin and ALL available series from CMF
      const cmfData = await discoverFromCmfPage(foRun, "RGFMU");
      if (!cmfData) {
        const rutAdmin = findRutAdmin(fondo.nombre_agf);
        if (!rutAdmin) {
          results.push({ fo_run: foRun, serie: fondo.fm_serie, status: "no_rut_admin" });
          errors++;
          continue;
        }
        // Fallback: try single serie from DB
        if (alreadySynced.has(`${foRun}-${fondo.fm_serie}`)) {
          results.push({ fo_run: foRun, serie: fondo.fm_serie, status: "already_synced" });
          skipped++;
          continue;
        }
        const pdfUrl = await getPdfUrl(foRun, fondo.fm_serie, rutAdmin);
        if (!pdfUrl) {
          results.push({ fo_run: foRun, serie: fondo.fm_serie, status: "no_pdf_url" });
          errors++;
          continue;
        }
        const pdfBuffer = await downloadPdf(pdfUrl);
        if (!pdfBuffer) { results.push({ fo_run: foRun, serie: fondo.fm_serie, status: "download_failed" }); errors++; continue; }
        const { data: extracted, gemini_exhausted: fallbackGeminiExhausted } = await extractFromPdf(pdfBuffer);
        if (fallbackGeminiExhausted) geminiExhausted = true;
        const { extraction_method: _, ...dbFields1 } = extracted;
        const { error: upsertError } = await supabase.from("fund_fichas").upsert({
          fo_run: foRun, fm_serie: fondo.fm_serie, ...dbFields1,
          updated_at: new Date().toISOString(), updated_by: user!.id,
        }, { onConflict: "fo_run,fm_serie" });
        if (upsertError) { results.push({ fo_run: foRun, serie: fondo.fm_serie, status: `db_error: ${upsertError.message}` }); errors++; }
        else { results.push({ fo_run: foRun, serie: fondo.fm_serie, status: "ok" }); synced++; }
        await new Promise(r => setTimeout(r, 500));
        continue;
      }

      // Process EVERY serie — each has its own TAC/costs
      for (const serie of cmfData.series) {
        // Skip series already synced
        if (alreadySynced.has(`${foRun}-${serie}`)) {
          results.push({ fo_run: foRun, serie, status: "already_synced" });
          skipped++;
          continue;
        }
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

          const { data: extracted, gemini_exhausted: serieGeminiExhausted } = await extractFromPdf(pdfBuffer);
          if (serieGeminiExhausted) geminiExhausted = true;
          const { extraction_method: _x, ...dbFields2 } = extracted;

          const { error: upsertError } = await supabase
            .from("fund_fichas")
            .upsert({
              fo_run: foRun,
              fm_serie: serie,
              ...dbFields2,
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
    skipped,
    total: uniqueRuns.size,
    gemini_exhausted: geminiExhausted,
    results: results.filter(r => r.status !== "already_synced"),
  });
  });
}

// GET - Check sync status / list available AGFs
export async function GET(request: NextRequest) {
  const blocked = await applyRateLimit(request, "sync-fichas-get", { limit: 10, windowSeconds: 60 });
  if (blocked) return blocked;

  const { error: authError } = await requireAdvisor();
  if (authError) return authError;

  const supabase = createAdminClient();

  return handleApiError("sync-fichas-get", async () => {
  // Use raw SQL via rpc to get accurate counts with JOIN
  const { data: sqlResult, error: sqlError } = await supabase.rpc("get_fichas_sync_status");

  if (sqlError || !sqlResult) {
    // Fallback: simple count without per-AGF breakdown
    const { count: fichasCount } = await supabase
      .from("fund_fichas")
      .select("*", { count: "exact", head: true });

    const { data: agfs } = await supabase
      .from("vw_fondos_completo")
      .select("nombre_agf")
      .limit(10000);

    const agfCounts: Record<string, number> = {};
    agfs?.forEach(f => {
      if (f.nombre_agf) agfCounts[f.nombre_agf] = (agfCounts[f.nombre_agf] || 0) + 1;
    });

    const agfList = Object.entries(agfCounts)
      .map(([nombre, count]) => ({ nombre, count, synced: 0, rut_known: !!findRutAdmin(nombre) }))
      .sort((a, b) => b.count - a.count);

    return NextResponse.json({
      success: true,
      fichas_synced: fichasCount || 0,
      agf_list: agfList,
      agf_rut_map: AGF_RUT_MAP,
      fallback: true,
      sql_error: sqlError?.message,
    });
  }

  // sqlResult is array of { nombre_agf, total, synced }
  const agfList = (sqlResult as { nombre_agf: string; total: number; synced: number }[])
    .map(r => ({
      nombre: r.nombre_agf,
      count: Number(r.total),
      synced: Number(r.synced),
      rut_known: !!findRutAdmin(r.nombre_agf),
    }))
    .sort((a, b) => b.count - a.count);

  const totalSynced = agfList.reduce((sum, a) => sum + a.synced, 0);

  return NextResponse.json({
    success: true,
    fichas_synced: totalSynced,
    agf_list: agfList,
    agf_rut_map: AGF_RUT_MAP,
  });
  });
}
