// app/api/reports/[id]/route.ts
import { NextRequest } from "next/server";
import { requireAdvisor, createAdminClient } from "@/lib/auth/api-auth";
import { applyRateLimit } from "@/lib/rate-limit";
import { successResponse, errorResponse, handleApiError } from "@/lib/api-response";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const blocked = await applyRateLimit(request, "reports-get-one", { limit: 60, windowSeconds: 60 });
  if (blocked) return blocked;
  return handleApiError("reports-id-get", async () => {
    const { error: authError } = await requireAdvisor();
    if (authError) return authError;
    const { id } = await params;
    const supabase = createAdminClient();
    const { data, error } = await supabase.from("reports").select("*").eq("id", id).maybeSingle();
    if (error) return errorResponse(error.message, 500);
    if (!data) return errorResponse("Reporte no encontrado", 404);
    let pdf_signed_url: string | null = null;
    if (data.pdf_url) {
      const { data: signed } = await supabase.storage.from("reports").createSignedUrl(data.pdf_url, 60 * 60);
      pdf_signed_url = signed?.signedUrl ?? null;
    }
    return successResponse({ report: { ...data, pdf_signed_url } });
  });
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const blocked = await applyRateLimit(request, "reports-delete", { limit: 20, windowSeconds: 60 });
  if (blocked) return blocked;
  return handleApiError("reports-id-delete", async () => {
    const { error: authError } = await requireAdvisor();
    if (authError) return authError;
    const { id } = await params;
    const supabase = createAdminClient();
    const { error } = await supabase.from("reports").delete().eq("id", id);
    if (error) return errorResponse(error.message, 500);
    return successResponse({ deleted: id });
  });
}
