// app/api/clients/stats/route.ts

import { NextRequest } from "next/server";
import { requireAdvisor, createAdminClient, getSubordinateAdvisorIds } from "@/lib/auth/api-auth";
import { applyRateLimit } from "@/lib/rate-limit";
import { successResponse, handleApiError } from "@/lib/api-response";

export async function GET(request: NextRequest) {
  const blocked = await applyRateLimit(request, "clients-stats", { limit: 30, windowSeconds: 60 });
  if (blocked) return blocked;

  const { advisor, error: authError } = await requireAdvisor();
  if (authError) return authError;

  const supabase = createAdminClient();

  return handleApiError("clients-stats", async () => {
    // Scope to advisor's clients (admin sees subordinates too)
    let allowedAdvisorIds: string[] = [advisor!.id];
    if (advisor!.rol === 'admin') {
      allowedAdvisorIds = await getSubordinateAdvisorIds(advisor!.id);
    }
    const idsFilter = allowedAdvisorIds.map(id => `asesor_id.eq.${id}`).join(',');

    const { data: clients, error } = await supabase
      .from("clients")
      .select("*")
      .or(`${idsFilter},asesor_id.is.null`);

    if (error) throw error;

    const stats = {
      total_clientes: clients?.length || 0,
      clientes_activos: clients?.filter(c => c.status === "activo").length || 0,
      prospectos: clients?.filter(c => c.status === "prospecto").length || 0,
      inactivos: clients?.filter(c => c.status === "inactivo").length || 0,
      patrimonio_total: clients?.reduce((sum, c) => sum + (c.patrimonio_estimado || 0), 0) || 0,
      por_perfil: {
        conservador: clients?.filter(c => c.perfil_riesgo === "conservador").length || 0,
        moderado: clients?.filter(c => c.perfil_riesgo === "moderado").length || 0,
        agresivo: clients?.filter(c => c.perfil_riesgo === "agresivo").length || 0,
        muy_agresivo: clients?.filter(c => c.perfil_riesgo === "muy_agresivo").length || 0,
      },
    };

    // Calcular clientes que necesitan seguimiento (más de 30 días sin interacción)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const clientsNeedingFollowup = clients?.filter(client => {
      if (!client.last_interaction) return true;
      return new Date(client.last_interaction) < thirtyDaysAgo;
    }).length || 0;

    return successResponse({
      stats: {
        ...stats,
        clientes_sin_seguimiento: clientsNeedingFollowup,
      },
    });
  });
}
