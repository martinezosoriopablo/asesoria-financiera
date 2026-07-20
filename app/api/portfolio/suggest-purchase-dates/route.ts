// app/api/portfolio/suggest-purchase-dates/route.ts
// Sugiere fecha de compra para holdings FM sin match exacto: devuelve la fecha del
// valor cuota más cercano dentro de una banda laxa, para que el asesor la confirme.
// NUNCA la aplica sola. Solo FM chilenos (RUN); no toca bonos ni internacionales.

import { NextRequest, NextResponse } from "next/server";
import { requireAdvisor, createAdminClient } from "@/lib/auth/api-auth";
import { applyRateLimit } from "@/lib/rate-limit";
import { handleApiError } from "@/lib/api-response";
import { suggestPurchaseDate, type VCPoint } from "@/lib/tax/infer-purchase-date";
import type { SupabaseClient } from "@supabase/supabase-js";

interface HoldingIn {
  index: number;
  securityId?: string | null;
  serie?: string | null;
  unitCost?: number | null;
}

async function seriesForFondo(supabase: SupabaseClient, fondoId: string): Promise<VCPoint[]> {
  const { data } = await supabase
    .from("fund_cuota_history")
    .select("fecha, valor_cuota")
    .eq("fondo_id", fondoId)
    .order("fecha", { ascending: true });
  return (data ?? [])
    .filter((r: { valor_cuota: number | null }) => r.valor_cuota != null && r.valor_cuota > 0)
    .map((r: { fecha: string; valor_cuota: number }) => ({ fecha: r.fecha, valorCuota: r.valor_cuota }));
}

// Serie de valor cuota para un FI (fondos_inversion_precios, keyed por fondo_id UUID).
// Para FI el "valor cuota" es valor_economico (fallback valor_libro).
async function seriesForFI(supabase: SupabaseClient, fondoId: string, serie: string): Promise<VCPoint[]> {
  let q = supabase
    .from("fondos_inversion_precios")
    .select("fecha, valor_economico, valor_libro")
    .eq("fondo_id", fondoId)
    .order("fecha", { ascending: true });
  if (serie) q = q.eq("serie", serie);
  const { data } = await q;
  return (data ?? [])
    .map((r: { fecha: string; valor_economico: number | null; valor_libro: number | null }) => ({
      fecha: r.fecha,
      valorCuota: (r.valor_economico ?? r.valor_libro ?? 0),
    }))
    .filter((p) => p.valorCuota > 0);
}

// Reúne todas las series candidatas para un RUN/RUT: primero FM (fondos_mutuos),
// y también FI (fondos_inversion). El namespace numérico es compartido, así que
// se prueban ambas fuentes; la exigencia de "una sola fecha" aguas arriba descarta
// colisiones que produzcan fechas distintas.
async function candidateSeries(supabase: SupabaseClient, sid: string, serie: string): Promise<VCPoint[][]> {
  const out: VCPoint[][] = [];

  // FM
  let fmQ = supabase.from("fondos_mutuos").select("id, fm_serie").eq("fo_run", parseInt(sid, 10));
  if (serie) fmQ = fmQ.eq("fm_serie", serie);
  const { data: fms } = await fmQ.limit(30);
  for (const f of (fms ?? []) as Array<{ id: string }>) {
    out.push(await seriesForFondo(supabase, f.id));
  }

  // FI
  const { data: fis } = await supabase.from("fondos_inversion").select("id").eq("rut", sid).limit(5);
  for (const f of (fis ?? []) as Array<{ id: string }>) {
    out.push(await seriesForFI(supabase, f.id, serie));
  }

  return out.filter((s) => s.length > 0);
}

export async function POST(request: NextRequest) {
  const blocked = await applyRateLimit(request, "suggest-purchase-dates", { limit: 20, windowSeconds: 60 });
  if (blocked) return blocked;

  const { error: authError } = await requireAdvisor();
  if (authError) return authError;

  return handleApiError("suggest-purchase-dates", async () => {
    const supabase = createAdminClient();
    const body = await request.json();
    const holdings: HoldingIn[] = Array.isArray(body?.holdings) ? body.holdings : [];

    const suggestions: { index: number; date: string; valorCuota: number; diffPct: number }[] = [];

    for (const h of holdings) {
      const sid = (h.securityId ?? "").toString().trim();
      if (!/^\d{3,7}$/.test(sid)) continue;
      const unitCost = h.unitCost;
      if (!unitCost || unitCost <= 0) continue;
      const serie = (h.serie ?? "").toString().trim();

      // Series candidatas de FM y FI (namespace numérico compartido)
      const candidates = await candidateSeries(supabase, sid, serie);
      if (candidates.length === 0) continue;

      // Probar cada candidato; aceptar solo si EXACTAMENTE UNO sugiere fecha (evita ambigüedad)
      const hits: { date: string; valorCuota: number; diffPct: number }[] = [];
      for (const serieVC of candidates) {
        const s = suggestPurchaseDate(unitCost, serieVC);
        if (s) hits.push(s);
      }
      const uniqueDates = Array.from(new Set(hits.map((h) => h.date)));
      if (uniqueDates.length === 1) {
        // el más cercano entre los candidatos con esa fecha
        const best = hits.filter((x) => x.date === uniqueDates[0]).sort((a, b) => a.diffPct - b.diffPct)[0];
        suggestions.push({ index: h.index, date: best.date, valorCuota: best.valorCuota, diffPct: best.diffPct });
      }
    }

    return NextResponse.json({ success: true, suggestions });
  });
}
