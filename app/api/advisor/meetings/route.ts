// app/api/advisor/meetings/route.ts

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { rateLimit, getClientIp } from "@/lib/rate-limit";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// GET - Obtener reuniones del asesor
export async function GET(request: NextRequest) {
  const { allowed, remaining } = rateLimit(`meetings:${getClientIp(request)}`, { limit: 30, windowSeconds: 60 });
  if (!allowed) {
    return NextResponse.json(
      { success: false, error: "Demasiadas solicitudes. Intenta en un momento." },
      { status: 429, headers: { "X-RateLimit-Remaining": String(remaining) } }
    );
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    const { searchParams } = new URL(request.url);
    const advisorEmail = searchParams.get("email");
    if (!advisorEmail) {
      return NextResponse.json(
        { success: false, error: "Email del asesor es requerido" },
        { status: 400 }
      );
    }
    const timeframe = searchParams.get("timeframe") || "upcoming"; // 'upcoming', 'today', 'week', 'all'

    // Obtener ID del asesor
    const { data: advisor } = await supabase
      .from("advisors")
      .select("id")
      .eq("email", advisorEmail)
      .single();

    if (!advisor) {
      return NextResponse.json(
        { success: false, error: "Asesor no encontrado" },
        { status: 404 }
      );
    }

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
      .eq("asesor_id", advisor.id)
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
  } catch (error: any) {
    console.error("Error fetching meetings:", error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || "Error al obtener reuniones",
      },
      { status: 500 }
    );
  }
}

// POST - Crear nueva reunión
export async function POST(request: NextRequest) {
  const { allowed } = rateLimit(`meetings-post:${getClientIp(request)}`, { limit: 10, windowSeconds: 60 });
  if (!allowed) {
    return NextResponse.json(
      { success: false, error: "Demasiadas solicitudes. Intenta en un momento." },
      { status: 429 }
    );
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    const body = await request.json();

    // Validar campos requeridos
    if (!body.client_id || !body.asesor_email || !body.titulo || !body.fecha) {
      return NextResponse.json(
        {
          success: false,
          error: "client_id, asesor_email, titulo y fecha son requeridos",
        },
        { status: 400 }
      );
    }

    // Obtener ID del asesor
    const { data: advisor } = await supabase
      .from("advisors")
      .select("id")
      .eq("email", body.asesor_email)
      .single();

    if (!advisor) {
      return NextResponse.json(
        { success: false, error: "Asesor no encontrado" },
        { status: 404 }
      );
    }

    // Crear reunión
    const { data: newMeeting, error } = await supabase
      .from("meetings")
      .insert([
        {
          client_id: body.client_id,
          asesor_id: advisor.id,
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
      },
    ]);

    return NextResponse.json({
      success: true,
      meeting: newMeeting,
    });
  } catch (error: any) {
    console.error("Error creating meeting:", error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || "Error al crear reunión",
      },
      { status: 500 }
    );
  }
}
