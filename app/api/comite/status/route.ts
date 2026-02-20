// app/api/comite/status/route.ts
// Obtiene el estado actual de los reportes del comité

import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function GET() {
  try {
    const supabase = await createSupabaseServerClient();

    // Verificar autenticación
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json(
        { success: false, error: "No autorizado" },
        { status: 401 }
      );
    }

    // Obtener reportes del comité (los más recientes de cada tipo)
    const { data: reports, error } = await supabase
      .from("comite_reports")
      .select("id, type, filename, uploaded_at, updated_at")
      .order("uploaded_at", { ascending: false });

    if (error) {
      console.error("Error fetching comite reports:", error);
      return NextResponse.json(
        { success: false, error: "Error al obtener reportes" },
        { status: 500 }
      );
    }

    // Agrupar por tipo (solo el más reciente de cada uno)
    const latestByType = new Map<string, any>();
    for (const report of reports || []) {
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
  } catch (error: any) {
    console.error("Error in comite status:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Error interno" },
      { status: 500 }
    );
  }
}
