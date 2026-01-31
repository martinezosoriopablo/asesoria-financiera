// app/api/clients/[id]/interactions/route.ts

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { rateLimit, getClientIp } from "@/lib/rate-limit";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// GET - Obtener interacciones de un cliente
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
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
  } catch (error: any) {
    console.error("Error fetching interactions:", error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || "Error al obtener interacciones",
      },
      { status: 500 }
    );
  }
}

// POST - Crear nueva interacción
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { allowed } = rateLimit(`interactions-post:${getClientIp(request)}`, { limit: 10, windowSeconds: 60 });
  if (!allowed) {
    return NextResponse.json(
      { success: false, error: "Demasiadas solicitudes. Intenta en un momento." },
      { status: 429 }
    );
  }

  const { id } = await params;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    const body = await request.json();

    // Validar campos requeridos
    if (!body.tipo || !body.titulo) {
      return NextResponse.json(
        {
          success: false,
          error: "Tipo y título son requeridos",
        },
        { status: 400 }
      );
    }

    // Verificar que el cliente existe
    const { data: client } = await supabase
      .from("clients")
      .select("id")
      .eq("id", id)
      .single();

    if (!client) {
      return NextResponse.json(
        {
          success: false,
          error: "Cliente no encontrado",
        },
        { status: 404 }
      );
    }

    // Crear interacción
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
          created_by: body.created_by,
        },
      ])
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({
      success: true,
      interaction: newInteraction,
    });
  } catch (error: any) {
    console.error("Error creating interaction:", error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || "Error al crear interacción",
      },
      { status: 500 }
    );
  }
}
