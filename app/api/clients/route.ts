// app/api/clients/route.ts

import { NextRequest, NextResponse } from "next/server";
import { requireAdvisor, createAdminClient, getSubordinateAdvisorIds } from "@/lib/auth/api-auth";
import { sanitizeSearchInput } from "@/lib/sanitize";
import { applyRateLimit } from "@/lib/rate-limit";
import { logAuditEvent } from "@/lib/audit";

// GET - Obtener lista de clientes
// - Advisor normal: ve sus clientes + huérfanos
// - Admin: ve sus clientes + clientes de subordinados + huérfanos
export async function GET(request: NextRequest) {
  const blocked = await applyRateLimit(request, "clients-list", { limit: 30, windowSeconds: 60 });
  if (blocked) return blocked;

  // Verificar autenticación
  const { advisor, error: authError } = await requireAdvisor();
  if (authError) return authError;

  const supabase = createAdminClient();

  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status");
    const perfilRiesgo = searchParams.get("perfil_riesgo");
    const search = searchParams.get("search");
    const advisorFilter = searchParams.get("advisor_id"); // Para filtrar por asesor específico (solo admins)

    // Determinar qué asesores puede ver este usuario
    let allowedAdvisorIds: string[] = [advisor!.id];

    if (advisor!.rol === 'admin') {
      // Admin puede ver clientes de todos sus subordinados
      allowedAdvisorIds = await getSubordinateAdvisorIds(advisor!.id);
    }

    // Construir filtro de asesores
    let advisorFilterStr: string;
    if (advisorFilter && advisor!.rol === 'admin' && allowedAdvisorIds.includes(advisorFilter)) {
      // Admin filtrando por un asesor específico
      advisorFilterStr = `asesor_id.eq.${advisorFilter}`;
    } else {
      // Mostrar todos los permitidos + huérfanos
      const idsFilter = allowedAdvisorIds.map(id => `asesor_id.eq.${id}`).join(',');
      advisorFilterStr = `${idsFilter},asesor_id.is.null`;
    }

    let query = supabase
      .from("clients")
      .select("*")
      .or(advisorFilterStr)
      .order("created_at", { ascending: false });

    if (status) {
      query = query.eq("status", status);
    }

    if (perfilRiesgo) {
      query = query.eq("perfil_riesgo", perfilRiesgo);
    }

    if (search) {
      const sanitized = sanitizeSearchInput(search);
      query = query.or(
        `nombre.ilike.%${sanitized}%,apellido.ilike.%${sanitized}%,email.ilike.%${sanitized}%`
      );
    }

    const { data: clients, error } = await query;

    if (error) throw error;

    return NextResponse.json({
      success: true,
      clients: clients || [],
      total: clients?.length || 0,
      isAdmin: advisor!.rol === 'admin',
      allowedAdvisorIds,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Error al obtener clientes";
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}

// POST - Crear nuevo cliente (asignado al advisor autenticado)
export async function POST(request: NextRequest) {
  const blocked = await applyRateLimit(request, "clients-post", { limit: 10, windowSeconds: 60 });
  if (blocked) return blocked;

  // Verificar autenticación
  const { advisor, error: authError } = await requireAdvisor();
  if (authError) return authError;

  const supabase = createAdminClient();

  try {
    const body = await request.json();

    // Validar campos requeridos
    if (!body.nombre || !body.apellido || !body.email) {
      return NextResponse.json(
        {
          success: false,
          error: "nombre, apellido y email son requeridos",
        },
        { status: 400 }
      );
    }

    // Verificar que el email no exista para este advisor
    const { data: existingClient } = await supabase
      .from("clients")
      .select("id")
      .eq("email", body.email)
      .eq("asesor_id", advisor!.id)
      .single();

    if (existingClient) {
      return NextResponse.json(
        {
          success: false,
          error: "Ya existe un cliente con ese email",
        },
        { status: 400 }
      );
    }

    // Helper: convert empty strings to null for date/numeric fields
    const emptyToNull = (v: unknown) => (v === "" || v === undefined) ? null : v;

    // Crear cliente asignado al advisor autenticado
    const { data: newClient, error } = await supabase
      .from("clients")
      .insert([
        {
          nombre: body.nombre,
          apellido: body.apellido,
          email: body.email,
          telefono: body.telefono || null,
          rut: body.rut || null,
          fecha_nacimiento: emptyToNull(body.fecha_nacimiento),
          patrimonio_estimado: emptyToNull(body.patrimonio_estimado),
          ingreso_mensual: emptyToNull(body.ingreso_mensual),
          objetivo_inversion: body.objetivo_inversion || null,
          horizonte_temporal: body.horizonte_temporal || "largo_plazo",
          perfil_riesgo: body.perfil_riesgo || null,
          puntaje_riesgo: emptyToNull(body.puntaje_riesgo),
          tolerancia_perdida: emptyToNull(body.tolerancia_perdida),
          status: body.status || "prospecto",
          notas: body.notas || null,
          asesor_id: advisor!.id, // Siempre asignar al advisor autenticado
          parent_client_id: emptyToNull(body.parent_client_id),
        },
      ])
      .select()
      .single();

    if (error) throw error;

    // Fire-and-forget audit log
    logAuditEvent({
      advisorId: advisor!.id,
      action: "create",
      entityType: "client",
      entityId: newClient?.id,
      details: { nombre: body.nombre, apellido: body.apellido, email: body.email },
    }).catch(() => {});

    return NextResponse.json({
      success: true,
      client: newClient,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Error al crear cliente";
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
