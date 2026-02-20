// app/api/advisor/meetings/route.ts

import { NextRequest, NextResponse } from "next/server";
import { requireAdvisor, createAdminClient } from "@/lib/auth/api-auth";
import { rateLimit, getClientIp } from "@/lib/rate-limit";

// GET - Obtener reuniones del asesor autenticado
export async function GET(request: NextRequest) {
  // Rate limiting
  const { allowed, remaining } = rateLimit(`meetings:${getClientIp(request)}`, { limit: 30, windowSeconds: 60 });
  if (!allowed) {
    return NextResponse.json(
      { success: false, error: "Demasiadas solicitudes. Intenta en un momento." },
      { status: 429, headers: { "X-RateLimit-Remaining": String(remaining) } }
    );
  }

  // Verificar autenticación
  const { advisor, error: authError } = await requireAdvisor();
  if (authError) return authError;

  const supabase = createAdminClient();

  try {
    const { searchParams } = new URL(request.url);
    const timeframe = searchParams.get("timeframe") || "upcoming";

    let query = supabase
      .from("meetings")
      .select(`
        *,
        clients (
          id,
          nombre,
          apellido,
          email,
          telefono,
          perfil_riesgo
        )
      `)
      .eq("asesor_id", advisor!.id)
      .eq("cancelada", false)
      .order("fecha", { ascending: true });

    // Filtros por timeframe
    const now = new Date();

    if (timeframe === "upcoming" || timeframe === "today") {
      query = query.gte("fecha", now.toISOString()).eq("completada", false);
    }

    if (timeframe === "today") {
      const tomorrow = new Date(now);
      tomorrow.setDate(tomorrow.getDate() + 1);
      tomorrow.setHours(0, 0, 0, 0);
      query = query.lt("fecha", tomorrow.toISOString());
    }

    if (timeframe === "week") {
      const startOfWeek = new Date(now);
      startOfWeek.setDate(now.getDate() - now.getDay());
      startOfWeek.setHours(0, 0, 0, 0);

      const endOfWeek = new Date(startOfWeek);
      endOfWeek.setDate(endOfWeek.getDate() + 7);

      query = query
        .gte("fecha", startOfWeek.toISOString())
        .lt("fecha", endOfWeek.toISOString())
        .eq("completada", false);
    }

    const { data: meetings, error } = await query;

    if (error) throw error;

    return NextResponse.json({
      success: true,
      meetings: meetings || [],
      total: meetings?.length || 0,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Error al obtener reuniones";
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}

// POST - Crear nueva reunión (solo para clientes del asesor)
export async function POST(request: NextRequest) {
  // Rate limiting
  const { allowed } = rateLimit(`meetings-post:${getClientIp(request)}`, { limit: 10, windowSeconds: 60 });
  if (!allowed) {
    return NextResponse.json(
      { success: false, error: "Demasiadas solicitudes. Intenta en un momento." },
      { status: 429 }
    );
  }

  // Verificar autenticación
  const { advisor, error: authError } = await requireAdvisor();
  if (authError) return authError;

  const supabase = createAdminClient();

  try {
    const body = await request.json();

    // Validar campos requeridos
    if (!body.client_id || !body.titulo || !body.fecha) {
      return NextResponse.json(
        { success: false, error: "client_id, titulo y fecha son requeridos" },
        { status: 400 }
      );
    }

    // Verificar que el cliente pertenece al asesor autenticado
    const { data: client } = await supabase
      .from("clients")
      .select("id")
      .eq("id", body.client_id)
      .eq("asesor_id", advisor!.id)
      .single();

    if (!client) {
      return NextResponse.json(
        { success: false, error: "Cliente no encontrado o no tiene permiso" },
        { status: 404 }
      );
    }

    // Crear reunión asignada al asesor autenticado
    const { data: newMeeting, error } = await supabase
      .from("meetings")
      .insert([
        {
          client_id: body.client_id,
          asesor_id: advisor!.id, // Siempre el asesor autenticado
          titulo: body.titulo,
          descripcion: body.descripcion || null,
          fecha: body.fecha,
          duracion_minutos: body.duracion_minutos || 60,
          tipo: body.tipo || "presencial",
          ubicacion: body.ubicacion || null,
          link_virtual: body.link_virtual || null,
        },
      ])
      .select()
      .single();

    if (error) throw error;

    // Crear interacción en el cliente
    await supabase.from("client_interactions").insert([
      {
        client_id: body.client_id,
        tipo: "reunion",
        titulo: `Reunión agendada: ${body.titulo}`,
        descripcion: `Reunión programada para ${new Date(body.fecha).toLocaleDateString("es-CL")}`,
        resultado: "pendiente",
        created_by: advisor!.email,
      },
    ]);

    return NextResponse.json({
      success: true,
      meeting: newMeeting,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Error al crear reunión";
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
