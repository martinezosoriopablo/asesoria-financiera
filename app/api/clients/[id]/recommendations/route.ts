// app/api/clients/[id]/recommendations/route.ts
// List all recommendation versions for a client

import { NextRequest, NextResponse } from "next/server";
import { requireAdvisor, createAdminClient, getSubordinateAdvisorIds } from "@/lib/auth/api-auth";
import { applyRateLimit } from "@/lib/rate-limit";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(request: NextRequest, context: RouteContext) {
  const blocked = applyRateLimit(request, "client-recommendations", { limit: 30, windowSeconds: 60 });
  if (blocked) return blocked;

  const { advisor, error: authError } = await requireAdvisor();
  if (authError) return authError;

  const supabase = createAdminClient();

  try {
    const { id: clientId } = await context.params;

    // Verify client ownership
    const { data: client, error: clientError } = await supabase
      .from("clients")
      .select("id, asesor_id")
      .eq("id", clientId)
      .single();

    if (clientError || !client) {
      return NextResponse.json({ success: false, error: "Cliente no encontrado" }, { status: 404 });
    }

    if (client.asesor_id && client.asesor_id !== advisor!.id) {
      if (advisor!.rol === "admin") {
        const allowedIds = await getSubordinateAdvisorIds(advisor!.id);
        if (!allowedIds.includes(client.asesor_id)) {
          return NextResponse.json({ success: false, error: "No autorizado" }, { status: 403 });
        }
      } else {
        return NextResponse.json({ success: false, error: "No autorizado" }, { status: 403 });
      }
    }

    const { data: versions, error } = await supabase
      .from("recommendation_versions")
      .select("id, version_number, cartera_recomendada, applied_by, applied_at, notes, created_at")
      .eq("client_id", clientId)
      .order("version_number", { ascending: false });

    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      versions: versions || [],
      total: versions?.length || 0,
    });
  } catch (error) {
    console.error("Error in recommendations GET:", error);
    return NextResponse.json({ success: false, error: "Error interno del servidor" }, { status: 500 });
  }
}
