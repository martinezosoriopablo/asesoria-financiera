// app/api/fondos/[run]/[serie]/ficha/route.ts
// CRUD for fund ficha: tax benefits + PDF upload/download + auto-extract from CMF PDF

import { NextRequest, NextResponse } from "next/server";
import { requireAdvisor, createAdminClient } from "@/lib/auth/api-auth";
import { applyRateLimit } from "@/lib/rate-limit";
import { extractText } from "unpdf";

interface ExtractedFichaData {
  beneficio_107lir: boolean;
  beneficio_108lir: boolean;
  beneficio_apv: boolean;
  beneficio_57bis: boolean;
  tac_serie: number | null;
  nombre_fondo: string | null;
  serie_detectada: string | null;
  rentabilidades: {
    rent_1m: number | null;
    rent_3m: number | null;
    rent_6m: number | null;
    rent_12m: number | null;
  };
  rescatable: boolean | null;
  plazo_rescate: string | null;
  horizonte_inversion: string | null;
  tolerancia_riesgo: string | null;
  objetivo: string | null;
}

async function extractFromPdf(buffer: ArrayBuffer): Promise<ExtractedFichaData> {
  const result = await extractText(new Uint8Array(buffer));
  const text = (result.text as string[]).join("\n");

  // NOTE: CMF fichas always list ALL 5 benefit labels (APV, APVC, 57 LIR, 107 LIR, 108 LIR)
  // as visual checkboxes. The text extraction cannot distinguish which are checked vs unchecked.
  // So we do NOT auto-detect benefits from text — the advisor must mark them manually.
  const beneficio_apv = false;
  const beneficio_57bis = false;
  const beneficio_107lir = false;
  const beneficio_108lir = false;

  // Extract TAC Serie — handles both "IVA incluido" and "Exento de IVA"
  let tac_serie: number | null = null;
  const tacMatch = text.match(/TAC\s+Serie\s+\(?(?:IVA\s+incluido|Exento\s+de\s+IVA)\)?\s+([\d,]+)%/i);
  if (tacMatch) {
    tac_serie = parseFloat(tacMatch[1].replace(",", "."));
  }

  // Extract rentabilidades
  const parseRent = (label: string): number | null => {
    const re = new RegExp(label + "\\s+(-?[\\d,.]+)%", "i");
    const m = text.match(re);
    if (m) return parseFloat(m[1].replace(",", "."));
    return null;
  };

  const rentabilidades = {
    rent_1m: parseRent("1\\s*Mes"),
    rent_3m: parseRent("3\\s*Meses"),
    rent_6m: parseRent("6\\s*Meses"),
    rent_12m: parseRent("1\\s*Año"),
  };

  // Extract fund name from header (usually "FONDO MUTUO XXX | SERIE Y")
  let nombre_fondo: string | null = null;
  let serie_detectada: string | null = null;
  const headerMatch = text.match(/FONDO\s+MUTUO\s+([^|]+)\|\s*SERIE\s+(\S+)/i);
  if (headerMatch) {
    nombre_fondo = headerMatch[1].trim();
    serie_detectada = headerMatch[2].trim();
  }

  // Rescatable
  const rescatableMatch = text.match(/Fondo\s+es\s+Rescatable:\s*(SI|NO)/i);
  const rescatable = rescatableMatch ? rescatableMatch[1].toUpperCase() === "SI" : null;

  // Plazo rescates
  const plazoMatch = text.match(/Plazo\s+Rescates:\s*([^\n]+)/i);
  const plazo_rescate = plazoMatch ? plazoMatch[1].trim() : null;

  // Horizonte — CMF PDFs use 2-column layout, value is separate from label
  const horizonteMatch = text.match(/((?:Corto|Mediano|Largo)(?:\s+(?:o|y|a)\s+(?:corto|mediano|largo))*\s+plazo)/i);
  const horizonte_inversion = horizonteMatch ? horizonteMatch[1].trim() : null;

  // Tolerancia — look for "Nivel alto/medio/bajo" anywhere in first page
  const toleranciaMatch = text.match(/Nivel\s+(alto|medio|bajo|moderado)/i);
  const tolerancia_riesgo = toleranciaMatch ? toleranciaMatch[0].trim() : null;

  // Objetivo — text between "Objetivo del Fondo" and "Tolerancia al Riesgo"
  const objIdx = text.indexOf("Objetivo del Fondo");
  const tolIdx = text.indexOf("Tolerancia al Riesgo");
  const objetivo = objIdx >= 0 && tolIdx > objIdx
    ? text.substring(objIdx + "Objetivo del Fondo".length, tolIdx).replace(/\n/g, " ").trim().substring(0, 500)
    : null;

  return {
    beneficio_107lir,
    beneficio_108lir,
    beneficio_apv,
    beneficio_57bis,
    tac_serie,
    nombre_fondo,
    serie_detectada,
    rentabilidades,
    rescatable,
    plazo_rescate,
    horizonte_inversion,
    tolerancia_riesgo,
    objetivo,
  };
}

interface RouteContext {
  params: Promise<{ run: string; serie: string }>;
}

