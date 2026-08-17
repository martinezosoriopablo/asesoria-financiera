// lib/reports/ingest.ts
// Lógica compartida de ingesta de un reporte (html/json/pdf/mp3), reutilizada por
// el POST /api/reports (auth cookie de asesor) y el POST /api/reports/ingest
// (auth token, para generadores externos headless).
import { createAdminClient } from "@/lib/auth/api-auth";
import { validateUpload } from "@/lib/upload-validation";
import { validateReportInput, resolveUsos, insumoNeedsTextWarning } from "@/lib/reports/validate";
import type { Formato, ReportTypeDef, Uso } from "@/lib/reports/types";

type AdminClient = ReturnType<typeof createAdminClient>;

export type IngestResult =
  | { ok: true; report: unknown; warning?: string }
  | { ok: false; error: string; status: number };

/**
 * Valida y persiste un reporte a partir de un FormData (multipart). No hace auth:
 * el caller ya autenticó (asesor o token) y pasa el `uploaderId` a registrar
 * (null para ingestas de máquina).
 */
export async function ingestReport(
  supabase: AdminClient,
  form: FormData,
  uploaderId: string | null
): Promise<IngestResult> {
  const type = form.get("type") as string | null;
  if (!type) return { ok: false, error: "Falta 'type'.", status: 400 };

  // Definición del tipo (desde DB; permite custom)
  const { data: typeRow } = await supabase
    .from("report_types").select("*").eq("id", type).maybeSingle();
  if (!typeRow) return { ok: false, error: `Tipo de reporte desconocido: ${type}`, status: 400 };
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

  // payload: acepta archivo .json (File) o string JSON.
  const payloadField = form.get("payload");
  const payloadRaw = payloadField instanceof File
    ? await payloadField.text()
    : (typeof payloadField === "string" ? payloadField : null);
  let payload = null;
  if (payloadRaw && payloadRaw.trim()) {
    try {
      payload = JSON.parse(payloadRaw);
    } catch {
      throw new Error("El JSON de la cartera no es válido (revisa el archivo/formato).");
    }
  }

  const pdfFile = form.get("pdf") as File | null;
  const mp3File = form.get("mp3") as File | null;

  const formatosPresentes: Formato[] = [];
  if (content_html) formatosPresentes.push("html");
  if (payload) formatosPresentes.push("json");
  if (pdfFile) formatosPresentes.push("pdf");
  if (mp3File) formatosPresentes.push("mp3");

  const validationError = validateReportInput(def, { report_date, period, perfil, formatosPresentes, usos });
  if (validationError) return { ok: false, error: validationError, status: 400 };

  // Subir archivos a Storage
  let pdf_url: string | null = null;
  if (pdfFile) {
    const err = validateUpload(pdfFile, { maxSizeMB: 20, allowedExtensions: [".pdf"], allowedTypes: ["application/pdf"] });
    if (err) return { ok: false, error: err, status: 400 };
    const path = `${type}/${report_date || period}/${Date.now()}-${pdfFile.name}`;
    const { error: upErr } = await supabase.storage.from("reports")
      .upload(path, Buffer.from(await pdfFile.arrayBuffer()), { contentType: "application/pdf", upsert: true });
    if (upErr) return { ok: false, error: `Error subiendo PDF: ${upErr.message}`, status: 500 };
    pdf_url = path; // se sirve vía URL firmada al leer
  }
  let audio_url: string | null = null;
  if (mp3File) {
    const err = validateUpload(mp3File, { maxSizeMB: 50, allowedExtensions: [".mp3"], allowedTypes: ["audio/mpeg", "audio/mp3"] });
    if (err) return { ok: false, error: err, status: 400 };
    const path = `${report_date || period}/${type}-${Date.now()}.mp3`;
    const { error: upErr } = await supabase.storage.from("daily-reports")
      .upload(path, Buffer.from(await mp3File.arrayBuffer()), { contentType: "audio/mpeg", upsert: true });
    if (upErr) return { ok: false, error: `Error subiendo MP3: ${upErr.message}`, status: 500 };
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
    report_date: report_date || `${period}-01`, // cierre/mensual usan 'YYYY-MM' → fecha del día 1
    period: period ?? null, perfil: perfil ?? null,
    content_html, payload, pdf_url, audio_url,
    usos, // null = hereda default
    uploaded_by: uploaderId,
  }).select().single();

  if (error) return { ok: false, error: `Error al guardar: ${error.message}`, status: 500 };
  return { ok: true, report: data, warning };
}
