// app/api/clients/[id]/risk-profile/route.ts

import { NextRequest, NextResponse } from "next/server";
import { requireAdvisor, createAdminClient, getSubordinateAdvisorIds } from "@/lib/auth/api-auth";
import { applyRateLimit } from "@/lib/rate-limit";

// GET - Obtener perfil de riesgo del cliente
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const blocked = await applyRateLimit(request, "client-risk-profile", { limit: 30, windowSeconds: 60 });
  if (blocked) return blocked;

  // Verificar autenticación
  const { advisor, error: authError } = await requireAdvisor();
  if (authError) return authError;

  const { id: clientId } = await params;
  const supabase = createAdminClient();

  try {
    // Verificar que el cliente pertenezca al advisor
    const { data: client, error: clientError } = await supabase
      .from("clients")
      .select("id, email, nombre, apellido, asesor_id")
      .eq("id", clientId)
      .single();

    if (clientError || !client) {
      return NextResponse.json(
        { success: false, error: "Cliente no encontrado" },
        { status: 404 }
      );
    }

    // Solo puede ver clientes sin asesor o propios
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

    // Obtener el perfil de riesgo más reciente
    const { data: profile, error: profileError } = await supabase
      .from("risk_profiles")
      .select("*")
      .eq("client_id", clientId)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    if (profileError || !profile) {
      return NextResponse.json(
        { success: false, error: "No se encontró perfil de riesgo para este cliente" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      profile: {
        id: profile.id,
        client_id: profile.client_id,
        capacity_score: profile.capacity_score,
        tolerance_score: profile.tolerance_score,
        perception_score: profile.perception_score,
        composure_score: profile.composure_score,
        global_score: profile.global_score,
        profile_label: profile.profile_label,
        created_at: profile.created_at,
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Error al obtener perfil de riesgo";
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
