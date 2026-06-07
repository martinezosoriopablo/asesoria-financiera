// app/api/fondos/fichas-batch/route.ts
// Batch fetch fichas by fo_run list — used by analisis-cartola to enrich holdings

import { NextRequest, NextResponse } from "next/server";
import { requireAdvisor, createAdminClient } from "@/lib/auth/api-auth";
import { applyRateLimit } from "@/lib/rate-limit";
import { handleApiError } from "@/lib/api-response";

export async function POST(request: NextRequest) {
  const blocked = await applyRateLimit(request, "fichas-batch", { limit: 10, windowSeconds: 60 });
  if (blocked) return blocked;

  const { error: authError } = await requireAdvisor();
  if (authError) return authError;

  const supabase = createAdminClient();

  return handleApiError("fichas-batch-post", async () => {
    const { holdings } = await request.json();

    // Accept array of { run, serie? } objects or plain run numbers
    if (!Array.isArray(holdings) || holdings.length === 0) {
      return NextResponse.json({ success: true, fichas: {} });
    }

    // Normalize to { run, serie } objects, limit to 100
    const holdingList = holdings.slice(0, 100).map((h: number | { run: number; serie?: string }) => {
      if (typeof h === "number") return { run: h, serie: undefined };
      return { run: Number(h.run), serie: h.serie || undefined };
    }).filter((h: { run: number }) => !isNaN(h.run) && h.run > 0);

    if (holdingList.length === 0) {
      return NextResponse.json({ success: true, fichas: {} });
    }

    const runList = [...new Set(holdingList.map((h: { run: number }) => h.run))];

    // Build serie lookup: run -> serie (from seguimiento match)
    const serieByRun: Record<number, string> = {};
    for (const h of holdingList) {
      if (h.serie) serieByRun[h.run] = h.serie;
    }

    // Fetch fund_fichas
    const { data: fichas } = await supabase
      .from("fund_fichas")
      .select("fo_run, fm_serie, tac_serie, nombre_fondo_pdf, serie_detectada, rent_1m, rent_3m, rent_6m, rent_12m, rescatable, plazo_rescate, horizonte_inversion, tolerancia_riesgo, objetivo, beneficio_107lir, beneficio_108lir, beneficio_apv, beneficio_57bis")
      .in("fo_run", runList);

    // Fetch from vw_fondos_completo for fund metadata (nombre, AGF, TAC, rentabilidades)
    const { data: fondos } = await supabase
      .from("vw_fondos_completo")
      .select("fo_run, fm_serie, nombre_fondo, nombre_agf, familia_estudios, clase_inversionista, tac_sintetica, rent_30d_nominal, rent_3m_nominal, rent_12m_nominal, pat_total")
      .in("fo_run", runList);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result: Record<number, { ficha: any; fondo: any }> = {};

    // Group fichas by fo_run — prefer exact serie match from seguimiento
    for (const f of fichas || []) {
      const wantedSerie = serieByRun[f.fo_run];
      if (!result[f.fo_run]) {
        result[f.fo_run] = { ficha: f, fondo: null };
      } else if (wantedSerie && f.fm_serie === wantedSerie) {
        // Exact serie match overrides previous
        result[f.fo_run].ficha = f;
      }
    }

    // Group fondos by fo_run — prefer exact serie match
    for (const f of fondos || []) {
      const wantedSerie = serieByRun[f.fo_run];
      if (result[f.fo_run]) {
        if (!result[f.fo_run].fondo) {
          result[f.fo_run].fondo = f;
        } else if (wantedSerie && f.fm_serie === wantedSerie) {
          result[f.fo_run].fondo = f;
        }
      } else {
        result[f.fo_run] = { ficha: null, fondo: f };
      }
    }

    return NextResponse.json({ success: true, fichas: result });
  });
}