// GET - Get ficha data + signed URL for PDF
export async function GET(request: NextRequest, context: RouteContext) {
  const blocked = await applyRateLimit(request, "ficha-get", { limit: 30, windowSeconds: 60 });
  if (blocked) return blocked;

  const { error: authError } = await requireAdvisor();
  if (authError) return authError;

  const supabase = createAdminClient();
  const { run, serie } = await context.params;
  const foRun = parseInt(run);

  if (isNaN(foRun)) {
    return NextResponse.json({ success: false, error: "run inválido" }, { status: 400 });
  }

  // Try exact match first (fo_run + serie), fallback to fo_run only
  // Sync from CMF saves with the CMF serie (e.g. "A") which may differ from the DB serie (e.g. "ADC")
  let { data: ficha } = await supabase
    .from("fund_fichas")
    .select("*")
    .eq("fo_run", foRun)
    .eq("fm_serie", serie)
    .single();

  if (!ficha) {
    // Fallback: get any ficha for this fo_run (CMF serie may differ)
    ({ data: ficha } = await supabase
      .from("fund_fichas")
      .select("*")
      .eq("fo_run", foRun)
      .limit(1)
      .single());
  }

  let pdfUrl: string | null = null;
  if (ficha?.ficha_pdf_path) {
    const { data: signedUrl } = await supabase.storage
      .from("fund-fichas")
      .createSignedUrl(ficha.ficha_pdf_path, 3600);
    pdfUrl = signedUrl?.signedUrl || null;
  }

  // Build extracted data from DB columns (persisted from PDF upload)
  const extractedFromDb = ficha?.tac_serie != null ? {
    tac_serie: ficha.tac_serie ? Number(ficha.tac_serie) : null,
    nombre_fondo: ficha.nombre_fondo_pdf,
    serie_detectada: ficha.serie_detectada,
    rentabilidades: {
      rent_1m: ficha.rent_1m ? Number(ficha.rent_1m) : null,
      rent_3m: ficha.rent_3m ? Number(ficha.rent_3m) : null,
      rent_6m: ficha.rent_6m ? Number(ficha.rent_6m) : null,
      rent_12m: ficha.rent_12m ? Number(ficha.rent_12m) : null,
    },
    rescatable: ficha.rescatable,
    plazo_rescate: ficha.plazo_rescate,
    horizonte_inversion: ficha.horizonte_inversion,
    tolerancia_riesgo: ficha.tolerancia_riesgo,
    objetivo: ficha.objetivo,
  } : null;

  return NextResponse.json({
    success: true,
    ficha: ficha || {
      fo_run: foRun,
      fm_serie: serie,
      beneficio_107lir: false,
      beneficio_108lir: false,
      beneficio_apv: false,
      beneficio_57bis: false,
      notas_tributarias: null,
      ficha_pdf_path: null,
    },
    pdfUrl,
    extracted: extractedFromDb,
  });
}

// PUT - Update tax benefits
export async function PUT(request: NextRequest, context: RouteContext) {
  const blocked = await applyRateLimit(request, "ficha-put", { limit: 10, windowSeconds: 60 });
  if (blocked) return blocked;

  const { user, error: authError } = await requireAdvisor();
  if (authError) return authError;

  const supabase = createAdminClient();
  const { run, serie } = await context.params;
  const foRun = parseInt(run);

  if (isNaN(foRun)) {
    return NextResponse.json({ success: false, error: "run inválido" }, { status: 400 });
  }

  const body = await request.json();
  const updates = {
    beneficio_107lir: !!body.beneficio_107lir,
    beneficio_108lir: !!body.beneficio_108lir,
    beneficio_apv: !!body.beneficio_apv,
    beneficio_57bis: !!body.beneficio_57bis,
    notas_tributarias: body.notas_tributarias || null,
    updated_at: new Date().toISOString(),
    updated_by: user!.id,
  };

  // Check if row exists
  const { data: existing } = await supabase
    .from("fund_fichas")
    .select("id")
    .eq("fo_run", foRun)
    .eq("fm_serie", serie)
    .single();

  let data, error;
  if (existing) {
    // UPDATE only benefit fields (preserve ficha_pdf_path etc)
    ({ data, error } = await supabase
      .from("fund_fichas")
      .update(updates)
      .eq("fo_run", foRun)
      .eq("fm_serie", serie)
      .select()
      .single());
  } else {
    // INSERT new row
    ({ data, error } = await supabase
      .from("fund_fichas")
      .insert({ fo_run: foRun, fm_serie: serie, ...updates })
      .select()
      .single());
  }

  if (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, ficha: data });
}

