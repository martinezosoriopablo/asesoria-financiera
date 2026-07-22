// app/api/admin/advisors/upload-asset/route.ts
// Sube una imagen (foto de asesor o logo de firma) al bucket público `advisor-assets`
// y devuelve su URL pública. Auth: cualquier asesor autenticado.

import { NextRequest, NextResponse } from "next/server";
import { requireAdvisor, createAdminClient } from "@/lib/auth/api-auth";
import { applyRateLimit } from "@/lib/rate-limit";
import { handleApiError } from "@/lib/api-response";

const BUCKET = "advisor-assets";
const MAX_BYTES = 2 * 1024 * 1024; // 2 MB
const ALLOWED: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

export async function POST(request: NextRequest) {
  const blocked = await applyRateLimit(request, "advisor-upload-asset", { limit: 20, windowSeconds: 60 });
  if (blocked) return blocked;

  const { advisor, error: authError } = await requireAdvisor();
  if (authError) return authError;

  const supabase = createAdminClient();

  return handleApiError("advisor-upload-asset", async () => {
    const form = await request.formData();
    const file = form.get("file") as File | null;
    const kindRaw = (form.get("kind") as string | null) || "foto";
    const kind = kindRaw === "logo" ? "logo" : "foto";

    if (!file) {
      return NextResponse.json({ success: false, error: "No se recibió archivo" }, { status: 400 });
    }

    const ext = ALLOWED[file.type];
    if (!ext) {
      return NextResponse.json(
        { success: false, error: "Formato no permitido. Usa JPG, PNG o WEBP." },
        { status: 400 }
      );
    }

    if (file.size > MAX_BYTES) {
      return NextResponse.json(
        { success: false, error: "Imagen muy grande (máx 2 MB)." },
        { status: 400 }
      );
    }

    // Ruta única: <kind>/<advisorId>-<timestamp>.<ext>
    const filePath = `${kind}/${advisor!.id}-${Date.now()}.${ext}`;
    const buffer = Buffer.from(await file.arrayBuffer());

    const { error: uploadError } = await supabase.storage
      .from(BUCKET)
      .upload(filePath, buffer, { contentType: file.type, upsert: true });

    if (uploadError) {
      return NextResponse.json({ success: false, error: uploadError.message }, { status: 500 });
    }

    const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(filePath);

    return NextResponse.json({ success: true, url: pub.publicUrl, kind });
  });
}
