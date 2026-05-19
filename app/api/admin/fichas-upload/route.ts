// app/api/admin/fichas-upload/route.ts
// Upload a ficha PDF manually, extract data, save to fund_fichas

import { NextRequest, NextResponse } from "next/server";
import { requireAdvisor, createAdminClient } from "@/lib/auth/api-auth";
import { applyRateLimit } from "@/lib/rate-limit";
import { extractFromPdf } from "@/lib/ficha-extract";

export async function POST(request: NextRequest) {
  const blocked = await applyRateLimit(request, "fichas-upload", { limit: 20, windowSeconds: 60 });
  if (blocked) return blocked;

  const { user, error: authError } = await requireAdvisor();
  if (authError) return authError;

  const formData = await request.formData();
  const fo_run = Number(formData.get("fo_run"));
  const fm_serie = String(formData.get("fm_serie") || "").trim();
  const file = formData.get("file") as File | null;

  if (!fo_run || !fm_serie || !file) {
    return NextResponse.json({ success: false, error: "fo_run, fm_serie y archivo PDF son requeridos" }, { status: 400 });
  }

  if (!file.name.toLowerCase().endsWith(".pdf")) {
    return NextResponse.json({ success: false, error: "El archivo debe ser un PDF" }, { status: 400 });
  }

  const buffer = await file.arrayBuffer();
  const { data: extracted, gemini_exhausted } = await extractFromPdf(buffer);
  const { extraction_method: _em, ...dbFields } = extracted;

  const supabase = createAdminClient();
  const { error: upsertError } = await supabase.from("fund_fichas").upsert({
    fo_run,
    fm_serie,
    ...dbFields,
    updated_at: new Date().toISOString(),
    updated_by: user!.id,
  }, { onConflict: "fo_run,fm_serie" });

  if (upsertError) {
    return NextResponse.json({ success: false, error: upsertError.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, extracted, gemini_exhausted });
}