// POST - Upload PDF ficha
export async function POST(request: NextRequest, context: RouteContext) {
  const blocked = await applyRateLimit(request, "ficha-upload", { limit: 5, windowSeconds: 60 });
  if (blocked) return blocked;

  const { user, error: authError } = await requireAdvisor();
  if (authError) return authError;

  const supabase = createAdminClient();
  const { run, serie } = await context.params;
  const foRun = parseInt(run);

  if (isNaN(foRun)) {
    return NextResponse.json({ success: false, error: "run inválido" }, { status: 400 });
  }

  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ success: false, error: "No se recibió archivo" }, { status: 400 });
    }

    if (file.type !== "application/pdf") {
      return NextResponse.json({ success: false, error: "Solo se aceptan archivos PDF" }, { status: 400 });
    }

    if (file.size > 10 * 1024 * 1024) {
      return NextResponse.json({ success: false, error: "Archivo muy grande (máx 10MB)" }, { status: 400 });
    }

    // Delete old PDF if exists
    const { data: existing } = await supabase
      .from("fund_fichas")
      .select("ficha_pdf_path")
      .eq("fo_run", foRun)
      .eq("fm_serie", serie)
      .single();

    if (existing?.ficha_pdf_path) {
      await supabase.storage.from("fund-fichas").remove([existing.ficha_pdf_path]);
    }

    // Read file into ArrayBuffer once
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Upload new PDF
    const filePath = `${foRun}/${serie}/${Date.now()}-ficha.pdf`;

    const { error: uploadError } = await supabase.storage
      .from("fund-fichas")
      .upload(filePath, buffer, {
        contentType: "application/pdf",
        upsert: false,
      });

    if (uploadError) {
      return NextResponse.json({ success: false, error: uploadError.message }, { status: 500 });
    }

    // Extract data from PDF
    let extracted: ExtractedFichaData | null = null;
    try {
      extracted = await extractFromPdf(arrayBuffer);
      console.log("PDF extraction result:", JSON.stringify(extracted, null, 2));
    } catch (e) {
      console.error("PDF extraction failed (non-blocking):", e);
    }

    // Save PDF path + extracted data to DB
    const pdfFields: Record<string, unknown> = {
      ficha_pdf_path: filePath,
      ficha_pdf_uploaded_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      updated_by: user!.id,
    };

    // Add extracted data if available
    if (extracted) {
      pdfFields.tac_serie = extracted.tac_serie;
      pdfFields.nombre_fondo_pdf = extracted.nombre_fondo;
      pdfFields.serie_detectada = extracted.serie_detectada;
      pdfFields.rent_1m = extracted.rentabilidades.rent_1m;
      pdfFields.rent_3m = extracted.rentabilidades.rent_3m;
      pdfFields.rent_6m = extracted.rentabilidades.rent_6m;
      pdfFields.rent_12m = extracted.rentabilidades.rent_12m;
      pdfFields.rescatable = extracted.rescatable;
      pdfFields.plazo_rescate = extracted.plazo_rescate;
      pdfFields.horizonte_inversion = extracted.horizonte_inversion;
      pdfFields.tolerancia_riesgo = extracted.tolerancia_riesgo;
      pdfFields.objetivo = extracted.objetivo;
    }

    // Check if row exists to use update (preserves benefits) vs insert
    const { data: existingRow } = await supabase
      .from("fund_fichas")
      .select("id")
      .eq("fo_run", foRun)
      .eq("fm_serie", serie)
      .single();

    let updateError;
    if (existingRow) {
      ({ error: updateError } = await supabase
        .from("fund_fichas")
        .update(pdfFields)
        .eq("fo_run", foRun)
        .eq("fm_serie", serie));
    } else {
      ({ error: updateError } = await supabase
        .from("fund_fichas")
        .insert({ fo_run: foRun, fm_serie: serie, ...pdfFields }));
    }

    if (updateError) {
      await supabase.storage.from("fund-fichas").remove([filePath]);
      return NextResponse.json({ success: false, error: updateError.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      ficha_pdf_path: filePath,
      extracted,
    });
  } catch (error) {
    console.error("Error uploading ficha PDF:", error);
    return NextResponse.json({ success: false, error: "Error al subir ficha" }, { status: 500 });
  }
}

// DELETE - Remove PDF ficha
export async function DELETE(request: NextRequest, context: RouteContext) {
  const blocked = await applyRateLimit(request, "ficha-delete", { limit: 5, windowSeconds: 60 });
  if (blocked) return blocked;

  const { user, error: authError } = await requireAdvisor();
  if (authError) return authError;

  const supabase = createAdminClient();
  const { run, serie } = await context.params;
  const foRun = parseInt(run);

  if (isNaN(foRun)) {
    return NextResponse.json({ success: false, error: "run inválido" }, { status: 400 });
  }

  const { data: ficha } = await supabase
    .from("fund_fichas")
    .select("ficha_pdf_path")
    .eq("fo_run", foRun)
    .eq("fm_serie", serie)
    .single();

  if (!ficha?.ficha_pdf_path) {
    return NextResponse.json({ success: false, error: "No hay ficha PDF" }, { status: 404 });
  }

  await supabase.storage.from("fund-fichas").remove([ficha.ficha_pdf_path]);

  await supabase
    .from("fund_fichas")
    .update({
      ficha_pdf_path: null,
      ficha_pdf_uploaded_at: null,
      updated_at: new Date().toISOString(),
      updated_by: user!.id,
    })
    .eq("fo_run", foRun)
    .eq("fm_serie", serie);

  return NextResponse.json({ success: true });
}
