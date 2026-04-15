// POST /api/cmf/import — Upload CMF cartola TXT and import to Supabase
// GET  /api/cmf/import — Check CMF import status (latest date, counts)

import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, createAdminClient } from "@/lib/auth/api-auth";
import { applyRateLimit } from "@/lib/rate-limit";
import { importCMFRows, parseCMFContent } from "@/lib/cmf-import";

export async function POST(request: NextRequest) {
  const blocked = await applyRateLimit(request, "cmf-import", { limit: 5, windowSeconds: 300 });
  if (blocked) return blocked;

  const { error: authError } = await requireAdmin();
  if (authError) return authError;

  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json(
        { success: false, error: "No se envió archivo. Enviar como form-data con campo 'file'." },
        { status: 400 }
      );
    }

    // Validate file type
    const name = file.name.toLowerCase();
    if (!name.endsWith(".txt") && !name.endsWith(".csv")) {
      return NextResponse.json(
        { success: false, error: "Formato no soportado. Se espera archivo .txt de cartola CMF." },
        { status: 400 }
      );
    }

    // Read file content as Buffer
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Try latin-1 first (CMF default), fallback to utf-8
    let content: string;
    try {
      content = new TextDecoder("latin1").decode(buffer);
      // If it doesn't look like CMF data, try utf-8
      if (!content.includes(";") || !content.includes("RUN")) {
        content = new TextDecoder("utf-8").decode(buffer);
      }
    } catch {
      content = buffer.toString("utf-8");
    }

    // Parse using the CMF cartola parser
    // leerCartolaTxt expects a file path, so we write a temp approach
    // Instead, parse the content directly
    const rows = parseCMFContent(content);

    if (rows.length === 0) {
      return NextResponse.json(
        { success: false, error: "No se encontraron registros válidos en el archivo. Verificar formato de cartola CMF." },
        { status: 400 }
      );
    }

    const metadata = {
      registros: rows.length,
      fondos: new Set(rows.map(r => `${r.runFm}-${r.serie}`)).size,
      fechaMin: rows.reduce((min, r) => r.fechaInf < min ? r.fechaInf : min, rows[0].fechaInf),
      fechaMax: rows.reduce((max, r) => r.fechaInf > max ? r.fechaInf : max, rows[0].fechaInf),
    };

    // Import to Supabase
    const supabase = createAdminClient();
    const result = await importCMFRows(supabase, rows);

    return NextResponse.json({
      success: true,
      file: file.name,
      metadata: {
        registros: metadata.registros,
        fondos: metadata.fondos,
        fechaInicio: metadata.fechaMin.toISOString().split("T")[0],
        fechaTermino: metadata.fechaMax.toISOString().split("T")[0],
      },
      result,
    });
  } catch (error) {
    console.error("Error in CMF import:", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Error importando cartola CMF" },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  const blocked = await applyRateLimit(request, "cmf-status", { limit: 30, windowSeconds: 60 });
  if (blocked) return blocked;

  const { error: authError } = await requireAdmin();
  if (authError) return authError;

  const supabase = createAdminClient();

  try {
    // Get latest CMF import date and counts
    const { data: latest } = await supabase
      .from("fund_cuota_history")
      .select("fecha")
      .eq("source", "cmf_cartola")
      .order("fecha", { ascending: false })
      .limit(1)
      .single();

    const { count: totalCMF } = await supabase
      .from("fund_cuota_history")
      .select("*", { count: "exact", head: true })
      .eq("source", "cmf_cartola");

    const { count: totalFondos } = await supabase
      .from("fondos_mutuos")
      .select("*", { count: "exact", head: true });

    // Count today's prices
    const today = new Date().toISOString().split("T")[0];
    const { count: todayPrices } = await supabase
      .from("fondos_rentabilidades_diarias")
      .select("*", { count: "exact", head: true })
      .eq("fecha", today);

    return NextResponse.json({
      success: true,
      latestDate: latest?.fecha || null,
      totalHistoryRecords: totalCMF || 0,
      totalFondos: totalFondos || 0,
      todayPrices: todayPrices || 0,
    });
  } catch (error) {
    console.error("Error checking CMF status:", error);
    return NextResponse.json(
      { success: false, error: "Error consultando estado CMF" },
      { status: 500 }
    );
  }
}

// parseCMFContent is now imported from @/lib/cmf-import
