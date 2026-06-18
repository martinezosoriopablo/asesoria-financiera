// app/api/advisor/stats/route.ts

import { NextRequest, NextResponse } from "next/server";
import { requireAdvisor, createAdminClient } from "@/lib/auth/api-auth";
import { rateLimit, getClientIp } from "@/lib/rate-limit";
import { handleApiError } from "@/lib/api-response";

// GET - Obtener estadísticas del asesor autenticado
export async function GET(request: NextRequest) {
  // Rate limiting
  const { allowed, remaining } = rateLimit(`stats:${getClientIp(request)}`, { limit: 30, windowSeconds: 60 });
  if (!allowed) {
    return NextResponse.json(
      { success: false, error: "Demasiadas solicitudes. Intenta en un momento." },
      { status: 429, headers: { "X-RateLimit-Remaining": String(remaining) } }
    );
  }

  // Verificar autenticación - usa el email del usuario autenticado
  const { advisor, error: authError } = await requireAdvisor();
  if (authError) return authError;

  return handleApiError("advisor-stats-get", async () => {
    const supabase = createAdminClient();

    const { data: clients } = await supabase
      .from("clients")
      .select("id, status")
      .eq("asesor_id", advisor!.id);

    const clientIds = (clients || []).map(c => c.id);

    // AUM real: latest snapshot per client (excluding api-prices auto-snapshots)
    // Multi-custodian: sum all snapshots on the latest date per client
    let aumTotal = 0;
    let clientsSinCartola = 0;

    if (clientIds.length > 0) {
      const { data: snapshots } = await supabase
        .from("portfolio_snapshots")
        .select("client_id, snapshot_date, total_value, source")
        .in("client_id", clientIds)
        .neq("source", "api-prices")
        .order("snapshot_date", { ascending: false });

      // For each client, find latest date, then sum all snapshots on that date
      const latestDateByClient = new Map<string, string>();
      for (const snap of (snapshots || [])) {
        if (!latestDateByClient.has(snap.client_id)) {
          latestDateByClient.set(snap.client_id, snap.snapshot_date);
        }
      }

      // Sum total_value for all snapshots on the latest date per client
      const aumByClient = new Map<string, number>();
      for (const snap of (snapshots || [])) {
        if (snap.snapshot_date === latestDateByClient.get(snap.client_id)) {
          aumByClient.set(snap.client_id, (aumByClient.get(snap.client_id) || 0) + (snap.total_value || 0));
        }
      }

      for (const val of aumByClient.values()) {
        aumTotal += val;
      }

      clientsSinCartola = clientIds.length - aumByClient.size;
    } else {
      clientsSinCartola = 0;
    }

    // Meetings: pending and this week (week starts Monday)
    const { data: meetings } = await supabase
      .from("meetings")
      .select("fecha")
      .eq("asesor_id", advisor!.id)
      .eq("completada", false)
      .eq("cancelada", false)
      .gte("fecha", new Date().toISOString());

    const now = new Date();
    const dayOfWeek = now.getDay(); // 0=Sun, 1=Mon, ...
    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1));
    startOfWeek.setHours(0, 0, 0, 0);
    const endOfWeek = new Date(startOfWeek);
    endOfWeek.setDate(endOfWeek.getDate() + 7);

    const meetingsThisWeek = meetings?.filter(m => {
      const meetingDate = new Date(m.fecha);
      return meetingDate >= startOfWeek && meetingDate < endOfWeek;
    }) || [];

    return NextResponse.json({
      success: true,
      stats: {
        total_clientes: clients?.length || 0,
        clientes_activos: clients?.filter(c => c.status === "activo").length || 0,
        prospectos: clients?.filter(c => c.status === "prospecto").length || 0,
        aum_total: aumTotal,
        clientes_sin_cartola: clientsSinCartola,
        reuniones_pendientes: meetings?.length || 0,
        reuniones_esta_semana: meetingsThisWeek.length,
      },
    });
  });
}
