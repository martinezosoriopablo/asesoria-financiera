// app/api/audit/prices/route.ts
// Auditoría cruzada de precios: AAFM vs CMF
// Compara valor_cuota de ambas fuentes para detectar discrepancias

import { NextRequest, NextResponse } from "next/server";
import { requireAdvisor, createAdminClient } from "@/lib/auth/api-auth";
import { applyRateLimit } from "@/lib/rate-limit";

interface AuditRow {
  fondoId: string;
  foRun: number;
  serie: string;
  nombreFondo: string;
  nombreAgf: string;
  fecha: string;
  aafmCuota: number;
  cmfCuota: number;
  diffAbsoluta: number;
  diffPorcentaje: number;
  moneda: string;
  status: "ok" | "warning" | "error";
}

interface AuditSummary {
  fecha: string;
  totalFondos: number;
  fondosConAmbasFuentes: number;
  fondosSoloAAFM: number;
  fondosSoloCMF: number;
  coincidencias: number;
  warnings: number;
  errors: number;
  maxDiffPct: number;
  avgDiffPct: number;
  fuenteRecomendada: string;
  rows: AuditRow[];
  soloAAFM: Array<{ fondoId: string; foRun: number; serie: string; nombreFondo: string; valorCuota: number }>;
  soloCMF: Array<{ fondoId: string; foRun: number; serie: string; nombreFondo: string; valorCuota: number }>;
}

const WARNING_THRESHOLD = 0.01; // 0.01% — warn if difference exceeds this
const ERROR_THRESHOLD = 0.1;   // 0.1% — error if difference exceeds this

