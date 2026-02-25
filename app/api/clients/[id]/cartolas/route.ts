// app/api/clients/[id]/cartolas/route.ts

import { NextRequest, NextResponse } from "next/server";
import { requireAdvisor, createAdminClient } from "@/lib/auth/api-auth";

interface RouteContext {
  params: Promise<{ id: string }>;
}

// GET - Obtener todas las cartolas de un cliente
export async function GET(
  request: NextRequest,
  context: RouteContext
) {
  const { advisor, error: authError } = await requireAdvisor();
  if (authError) return authError;

  const supabase = createAdminClient();

  try {
    const { id: clientId } = await context.params;

    // Verificar que el cliente pertenece al advisor
    const { data: client } = await supabase
      .from("clients")
      .select("id, asesor_id")
      .eq("id", clientId)
      .single();

    if (!client) {
      return NextResponse.json({ success: false, error: "Cliente no encontrado" }, { status: 404 });
    }

    if (client.asesor_id && client.asesor_id !== advisor!.id) {
      return NextResponse.json({ success: false, error: "No autorizado" }, { status: 403 });
    }

    // Obtener cartolas
    const { data: cartolas, error } = await supabase
      .from("client_cartolas")
      .select("*")
      .eq("client_id", clientId)
      .order("created_at", { ascending: false });

    if (error) throw error;

    // Calcular consolidado
    let totalConsolidado = 0;
    const composicionConsolidada: Record<string, number> = {};

    cartolas?.forEach((cartola) => {
      totalConsolidado += cartola.total_value || 0;

      if (cartola.composition) {
        Object.entries(cartola.composition).forEach(([key, value]) => {
          const numValue = typeof value === 'number' ? value : 0;
          composicionConsolidada[key] = (composicionConsolidada[key] || 0) + numValue;
        });
      }
    });

    // Calcular porcentajes del consolidado
    const porcentajesConsolidados: Record<string, number> = {};
    if (totalConsolidado > 0) {
      Object.entries(composicionConsolidada).forEach(([key, value]) => {
        porcentajesConsolidados[key] = Math.round((value / totalConsolidado) * 100);
      });
    }

    return NextResponse.json({
      success: true,
      cartolas: cartolas || [],
      consolidado: {
        total: totalConsolidado,
        composicion: composicionConsolidada,
        porcentajes: porcentajesConsolidados,
      },
    });
  } catch (error) {
    console.error("Error fetching cartolas:", error);
    return NextResponse.json({ success: false, error: "Error al obtener cartolas" }, { status: 500 });
  }
}

// POST - Agregar nueva cartola
export async function POST(
  request: NextRequest,
  context: RouteContext
) {
  const { advisor, error: authError } = await requireAdvisor();
  if (authError) return authError;

  const supabase = createAdminClient();

  try {
    const { id: clientId } = await context.params;
    const body = await request.json();

    // Verificar que el cliente pertenece al advisor
    const { data: client } = await supabase
      .from("clients")
      .select("id, asesor_id")
      .eq("id", clientId)
      .single();

    if (!client) {
      return NextResponse.json({ success: false, error: "Cliente no encontrado" }, { status: 404 });
    }

    if (client.asesor_id && client.asesor_id !== advisor!.id) {
      return NextResponse.json({ success: false, error: "No autorizado" }, { status: 403 });
    }

    // Validar datos
    if (!body.nombre_agf) {
      return NextResponse.json({ success: false, error: "nombre_agf es requerido" }, { status: 400 });
    }

    // Calcular total_value desde composition si existe
    let totalValue = body.total_value || 0;
    if (body.composition && !totalValue) {
      totalValue = Object.values(body.composition).reduce((sum: number, val) => sum + (typeof val === 'number' ? val : 0), 0);
    }

    // Insertar cartola
    const { data: cartola, error } = await supabase
      .from("client_cartolas")
      .insert({
        client_id: clientId,
        nombre_agf: body.nombre_agf,
        portfolio_data: body.portfolio_data || null,
        composition: body.composition || null,
        total_value: totalValue,
      })
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ success: true, cartola });
  } catch (error) {
    console.error("Error creating cartola:", error);
    return NextResponse.json({ success: false, error: "Error al crear cartola" }, { status: 500 });
  }
}

// DELETE - Eliminar cartola específica
export async function DELETE(
  request: NextRequest,
  context: RouteContext
) {
  const { advisor, error: authError } = await requireAdvisor();
  if (authError) return authError;

  const supabase = createAdminClient();

  try {
    const { id: clientId } = await context.params;
    const { searchParams } = new URL(request.url);
    const cartolaId = searchParams.get("cartola_id");

    if (!cartolaId) {
      return NextResponse.json({ success: false, error: "cartola_id es requerido" }, { status: 400 });
    }

    // Verificar que el cliente pertenece al advisor
    const { data: client } = await supabase
      .from("clients")
      .select("id, asesor_id")
      .eq("id", clientId)
      .single();

    if (!client) {
      return NextResponse.json({ success: false, error: "Cliente no encontrado" }, { status: 404 });
    }

    if (client.asesor_id && client.asesor_id !== advisor!.id) {
      return NextResponse.json({ success: false, error: "No autorizado" }, { status: 403 });
    }

    // Eliminar cartola
    const { error } = await supabase
      .from("client_cartolas")
      .delete()
      .eq("id", cartolaId)
      .eq("client_id", clientId);

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting cartola:", error);
    return NextResponse.json({ success: false, error: "Error al eliminar cartola" }, { status: 500 });
  }
}
