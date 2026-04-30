// POST /api/fondos-inversion/fetch-prices
// Scrapes CMF for fondo de inversión prices using 2captcha and persists them.
// Body: { rut: string, desde?: string (YYYY-MM-DD), hasta?: string (YYYY-MM-DD) }

import { NextRequest, NextResponse } from "next/server";
import { requireAdvisor, createAdminClient } from "@/lib/auth/api-auth";
import { applyRateLimit } from "@/lib/rate-limit";
import { scrapeFIPrices } from "@/lib/cmf-fi-auto";
import { importFIRows } from "@/lib/cmf-fi-import";

export const maxDuration = 120; // Allow up to 2 minutes for captcha solving

export async function POST(request: NextRequest) {
  const blocked = await applyRateLimit(request, "fi-fetch-prices", { limit: 5, windowSeconds: 120 });
  if (blocked) return blocked;

  const { error: authError } = await requireAdvisor();
  if (authError) return authError;

  const supabase = createAdminClient();

  try {
    const { rut, desde, hasta } = await request.json();

    if (!rut) {
      return NextResponse.json({ success: false, error: "rut requerido" }, { status: 400 });
    }

    // Look up the fund in catalog
    const { data: fondo, error: lookupErr } = await supabase
      .from("fondos_inversion")
      .select("id, rut, nombre, administradora, tipo, cmf_row, series_detectadas, ultimo_sync")
      .eq("rut", String(rut))
      .maybeSingle();

    if (lookupErr || !fondo) {
      return NextResponse.json(
        { success: false, error: `Fondo de inversión con RUT ${rut} no encontrado en catálogo` },
        { status: 404 }
      );
    }

    if (!fondo.cmf_row) {
      return NextResponse.json(
        { success: false, error: `Fondo ${fondo.nombre} no tiene cmf_row configurado` },
        { status: 400 }
      );
    }

    // Default date range: last 30 days
    const hastaDate = hasta ? new Date(hasta + "T12:00:00") : new Date();
    const desdeDate = desde ? new Date(desde + "T12:00:00") : new Date(hastaDate.getTime() - 30 * 24 * 60 * 60 * 1000);

    console.log(`[FI fetch-prices] Scraping ${fondo.nombre} (RUT ${rut}), ${desdeDate.toISOString().slice(0, 10)} → ${hastaDate.toISOString().slice(0, 10)}`);

    // Scrape from CMF
    const scrapeResult = await scrapeFIPrices({
      rut: fondo.rut,
      cmfRow: fondo.cmf_row,
      tipo: fondo.tipo as "FIRES" | "FINRE",
      desde: desdeDate,
      hasta: hastaDate,
      maxRetries: 3,
    });

    if (!scrapeResult.success) {
      return NextResponse.json({
        success: false,
        error: `Error scraping CMF: ${scrapeResult.error}`,
        captchaSolveMs: scrapeResult.captchaSolveMs,
      }, { status: 502 });
    }

    // Persist scraped rows
    const importResult = await importFIRows(fondo.rut, scrapeResult.rows || []);

    // Fetch latest price after import
    const { data: latestPrice } = await supabase
      .from("fondos_inversion_precios")
      .select("serie, fecha, valor_libro")
      .eq("fondo_id", fondo.id)
      .order("fecha", { ascending: false })
      .limit(5);

    return NextResponse.json({
      success: true,
      fondo: {
        id: fondo.id,
        rut: fondo.rut,
        nombre: fondo.nombre,
        administradora: fondo.administradora,
      },
      scrape: {
        rowsScraped: scrapeResult.rows?.length || 0,
        captchaSolveMs: scrapeResult.captchaSolveMs,
        attempt: scrapeResult.attempt,
      },
      import: {
        rowsUpserted: importResult.rowsUpserted,
        seriesDetected: importResult.seriesDetected,
        error: importResult.error,
      },
      latestPrices: latestPrice || [],
    });
  } catch (error) {
    console.error("FI fetch-prices error:", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Error fetching FI prices" },
      { status: 500 }
    );
  }
}
