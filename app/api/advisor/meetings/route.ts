// app/api/advisor/meetings/route.ts

import { NextRequest, NextResponse } from "next/server";
import { requireAdvisor, createAdminClient } from "@/lib/auth/api-auth";
import { rateLimit, getClientIp } from "@/lib/rate-limit";
import { syncMeetingToGoogle, deleteMeetingFromGoogle, type Meeting } from "@/lib/google/calendar-client";

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

    // Sincronizar con Google Calendar si está conectado
    try {
      // Obtener datos del cliente para el evento
      const { data: clientData } = await supabase
        .from("clients")
        .select("nombre, apellido, email")
        .eq("id", body.client_id)
        .single();

      const meetingForSync: Meeting = {
        ...newMeeting,
        clients: clientData || undefined,
      };

      const googleEventId = await syncMeetingToGoogle(advisor!.id, meetingForSync);

      // Si se creó el evento en Google, guardar el ID
      if (googleEventId && googleEventId !== newMeeting.google_event_id) {
        await supabase
          .from("meetings")
          .update({ google_event_id: googleEventId })
          .eq("id", newMeeting.id);

        newMeeting.google_event_id = googleEventId;
      }
    } catch (syncError) {
      // No fallar si la sincronización falla, solo loggear
      console.error("Error sincronizando con Google Calendar:", syncError);
    }

    return NextResponse.json({
      success: true,
      meeting: newMeeting,
      googleSynced: !!newMeeting.google_event_id,
      googleError: !newMeeting.google_event_id ? "No se pudo sincronizar con Google Calendar" : null,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Error al crear reunión";
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}

// PATCH - Editar reunión existente
export async function PATCH(request: NextRequest) {
  const { allowed } = rateLimit(`meetings-patch:${getClientIp(request)}`, { limit: 10, windowSeconds: 60 });
  if (!allowed) {
    return NextResponse.json({ success: false, error: "Demasiadas solicitudes." }, { status: 429 });
  }

  const { advisor, error: authError } = await requireAdvisor();
  if (authError) return authError;

  const supabase = createAdminClient();

  try {
    const body = await request.json();
    const { id, ...updates } = body;

    if (!id) {
      return NextResponse.json({ success: false, error: "id es requerido" }, { status: 400 });
    }

    // Verificar que la reunión pertenece al asesor
    const { data: existing } = await supabase
      .from("meetings")
      .select("id, asesor_id, google_event_id, client_id")
      .eq("id", id)
      .eq("asesor_id", advisor!.id)
      .single();

    if (!existing) {
      return NextResponse.json({ success: false, error: "Reunión no encontrada" }, { status: 404 });
    }

    // Campos permitidos para actualizar
    const allowedFields: Record<string, unknown> = {};
    const editable = ["titulo", "descripcion", "fecha", "duracion_minutos", "tipo", "ubicacion", "link_virtual", "completada", "cancelada"];
    for (const key of editable) {
      if (key in updates) allowedFields[key] = updates[key];
    }

    const { data: updated, error } = await supabase
      .from("meetings")
      .update(allowedFields)
      .eq("id", id)
      .select(`*, clients (id, nombre, apellido, email)`)
      .single();

    if (error) throw error;

    // Sincronizar cambios con Google Calendar
    let googleSynced = false;
    try {
      const meetingForSync: Meeting = { ...updated, clients: updated.clients || undefined };
      const googleEventId = await syncMeetingToGoogle(advisor!.id, meetingForSync);
      if (googleEventId && googleEventId !== existing.google_event_id) {
        await supabase.from("meetings").update({ google_event_id: googleEventId }).eq("id", id);
      }
      googleSynced = !!googleEventId;
    } catch (syncError) {
      console.error("Error sincronizando con Google Calendar:", syncError);
    }

    return NextResponse.json({ success: true, meeting: updated, googleSynced });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Error al actualizar reunión";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

// DELETE - Eliminar/cancelar reunión
export async function DELETE(request: NextRequest) {
  const { allowed } = rateLimit(`meetings-delete:${getClientIp(request)}`, { limit: 10, windowSeconds: 60 });
  if (!allowed) {
    return NextResponse.json({ success: false, error: "Demasiadas solicitudes." }, { status: 429 });
  }

  const { advisor, error: authError } = await requireAdvisor();
  if (authError) return authError;

  const supabase = createAdminClient();

  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ success: false, error: "id es requerido" }, { status: 400 });
    }

    // Verificar ownership
    const { data: meeting } = await supabase
      .from("meetings")
      .select("id, asesor_id, google_event_id")
      .eq("id", id)
      .eq("asesor_id", advisor!.id)
      .single();

    if (!meeting) {
      return NextResponse.json({ success: false, error: "Reunión no encontrada" }, { status: 404 });
    }

    // Eliminar de Google Calendar si existe
    if (meeting.google_event_id) {
      await deleteMeetingFromGoogle(advisor!.id, meeting.google_event_id);
    }

    // Marcar como cancelada (soft delete)
    await supabase
      .from("meetings")
      .update({ cancelada: true })
      .eq("id", id);

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Error al eliminar reunión";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
