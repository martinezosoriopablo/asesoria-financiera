// GET /api/fondos-inversion/lookup?q=searchterm — Search FI with latest prices
// GET /api/fondos-inversion/lookup?id=uuid&dias=N — Single FI detail with history (all series)

import { NextRequest, NextResponse } from "next/server";
import { requireAdvisor, createAdminClient } from "@/lib/auth/api-auth";
import { sanitizeSearchInput } from "@/lib/sanitize";
import { applyRateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

function daysSince(dateStr: string): number {
  const d = new Date(dateStr);
  const now = new Date();
  return Math.floor((now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24));
}

export async function GET(request: NextRequest) {
  const blocked = await applyRateLimit(request, "fondos-inversion-lookup", { limit: 30, windowSeconds: 60 });
  if (blocked) return blocked;

  const { error: authError } = await requireAdvisor();
  if (authError) return authError;

  const supabase = createAdminClient();
  const params = request.nextUrl.searchParams;
  const id = params.get("id");
  const q = params.get("q");
  const dias = parseInt(params.get("dias") || "15", 10);

  try {
    // Mode 1: Single FI detail
    if (id) {
      const { data: fondo, error } = await supabase
        .from("fondos_inversion")
        .select("id, rut, nombre, administradora, tipo, moneda, series_detectadas, ultimo_sync, ultimo_sync_ok")
        .eq("id", id)
        .single();

      if (error || !fondo) {
        return NextResponse.json({ success: false, error: "Fondo no encontrado" }, { status: 404 });
      }

      // All price history for all series (limit dias days back)
      const fromDate = new Date();
      fromDate.setDate(fromDate.getDate() - dias);
      const { data: precios } = await supabase
        .from("fondos_inversion_precios")
        .select("serie, fecha, valor_libro, valor_economico, patrimonio_neto, activo_total, n_aportantes, rent_diaria, moneda")
        .eq("fondo_id", id)
        .gte("fecha", fromDate.toISOString().slice(0, 10))
        .order("fecha", { ascending: false })
        .order("serie");

      // Group by serie, latest per serie
      const latestBySerie: Record<string, { fecha: string; valor_libro: number; rent_diaria: number | null }> = {};
      if (precios) {
        for (const p of precios) {
          if (!latestBySerie[p.serie]) {
            latestBySerie[p.serie] = {
              fecha: p.fecha,
              valor_libro: Number(p.valor_libro),
              rent_diaria: p.rent_diaria != null ? Number(p.rent_diaria) : null,
            };
          }
        }
      }

      return NextResponse.json({
        success: true,
        fondo: {
          ...fondo,
          series_precios: latestBySerie,
        },
        precios: precios || [],
      });
    }

    // Mode 2: Search
    if (!q || q.length < 2) {
      return NextResponse.json({ success: false, error: "Búsqueda debe tener al menos 2 caracteres" }, { status: 400 });
    }

    const sanitized = sanitizeSearchInput(q);
    const isNumeric = /^\d+$/.test(q.trim());

    let query = supabase
      .from("fondos_inversion")
      .select("id, rut, nombre, administradora, tipo, moneda, series_detectadas")
      .eq("activo", true)
      .limit(30);

    if (isNumeric) {
      query = query.eq("rut", q.trim());
    } else {
      query = query.or(`nombre.ilike.%${sanitized}%,administradora.ilike.%${sanitized}%`);
    }

    const { data: fondos, error: fondosError } = await query;

    if (fondosError) {
      return NextResponse.json({ success: false, error: fondosError.message }, { status: 500 });
    }

    if (!fondos || fondos.length === 0) {
      return NextResponse.json({ success: true, results: [] });
    }

    // Latest price per fondo (pick primary series — first alphabetical — or any with data)
    const fondoIds = fondos.map(f => f.id);
    const { data: allPrices } = await supabase
      .from("fondos_inversion_precios")
      .select("fondo_id, serie, fecha, valor_libro, rent_diaria")
      .in("fondo_id", fondoIds)
      .order("fecha", { ascending: false });

    // Group: latest price per fondo (any series with the most recent fecha, prefer serie 'A')
    const latestByFondo: Record<string, { serie: string; fecha: string; valor_libro: number; rent_diaria: number | null }> = {};
    if (allPrices) {
      for (const p of allPrices) {
        const existing = latestByFondo[p.fondo_id];
        if (!existing) {
          latestByFondo[p.fondo_id] = {
            serie: p.serie,
            fecha: p.fecha,
            valor_libro: Number(p.valor_libro),
            rent_diaria: p.rent_diaria != null ? Number(p.rent_diaria) : null,
          };
        } else if (existing.fecha === p.fecha && p.serie === 'A' && existing.serie !== 'A') {
          // Prefer serie A on ties
          latestByFondo[p.fondo_id] = {
            serie: p.serie,
            fecha: p.fecha,
            valor_libro: Number(p.valor_libro),
            rent_diaria: p.rent_diaria != null ? Number(p.rent_diaria) : null,
          };
        }
      }
    }

    const results = fondos.map(f => {
      const latest = latestByFondo[f.id];
      return {
        id: f.id,
        rut: f.rut,
        nombre: f.nombre,
        administradora: f.administradora,
        tipo: f.tipo,
        moneda: f.moneda || "CLP",
        series_disponibles: f.series_detectadas || [],
        serie_mostrada: latest?.serie || null,
        precio_actual: latest?.valor_libro || null,
        fecha_precio: latest?.fecha || null,
        variacion_diaria: latest?.rent_diaria || null,
        dias_desactualizado: latest ? daysSince(latest.fecha) : null,
      };
    });

    results.sort((a, b) => {
      if (a.precio_actual && !b.precio_actual) return -1;
      if (!a.precio_actual && b.precio_actual) return 1;
      return (a.nombre || "").localeCompare(b.nombre || "");
    });

    return NextResponse.json({ success: true, results });
  } catch (error) {
    console.error("FI lookup error:", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Error en consulta" },
      { status: 500 }
    );
  }
}
