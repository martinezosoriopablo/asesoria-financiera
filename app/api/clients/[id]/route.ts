// app/api/clients/[id]/route.ts

import { NextRequest, NextResponse } from "next/server";
import { requireAdvisor, createAdminClient, getSubordinateAdvisorIds } from "@/lib/auth/api-auth";
import { applyRateLimit } from "@/lib/rate-limit";
import { successResponse, errorResponse, handleApiError } from "@/lib/api-response";
import { logAuditEvent } from "@/lib/audit";

interface RouteContext {
  params: Promise<{ id: string }>;
}

interface ClientInteraction {
  id: string;
  tipo: string;
  titulo: string;
  descripcion: string;
  resultado: string;
  duracion_minutos: number | null;
  fecha: string;
  created_by: string | null;
}

/**
 * Verifica que el cliente pertenece al advisor autenticado, a un subordinado, o no tiene asesor asignado.
 * Admins pueden acceder a clientes de sus subordinados.
 */
async function verifyClientAccess(
  supabase: ReturnType<typeof createAdminClient>,
  clientId: string,
  advisorId: string,
  allowedAdvisorIds?: string[]
) {
  const { data: client, error } = await supabase
    .from("clients")
    .select("id, asesor_id")
    .eq("id", clientId)
    .single();

  if (error || !client) {
    return { exists: false, canAccess: false, isOrphan: false };
  }

  const isOrphan = client.asesor_id === null;
  const isOwned = client.asesor_id === advisorId;
  const isSubordinate = allowedAdvisorIds
    ? allowedAdvisorIds.includes(client.asesor_id)
    : false;

  return {
    exists: true,
    canAccess: isOwned || isOrphan || isSubordinate,
    isOrphan,
  };
}

// GET - Obtener un cliente específico (si pertenece al advisor o no tiene asesor)
export async function GET(
  request: NextRequest,
  context: RouteContext
) {
  const blocked = await applyRateLimit(request, "client-get", { limit: 30, windowSeconds: 60 });
  if (blocked) return blocked;

  // Verificar autenticación
  const { advisor, error: authError } = await requireAdvisor();
  if (authError) return authError;

  const supabase = createAdminClient();

  return handleApiError("client-get", async () => {
    const { id } = await context.params;

    // Admins can access clients of subordinates
    const allowedIds = advisor!.rol === "admin"
      ? await getSubordinateAdvisorIds(advisor!.id)
      : undefined;

    // Verificar acceso al cliente
    const access = await verifyClientAccess(supabase, id, advisor!.id, allowedIds);
    if (!access.exists) {
      return errorResponse("Cliente no encontrado", 404);
    }
    if (!access.canAccess) {
      return errorResponse("No tiene permiso para ver este cliente", 403);
    }

    // Obtener cliente con interacciones
    const { data: client, error } = await supabase
      .from("clients")
      .select(`
        *,
        client_interactions (
          id,
          tipo,
          titulo,
          descripcion,
          resultado,
          duracion_minutos,
          fecha,
          created_by
        )
      `)
      .eq("id", id)
      .single();

    if (error) throw error;

    // Ordenar interacciones por fecha (más reciente primero)
    if (client.client_interactions) {
      client.client_interactions.sort(
        (a: ClientInteraction, b: ClientInteraction) =>
          new Date(b.fecha).getTime() - new Date(a.fecha).getTime()
      );
    }

    // Obtener clientes asociados (grupo familiar)
    const { data: associatedClients } = await supabase
      .from("clients")
      .select("id, nombre, apellido, email, rut, perfil_riesgo, puntaje_riesgo")
      .eq("parent_client_id", id)
      .eq("status", "activo");

    // Si es un cliente asociado, obtener info del titular
    let parentClient = null;
    if (client.parent_client_id) {
      const { data: parent } = await supabase
        .from("clients")
        .select("id, nombre, apellido, email, perfil_riesgo, puntaje_riesgo")
        .eq("id", client.parent_client_id)
        .single();
      parentClient = parent;
    }

    return successResponse({ client, associatedClients: associatedClients || [], parentClient });
  });
}

