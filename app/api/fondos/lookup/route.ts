// GET /api/fondos/lookup?q=searchterm — Search fondos with latest price + history
// GET /api/fondos/lookup?id=uuid — Get single fondo detail with price history

import { NextRequest, NextResponse } from "next/server";
import { requireAdvisor, createAdminClient } from "@/lib/auth/api-auth";
import { sanitizeSearchInput } from "@/lib/sanitize";
import { applyRateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const blocked = await applyRateLimit(request, "fondos-lookup", { limit: 30, windowSeconds: 60 });
  if (blocked) return blocked;

  const { error: authError } = await requireAdvisor();
  if (authError) return authError;

  const supabase = createAdminClient();
  const params = request.nextUrl.searchParams;
  const id = params.get("id");
  const q = params.get("q");
  const dias = parseInt(params.get("dias") || "10", 10);

  try {
    // Mode 1: Get single fondo detail
    if (id) {
      const { data: fondo, error } = await supabase
        .from("fondos_mutuos")
        .select("id, fo_run, fm_serie, nombre_fondo, nombre_agf, moneda_funcional, familia_estudios, clase_inversionista")
        .eq("id", id)
        .single();

      if (error || !fondo) {
        return NextResponse.json({ success: false, error: "Fondo no encontrado" }, { status: 404 });
      }

      // Get price history
      const { data: prices } = await supabase
        .from("fondos_rentabilidades_diarias")
        .select("fecha, valor_cuota, rent_diaria")
        .eq("fondo_id", id)
        .order("fecha", { ascending: false })
        .limit(dias);

      // Get aggregated rentabilities
      const { data: rentAgg } = await supabase
        .from("fondos_rentabilidades_latest")
        .select("*")
        .eq("fondo_id", id)
        .limit(1)
        .maybeSingle();

      const priceList = (prices || []).reverse();
      const latest = priceList.length > 0 ? priceList[priceList.length - 1] : null;
      const prev = priceList.length > 1 ? priceList[priceList.length - 2] : null;

      return NextResponse.json({
        success: true,
        fondo: {
          ...fondo,
          precio_actual: latest?.valor_cuota || null,
          fecha_precio: latest?.fecha || null,
          variacion_diaria: latest?.rent_diaria || (prev && latest ? ((latest.valor_cuota - prev.valor_cuota) / prev.valor_cuota) * 100 : null),
          dias_desactualizado: latest ? daysSince(latest.fecha) : null,
        },
        precios: priceList,
        rentabilidades: rentAgg || null,
      });
    }

    // Mode 2: Search fondos
    if (!q || q.length < 2) {
      return NextResponse.json({ success: false, error: "Búsqueda debe tener al menos 2 caracteres" }, { status: 400 });
    }

    const sanitized = sanitizeSearchInput(q);
    const isNumeric = /^\d+$/.test(q.trim());

    let query = supabase
      .from("fondos_mutuos")
      .select("id, fo_run, fm_serie, nombre_fondo, nombre_agf, moneda_funcional")
      .limit(30);

    if (isNumeric) {
      query = query.eq("fo_run", parseInt(q.trim(), 10));
    } else {
      query = query.or(`nombre_fondo.ilike.%${sanitized}%,nombre_agf.ilike.%${sanitized}%,fm_serie.ilike.%${sanitized}%`);
    }

    const { data: fondos, error: fondosError } = await query;

    if (fondosError) {
      return NextResponse.json({ success: false, error: fondosError.message }, { status: 500 });
    }

    if (!fondos || fondos.length === 0) {
      return NextResponse.json({ success: true, results: [] });
    }

    // Get latest price for each fondo
    const fondoIds = fondos.map(f => f.id);
    const { data: allPrices } = await supabase
      .from("fondos_rentabilidades_diarias")
      .select("fondo_id, fecha, valor_cuota, rent_diaria")
      .in("fondo_id", fondoIds)
      .order("fecha", { ascending: false });

    // Group: latest price per fondo
    const latestByFondo: Record<string, { fecha: string; valor_cuota: number; rent_diaria: number | null }> = {};
    if (allPrices) {
      for (const p of allPrices) {
        if (!latestByFondo[p.fondo_id]) {
          latestByFondo[p.fondo_id] = { fecha: p.fecha, valor_cuota: p.valor_cuota, rent_diaria: p.rent_diaria };
        }
      }
    }

    const results = fondos.map(f => {
      const latest = latestByFondo[f.id];
      return {
        id: f.id,
        fo_run: f.fo_run,
        fm_serie: f.fm_serie,
        nombre_fondo: f.nombre_fondo,
        nombre_agf: f.nombre_agf,
        moneda: f.moneda_funcional || "CLP",
        precio_actual: latest?.valor_cuota || null,
        fecha_precio: latest?.fecha || null,
        variacion_diaria: latest?.rent_diaria || null,
        dias_desactualizado: latest ? daysSince(latest.fecha) : null,
      };
    });

    // Sort: those with prices first, then by name
    results.sort((a, b) => {
      if (a.precio_actual && !b.precio_actual) return -1;
      if (!a.precio_actual && b.precio_actual) return 1;
      return (a.nombre_fondo || "").localeCompare(b.nombre_fondo || "");
    });

    return NextResponse.json({ success: true, results });
  } catch (error) {
    console.error("Fondos lookup error:", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Error en consulta" },
      { status: 500 }
    );
  }
}

function daysSince(dateStr: string): number {
  const d = new Date(dateStr);
  const now = new Date();
  return Math.floor((now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24));
}
