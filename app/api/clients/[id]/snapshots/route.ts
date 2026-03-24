// app/api/clients/[id]/snapshots/route.ts
// Delete all snapshots for a client

import { NextRequest, NextResponse } from "next/server";
import { requireAdvisor, createAdminClient, getSubordinateAdvisorIds } from "@/lib/auth/api-auth";
import { applyRateLimit } from "@/lib/rate-limit";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function DELETE(
  request: NextRequest,
  context: RouteContext
) {
  const blocked = applyRateLimit(request, "delete-all-snapshots", { limit: 3, windowSeconds: 60 });
  if (blocked) return blocked;

  const { advisor, error: authError } = await requireAdvisor();
  if (authError) return authError;

  const supabase = createAdminClient();

  try {
    const { id: clientId } = await context.params;

    // Verify client belongs to advisor
    const { data: client } = await supabase
      .from("clients")
      .select("id, asesor_id")
      .eq("id", clientId)
      .single();

    if (!client) {
      return NextResponse.json(
        { success: false, error: "No autorizado" },
        { status: 403 }
      );
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

    // Delete all snapshots for this client
    const { error, count } = await supabase
      .from("portfolio_snapshots")
      .delete({ count: "exact" })
      .eq("client_id", clientId);

    if (error) {
      console.error("Error deleting all snapshots:", error);
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      deleted: count,
    });
  } catch (error) {
    console.error("Error in DELETE all snapshots:", error);
    return NextResponse.json(
      { success: false, error: "Error interno del servidor" },
      { status: 500 }
    );
  }
}
