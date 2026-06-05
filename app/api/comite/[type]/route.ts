// app/api/comite/[type]/route.ts
// Obtiene el contenido de un reporte específico del comité

import { NextRequest, NextResponse } from "next/server";
import { requireAdvisor, createAdminClient } from "@/lib/auth/api-auth";
import { applyRateLimit } from "@/lib/rate-limit";
import { handleApiError } from "@/lib/api-response";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ type: string }> }
) {
  const blocked = await applyRateLimit(request, "comite-report", { limit: 30, windowSeconds: 60 });
  if (blocked) return blocked;

  return handleApiError("comite-type-get", async () => {
    const { type } = await params;

    if (!type || type.length > 100) {
      return NextResponse.json(
        { success: false, error: "Tipo de reporte inválido" },
        { status: 400 }
      );
    }

    const { error: authError } = await requireAdvisor();
    if (authError) return authError;

    const supabase = createAdminClient();

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
  
  });
}

// DELETE - Eliminar un reporte del comité
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ type: string }> }
) {
  const blocked = await applyRateLimit(request, "comite-delete", { limit: 10, windowSeconds: 60 });
  if (blocked) return blocked;

  return handleApiError("comite-type-delete", async () => {
    const { type } = await params;

    if (!type || type.length > 100) {
      return NextResponse.json(
        { success: false, error: "Tipo de reporte inválido" },
        { status: 400 }
      );
    }

    const { error: authError } = await requireAdvisor();
    if (authError) return authError;

    const supabase = createAdminClient();

    const { error } = await supabase
      .from("comite_reports")
      .delete()
      .eq("type", type);

    if (error) {
      console.error("Error deleting comite report:", error);
      return NextResponse.json(
        { success: false, error: "Error al eliminar reporte" },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  
  });
}
