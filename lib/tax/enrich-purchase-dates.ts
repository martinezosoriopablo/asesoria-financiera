// Rellena holding.purchaseDate infiriéndola del unitCost vs valor cuota historico.
// Resuelve el fondo por fo_run (+serie); si no hay serie explicita, prueba todas
// las series y solo acepta cuando EXACTAMENTE UNA produce una fecha (evita ambiguo).

import type { SupabaseClient } from "@supabase/supabase-js";
import { inferPurchaseDate, type VCPoint } from "./infer-purchase-date";

interface EnrichableHolding {
  securityId?: string | null;
  serie?: string | null;
  unitCost?: number | null;
  purchaseDate?: string | null;
  [key: string]: unknown;
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

export async function enrichPurchaseDates(
  holdings: EnrichableHolding[],
  supabase: SupabaseClient,
): Promise<number> {
  let filled = 0;
  for (const h of holdings) {
    if (h.purchaseDate) continue;
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

    // Probar cada candidato; aceptar solo si EXACTAMENTE UNO produce fecha.
    const hits: string[] = [];
    for (const f of fondos as Array<{ id: string }>) {
      const serieVC = await seriesForFondo(supabase, f.id);
      const inferred = inferPurchaseDate(unitCost, serieVC);
      if (inferred) hits.push(inferred.date);
    }
    const uniqueDates = Array.from(new Set(hits));
    if (uniqueDates.length === 1) {
      h.purchaseDate = uniqueDates[0];
      filled++;
    }
  }
  return filled;
}
