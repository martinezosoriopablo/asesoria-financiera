// lib/prices/chilean-fund-series.ts
// Serie de valor cuota (CLP) de un fondo chileno por RUN, para revalorizar
// posiciones recomendadas que resolveSource rutea a "cmf" (RUN numérico).
// Reusa el mismo camino que prices-at-date/historical-prices:
//   FM: fondos_mutuos(fo_run) → fondos_rentabilidades_diarias(valor_cuota)
//   FI: fondos_inversion(rut) → fondos_inversion_precios(valor_libro)
import type { DailyPrice } from "@/lib/prices/types";

// Estructura mínima que necesitamos del admin client (encadenable, awaitable).
type SupabaseLike = { from: (table: string) => any };

/** RUN chileno = 3-6 dígitos. Excluye tickers alfa y CUSIP/ISIN (9/12 chars). */
export function isChileanRun(ticker: string): boolean {
  return /^\d{3,6}$/.test(ticker.trim());
}

export async function getChileanFundSeries(
  supabase: SupabaseLike,
  run: string,
  fromDate: string,
  toDate: string
): Promise<DailyPrice[]> {
  const runNum = Number(run);

  // FM: fondos_mutuos (fo_run) → id → fondos_rentabilidades_diarias
  const { data: fm } = await supabase
    .from("fondos_mutuos").select("id").eq("fo_run", runNum).limit(1);
  if (fm && fm.length > 0) {
    const { data: rows } = await supabase
      .from("fondos_rentabilidades_diarias")
      .select("valor_cuota, fecha")
      .eq("fondo_id", fm[0].id)
      .gte("fecha", fromDate).lte("fecha", toDate)
      .order("fecha", { ascending: true });
    const series = (rows || [])
      .filter((r: any) => r.valor_cuota > 0)
      .map((r: any) => ({ date: r.fecha as string, price: Number(r.valor_cuota) }));
    if (series.length > 0) return series;
  }

  // FI: fondos_inversion (rut) → id → fondos_inversion_precios (valor_libro)
  const { data: fi } = await supabase
    .from("fondos_inversion").select("id").eq("rut", String(run)).limit(1);
  if (fi && fi.length > 0) {
    const { data: rows } = await supabase
      .from("fondos_inversion_precios")
      .select("valor_libro, fecha")
      .eq("fondo_id", fi[0].id)
      .gte("fecha", fromDate).lte("fecha", toDate)
      .order("fecha", { ascending: true });
    return (rows || [])
      .filter((r: any) => r.valor_libro > 0)
      .map((r: any) => ({ date: r.fecha as string, price: Number(r.valor_libro) }));
  }

  return [];
}
