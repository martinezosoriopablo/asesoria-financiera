// app/api/comite/upload-report/route.ts
// Receives the full comité JSON report and transforms it into model_portfolios rows
import { NextRequest, NextResponse } from "next/server";
import { requireAdvisor, createAdminClient } from "@/lib/auth/api-auth";
import { applyRateLimit } from "@/lib/rate-limit";
import { errorResponse, handleApiError } from "@/lib/api-response";

// Map JSON profile keys → DB perfil values
const PROFILE_MAP: Record<string, string> = {
  conservador: "conservador",
  mod_conservador: "moderado_conservador",
  moderado: "moderado",
  mod_agresivo: "moderado_agresivo",
  agresivo: "agresivo",
};

// Map JSON asset_class_key → our internal categoria IDs
const CATEGORY_MAP: Record<string, string> = {
  rv_usa: "usa_large_cap",
  rv_dev_ex_us: "desarrollados_ex_us",
  rv_em: "emergentes",
  rv_chile: "chile",
  rv_small_cap_us: "rv_small_cap_us",
  rf_ust_medio: "ust_belly",
  rf_ust_corto: "ust_short",
  rf_ig: "ig_corp",
  rf_tips: "tips",
  rf_hy: "high_yield",
  rf_em_sov: "em_sovereign",
  rf_chile: "rf_chile",
  alt_gold: "gold",
  alt_reit: "reits",
  cash: "tbills",
};

interface ReportRow {
  asset_class_key: string;
  description: string;
  ticker_us: string;
  ticker_ucits: string;
  role: string;
  bench: number;
  model: number;
  delta: number;
  view: string;
  conviction: string;
  rationale: string;
  call_source?: string;
  sleeves_total?: number;
  broad_neto?: number;
  has_sleeves?: boolean;
}

interface ReportSleeve {
  sector_key: string;
  sector_name: string;
  ticker_us: string;
  ticker_ucits: string;
  satellite_weight: number;
  view: string;
  conviction: string;
  rationale: string;
}

interface ReportProfile {
  label: string;
  rows: ReportRow[];
  sleeves_sectoriales?: {
    us?: ReportSleeve[];
    europe?: ReportSleeve[];
  };
  summary: { rv: number; rf: number; alt: number; cash: number; total: number };
  tilts_applied: number;
}

interface ComiteReport {
  report_type: string;
  schema_version: string;
  fecha_iso: string;
  metadata: Record<string, unknown>;
  doctrine: Record<string, unknown>;
  council_calls: Record<string, unknown>;
  sector_calls: Record<string, unknown>;
  contra_tesis: string;
  rebalance_triggers: string[];
  profiles: Record<string, ReportProfile>;
}

function mapVista(view: string): "OW" | "UW" | "N" {
  if (view === "OW") return "OW";
  if (view === "UW") return "UW";
  return "N";
}

function mapConviction(c: string): "ALTA" | "MEDIA" | "BAJA" | null {
  if (c === "ALTA") return "ALTA";
  if (c === "MEDIA") return "MEDIA";
  if (c === "BAJA") return "BAJA";
  return null;
}

function transformRow(row: ReportRow) {
  return {
    categoria: CATEGORY_MAP[row.asset_class_key] || row.asset_class_key,
    description: row.description,
    role: row.role,
    bench_pct: row.bench,
    modelo_pct: row.model,
    broad_neto_pct: row.broad_neto ?? null,
    delta_pp: row.delta,
    vista: mapVista(row.view),
    conviction: mapConviction(row.conviction),
    etf_us: row.ticker_us || null,
    etf_ucits: row.ticker_ucits || null,
    justificacion: row.rationale || null,
    call_source: row.call_source || null,
    sleeves_total: row.sleeves_total ?? null,
  };
}

function transformSleeves(sleevesObj?: ReportProfile["sleeves_sectoriales"]) {
  if (!sleevesObj) return [];
  const result: Array<{
    region: string;
    sector: string;
    sector_name: string;
    vista: "OW" | "UW" | "N";
    conviction: "ALTA" | "MEDIA" | "BAJA" | null;
    etf_us: string | null;
    etf_ucits: string | null;
    peso_pct: number;
    tesis: string | null;
  }> = [];

  for (const [region, sleeves] of Object.entries(sleevesObj)) {
    if (!Array.isArray(sleeves)) continue;
    for (const s of sleeves) {
      result.push({
        region,
        sector: s.sector_key,
        sector_name: s.sector_name,
        vista: mapVista(s.view),
        conviction: mapConviction(s.conviction),
        etf_us: s.ticker_us || null,
        etf_ucits: s.ticker_ucits || null,
        peso_pct: s.satellite_weight,
        tesis: s.rationale || null,
      });
    }
  }
  return result;
}

