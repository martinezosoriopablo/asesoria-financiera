// app/api/reports/ingest/route.ts
// Ingesta máquina-a-máquina: generadores externos (consejo de IAs, reportes de
// calendario, podcast) empujan reportes con un token compartido en vez de la
// cookie de asesor. Mismo contrato multipart que POST /api/reports.
// Auth: header `Authorization: Bearer ${REPORTS_INGEST_TOKEN}` (patrón de los crons).
import { NextRequest } from "next/server";
import { createAdminClient } from "@/lib/auth/api-auth";
import { applyRateLimit } from "@/lib/rate-limit";
import { successResponse, errorResponse, handleApiError } from "@/lib/api-response";
import { ingestReport } from "@/lib/reports/ingest";

export const maxDuration = 120;

export async function POST(request: NextRequest) {
  const blocked = await applyRateLimit(request, "reports-ingest-token", { limit: 60, windowSeconds: 60 });
  if (blocked) return blocked;

  return handleApiError("reports-ingest-token", async () => {
    const authHeader = request.headers.get("authorization");
    const token = process.env.REPORTS_INGEST_TOKEN;
    if (!token || authHeader !== `Bearer ${token}`) {
      return errorResponse("No autorizado", 401);
    }

    const supabase = createAdminClient();
    const form = await request.formData();
    const res = await ingestReport(supabase, form, null); // uploaded_by null = ingesta de máquina
    if (!res.ok) return errorResponse(res.error, res.status);
    return successResponse({ report: res.report, warning: res.warning });
  });
}
