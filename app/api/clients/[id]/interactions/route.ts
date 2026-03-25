// app/api/clients/[id]/interactions/route.ts

import { NextRequest, NextResponse } from "next/server";
import { requireAdvisor, createAdminClient, getSubordinateAdvisorIds } from "@/lib/auth/api-auth";
import { rateLimit, getClientIp } from "@/lib/rate-limit";

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * Verifica que el cliente pertenece al advisor, no tiene asesor asignado,
 * o pertenece a un subordinado (si el advisor es admin).
 */
async function verifyClientAccess(
  supabase: ReturnType<typeof createAdminClient>,
  clientId: string,
  advisor: { id: string; rol: string }
): Promise<boolean> {
  const { data: client } = await supabase
    .from("clients")
    .select("id, asesor_id")
    .eq("id", clientId)
    .single();

  if (!client) return false;
  // Puede acceder si es suyo o si no tiene asesor
  if (client.asesor_id === advisor.id || client.asesor_id === null) return true;
  // Admin puede acceder a clientes de subordinados
  if (advisor.rol === "admin") {
    const allowedIds = await getSubordinateAdvisorIds(advisor.id);
    return allowedIds.includes(client.asesor_id);
  }
  return false;
}

// GET - Obtener interacciones de un cliente (si pertenece al advisor o no tiene asesor)
export async function GET(
  request: NextRequest,
  { params }: RouteContext
) {
  // Verificar autenticación
  const { advisor, error: authError } = await requireAdvisor();
  if (authError) return authError;

  const { id } = await params;
  const supabase = createAdminClient();

  try {
    // Verificar acceso al cliente
    const canAccess = await verifyClientAccess(supabase, id, advisor!);
    if (!canAccess) {
      return NextResponse.json(
        { success: false, error: "Cliente no encontrado" },
        { status: 404 }
      );
    }

    const { data: interactions, error } = await supabase
      .from("client_interactions")
      .select("*")
      .eq("client_id", id)
      .order("fecha", { ascending: false });

    if (error) throw error;

    return NextResponse.json({
      success: true,
      interactions,
      total: interactions.length,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Error al obtener interacciones";
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}

// POST - Crear nueva interacción (si el cliente pertenece al advisor o no tiene asesor)
export async function POST(
  request: NextRequest,
  { params }: RouteContext
) {
  // Rate limiting
  const { allowed } = rateLimit(`interactions-post:${getClientIp(request)}`, { limit: 10, windowSeconds: 60 });
  if (!allowed) {
    return NextResponse.json(
      { success: false, error: "Demasiadas solicitudes. Intenta en un momento." },
      { status: 429 }
    );
  }

  // Verificar autenticación
  const { advisor, error: authError } = await requireAdvisor();
  if (authError) return authError;

  const { id } = await params;
  const supabase = createAdminClient();

  try {
    // Verificar acceso al cliente
    const canAccess = await verifyClientAccess(supabase, id, advisor!);
    if (!canAccess) {
      return NextResponse.json(
        { success: false, error: "Cliente no encontrado o no tiene permiso" },
        { status: 404 }
      );
    }

    const body = await request.json();

    // Validar campos requeridos
    if (!body.tipo || !body.titulo) {
      return NextResponse.json(
        { success: false, error: "Tipo y título son requeridos" },
        { status: 400 }
      );
    }

    // Crear interacción con el advisor autenticado como creador
    const { data: newInteraction, error } = await supabase
      .from("client_interactions")
      .insert([
        {
          client_id: id,
          tipo: body.tipo,
          titulo: body.titulo,
          descripcion: body.descripcion || null,
          resultado: body.resultado || "exitoso",
          duracion_minutos: body.duracion_minutos || null,
          archivo_adjunto: body.archivo_adjunto || null,
          created_by: advisor!.email, // Siempre el advisor autenticado
        },
      ])
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({
      success: true,
      interaction: newInteraction,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Error al crear interacción";
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