// PUT - Actualizar cliente (si pertenece al advisor o no tiene asesor)
// Si el cliente no tiene asesor, se asigna automáticamente al advisor que lo edita
export async function PUT(
  request: NextRequest,
  context: RouteContext
) {
  const blocked = await applyRateLimit(request, "client-put", { limit: 10, windowSeconds: 60 });
  if (blocked) return blocked;

  // Verificar autenticación
  const { advisor, error: authError } = await requireAdvisor();
  if (authError) return authError;

  const supabase = createAdminClient();

  return handleApiError("client-put", async () => {
    const { id } = await context.params;

    const allowedIds = advisor!.rol === "admin"
      ? await getSubordinateAdvisorIds(advisor!.id)
      : undefined;

    // Verificar acceso al cliente
    const access = await verifyClientAccess(supabase, id, advisor!.id, allowedIds);
    if (!access.exists) {
      return errorResponse("Cliente no encontrado", 404);
    }
    if (!access.canAccess) {
      return errorResponse("No tiene permiso para modificar este cliente", 403);
    }

    const body = await request.json();

    // Campos permitidos para actualización (whitelist)
    const allowedFields = [
      'nombre', 'apellido', 'email', 'telefono', 'rut', 'fecha_nacimiento',
      'patrimonio_estimado', 'ingreso_mensual', 'objetivo_inversion',
      'horizonte_temporal', 'perfil_riesgo', 'puntaje_riesgo', 'parent_client_id',
      'tolerancia_perdida', 'tiene_portfolio', 'portfolio_data',
      'status', 'notas'
    ];

    const updateData: Record<string, unknown> = {};
    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        updateData[field] = body[field];
      }
    }

    // Si el cliente no tiene asesor, asignarlo al advisor actual
    if (access.isOrphan) {
      updateData.asesor_id = advisor!.id;
    }

    const { data: updatedClient, error } = await supabase
      .from("clients")
      .update(updateData)
      .eq("id", id)
      .select()
      .single();

    if (error) {
      console.error("Error updating client:", error.code, error.message, error.details);
      if (error.code === "PGRST116") {
        return errorResponse("Cliente no encontrado", 404);
      }
      return errorResponse("Error al actualizar: " + error.message, 400);
    }

    // Registrar la actualización (fire-and-forget, no bloquea el response)
    supabase.from("client_interactions").insert([
      {
        client_id: id,
        tipo: "otro",
        titulo: "Información Actualizada",
        descripcion: "Datos del cliente actualizados en el sistema",
        resultado: "exitoso",
        created_by: advisor!.email,
      },
    ]).then(({ error: intErr }) => {
      if (intErr) console.error("Error logging interaction:", intErr.message);
    });

    return successResponse({ client: updatedClient });
  });
}

// DELETE - Desactivar cliente (soft delete)
// NOTA: Hard delete removido por seguridad. Solo se permite soft delete.
export async function DELETE(
  request: NextRequest,
  context: RouteContext
) {
  const blocked = await applyRateLimit(request, "client-delete", { limit: 5, windowSeconds: 60 });
  if (blocked) return blocked;

  // Verificar autenticación
  const { advisor, error: authError } = await requireAdvisor();
  if (authError) return authError;

  const supabase = createAdminClient();

  return handleApiError("client-delete", async () => {
    const { id } = await context.params;

    const allowedIds = advisor!.rol === "admin"
      ? await getSubordinateAdvisorIds(advisor!.id)
      : undefined;

    // Verificar acceso al cliente
    const access = await verifyClientAccess(supabase, id, advisor!.id, allowedIds);
    if (!access.exists) {
      return errorResponse("Cliente no encontrado", 404);
    }
    if (!access.canAccess) {
      return errorResponse("No tiene permiso para eliminar este cliente", 403);
    }

    // Solo soft delete (marcar como inactivo)
    // Si es huérfano, también asignarlo al advisor que lo desactiva
    const updateData: Record<string, unknown> = { status: "inactivo" };
    if (access.isOrphan) {
      updateData.asesor_id = advisor!.id;
    }

    const { data: client, error } = await supabase
      .from("clients")
      .update(updateData)
      .eq("id", id)
      .select()
      .single();

    if (error) {
      if (error.code === "PGRST116") {
        return errorResponse("Cliente no encontrado", 404);
      }
      throw error;
    }

    // Registrar la desactivación
    await supabase.from("client_interactions").insert([
      {
        client_id: id,
        tipo: "otro",
        titulo: "Cliente Desactivado",
        descripcion: "Cliente marcado como inactivo",
        resultado: "exitoso",
        created_by: advisor!.email,
      },
    ]);

    // Fire-and-forget audit log
    logAuditEvent({
      advisorId: advisor!.id,
      action: "delete",
      entityType: "client",
      entityId: id,
      details: { nombre: client.nombre, apellido: client.apellido },
    }).catch(() => {});

    return successResponse({ message: "Cliente marcado como inactivo", client });
  });
}
