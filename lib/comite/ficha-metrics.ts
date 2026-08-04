import type { SupabaseClient } from "@supabase/supabase-js";

export interface FichaMetrics {
  tac: number | null;
  rent_12m: number | null;
}

/**
 * Devuelve TAC (%) y rentabilidad 12M nominal (%) por `fund_run` de advisor_preferred_funds.
 * FM (fund_run "foRun-serie"): desde vw_fondos_completo (tac_sintetica, rent_12m_nominal).
 * FI (fund_run "rut-FI"): TAC desde fi_fichas.tac_serie; rent 12M no disponible (null) en esta versión.
 * Mismo criterio de parseo que /api/advisor/preferred-funds.
 */
export async function getFichaMetrics(
  supabase: SupabaseClient,
  fundRuns: string[],
): Promise<Map<string, FichaMetrics>> {
  const out = new Map<string, FichaMetrics>();
  const runs = [...new Set(fundRuns.filter(Boolean))];
  if (runs.length === 0) return out;

  const fmRuns = runs.filter((r) => !r.endsWith("-FI"));
  const fiRuns = runs.filter((r) => r.endsWith("-FI"));

  // FM: vw_fondos_completo (fo_run + fm_serie)
  if (fmRuns.length > 0) {
    const foRuns = [...new Set(fmRuns.map((r) => parseInt(r.split("-")[0], 10)))].filter((n) => n > 0);
    if (foRuns.length > 0) {
      const { data } = await (supabase as any)
        .from("vw_fondos_completo")
        .select("fo_run, fm_serie, tac_sintetica, rent_12m_nominal")
        .in("fo_run", foRuns);
      const byKey = new Map<string, { tac: number | null; rent_12m: number | null }>();
      for (const row of data || []) {
        byKey.set(`${row.fo_run}-${row.fm_serie}`, {
          tac: row.tac_sintetica ?? null,
          rent_12m: row.rent_12m_nominal ?? null,
        });
      }
      for (const fr of fmRuns) {
        const m = byKey.get(fr);
        if (m) out.set(fr, m);
      }
    }
  }

  // FI: fi_fichas (fi_rut + fi_serie), TAC solamente
  if (fiRuns.length > 0) {
    const ruts = [...new Set(fiRuns.map((r) => r.replace(/-FI$/, "")))];
    const { data } = await (supabase as any)
      .from("fi_fichas")
      .select("fi_rut, fi_serie, tac_serie")
      .in("fi_rut", ruts);
    for (const fr of fiRuns) {
      const rut = fr.replace(/-FI$/, "");
      const ficha = (data || []).find((f: any) => String(f.fi_rut) === rut);
      if (ficha) out.set(fr, { tac: ficha.tac_serie ?? null, rent_12m: null });
    }
  }

  return out;
}