function buildNotaComite(report: ComiteReport): string {
  const parts: string[] = [];

  if (report.contra_tesis) {
    parts.push(report.contra_tesis);
  }

  if (report.rebalance_triggers?.length > 0) {
    parts.push("\n## Rebalance Triggers\n");
    for (const t of report.rebalance_triggers) {
      parts.push(`- ${t}`);
    }
  }

  return parts.join("\n");
}

export async function POST(request: NextRequest) {
  const blocked = await applyRateLimit(request, "comite-upload-report", {
    limit: 5,
    windowSeconds: 60,
  });
  if (blocked) return blocked;

  const { advisor, error: authError } = await requireAdvisor();
  if (authError) return authError;

  const supabase = createAdminClient();

  return handleApiError("comite-upload-report-post", async () => {
    // Validate JSON body size (max 5 MB)
    const contentLength = parseInt(request.headers.get("content-length") || "0", 10);
    if (contentLength > 5 * 1024 * 1024) {
      return errorResponse("Archivo demasiado grande (máx 5 MB)", 400);
    }

    const contentType = request.headers.get("content-type") || "";
    if (!contentType.includes("application/json")) {
      return errorResponse("Tipo de archivo no permitido", 400);
    }

    const report: ComiteReport = await request.json();

    // Validate basic structure
    if (report.report_type !== "portfolio_recommendation") {
      return NextResponse.json(
        { success: false, error: "report_type debe ser 'portfolio_recommendation'" },
        { status: 400 }
      );
    }

    if (!report.fecha_iso || !report.profiles) {
      return NextResponse.json(
        { success: false, error: "fecha_iso y profiles son requeridos" },
        { status: 400 }
      );
    }

    const reportDate = report.fecha_iso;
    const nota = buildNotaComite(report);

    // Transform and validate each profile
    const dbRows: Array<{
      report_date: string;
      perfil: string;
      posiciones: ReturnType<typeof transformRow>[];
      sleeves: ReturnType<typeof transformSleeves>;
      nota_comite: string | null;
      created_by: string;
    }> = [];

    const unknownProfiles: string[] = [];

    for (const [jsonKey, profile] of Object.entries(report.profiles)) {
      const dbPerfil = PROFILE_MAP[jsonKey];
      if (!dbPerfil) {
        unknownProfiles.push(jsonKey);
        continue;
      }

      const posiciones = profile.rows.map(transformRow);
      const sleeves = transformSleeves(profile.sleeves_sectoriales);

      const totalModel = posiciones.reduce((s, p) => s + p.modelo_pct, 0);
      if (Math.abs(totalModel - 100) > 1.5) {
        return NextResponse.json(
          {
            success: false,
            error: `Perfil ${jsonKey}: modelo_pct suma ${totalModel.toFixed(1)}%, debe ser ~100%`,
          },
          { status: 400 }
        );
      }

      dbRows.push({
        report_date: reportDate,
        perfil: dbPerfil,
        posiciones,
        sleeves,
        nota_comite: nota || null,
        created_by: advisor!.id,
      });
    }

    if (dbRows.length === 0) {
      return NextResponse.json(
        { success: false, error: "No se encontraron perfiles válidos en el reporte" },
        { status: 400 }
      );
    }

    // Delete existing rows for this report_date (upsert)
    await supabase
      .from("model_portfolios")
      .delete()
      .eq("report_date", reportDate);

    const { data, error } = await supabase
      .from("model_portfolios")
      .insert(dbRows)
      .select("id, perfil, version, report_date");

    if (error) {
      console.error("Error inserting model portfolios:", error);
      return NextResponse.json(
        { success: false, error: `Error al guardar: ${error.message}` },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      inserted: data,
      report_date: reportDate,
      profiles_count: dbRows.length,
      ...(unknownProfiles.length > 0 && {
        warnings: [`Perfiles ignorados (no mapeados): ${unknownProfiles.join(", ")}`],
      }),
    });
  
  });
}