export async function GET(request: NextRequest) {
  const blocked = await applyRateLimit(request, "audit-prices", { limit: 10, windowSeconds: 60 });
  if (blocked) return blocked;

  const { error: authError } = await requireAdvisor();
  if (authError) return authError;

  const supabase = createAdminClient();

  try {
    const url = new URL(request.url);
    const fechaParam = url.searchParams.get("fecha");
    const limitParam = parseInt(url.searchParams.get("limit") || "500", 10);

    // If no date specified, find the most recent date with data from both sources
    let fecha = fechaParam;
    if (!fecha) {
      const { data: latestAAFM } = await supabase
        .from("fund_cuota_history")
        .select("fecha")
        .eq("source", "aafm_direct")
        .order("fecha", { ascending: false })
        .limit(1)
        .single();

      const { data: latestCMF } = await supabase
        .from("fund_cuota_history")
        .select("fecha")
        .eq("source", "cmf_cartola")
        .order("fecha", { ascending: false })
        .limit(1)
        .single();

      if (latestAAFM && latestCMF) {
        // Use the most recent date that both have
        fecha = latestAAFM.fecha <= latestCMF.fecha ? latestAAFM.fecha : latestCMF.fecha;
      } else if (latestAAFM) {
        fecha = latestAAFM.fecha;
      } else if (latestCMF) {
        fecha = latestCMF.fecha;
      } else {
        return NextResponse.json({
          success: false,
          error: "No hay datos de precios en fund_cuota_history",
        }, { status: 404 });
      }
    }

    // Fetch AAFM entries for this date
    const { data: aafmData, error: aafmErr } = await supabase
      .from("fund_cuota_history")
      .select("fondo_id, fecha, valor_cuota, moneda")
      .eq("source", "aafm_direct")
      .eq("fecha", fecha)
      .limit(2000);

    if (aafmErr) throw new Error(`Error fetching AAFM data: ${aafmErr.message}`);

    // Fetch CMF entries for this date
    const { data: cmfData, error: cmfErr } = await supabase
      .from("fund_cuota_history")
      .select("fondo_id, fecha, valor_cuota, moneda")
      .eq("source", "cmf_cartola")
      .eq("fecha", fecha)
      .limit(2000);

    if (cmfErr) throw new Error(`Error fetching CMF data: ${cmfErr.message}`);

    // Also try fondos_rentabilidades_diarias as fallback for CMF data
    // (importar-cmf.ts writes there too)
    const { data: dailyData } = await supabase
      .from("fondos_rentabilidades_diarias")
      .select("fondo_id, fecha, valor_cuota")
      .eq("fecha", fecha)
      .limit(5000);

    // Build lookup maps
    const aafmMap = new Map<string, { valor_cuota: number; moneda: string }>();
    for (const row of aafmData || []) {
      aafmMap.set(row.fondo_id, { valor_cuota: row.valor_cuota, moneda: row.moneda || "CLP" });
    }

    const cmfMap = new Map<string, { valor_cuota: number; moneda: string }>();
    for (const row of cmfData || []) {
      cmfMap.set(row.fondo_id, { valor_cuota: row.valor_cuota, moneda: row.moneda || "CLP" });
    }

    // If CMF history is empty but daily prices exist, use those as CMF proxy
    if (cmfMap.size === 0 && dailyData && dailyData.length > 0) {
      for (const row of dailyData) {
        if (!aafmMap.has(row.fondo_id)) continue; // Only compare where AAFM exists
        cmfMap.set(row.fondo_id, { valor_cuota: row.valor_cuota, moneda: "CLP" });
      }
    }

    // Load fond metadata for all involved fondo_ids
    const allFondoIds = new Set([...Array.from(aafmMap.keys()), ...Array.from(cmfMap.keys())]);
    const fondoIds = Array.from(allFondoIds);

    // Batch load fondos_mutuos metadata
    const fondoMeta = new Map<string, { fo_run: number; fm_serie: string; nombre_fondo: string; nombre_agf: string }>();
    const BATCH_SIZE = 100;
    for (let i = 0; i < fondoIds.length; i += BATCH_SIZE) {
      const batch = fondoIds.slice(i, i + BATCH_SIZE);
      const { data: meta } = await supabase
        .from("fondos_mutuos")
        .select("id, fo_run, fm_serie, nombre_fondo, nombre_agf")
        .in("id", batch);

      if (meta) {
        for (const m of meta) {
          fondoMeta.set(m.id, {
            fo_run: m.fo_run,
            fm_serie: m.fm_serie || "",
            nombre_fondo: m.nombre_fondo || "",
            nombre_agf: m.nombre_agf || "",
          });
        }
      }
    }

    // Compare
    const rows: AuditRow[] = [];
    const soloAAFM: AuditSummary["soloAAFM"] = [];
    const soloCMF: AuditSummary["soloCMF"] = [];

    for (const fondoId of fondoIds) {
      const meta = fondoMeta.get(fondoId);
      const aafm = aafmMap.get(fondoId);
      const cmf = cmfMap.get(fondoId);

      if (aafm && cmf) {
        const diff = Math.abs(aafm.valor_cuota - cmf.valor_cuota);
        const avgCuota = (aafm.valor_cuota + cmf.valor_cuota) / 2;
        const diffPct = avgCuota > 0 ? (diff / avgCuota) * 100 : 0;

        let status: AuditRow["status"] = "ok";
        if (diffPct > ERROR_THRESHOLD) status = "error";
        else if (diffPct > WARNING_THRESHOLD) status = "warning";

        rows.push({
          fondoId,
          foRun: meta?.fo_run || 0,
          serie: meta?.fm_serie || "",
          nombreFondo: meta?.nombre_fondo || "",
          nombreAgf: meta?.nombre_agf || "",
          fecha: fecha!,
          aafmCuota: aafm.valor_cuota,
          cmfCuota: cmf.valor_cuota,
          diffAbsoluta: Math.round(diff * 10000) / 10000,
          diffPorcentaje: Math.round(diffPct * 10000) / 10000,
          moneda: aafm.moneda,
          status,
        });
      } else if (aafm && !cmf) {
        soloAAFM.push({
          fondoId,
          foRun: meta?.fo_run || 0,
          serie: meta?.fm_serie || "",
          nombreFondo: meta?.nombre_fondo || "",
          valorCuota: aafm.valor_cuota,
        });
      } else if (!aafm && cmf) {
        soloCMF.push({
          fondoId,
          foRun: meta?.fo_run || 0,
          serie: meta?.fm_serie || "",
          nombreFondo: meta?.nombre_fondo || "",
          valorCuota: cmf.valor_cuota,
        });
      }
    }

    // Sort rows: errors first, then warnings, then ok
    const statusOrder = { error: 0, warning: 1, ok: 2 };
    rows.sort((a, b) => statusOrder[a.status] - statusOrder[b.status] || b.diffPorcentaje - a.diffPorcentaje);

    const limitedRows = rows.slice(0, limitParam);

    // Summary stats
    const diffs = rows.map((r) => r.diffPorcentaje);
    const summary: AuditSummary = {
      fecha: fecha!,
      totalFondos: fondoIds.length,
      fondosConAmbasFuentes: rows.length,
      fondosSoloAAFM: soloAAFM.length,
      fondosSoloCMF: soloCMF.length,
      coincidencias: rows.filter((r) => r.status === "ok").length,
      warnings: rows.filter((r) => r.status === "warning").length,
      errors: rows.filter((r) => r.status === "error").length,
      maxDiffPct: diffs.length > 0 ? Math.max(...diffs) : 0,
      avgDiffPct: diffs.length > 0
        ? Math.round((diffs.reduce((a, b) => a + b, 0) / diffs.length) * 10000) / 10000
        : 0,
      fuenteRecomendada: buildRecommendation(rows, aafmMap.size, cmfMap.size),
      rows: limitedRows,
      soloAAFM: soloAAFM.slice(0, 50),
      soloCMF: soloCMF.slice(0, 50),
    };

    return NextResponse.json({ success: true, audit: summary });
  } catch (error) {
    console.error("Error in audit/prices:", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Error en auditoría" },
      { status: 500 }
    );
  }
}

function buildRecommendation(
  rows: AuditRow[],
  aafmCount: number,
  cmfCount: number
): string {
  const errorCount = rows.filter((r) => r.status === "error").length;
  const totalMatched = rows.length;

  if (totalMatched === 0) {
    if (cmfCount > aafmCount) return "CMF como fuente principal (cobertura completa de todos los fondos registrados).";
    if (aafmCount > cmfCount) return "AAFM disponible, pero importar CMF para cobertura completa.";
    return "Sin datos suficientes. Importar CMF cartola diaria con: npx tsx scripts/importar-cmf.ts";
  }

  if (errorCount === 0) {
    return `Ambas fuentes son consistentes. CMF es la fuente principal (cubre 2500+ fondos vs ~1000 de AAFM). AAFM complementa con rentabilidades pre-calculadas.`;
  }

  if (errorCount / totalMatched < 0.05) {
    return `Fuentes mayormente consistentes (${errorCount} discrepancias de ${totalMatched}). CMF principal por cobertura, AAFM para rentabilidades.`;
  }

  return `Hay ${errorCount} discrepancias significativas. Revisar fondos con status 'error'. CMF es la fuente regulatoria oficial.`;
}
