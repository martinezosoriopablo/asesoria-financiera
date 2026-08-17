// API: GET /api/monthly-reports?month=2026-05  — fetch report
//       POST /api/monthly-reports               — upload report HTML
//
// Re-apuntado al repositorio unificado (tabla `reports`, type='cierre_mensual',
// period=month 'YYYY-MM'). Antes escribía/leía la tabla legacy monthly_reports,
// por lo que el mensual no aparecía en /advisor/reportes. Se conserva el mismo
// shape de respuesta { id, month, title, html_content, created_at } para no
// tocar los consumidores (MonthlyReportSection, reporte-mensual/[month],
// ClientMonthlyClosing).
import { NextRequest } from "next/server";
import { requireAdvisor, createAdminClient } from "@/lib/auth/api-auth";
import { successResponse, errorResponse } from "@/lib/api-response";
import { handleApiError } from "@/lib/api-response";

type ReportRow = {
  id: string;
  period: string | null;
  title: string | null;
  content_html?: string | null;
  created_at: string;
};

// reports (repositorio) → shape legacy que espera la UI del mensual.
function toMonthly(r: ReportRow) {
  return {
    id: r.id,
    month: r.period,
    title: r.title,
    html_content: r.content_html ?? null,
    created_at: r.created_at,
  };
}

export async function GET(req: NextRequest) {
  return handleApiError("monthly-reports-get", async () => {
    const { error } = await requireAdvisor();
    if (error) return error;

    const month = req.nextUrl.searchParams.get("month");
    const sb = createAdminClient();

    if (month) {
      // Vigente del mes (última versión por period) desde la vista unificada.
      const { data, error: dbErr } = await sb
        .from("vw_reports_vigentes")
        .select("id, period, title, content_html, created_at")
        .eq("type", "cierre_mensual")
        .eq("period", month)
        .maybeSingle();

      if (dbErr || !data) {
        return successResponse({ report: null });
      }
      return successResponse({ report: toMonthly(data as ReportRow) });
    }

    // Lista de meses (sin content_html) — vigentes por period.
    const { data, error: dbErr } = await sb
      .from("vw_reports_vigentes")
      .select("id, period, title, created_at")
      .eq("type", "cierre_mensual")
      .order("period", { ascending: false })
      .limit(24);

    if (dbErr) return errorResponse("Error al obtener reportes", 500);
    return successResponse({ reports: (data || []).map((r) => toMonthly(r as ReportRow)) });
  });
}

export async function POST(req: NextRequest) {
  return handleApiError("monthly-reports-upload", async () => {
    const { advisor, error } = await requireAdvisor();
    if (error) return error;

    const { month, title, html_content } = await req.json();

    if (!month || !html_content) {
      return errorResponse("Faltan campos: month, html_content", 400);
    }

    // Validate month format YYYY-MM
    if (!/^\d{4}-\d{2}$/.test(month)) {
      return errorResponse("Formato de mes inválido. Use YYYY-MM", 400);
    }

    const sb = createAdminClient();

    // Extract title from HTML if not provided
    let reportTitle = title;
    if (!reportTitle) {
      const titleMatch = html_content.match(/<title[^>]*>([^<]+)<\/title>/i);
      reportTitle = titleMatch?.[1] || `Reporte Mensual ${month}`;
    }

    // Insertar como nueva versión del cierre_mensual del mes en el repositorio
    // unificado. La vista vw_reports_vigentes toma automáticamente la más
    // reciente por (type, period). report_date = día 1 del mes.
    const { data, error: dbErr } = await sb
      .from("reports")
      .insert({
        type: "cierre_mensual",
        title: reportTitle,
        report_date: `${month}-01`,
        period: month,
        content_html: html_content,
        uploaded_by: advisor!.id,
      })
      .select("id, period, title, content_html, created_at")
      .single();

    if (dbErr) {
      return errorResponse(`Error al guardar: ${dbErr.message}`, 500);
    }

    return successResponse({ report: toMonthly(data as ReportRow) }, 201);
  });
}
