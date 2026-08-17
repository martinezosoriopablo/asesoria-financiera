// app/api/comite/status/route.ts
// Obtiene el estado actual de los reportes del comité

import { NextRequest, NextResponse } from "next/server";
import { requireAdvisor, createAdminClient } from "@/lib/auth/api-auth";
import { applyRateLimit } from "@/lib/rate-limit";
import { handleApiError } from "@/lib/api-response";

interface ComiteReportStatus {
  id: string;
  type: string;
  filename: string;
  uploaded_at: string;
  updated_at: string;
}

export async function GET(request: NextRequest) {
  const blocked = await applyRateLimit(request, "comite-status", { limit: 30, windowSeconds: 60 });
  if (blocked) return blocked;

  return handleApiError("comite-status-get", async () => {
    const { error: authError } = await requireAdvisor();
    if (authError) return authError;

    const supabase = createAdminClient();

    // Reportes vigentes (repositorio unificado). vw_reports_vigentes ya devuelve
    // la versión más reciente por tipo (para tipos date-scoped, una por tipo).
    const { data: rows, error } = await supabase
      .from("vw_reports_vigentes")
      .select("id, type, title, created_at, updated_at")
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Error fetching reports:", error);
      return NextResponse.json(
        { success: false, error: "Error al obtener reportes" },
        { status: 500 }
      );
    }

    // Agrupar por tipo (solo el más reciente de cada uno)
    const latestByType = new Map<string, ComiteReportStatus>();
    for (const r of rows || []) {
      const report: ComiteReportStatus = {
        id: r.id as string,
        type: r.type as string,
        filename: (r.title as string | null) ?? (r.type as string),
        uploaded_at: r.created_at as string,
        updated_at: r.updated_at as string,
      };
      if (!latestByType.has(report.type)) {
        latestByType.set(report.type, report);
      }
    }

    const latestReports = Array.from(latestByType.values());

    // Calcular última actualización
    const lastUpdate = latestReports.length > 0
      ? latestReports.reduce((latest, r) =>
          new Date(r.uploaded_at) > new Date(latest) ? r.uploaded_at : latest,
          latestReports[0].uploaded_at
        )
      : null;

    return NextResponse.json({
      success: true,
      reports: latestReports,
      lastUpdate,
    });
  
  });
}
