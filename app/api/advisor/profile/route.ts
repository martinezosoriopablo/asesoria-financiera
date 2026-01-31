// app/api/advisor/profile/route.ts

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// GET - Obtener perfil del asesor
export async function GET(request: NextRequest) {
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    const { searchParams } = new URL(request.url);
    const advisorEmail = searchParams.get("email");

    if (!advisorEmail) {
      return NextResponse.json(
        { success: false, error: "Email es requerido" },
        { status: 400 }
      );
    }

    const { data: advisor, error } = await supabase
      .from("advisors")
      .select("*")
      .eq("email", advisorEmail)
      .single();

    if (error || !advisor) {
      return NextResponse.json(
        { success: false, error: "Asesor no encontrado" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      advisor: advisor,
    });
  } catch (error: any) {
    console.error("Error fetching advisor profile:", error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || "Error al obtener perfil",
      },
      { status: 500 }
    );
  }
}

// PUT - Actualizar perfil del asesor
export async function PUT(request: NextRequest) {
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    const body = await request.json();

    // Validar campos requeridos
    if (!body.email) {
      return NextResponse.json(
        { success: false, error: "Email es requerido" },
        { status: 400 }
      );
    }

    // Preparar datos para actualizar (solo campos permitidos)
    const updateData: any = {};
    
    if (body.nombre !== undefined) updateData.nombre = body.nombre;
    if (body.apellido !== undefined) updateData.apellido = body.apellido;
    if (body.telefono !== undefined) updateData.telefono = body.telefono;
    if (body.especialidad !== undefined) updateData.especialidad = body.especialidad;
    if (body.bio !== undefined) updateData.bio = body.bio;

    // Actualizar asesor
    const { data: updatedAdvisor, error } = await supabase
      .from("advisors")
      .update(updateData)
      .eq("email", body.email)
      .select()
      .single();

    if (error) {
      console.error("Error updating advisor:", error);
      throw error;
    }

    return NextResponse.json({
      success: true,
      advisor: updatedAdvisor,
    });
  } catch (error: any) {
    console.error("Error updating advisor profile:", error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || "Error al actualizar perfil",
      },
      { status: 500 }
    );
  }
}
