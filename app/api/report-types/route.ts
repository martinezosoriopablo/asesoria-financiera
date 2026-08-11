// app/api/report-types/route.ts
import { NextRequest } from "next/server";
import { requireAdvisor, createAdminClient } from "@/lib/auth/api-auth";
import { applyRateLimit } from "@/lib/rate-limit";
import { successResponse, errorResponse, handleApiError } from "@/lib/api-response";

const SCOPE_KEYS = ["date", "period", "month", "perfil"];

export async function GET(request: NextRequest) {
  const blocked = await applyRateLimit(request, "report-types-get", { limit: 60, windowSeconds: 60 });
  if (blocked) return blocked;
  return handleApiError("report-types-get", async () => {
    const { error: authError } = await requireAdvisor();
    if (authError) return authError;
    const supabase = createAdminClient();
    const { data, error } = await supabase.from("report_types").select("*").order("orden");
    if (error) return errorResponse(error.message, 500);
    return successResponse({ types: data || [] });
  });
}

export async function POST(request: NextRequest) {
  const blocked = await applyRateLimit(request, "report-types-post", { limit: 10, windowSeconds: 60 });
  if (blocked) return blocked;
  return handleApiError("report-types-post", async () => {
    const { error: authError } = await requireAdvisor();
    if (authError) return authError;
    const body = await request.json();
    const { id, label, scope_key, default_usos, formatos } = body || {};
    if (!id || !/^[a-z0-9_]+$/.test(id)) return errorResponse("id inválido (usar snake_case).", 400);
    if (!label) return errorResponse("Falta label.", 400);
    if (!SCOPE_KEYS.includes(scope_key)) return errorResponse("scope_key inválido.", 400);
    const supabase = createAdminClient();
    const { data, error } = await supabase.from("report_types").insert({
      id, label, scope_key,
      default_usos: Array.isArray(default_usos) ? default_usos : [],
      formatos: Array.isArray(formatos) && formatos.length ? formatos : ["html"],
      is_custom: true, orden: 200,
    }).select().single();
    if (error) return errorResponse(error.message, 500);
    return successResponse({ type: data });
  });
}
