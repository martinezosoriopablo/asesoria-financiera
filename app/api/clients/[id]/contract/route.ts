// app/api/clients/[id]/contract/route.ts
// Upload, get, and delete contract PDF for a client

import { NextRequest, NextResponse } from "next/server";
import { requireAdvisor, createAdminClient, getSubordinateAdvisorIds } from "@/lib/auth/api-auth";
import { applyRateLimit } from "@/lib/rate-limit";

interface RouteContext {
  params: Promise<{ id: string }>;
}

async function verifyClientAccess(
  supabase: ReturnType<typeof createAdminClient>,
  clientId: string,
  advisor: { id: string; rol: string }
) {
  const { data: client } = await supabase
    .from("clients")
    .select("id, asesor_id, contract_url")
    .eq("id", clientId)
    .single();

  if (!client) return { ok: false as const, error: "Cliente no encontrado" };

  if (client.asesor_id && client.asesor_id !== advisor.id) {
    if (advisor.rol === "admin") {
      const allowedIds = await getSubordinateAdvisorIds(advisor.id);
      if (!allowedIds.includes(client.asesor_id)) {
        return { ok: false as const, error: "No autorizado" };
      }
    } else {
      return { ok: false as const, error: "No autorizado" };
    }
  }

  return { ok: true as const, client };
}

// GET - Get signed URL for downloading the contract
export async function GET(request: NextRequest, context: RouteContext) {
  const blocked = await applyRateLimit(request, "contract-get", { limit: 30, windowSeconds: 60 });
  if (blocked) return blocked;

  const { advisor, error: authError } = await requireAdvisor();
  if (authError) return authError;

  const supabase = createAdminClient();
  const { id: clientId } = await context.params;

  const access = await verifyClientAccess(supabase, clientId, advisor!);
  if (!access.ok) {
    return NextResponse.json({ success: false, error: access.error }, { status: 403 });
  }

  if (!access.client.contract_url) {
    return NextResponse.json({ success: false, error: "No hay contrato" }, { status: 404 });
  }

  // Generate signed URL (valid 1 hour)
  const { data: signedUrl, error: signError } = await supabase.storage
    .from("contracts")
    .createSignedUrl(access.client.contract_url, 3600);

  if (signError) {
    return NextResponse.json({ success: false, error: signError.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, url: signedUrl.signedUrl });
}

// POST - Upload contract PDF
export async function POST(request: NextRequest, context: RouteContext) {
  const blocked = await applyRateLimit(request, "contract-upload", { limit: 5, windowSeconds: 60 });
  if (blocked) return blocked;

  const { advisor, error: authError } = await requireAdvisor();
  if (authError) return authError;

  const supabase = createAdminClient();
  const { id: clientId } = await context.params;

  const access = await verifyClientAccess(supabase, clientId, advisor!);
  if (!access.ok) {
    return NextResponse.json({ success: false, error: access.error }, { status: 403 });
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

    // Delete old contract if exists
    if (access.client.contract_url) {
      await supabase.storage.from("contracts").remove([access.client.contract_url]);
    }

    // Upload new contract
    const filePath = `${clientId}/${Date.now()}-contrato.pdf`;
    const buffer = Buffer.from(await file.arrayBuffer());

    const { error: uploadError } = await supabase.storage
      .from("contracts")
      .upload(filePath, buffer, {
        contentType: "application/pdf",
        upsert: false,
      });

    if (uploadError) {
      return NextResponse.json({ success: false, error: uploadError.message }, { status: 500 });
    }

    // Update client record
    const { error: updateError } = await supabase
      .from("clients")
      .update({
        contract_url: filePath,
        contract_uploaded_at: new Date().toISOString(),
      })
      .eq("id", clientId);

    if (updateError) {
      // Cleanup uploaded file
      await supabase.storage.from("contracts").remove([filePath]);
      return NextResponse.json({ success: false, error: updateError.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, contract_url: filePath });
  } catch (error) {
    console.error("Error uploading contract:", error);
    return NextResponse.json({ success: false, error: "Error al subir contrato" }, { status: 500 });
  }
}

// DELETE - Remove contract
export async function DELETE(request: NextRequest, context: RouteContext) {
  const blocked = await applyRateLimit(request, "contract-delete", { limit: 5, windowSeconds: 60 });
  if (blocked) return blocked;

  const { advisor, error: authError } = await requireAdvisor();
  if (authError) return authError;

  const supabase = createAdminClient();
  const { id: clientId } = await context.params;

  const access = await verifyClientAccess(supabase, clientId, advisor!);
  if (!access.ok) {
    return NextResponse.json({ success: false, error: access.error }, { status: 403 });
  }

  if (!access.client.contract_url) {
    return NextResponse.json({ success: false, error: "No hay contrato" }, { status: 404 });
  }

  // Delete from storage
  await supabase.storage.from("contracts").remove([access.client.contract_url]);

  // Clear from client
  await supabase
    .from("clients")
    .update({ contract_url: null, contract_uploaded_at: null })
    .eq("id", clientId);

  return NextResponse.json({ success: true });
}
