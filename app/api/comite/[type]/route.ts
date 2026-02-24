// app/api/comite/[type]/route.ts
// Obtiene el contenido de un reporte específico del comité

import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const VALID_TYPES = ["macro", "rv", "rf", "asset_allocation"];

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ type: string }> }
) {
  try {
    const { type } = await params;

    if (!VALID_TYPES.includes(type)) {
      return NextResponse.json(
        { success: false, error: "Tipo de reporte inválido" },
        { status: 400 }
      );
    }

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

    // Obtener el reporte más reciente de este tipo
    const { data: report, error } = await supabase
      .from("comite_reports")
      .select("id, type, filename, title, content, report_date, uploaded_at")
      .eq("type", type)
      .order("uploaded_at", { ascending: false })
      .limit(1)
      .single();

    if (error) {
      if (error.code === "PGRST116") {
        return NextResponse.json(
          { success: false, error: "Reporte no encontrado" },
          { status: 404 }
        );
      }
      console.error("Error fetching comite report:", error);
      return NextResponse.json(
        { success: false, error: "Error al obtener reporte" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      report: {
        id: report.id,
        type: report.type,
        filename: report.filename,
        title: report.title,
        content: report.content,
        reportDate: report.report_date,
        uploadedAt: report.uploaded_at,
      },
    });
  } catch (error: any) {
    console.error("Error in comite get report:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Error interno" },
      { status: 500 }
    );
  }
}
