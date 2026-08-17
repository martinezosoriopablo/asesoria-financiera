import { NextRequest } from "next/server";
import { requireClientAccess, createAdminClient } from "@/lib/auth/api-auth";
import { successResponse, errorResponse, handleApiError } from "@/lib/api-response";
import { applyRateLimit } from "@/lib/rate-limit";
import { resolveTabla, pickAllowed, validateFor, EntidadKey } from "@/lib/patrimonio/entidades";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; entidad: string; itemId: string }> }
) {
  const { id, entidad, itemId } = await params;
  const rl = await applyRateLimit(request, "patrimonio-update", { limit: 60 });
  if (rl) return rl;

  const tabla = resolveTabla(entidad);
  if (!tabla) return errorResponse("Entidad de patrimonio desconocida", 404);

  const { error } = await requireClientAccess(id);
  if (error) return error;

  return handleApiError("patrimonio-update", async () => {
    const body = (await request.json()) as Record<string, unknown>;
    const v = validateFor(entidad as EntidadKey, body);
    if (!v.ok) return errorResponse(v.errors.join(" · "), 400);

    const fields = pickAllowed(entidad as EntidadKey, body);
    const supabase = createAdminClient();
    const { data, error: dbErr } = await supabase
      .from(tabla)
      .update({ ...fields, updated_at: new Date().toISOString() })
      .eq("id", itemId)
      .eq("client_id", id) // ata el ítem al cliente accesible (defensa IDOR)
      .select("*")
      .single();
    if (dbErr || !data) return errorResponse("No se pudo actualizar el registro", 404);
    return successResponse({ item: data });
  });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; entidad: string; itemId: string }> }
) {
  const { id, entidad, itemId } = await params;
  const rl = await applyRateLimit(request, "patrimonio-delete", { limit: 60 });
  if (rl) return rl;

  const tabla = resolveTabla(entidad);
  if (!tabla) return errorResponse("Entidad de patrimonio desconocida", 404);

  const { error } = await requireClientAccess(id);
  if (error) return error;

  return handleApiError("patrimonio-delete", async () => {
    const supabase = createAdminClient();
    const { error: dbErr } = await supabase
      .from(tabla)
      .delete()
      .eq("id", itemId)
      .eq("client_id", id);
    if (dbErr) return errorResponse("No se pudo eliminar el registro", 500);
    return successResponse({});
  });
}
