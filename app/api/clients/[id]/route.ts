// app/api/clients/[id]/route.ts

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

interface RouteContext {
  params: Promise<{ id: string }>;
}

// GET - Obtener un cliente específico
export async function GET(
  request: NextRequest,
  context: RouteContext
) {
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    const { id } = await context.params;

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
      if (error.code === "PGRST116") {
        return NextResponse.json(
          {
            success: false,
            error: "Cliente no encontrado",
          },
          { status: 404 }
        );
      }
      throw error;
    }

    // Ordenar interacciones por fecha (más reciente primero)
    if (client.client_interactions) {
      client.client_interactions.sort(
        (a: any, b: any) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime()
      );
    }

    return NextResponse.json({
      success: true,
      client,
    });
  } catch (error: any) {
    console.error("Error fetching client:", error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || "Error al obtener cliente",
      },
      { status: 500 }
    );
  }
}

// PUT - Actualizar cliente
export async function PUT(
  request: NextRequest,
  context: RouteContext
) {
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    const { id } = await context.params;
    const body = await request.json();

    const updateData: any = {};
    
    if (body.nombre !== undefined) updateData.nombre = body.nombre;
    if (body.apellido !== undefined) updateData.apellido = body.apellido;
    if (body.email !== undefined) updateData.email = body.email;
    if (body.telefono !== undefined) updateData.telefono = body.telefono;
    if (body.rut !== undefined) updateData.rut = body.rut;
    if (body.patrimonio_estimado !== undefined) updateData.patrimonio_estimado = body.patrimonio_estimado;
    if (body.ingreso_mensual !== undefined) updateData.ingreso_mensual = body.ingreso_mensual;
    if (body.objetivo_inversion !== undefined) updateData.objetivo_inversion = body.objetivo_inversion;
    if (body.horizonte_temporal !== undefined) updateData.horizonte_temporal = body.horizonte_temporal;
    if (body.perfil_riesgo !== undefined) updateData.perfil_riesgo = body.perfil_riesgo;
    if (body.puntaje_riesgo !== undefined) updateData.puntaje_riesgo = body.puntaje_riesgo;
    if (body.tolerancia_perdida !== undefined) updateData.tolerancia_perdida = body.tolerancia_perdida;
    if (body.tiene_portfolio !== undefined) updateData.tiene_portfolio = body.tiene_portfolio;
    if (body.portfolio_data !== undefined) updateData.portfolio_data = body.portfolio_data;
    if (body.status !== undefined) updateData.status = body.status;
    if (body.notas !== undefined) updateData.notas = body.notas;

    const { data: updatedClient, error } = await supabase
      .from("clients")
      .update(updateData)
      .eq("id", id)
      .select()
      .single();

    if (error) {
      if (error.code === "PGRST116") {
        return NextResponse.json(
          {
            success: false,
            error: "Cliente no encontrado",
          },
          { status: 404 }
        );
      }
      throw error;
    }

    await supabase.from("client_interactions").insert([
      {
        client_id: id,
        tipo: "otro",
        titulo: "Información Actualizada",
        descripcion: "Datos del cliente actualizados en el sistema",
        resultado: "exitoso",
      },
    ]);

    return NextResponse.json({
      success: true,
      client: updatedClient,
    });
  } catch (error: any) {
    console.error("Error updating client:", error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || "Error al actualizar cliente",
      },
      { status: 500 }
    );
  }
}

// DELETE - Eliminar cliente
export async function DELETE(
  request: NextRequest,
  context: RouteContext
) {
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    const { id } = await context.params;
    const { searchParams } = new URL(request.url);
    const hardDelete = searchParams.get("hard") === "true";

    if (hardDelete) {
      const { error } = await supabase
        .from("clients")
        .delete()
        .eq("id", id);

      if (error) throw error;

      return NextResponse.json({
        success: true,
        message: "Cliente eliminado permanentemente",
      });
    } else {
      const { data: client, error } = await supabase
        .from("clients")
        .update({ status: "inactivo" })
        .eq("id", id)
        .select()
        .single();

      if (error) {
        if (error.code === "PGRST116") {
          return NextResponse.json(
            {
              success: false,
              error: "Cliente no encontrado",
            },
            { status: 404 }
          );
        }
        throw error;
      }

      await supabase.from("client_interactions").insert([
        {
          client_id: id,
          tipo: "otro",
          titulo: "Cliente Desactivado",
          descripcion: "Cliente marcado como inactivo",
          resultado: "exitoso",
        },
      ]);

      return NextResponse.json({
        success: true,
        message: "Cliente marcado como inactivo",
        client,
      });
    }
  } catch (error: any) {
    console.error("Error deleting client:", error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || "Error al eliminar cliente",
      },
      { status: 500 }
    );
  }
}