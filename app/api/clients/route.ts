// app/api/clients/route.ts

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// GET - Obtener lista de clientes
export async function GET(request: NextRequest) {
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status");
    const perfilRiesgo = searchParams.get("perfil_riesgo");
    const search = searchParams.get("search");

    let query = supabase
      .from("clients")
      .select("*")
      .order("created_at", { ascending: false });

    if (status) {
      query = query.eq("status", status);
    }

    if (perfilRiesgo) {
      query = query.eq("perfil_riesgo", perfilRiesgo);
    }

    if (search) {
      query = query.or(
        `nombre.ilike.%${search}%,apellido.ilike.%${search}%,email.ilike.%${search}%`
      );
    }

    const { data: clients, error } = await query;

    if (error) throw error;

    return NextResponse.json({
      success: true,
      clients: clients || [],
      total: clients?.length || 0,
    });
  } catch (error: any) {
    console.error("Error fetching clients:", error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || "Error al obtener clientes",
      },
      { status: 500 }
    );
  }
}

// POST - Crear nuevo cliente
export async function POST(request: NextRequest) {
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

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

    // Verificar que el email no exista
    const { data: existingClient } = await supabase
      .from("clients")
      .select("id")
      .eq("email", body.email)
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

    // Crear cliente
    const { data: newClient, error } = await supabase
      .from("clients")
      .insert([
        {
          nombre: body.nombre,
          apellido: body.apellido,
          email: body.email,
          telefono: body.telefono || null,
          rut: body.rut || null,
          patrimonio_estimado: body.patrimonio_estimado || null,
          ingreso_mensual: body.ingreso_mensual || null,
          objetivo_inversion: body.objetivo_inversion || null,
          horizonte_temporal: body.horizonte_temporal || "largo_plazo",
          perfil_riesgo: body.perfil_riesgo || null,
          puntaje_riesgo: body.puntaje_riesgo || null,
          tolerancia_perdida: body.tolerancia_perdida || null,
          status: body.status || "prospecto",
          notas: body.notas || null,
          asesor_id: body.asesor_id || null,
        },
      ])
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({
      success: true,
      client: newClient,
    });
  } catch (error: any) {
    console.error("Error creating client:", error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || "Error al crear cliente",
      },
      { status: 500 }
    );
  }
}
