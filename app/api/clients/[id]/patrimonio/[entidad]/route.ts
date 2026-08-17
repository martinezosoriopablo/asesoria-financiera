import { NextRequest } from "next/server";
import { requireClientAccess, createAdminClient } from "@/lib/auth/api-auth";
import { successResponse, errorResponse, handleApiError } from "@/lib/api-response";
import { applyRateLimit } from "@/lib/rate-limit";
import { resolveTabla, pickAllowed, validateFor, EntidadKey } from "@/lib/patrimonio/entidades";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; entidad: string }> }
) {
  const { id, entidad } = await params;
  const rl = await applyRateLimit(request, "patrimonio-create", { limit: 30 });
  if (rl) return rl;

  const tabla = resolveTabla(entidad);
  if (!tabla) return errorResponse("Entidad de patrimonio desconocida", 404);

  const { advisor, error } = await requireClientAccess(id);
  if (error) return error;

  return handleApiError("patrimonio-create", async () => {
    const body = (await request.json()) as Record<string, unknown>;
    const v = validateFor(entidad as EntidadKey, body);
    if (!v.ok) return errorResponse(v.errors.join(" · "), 400);

    const fields = pickAllowed(entidad as EntidadKey, body);
    const supabase = createAdminClient();
    const { data, error: dbErr } = await supabase
      .from(tabla)
      .insert({ ...fields, client_id: id, created_by: advisor!.id })
      .select("*")
      .single();
    if (dbErr) return errorResponse("No se pudo crear el registro", 500);
    return successResponse({ item: data });
  });
}
