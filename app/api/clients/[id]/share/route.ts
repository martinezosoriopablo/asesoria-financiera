// app/api/clients/[id]/share/route.ts
// Compartir/dejar de compartir un cliente con otro asesor

import { NextRequest, NextResponse } from "next/server";
import { requireAdvisor, createAdminClient, getSubordinateAdvisorIds } from "@/lib/auth/api-auth";
import { applyRateLimit } from "@/lib/rate-limit";

interface RouteContext {
  params: Promise<{ id: string }>;
}

// GET - Obtener asesores con acceso compartido a este cliente
export async function GET(request: NextRequest, context: RouteContext) {
  const blocked = await applyRateLimit(request, "client-share", { limit: 30, windowSeconds: 60 });
  if (blocked) return blocked;

  const { advisor, error: authError } = await requireAdvisor();
  if (authError) return authError;

  const supabase = createAdminClient();
  const { id: clientId } = await context.params;

  // Verificar acceso al cliente
  const hasAccess = await verifyClientAccess(supabase, clientId, advisor!);
  if (!hasAccess) {
    return NextResponse.json({ success: false, error: "No autorizado" }, { status: 403 });
  }

  const { data: shares, error } = await supabase
    .from("client_advisors")
    .select(`
      id,
      advisor_id,
      role,
      created_at,
      shared_by,
      advisor:advisors!client_advisors_advisor_id_fkey(id, nombre, apellido, email)
    `)
    .eq("client_id", clientId);

  if (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, shares: shares || [] });
}

// POST - Compartir cliente con otro asesor
export async function POST(request: NextRequest, context: RouteContext) {
  const blocked = await applyRateLimit(request, "client-share", { limit: 10, windowSeconds: 60 });
  if (blocked) return blocked;

  const { advisor, error: authError } = await requireAdvisor();
  if (authError) return authError;

  const supabase = createAdminClient();
  const { id: clientId } = await context.params;

  // Verificar que el advisor es dueño del cliente o admin
  const { data: client } = await supabase
    .from("clients")
    .select("id, asesor_id, nombre, apellido")
    .eq("id", clientId)
    .single();

  if (!client) {
    return NextResponse.json({ success: false, error: "Cliente no encontrado" }, { status: 404 });
  }

  const isOwner = client.asesor_id === advisor!.id;
  const isAdmin = advisor!.rol === "admin";

  if (!isOwner && !isAdmin) {
    return NextResponse.json(
      { success: false, error: "Solo el dueño del cliente o un admin puede compartirlo" },
      { status: 403 }
    );
  }

  const body = await request.json();
  const { advisor_id: targetAdvisorId, role = "viewer" } = body;

  if (!targetAdvisorId) {
    return NextResponse.json(
      { success: false, error: "advisor_id es requerido" },
      { status: 400 }
    );
  }

  if (!["editor", "viewer"].includes(role)) {
    return NextResponse.json(
      { success: false, error: "role debe ser 'editor' o 'viewer'" },
      { status: 400 }
    );
  }

  // No compartir consigo mismo
  if (targetAdvisorId === advisor!.id) {
    return NextResponse.json(
      { success: false, error: "No puedes compartir un cliente contigo mismo" },
      { status: 400 }
    );
  }

  // No compartir con el dueño actual
  if (targetAdvisorId === client.asesor_id) {
    return NextResponse.json(
      { success: false, error: "Este asesor ya es el dueño del cliente" },
      { status: 400 }
    );
  }

  // Verificar que el target advisor existe y está activo
  const { data: targetAdvisor } = await supabase
    .from("advisors")
    .select("id, nombre, apellido, activo")
    .eq("id", targetAdvisorId)
    .eq("activo", true)
    .single();

  if (!targetAdvisor) {
    return NextResponse.json(
      { success: false, error: "Asesor destino no encontrado o inactivo" },
      { status: 404 }
    );
  }

  // Crear share (upsert para actualizar role si ya existe)
  const { data: share, error } = await supabase
    .from("client_advisors")
    .upsert(
      {
        client_id: clientId,
        advisor_id: targetAdvisorId,
        role,
        shared_by: advisor!.id,
      },
      { onConflict: "client_id,advisor_id" }
    )
    .select()
    .single();

  if (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    success: true,
    share,
    message: `Cliente compartido con ${targetAdvisor.nombre} ${targetAdvisor.apellido}`,
  });
}

// DELETE - Dejar de compartir cliente
export async function DELETE(request: NextRequest, context: RouteContext) {
  const blocked = await applyRateLimit(request, "client-share", { limit: 10, windowSeconds: 60 });
  if (blocked) return blocked;

  const { advisor, error: authError } = await requireAdvisor();
  if (authError) return authError;

  const supabase = createAdminClient();
  const { id: clientId } = await context.params;

  const { searchParams } = new URL(request.url);
  const targetAdvisorId = searchParams.get("advisor_id");

  if (!targetAdvisorId) {
    return NextResponse.json(
      { success: false, error: "advisor_id query param requerido" },
      { status: 400 }
    );
  }

  // Verificar que el advisor es dueño o admin
  const { data: client } = await supabase
    .from("clients")
    .select("id, asesor_id")
    .eq("id", clientId)
    .single();

  if (!client) {
    return NextResponse.json({ success: false, error: "Cliente no encontrado" }, { status: 404 });
  }

  const isOwner = client.asesor_id === advisor!.id;
  const isAdmin = advisor!.rol === "admin";
  const isSelf = targetAdvisorId === advisor!.id; // Un asesor puede quitarse a sí mismo

  if (!isOwner && !isAdmin && !isSelf) {
    return NextResponse.json({ success: false, error: "No autorizado" }, { status: 403 });
  }

  const { error } = await supabase
    .from("client_advisors")
    .delete()
    .eq("client_id", clientId)
    .eq("advisor_id", targetAdvisorId);

  if (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, message: "Acceso compartido eliminado" });
}

// Helper para verificar acceso
async function verifyClientAccess(
  supabase: ReturnType<typeof createAdminClient>,
  clientId: string,
  advisor: { id: string; rol: string }
) {
  const { data: client } = await supabase
    .from("clients")
    .select("asesor_id")
    .eq("id", clientId)
    .single();

  if (!client) return false;

  // Dueño directo
  if (client.asesor_id === advisor.id) return true;

  // Admin con subordinados
  if (advisor.rol === "admin") {
    const allowedIds = await getSubordinateAdvisorIds(advisor.id);
    if (client.asesor_id && allowedIds.includes(client.asesor_id)) return true;
  }

  // Compartido conmigo
  const { data: share } = await supabase
    .from("client_advisors")
    .select("id")
    .eq("client_id", clientId)
    .eq("advisor_id", advisor.id)
    .single();

  return !!share;
}
