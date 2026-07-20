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

      let fondoQuery = supabase
        .from("fondos_mutuos")
        .select("id, fm_serie")
        .eq("fo_run", parseInt(sid, 10));
      const serie = (h.serie ?? "").toString().trim();
      if (serie) fondoQuery = fondoQuery.eq("fm_serie", serie);

      const { data: fondos } = await fondoQuery.limit(30);
      if (!fondos || fondos.length === 0) continue;

      // Probar cada candidato; aceptar solo si EXACTAMENTE UNO sugiere fecha (evita ambigüedad)
      const hits: { date: string; valorCuota: number; diffPct: number }[] = [];
      for (const f of fondos as Array<{ id: string }>) {
        const serieVC = await seriesForFondo(supabase, f.id);
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
