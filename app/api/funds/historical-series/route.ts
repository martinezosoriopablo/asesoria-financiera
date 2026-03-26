import { NextRequest, NextResponse } from "next/server";
import { requireAdvisor, createAdminClient } from "@/lib/auth/api-auth";
import { applyRateLimit } from "@/lib/rate-limit";

export async function GET(request: NextRequest) {
  const blocked = applyRateLimit(request, "fund-history", { limit: 30, windowSeconds: 60 });
  if (blocked) return blocked;

  const { error: authError } = await requireAdvisor();
  if (authError) return authError;

  const { searchParams } = new URL(request.url);
  const run = searchParams.get("run");
  const serie = searchParams.get("serie");
  const from = searchParams.get("from");
  const to = searchParams.get("to");

  if (!run) {
    return NextResponse.json({ error: "run parameter required" }, { status: 400 });
  }

  const supabase = createAdminClient();

  // Find the fondo_id from fondos_mutuos
  let query = supabase
    .from("fondos_mutuos")
    .select("id, fo_run, fm_serie, nombre_fondo, nombre_agf, moneda_funcional")
    .eq("fo_run", parseInt(run));

  if (serie) {
    query = query.ilike("fm_serie", serie);
  }

  const { data: fondos, error: fondoError } = await query;

  if (fondoError || !fondos || fondos.length === 0) {
    return NextResponse.json({ error: "Fondo no encontrado" }, { status: 404 });
  }

  // Get history for all matching series
  const results: Record<string, unknown> = {};

  for (const fondo of fondos) {
    let histQuery = supabase
      .from("fund_cuota_history")
      .select("fecha, valor_cuota, valor_cuota_orig, moneda, source")
      .eq("fondo_id", fondo.id)
      .order("fecha", { ascending: true });

    if (from) histQuery = histQuery.gte("fecha", from);
    if (to) histQuery = histQuery.lte("fecha", to);
    histQuery = histQuery.limit(2000);

    const { data: history } = await histQuery;

    // Deduplicate: prefer aafm_direct over derived for same date
    const byDate = new Map<string, typeof history extends (infer T)[] | null ? T : never>();
    for (const h of history || []) {
      const existing = byDate.get(h.fecha);
      if (!existing || h.source === "aafm_direct") {
        byDate.set(h.fecha, h);
      }
    }

    const series = Array.from(byDate.values()).map((h) => ({
      date: h.fecha,
      value: h.valor_cuota,
      valueOrig: h.valor_cuota_orig,
      currency: h.moneda,
      source: h.source,
    }));

    results[fondo.fm_serie || "TOTAL"] = {
      fund: {
        run: fondo.fo_run,
        serie: fondo.fm_serie,
        name: fondo.nombre_fondo,
        manager: fondo.nombre_agf,
        currency: fondo.moneda_funcional,
      },
      dataPoints: series.length,
      series,
    };
  }

  return NextResponse.json({ success: true, data: results });
}
