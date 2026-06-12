// app/api/clients/route.ts

import { NextRequest, NextResponse } from "next/server";
import { requireAdvisor, createAdminClient, getSubordinateAdvisorIds, getSharedClientIds } from "@/lib/auth/api-auth";
import { sanitizeSearchInput } from "@/lib/sanitize";
import { applyRateLimit } from "@/lib/rate-limit";
import { logAuditEvent } from "@/lib/audit";
import { handleApiError } from "@/lib/api-response";

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

  return handleApiError("clients-get", async () => {
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

    // Obtener clientes compartidos conmigo
    const sharedClientIds = await getSharedClientIds(advisor!.id);

    // Build client query with parameterized filters (no string interpolation in .or())
    let query = supabase
      .from("clients")
      .select("*")
      .order("created_at", { ascending: false });

    if (advisorFilter && advisor!.rol === 'admin' && allowedAdvisorIds.includes(advisorFilter)) {
      // Admin filtrando por un asesor específico
      query = query.eq("asesor_id", advisorFilter);
    } else {
      // Mostrar todos los permitidos + huérfanos + compartidos
      // Use .in() for advisor IDs and separate query for shared + orphans
      const allVisibleIds = [...allowedAdvisorIds];
      // Fetch clients by asesor_id IN allowed list + orphans (asesor_id is null)
      // Supabase doesn't support .in() + .is(null) in one filter, so fetch separately
      const ownPromise = supabase.from("clients").select("*").in("asesor_id", allVisibleIds).order("created_at", { ascending: false });
      const orphanPromise = supabase.from("clients").select("*").is("asesor_id", null).order("created_at", { ascending: false });
      const sharedPromise = sharedClientIds.length > 0
        ? supabase.from("clients").select("*").in("id", sharedClientIds).order("created_at", { ascending: false })
        : Promise.resolve({ data: [] as Record<string, unknown>[], error: null });
      const [ownRes, orphanRes, sharedRes] = await Promise.all([ownPromise, orphanPromise, sharedPromise]);

      if (ownRes.error) throw ownRes.error;
      if (orphanRes.error) throw orphanRes.error;
      if (sharedRes.error) throw sharedRes.error;

      // Merge and deduplicate by id
      const seen = new Set<string>();
      const merged = [...(ownRes.data || []), ...(orphanRes.data || []), ...(sharedRes.data || [])]
        .filter((c) => { if (seen.has(c.id)) return false; seen.add(c.id); return true; })
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

      // Apply remaining filters in-memory (status, perfilRiesgo, search already applied below)
      // But we need to return early with the merged result, applying filters
      let filtered = merged;
      if (status) filtered = filtered.filter((c) => c.status === status);
      if (perfilRiesgo) filtered = filtered.filter((c) => c.perfil_riesgo === perfilRiesgo);
      if (search) {
        const s = search.toLowerCase();
        filtered = filtered.filter((c) =>
          (c.nombre || "").toLowerCase().includes(s) ||
          (c.apellido || "").toLowerCase().includes(s) ||
          (c.email || "").toLowerCase().includes(s)
        );
      }

      return NextResponse.json({ success: true, clients: filtered, total: filtered.length });
    }

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
  
  });
}

// POST - Crear nuevo cliente (asignado al advisor autenticado)
export async function POST(request: NextRequest) {
  const blocked = await applyRateLimit(request, "clients-post", { limit: 10, windowSeconds: 60 });
  if (blocked) return blocked;

  // Verificar autenticación
  const { advisor, error: authError } = await requireAdvisor();
  if (authError) return authError;

  const supabase = createAdminClient();

  return handleApiError("clients-post", async () => {
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
  
  });
}
