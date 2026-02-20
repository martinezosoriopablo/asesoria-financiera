// app/api/comite/upload/route.ts
// Sube un reporte del comité (HTML)

import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const VALID_TYPES = ["macro", "rv", "rf", "asset_allocation"];

export async function POST(request: NextRequest) {
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

    // Parsear el FormData
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const type = formData.get("type") as string | null;

    // Validaciones
    if (!file) {
      return NextResponse.json(
        { success: false, error: "No se proporcionó archivo" },
        { status: 400 }
      );
    }

    if (!type || !VALID_TYPES.includes(type)) {
      return NextResponse.json(
        { success: false, error: "Tipo de reporte inválido" },
        { status: 400 }
      );
    }

    // Validar que sea HTML
    if (!file.name.endsWith(".html") && !file.type.includes("html")) {
      return NextResponse.json(
        { success: false, error: "El archivo debe ser HTML" },
        { status: 400 }
      );
    }

    // Leer contenido del archivo
    const content = await file.text();

    // Validar que no esté vacío
    if (!content || content.length < 100) {
      return NextResponse.json(
        { success: false, error: "El archivo está vacío o es muy pequeño" },
        { status: 400 }
      );
    }

    // Extraer metadata básica del HTML (título, fecha si existe)
    const titleMatch = content.match(/<title>([^<]+)<\/title>/i);
    const title = titleMatch ? titleMatch[1] : `Reporte ${type}`;

    // Buscar fecha en el contenido (formato común: "13 Febrero 2026" o similar)
    const dateMatch = content.match(/(\d{1,2})\s+(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)\s+(\d{4})/i);
    const reportDate = dateMatch
      ? `${dateMatch[3]}-${getMonthNumber(dateMatch[2])}-${dateMatch[1].padStart(2, "0")}`
      : new Date().toISOString().split("T")[0];

    // Guardar en Supabase
    const { data, error } = await supabase
      .from("comite_reports")
      .upsert(
        {
          type,
          filename: file.name,
          title,
          content,
          report_date: reportDate,
          uploaded_by: user.id,
          uploaded_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        {
          onConflict: "type",
        }
      )
      .select()
      .single();

    if (error) {
      console.error("Error saving comite report:", error);
      return NextResponse.json(
        { success: false, error: "Error al guardar el reporte" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      report: {
        id: data.id,
        type: data.type,
        filename: data.filename,
        title: data.title,
        reportDate: data.report_date,
        uploadedAt: data.uploaded_at,
      },
    });
  } catch (error: any) {
    console.error("Error in comite upload:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Error interno" },
      { status: 500 }
    );
  }
}

function getMonthNumber(month: string): string {
  const months: Record<string, string> = {
    enero: "01",
    febrero: "02",
    marzo: "03",
    abril: "04",
    mayo: "05",
    junio: "06",
    julio: "07",
    agosto: "08",
    septiembre: "09",
    octubre: "10",
    noviembre: "11",
    diciembre: "12",
  };
  return months[month.toLowerCase()] || "01";
}
