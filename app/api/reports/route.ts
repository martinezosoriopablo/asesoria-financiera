// app/api/reports/route.ts
// POST: ingesta unificada de un reporte (html/json/pdf/mp3). GET: listar (vigentes o historial).
import { NextRequest } from "next/server";
import { requireAdvisor, createAdminClient } from "@/lib/auth/api-auth";
import { applyRateLimit } from "@/lib/rate-limit";
import { validateUpload } from "@/lib/upload-validation";
import { successResponse, errorResponse, handleApiError } from "@/lib/api-response";
import { validateReportInput, resolveUsos, insumoNeedsTextWarning } from "@/lib/reports/validate";
import type { Formato, ReportTypeDef, Uso } from "@/lib/reports/types";

export const maxDuration = 120;

export async function POST(request: NextRequest) {
  const blocked = await applyRateLimit(request, "reports-ingest", { limit: 20, windowSeconds: 60 });
  if (blocked) return blocked;

  return handleApiError("reports-post", async () => {
    const { user, advisor, error: authError } = await requireAdvisor();
    if (authError) return authError;

    const supabase = createAdminClient();
    const form = await request.formData();
    const type = form.get("type") as string | null;
    if (!type) return errorResponse("Falta 'type'.", 400);

    // Definición del tipo (desde DB; permite custom)
    const { data: typeRow } = await supabase
      .from("report_types").select("*").eq("id", type).maybeSingle();
    if (!typeRow) return errorResponse(`Tipo de reporte desconocido: ${type}`, 400);
    const def: ReportTypeDef = {
      id: typeRow.id, label: typeRow.label, scopeKey: typeRow.scope_key,
      defaultUsos: typeRow.default_usos as Uso[], formatos: typeRow.formatos as Formato[],
    };

    const report_date = (form.get("report_date") as string | null) || undefined;
    const period = (form.get("period") as string | null) || undefined;
    const perfil = (form.get("perfil") as string | null) || undefined;
    const usosRaw = form.get("usos") as string | null; // JSON array o null
    const usos: Uso[] | null = usosRaw ? (JSON.parse(usosRaw) as Uso[]) : null;

    // Contenido
    const htmlField = form.get("html");
    let content_html: string | null = null;
    if (htmlField instanceof File) content_html = await htmlField.text();
    else if (typeof htmlField === "string" && htmlField.trim()) content_html = htmlField;

    const payloadRaw = form.get("payload") as string | null;
    const payload = payloadRaw ? JSON.parse(payloadRaw) : null;

    const pdfFile = form.get("pdf") as File | null;
    const mp3File = form.get("mp3") as File | null;

    const formatosPresentes: Formato[] = [];
    if (content_html) formatosPresentes.push("html");
    if (payload) formatosPresentes.push("json");
    if (pdfFile) formatosPresentes.push("pdf");
    if (mp3File) formatosPresentes.push("mp3");

    const validationError = validateReportInput(def, { report_date, period, perfil, formatosPresentes, usos });
    if (validationError) return errorResponse(validationError, 400);

    // Subir archivos a Storage
    let pdf_url: string | null = null;
    if (pdfFile) {
      const err = validateUpload(pdfFile, { maxSizeMB: 20, allowedExtensions: [".pdf"], allowedTypes: ["application/pdf"] });
      if (err) return errorResponse(err, 400);
      const path = `${type}/${report_date || period}/${Date.now()}-${pdfFile.name}`;
      const { error: upErr } = await supabase.storage.from("reports")
        .upload(path, Buffer.from(await pdfFile.arrayBuffer()), { contentType: "application/pdf", upsert: true });
      if (upErr) return errorResponse(`Error subiendo PDF: ${upErr.message}`, 500);
      pdf_url = path; // se sirve vía URL firmada al leer
    }
    let audio_url: string | null = null;
    if (mp3File) {
      const err = validateUpload(mp3File, { maxSizeMB: 50, allowedExtensions: [".mp3"], allowedTypes: ["audio/mpeg", "audio/mp3"] });
      if (err) return errorResponse(err, 400);
      const path = `${report_date || period}/${type}-${Date.now()}.mp3`;
      const { error: upErr } = await supabase.storage.from("daily-reports")
        .upload(path, Buffer.from(await mp3File.arrayBuffer()), { contentType: "audio/mpeg", upsert: true });
      if (upErr) return errorResponse(`Error subiendo MP3: ${upErr.message}`, 500);
      const { data: urlData } = supabase.storage.from("daily-reports").getPublicUrl(path);
      audio_url = urlData.publicUrl;
    }

    // Título: campo explícito o <title> del HTML
    const titleField = form.get("title") as string | null;
    const titleFromHtml = content_html?.match(/<title>([^<]+)<\/title>/i)?.[1];
    const title = titleField || titleFromHtml || def.label;

    const effectiveUsos = resolveUsos(usos, def.defaultUsos);
    const warning = insumoNeedsTextWarning(effectiveUsos, !!content_html, !!payload)
      ? "Este reporte está marcado como insumo IA pero no tiene cuerpo HTML/JSON — la IA no podrá leerlo."
      : undefined;

    const { data, error } = await supabase.from("reports").insert({
      type, title,
      report_date: report_date || `${period}-01`, // cierre_mensual usa 'YYYY-MM' → fecha del día 1
      period: period ?? null, perfil: perfil ?? null,
      content_html, payload, pdf_url, audio_url,
      usos, // null = hereda default
      uploaded_by: advisor?.id ?? user?.id ?? null,
    }).select().single();

    if (error) return errorResponse(`Error al guardar: ${error.message}`, 500);
    return successResponse({ report: data, warning });
  });
}

export async function GET(request: NextRequest) {
  const blocked = await applyRateLimit(request, "reports-list", { limit: 60, windowSeconds: 60 });
  if (blocked) return blocked;

  return handleApiError("reports-get", async () => {
    const { error: authError } = await requireAdvisor();
    if (authError) return authError;
    const supabase = createAdminClient();
    const sp = request.nextUrl.searchParams;
    const type = sp.get("type");
    const vigente = sp.get("vigente") === "true";
    const fromTable = vigente ? "vw_reports_vigentes" : "reports";

    let q = supabase.from(fromTable).select("*").order("report_date", { ascending: false }).limit(200);
    if (type) q = q.eq("type", type);
    const desde = sp.get("desde");
    const hasta = sp.get("hasta");
    if (desde) q = q.gte("report_date", desde);
    if (hasta) q = q.lte("report_date", hasta);

    const { data, error } = await q;
    if (error) return errorResponse(error.message, 500);
    return successResponse({ reports: data || [] });
  });
}
