// app/api/clients/[id]/route.ts

import { NextRequest, NextResponse } from "next/server";
import { requireAdvisor, createAdminClient } from "@/lib/auth/api-auth";

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
 * Verifica que el cliente pertenece al advisor autenticado o no tiene asesor asignado.
 * Clientes sin asesor (huérfanos) pueden ser accedidos para asignarlos.
 */
async function verifyClientAccess(
  supabase: ReturnType<typeof createAdminClient>,
  clientId: string,
  advisorId: string
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

  return {
    exists: true,
    canAccess: isOwned || isOrphan, // Puede acceder si es suyo o si no tiene asesor
    isOrphan,
  };
}

// GET - Obtener un cliente específico (si pertenece al advisor o no tiene asesor)
export async function GET(
  request: NextRequest,
  context: RouteContext
) {
  // Verificar autenticación
  const { advisor, error: authError } = await requireAdvisor();
  if (authError) return authError;

  const supabase = createAdminClient();

  try {
    const { id } = await context.params;

    // Verificar acceso al cliente
    const access = await verifyClientAccess(supabase, id, advisor!.id);
    if (!access.exists) {
      return NextResponse.json(
        { success: false, error: "Cliente no encontrado" },
        { status: 404 }
      );
    }
    if (!access.canAccess) {
      return NextResponse.json(
        { success: false, error: "No tiene permiso para ver este cliente" },
        { status: 403 }
      );
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

    if (error) {
      throw error;
    }

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

    return NextResponse.json({
      success: true,
      client,
      associatedClients: associatedClients || [],
      parentClient,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Error al obtener cliente";
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}

// PUT - Actualizar cliente (si pertenece al advisor o no tiene asesor)
// Si el cliente no tiene asesor, se asigna automáticamente al advisor que lo edita
export async function PUT(
  request: NextRequest,
  context: RouteContext
) {
  // Verificar autenticación
  const { advisor, error: authError } = await requireAdvisor();
  if (authError) return authError;

  const supabase = createAdminClient();

  try {
    const { id } = await context.params;

    // Verificar acceso al cliente
    const access = await verifyClientAccess(supabase, id, advisor!.id);
    if (!access.exists) {
      return NextResponse.json(
        { success: false, error: "Cliente no encontrado" },
        { status: 404 }
      );
    }
    if (!access.canAccess) {
      return NextResponse.json(
        { success: false, error: "No tiene permiso para modificar este cliente" },
        { status: 403 }
      );
    }

    const body = await request.json();

    // Campos permitidos para actualización (whitelist)
    const allowedFields = [
      'nombre', 'apellido', 'email', 'telefono', 'rut',
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
      if (error.code === "PGRST116") {
        return NextResponse.json(
          { success: false, error: "Cliente no encontrado" },
          { status: 404 }
        );
      }
      throw error;
    }

    // Registrar la actualización
    await supabase.from("client_interactions").insert([
      {
        client_id: id,
        tipo: "otro",
        titulo: "Información Actualizada",
        descripcion: "Datos del cliente actualizados en el sistema",
        resultado: "exitoso",
        created_by: advisor!.email,
      },
    ]);

    return NextResponse.json({
      success: true,
      client: updatedClient,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Error al actualizar cliente";
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}

// DELETE - Desactivar cliente (soft delete)
// NOTA: Hard delete removido por seguridad. Solo se permite soft delete.
export async function DELETE(
  request: NextRequest,
  context: RouteContext
) {
  // Verificar autenticación
  const { advisor, error: authError } = await requireAdvisor();
  if (authError) return authError;

  const supabase = createAdminClient();

  try {
    const { id } = await context.params;

    // Verificar acceso al cliente
    const access = await verifyClientAccess(supabase, id, advisor!.id);
    if (!access.exists) {
      return NextResponse.json(
        { success: false, error: "Cliente no encontrado" },
        { status: 404 }
      );
    }
    if (!access.canAccess) {
      return NextResponse.json(
        { success: false, error: "No tiene permiso para eliminar este cliente" },
        { status: 403 }
      );
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
        return NextResponse.json(
          { success: false, error: "Cliente no encontrado" },
          { status: 404 }
        );
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

    return NextResponse.json({
      success: true,
      message: "Cliente marcado como inactivo",
      client,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Error al eliminar cliente";
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
