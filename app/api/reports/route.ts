// app/api/reports/route.ts
// POST: ingesta unificada de un reporte (html/json/pdf/mp3). GET: listar (vigentes o historial).
import { NextRequest } from "next/server";
import { requireAdvisor, createAdminClient } from "@/lib/auth/api-auth";
import { applyRateLimit } from "@/lib/rate-limit";
import { successResponse, errorResponse, handleApiError } from "@/lib/api-response";
import { ingestReport } from "@/lib/reports/ingest";

export const maxDuration = 120;

export async function POST(request: NextRequest) {
  const blocked = await applyRateLimit(request, "reports-ingest", { limit: 20, windowSeconds: 60 });
  if (blocked) return blocked;

  return handleApiError("reports-post", async () => {
    const { user, advisor, error: authError } = await requireAdvisor();
    if (authError) return authError;

    const supabase = createAdminClient();
    const form = await request.formData();
    const res = await ingestReport(supabase, form, advisor?.id ?? user?.id ?? null);
    if (!res.ok) return errorResponse(res.error, res.status);
    return successResponse({ report: res.report, warning: res.warning });
  });
}

export async function GET(request: NextRequest) {
  const blocked = await applyRateLimit(request, "reports-list", { limit: 60, windowSeconds: 60 });
  if (blocked) return blocked;

  return handleApiError("reports-get", async () => {
    const { error: authError } = await requireAdvisor();
    if (authError) return authError;
    const supabase = createAdminClient();
    const sp = request.nextUrl.searchParams;
    const type = sp.get("type");
    const vigente = sp.get("vigente") === "true";
    const fromTable = vigente ? "vw_reports_vigentes" : "reports";

    let q = supabase.from(fromTable).select("*").order("report_date", { ascending: false }).limit(200);
    if (type) q = q.eq("type", type);
    const desde = sp.get("desde");
    const hasta = sp.get("hasta");
    if (desde) q = q.gte("report_date", desde);
    if (hasta) q = q.lte("report_date", hasta);

    const { data, error } = await q;
    if (error) return errorResponse(error.message, 500);
    return successResponse({ reports: data || [] });
  });
}
