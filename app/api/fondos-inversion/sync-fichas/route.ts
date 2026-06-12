// app/api/fondos-inversion/sync-fichas/route.ts
// Scrape fichas PDF from CMF for Fondos de Inversión
// Same flow as FM but uses tipoentidad=FIRES and fi_fichas table

import { NextRequest, NextResponse } from "next/server";
import { requireAdvisor, createAdminClient } from "@/lib/auth/api-auth";
import { applyRateLimit } from "@/lib/rate-limit";
import { extractFromPdf } from "@/lib/ficha-extract";
import { discoverFromCmfPage, getPdfUrl, downloadPdf } from "@/lib/cmf-fichas";
import { handleApiError } from "@/lib/api-response";

export const maxDuration = 300;

// POST - Sync fichas for a batch of FI
export async function POST(request: NextRequest) {
  const blocked = await applyRateLimit(request, "sync-fichas-fi", { limit: 3, windowSeconds: 60 });
  if (blocked) return blocked;

  const { user, error: authError } = await requireAdvisor();
  if (authError) return authError;

  return handleApiError("sync-fichas-fi-post", async () => {
    const supabase = createAdminClient();
    const body = await request.json();

  const { administradora, fi_ruts, limit: batchLimit = 200, force = false } = body;

  if (!administradora && !fi_ruts) {
    return NextResponse.json({
      success: false,
      error: "Debe especificar administradora o fi_ruts",
    }, { status: 400 });
  }

  // Get fondos to sync
  let fondosToSync: { id: string; rut: string; nombre: string; administradora: string }[] = [];

  if (fi_ruts && Array.isArray(fi_ruts)) {
    const { data } = await supabase
      .from("fondos_inversion")
      .select("id, rut, nombre, administradora")
      .in("rut", fi_ruts)
      .eq("activo", true);
    fondosToSync = data || [];
  } else if (administradora) {
    const { data } = await supabase
      .from("fondos_inversion")
      .select("id, rut, nombre, administradora")
      .ilike("administradora", `%${administradora}%`)
      .eq("activo", true)
      .limit(batchLimit);
    fondosToSync = data || [];
  }

  if (fondosToSync.length === 0) {
    return NextResponse.json({ success: true, message: "No se encontraron fondos", synced: 0 });
  }

  // Get already synced fi_rut+fi_serie pairs to skip them (unless force=true)
  const allRuts = fondosToSync.map(f => f.rut);
  let alreadySynced = new Set<string>();
  if (!force) {
    const { data: existingFichas } = await supabase
      .from("fi_fichas")
      .select("fi_rut, fi_serie")
      .in("fi_rut", allRuts);
    alreadySynced = new Set((existingFichas || []).map(f => `${f.fi_rut}-${f.fi_serie}`));
  }

  const results: { fi_rut: string; nombre: string; serie: string; status: string }[] = [];
  let synced = 0;
  let errors = 0;
  let skipped = 0;
  let geminiExhausted = false;

  for (const fondo of fondosToSync) {
    try {
      const cmfData = await discoverFromCmfPage(fondo.rut, "FIRES");
      if (!cmfData) {
        results.push({ fi_rut: fondo.rut, nombre: fondo.nombre, serie: "-", status: "no_folleto_page" });
        errors++;
        continue;
      }

      // Process EVERY serie — each has its own TAC/costs
      for (const serie of cmfData.series) {
        if (alreadySynced.has(`${fondo.rut}-${serie}`)) {
          skipped++;
          continue;
        }
        try {
          const pdfUrl = await getPdfUrl(fondo.rut, serie, cmfData.rutAdmin);
          if (!pdfUrl) {
            results.push({ fi_rut: fondo.rut, nombre: fondo.nombre, serie, status: "no_pdf" });
            errors++;
            continue;
          }

          const pdfBuffer = await downloadPdf(pdfUrl);
          if (!pdfBuffer) {
            results.push({ fi_rut: fondo.rut, nombre: fondo.nombre, serie, status: "download_failed" });
            errors++;
            continue;
          }

          const { data: extracted, gemini_exhausted: serieGeminiExhausted } = await extractFromPdf(pdfBuffer);
          if (serieGeminiExhausted) geminiExhausted = true;
          const { extraction_method: _method, ...dbFields } = extracted;

          const { error: upsertError } = await supabase
            .from("fi_fichas")
            .upsert({
              fi_rut: fondo.rut,
              fi_serie: serie,
              ...dbFields,
              updated_at: new Date().toISOString(),
              updated_by: user!.id,
            }, { onConflict: "fi_rut,fi_serie" });

          if (upsertError) {
            results.push({ fi_rut: fondo.rut, nombre: fondo.nombre, serie, status: `db_error: ${upsertError.message}` });
            errors++;
          } else {
            results.push({ fi_rut: fondo.rut, nombre: fondo.nombre, serie, status: "ok" });
            synced++;
          }

          await new Promise(r => setTimeout(r, 300));
        } catch (err) {
          results.push({ fi_rut: fondo.rut, nombre: fondo.nombre, serie, status: `error: ${err instanceof Error ? err.message : "unknown"}` });
          errors++;
        }
      }
    } catch (err) {
      results.push({ fi_rut: fondo.rut, nombre: fondo.nombre, serie: "-", status: `error: ${err instanceof Error ? err.message : "unknown"}` });
      errors++;
    }
  }

    return NextResponse.json({ success: true, synced, errors, skipped, total: fondosToSync.length, gemini_exhausted: geminiExhausted, results });
  });
}

// GET - Check sync status / list administradoras
export async function GET(request: NextRequest) {
  const blocked = await applyRateLimit(request, "sync-fichas-fi-get", { limit: 10, windowSeconds: 60 });
  if (blocked) return blocked;

  const { error: authError } = await requireAdvisor();
  if (authError) return authError;

  return handleApiError("sync-fichas-fi-get", async () => {
    const supabase = createAdminClient();

    // Use SQL RPC for accurate counts with JOIN
  const { data: sqlResult, error: sqlError } = await supabase.rpc("get_fi_fichas_sync_status");

  if (sqlError || !sqlResult) {
    // Fallback: simple count without per-admin breakdown
    const { count: fichasCount } = await supabase
      .from("fi_fichas")
      .select("*", { count: "exact", head: true });

    const { data: fondos } = await supabase
      .from("fondos_inversion")
      .select("administradora")
      .eq("activo", true);

    const adminCounts: Record<string, number> = {};
    fondos?.forEach((f: { administradora: string | null }) => {
      if (f.administradora) adminCounts[f.administradora] = (adminCounts[f.administradora] || 0) + 1;
    });

    const adminList = Object.entries(adminCounts)
      .map(([nombre, count]) => ({ nombre, count, synced: 0 }))
      .sort((a, b) => b.count - a.count);

    return NextResponse.json({
      success: true,
      fichas_synced: fichasCount || 0,
      admin_list: adminList,
      fallback: true,
    });
  }

  const adminList = (sqlResult as { administradora: string; total: number; synced: number }[])
    .map(r => ({
      nombre: r.administradora,
      count: Number(r.total),
      synced: Number(r.synced),
    }))
    .sort((a, b) => b.count - a.count);

  const totalSynced = adminList.reduce((sum, a) => sum + a.synced, 0);

    return NextResponse.json({
      success: true,
      fichas_synced: totalSynced,
      admin_list: adminList,
    });
  });
}
