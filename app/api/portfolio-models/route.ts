// app/api/portfolio-models/route.ts

import { NextRequest, NextResponse } from "next/server";
import { requireAdvisor, createAdminClient } from "@/lib/auth/api-auth";

// GET - Obtener modelos de portafolio de un cliente
export async function GET(request: NextRequest) {
  // Verificar autenticación
  const { advisor, error: authError } = await requireAdvisor();
  if (authError) return authError;

  const { searchParams } = new URL(request.url);
  const clientId = searchParams.get("client_id");

  if (!clientId) {
    return NextResponse.json(
      { success: false, error: "client_id es requerido" },
      { status: 400 }
    );
  }

  const supabase = createAdminClient();

  try {
    // Verificar que el cliente pertenezca al advisor
    const { data: client, error: clientError } = await supabase
      .from("clients")
      .select("id, asesor_id")
      .eq("id", clientId)
      .single();

    if (clientError || !client) {
      return NextResponse.json(
        { success: false, error: "Cliente no encontrado" },
        { status: 404 }
      );
    }

    // Solo puede ver clientes sin asesor o propios
    if (client.asesor_id && client.asesor_id !== advisor!.id) {
      return NextResponse.json(
        { success: false, error: "No tiene permiso para ver este cliente" },
        { status: 403 }
      );
    }

    // Obtener modelos del cliente
    const { data: models, error: modelsError } = await supabase
      .from("portfolio_models")
      .select("*")
      .eq("client_id", clientId)
      .order("created_at", { ascending: false });

    if (modelsError) {
      return NextResponse.json(
        { success: false, error: modelsError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      models: models || [],
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Error al obtener modelos";
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}

// POST - Guardar nuevo modelo de portafolio
export async function POST(request: NextRequest) {
  // Verificar autenticación
  const { advisor, error: authError } = await requireAdvisor();
  if (authError) return authError;

  const supabase = createAdminClient();

  try {
    const body = await request.json();

    // Validar campos requeridos
    if (!body.client_id || !body.risk_profile_id) {
      return NextResponse.json(
        { success: false, error: "client_id y risk_profile_id son requeridos" },
        { status: 400 }
      );
    }

    // Verificar que el cliente pertenezca al advisor
    const { data: client, error: clientError } = await supabase
      .from("clients")
      .select("id, asesor_id")
      .eq("id", body.client_id)
      .single();

    if (clientError || !client) {
      return NextResponse.json(
        { success: false, error: "Cliente no encontrado" },
        { status: 404 }
      );
    }

    // Solo puede guardar para clientes sin asesor o propios
    if (client.asesor_id && client.asesor_id !== advisor!.id) {
      return NextResponse.json(
        { success: false, error: "No tiene permiso para este cliente" },
        { status: 403 }
      );
    }

    // Guardar el modelo
    const { data: newModel, error: insertError } = await supabase
      .from("portfolio_models")
      .insert({
        client_id: body.client_id,
        risk_profile_id: body.risk_profile_id,
        universe: body.universe || "global",
        include_alternatives: body.include_alternatives || false,
        portfolio_amount: body.portfolio_amount || null,
        weights: body.weights || {},
        equity_blocks: body.equity_blocks || [],
        fixed_income_blocks: body.fixed_income_blocks || [],
        alternative_blocks: body.alternative_blocks || [],
      })
      .select()
      .single();

    if (insertError) {
      return NextResponse.json(
        { success: false, error: insertError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      model: newModel,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Error al guardar modelo";
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}

// DELETE - Eliminar modelo de portafolio
export async function DELETE(request: NextRequest) {
  // Verificar autenticación
  const { advisor, error: authError } = await requireAdvisor();
  if (authError) return authError;

  const { searchParams } = new URL(request.url);
  const modelId = searchParams.get("id");

  if (!modelId) {
    return NextResponse.json(
      { success: false, error: "id es requerido" },
      { status: 400 }
    );
  }

  const supabase = createAdminClient();

  try {
    // Obtener el modelo para verificar permisos
    const { data: model, error: modelError } = await supabase
      .from("portfolio_models")
      .select("id, client_id")
      .eq("id", modelId)
      .single();

    if (modelError || !model) {
      return NextResponse.json(
        { success: false, error: "Modelo no encontrado" },
        { status: 404 }
      );
    }

    // Verificar que el cliente pertenezca al advisor
    const { data: client, error: clientError } = await supabase
      .from("clients")
      .select("id, asesor_id")
      .eq("id", model.client_id)
      .single();

    if (clientError || !client) {
      return NextResponse.json(
        { success: false, error: "Cliente no encontrado" },
        { status: 404 }
      );
    }

    if (client.asesor_id && client.asesor_id !== advisor!.id) {
      return NextResponse.json(
        { success: false, error: "No tiene permiso para eliminar este modelo" },
        { status: 403 }
      );
    }

    // Eliminar el modelo
    const { error: deleteError } = await supabase
      .from("portfolio_models")
      .delete()
      .eq("id", modelId);

    if (deleteError) {
      return NextResponse.json(
        { success: false, error: deleteError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "Modelo eliminado correctamente",
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Error al eliminar modelo";
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
