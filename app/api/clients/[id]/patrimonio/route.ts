import { NextRequest } from "next/server";
import { requireClientAccess, createAdminClient } from "@/lib/auth/api-auth";
import { successResponse, errorResponse, handleApiError } from "@/lib/api-response";
import { applyRateLimit } from "@/lib/rate-limit";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const rl = await applyRateLimit(request, "patrimonio-get", { limit: 60 });
  if (rl) return rl;

  const { error } = await requireClientAccess(id);
  if (error) return error;

  return handleApiError("patrimonio-get", async () => {
    const supabase = createAdminClient();
    const [seguros, inmuebles, activos] = await Promise.all([
      supabase.from("client_seguros").select("*").eq("client_id", id).order("created_at", { ascending: true }),
      supabase.from("client_inmuebles").select("*").eq("client_id", id).order("created_at", { ascending: true }),
      supabase.from("client_activos_financieros").select("*").eq("client_id", id).order("created_at", { ascending: true }),
    ]);
    if (seguros.error || inmuebles.error || activos.error) {
      return errorResponse("Error al cargar el patrimonio", 500);
    }
    return successResponse({
      seguros: seguros.data ?? [],
      inmuebles: inmuebles.data ?? [],
      activos: activos.data ?? [],
    });
  });
}
