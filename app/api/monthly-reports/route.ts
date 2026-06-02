// API: GET /api/monthly-reports?month=2026-05  — fetch report
//       POST /api/monthly-reports               — upload report HTML
import { NextRequest } from "next/server";
import { requireAdvisor, createAdminClient } from "@/lib/auth/api-auth";
import { successResponse, errorResponse } from "@/lib/api-response";
import { handleApiError } from "@/lib/api-response";

export async function GET(req: NextRequest) {
  return handleApiError("monthly-reports-get", async () => {
    const { error } = await requireAdvisor();
    if (error) return error;

    const month = req.nextUrl.searchParams.get("month");
    const sb = createAdminClient();

    if (month) {
      const { data, error: dbErr } = await sb
        .from("monthly_reports")
        .select("id, month, title, html_content, created_at")
        .eq("month", month)
        .single();

      if (dbErr || !data) {
        return successResponse({ report: null });
      }
      return successResponse({ report: data });
    }

    // List all months (without html_content for efficiency)
    const { data, error: dbErr } = await sb
      .from("monthly_reports")
      .select("id, month, title, created_at")
      .order("month", { ascending: false })
      .limit(24);

    if (dbErr) return errorResponse("Error al obtener reportes", 500);
    return successResponse({ reports: data || [] });
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

    const { data, error: dbErr } = await sb
      .from("monthly_reports")
      .upsert(
        {
          month,
          title: reportTitle,
          html_content,
          uploaded_by: advisor!.id,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "month" }
      )
      .select("id, month, title")
      .single();

    if (dbErr) {
      return errorResponse(`Error al guardar: ${dbErr.message}`, 500);
    }

    return successResponse({ report: data }, 201);
  });
}
