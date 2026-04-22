// app/api/advisors/route.ts
// Lista asesores disponibles (para compartir clientes, etc.)

import { NextRequest, NextResponse } from "next/server";
import { requireAdvisor, createAdminClient, getSubordinateAdvisorIds } from "@/lib/auth/api-auth";
import { applyRateLimit } from "@/lib/rate-limit";

export async function GET(request: NextRequest) {
  const blocked = await applyRateLimit(request, "advisors-list", { limit: 30, windowSeconds: 60 });
  if (blocked) return blocked;

  const { advisor, error: authError } = await requireAdvisor();
  if (authError) return authError;

  const supabase = createAdminClient();

  try {
    // Admin ve todos los subordinados + sí mismo
    // Advisor normal ve a su admin + compañeros (mismo parent)
    let query = supabase
      .from("advisors")
      .select("id, nombre, apellido, email, rol")
      .eq("activo", true)
      .order("nombre");

    if (advisor!.rol === "admin") {
      // Admin: ver todos sus subordinados
      const allowedIds = await getSubordinateAdvisorIds(advisor!.id);
      query = query.in("id", allowedIds);
    } else if (advisor!.parent_advisor_id) {
      // Advisor con parent: ver compañeros del mismo equipo
      const teamIds = await getSubordinateAdvisorIds(advisor!.parent_advisor_id);
      query = query.in("id", teamIds);
    } else {
      // Advisor independiente: solo se ve a sí mismo
      query = query.eq("id", advisor!.id);
    }

    const { data: advisors, error } = await query;

    if (error) throw error;

    return NextResponse.json({
      success: true,
      advisors: advisors || [],
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error al obtener asesores";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
