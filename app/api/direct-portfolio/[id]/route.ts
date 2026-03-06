// app/api/direct-portfolio/[id]/route.ts
// Operaciones en un portafolio directo específico

import { NextRequest, NextResponse } from "next/server";
import { requireAdvisor, createAdminClient, getSubordinateAdvisorIds } from "@/lib/auth/api-auth";

// GET - Obtener un portafolio específico
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { advisor, error: authError } = await requireAdvisor();
  if (authError) return authError;

  const { id } = await params;
  const supabase = createAdminClient();

  try {
    // Obtener el portafolio
    const { data: portfolio, error } = await supabase
      .from("direct_portfolios")
      .select(`
        *,
        clients (
          id,
          nombre,
          apellido,
          email,
          perfil_riesgo,
          puntaje_riesgo
        ),
        direct_portfolio_holdings (
          id,
          tipo,
          ticker,
          nombre,
          cantidad,
          precio_compra,
          fecha_compra,
          cupon,
          vencimiento,
          valor_nominal,
          cusip,
          isin,
          created_at
        )
      `)
      .eq("id", id)
      .single();

    if (error || !portfolio) {
      return NextResponse.json(
        { success: false, error: "Portafolio no encontrado" },
        { status: 404 }
      );
    }

    // Verificar permisos
    let allowedAdvisorIds = [advisor!.id];
    if (advisor!.rol === "admin") {
      allowedAdvisorIds = await getSubordinateAdvisorIds(advisor!.id);
    }

    if (!allowedAdvisorIds.includes(portfolio.advisor_id)) {
      return NextResponse.json(
        { success: false, error: "No tiene permisos para este portafolio" },
        { status: 403 }
      );
    }

    return NextResponse.json({
      success: true,
      portfolio,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Error al obtener portafolio";
    console.error("Error fetching portfolio:", error);
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}

// PUT - Actualizar un portafolio
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { advisor, error: authError } = await requireAdvisor();
  if (authError) return authError;

  const { id } = await params;
  const supabase = createAdminClient();

  try {
    // Verificar que el portafolio existe y el usuario tiene permisos
    const { data: existing } = await supabase
      .from("direct_portfolios")
      .select("id, advisor_id")
      .eq("id", id)
      .single();

    if (!existing) {
      return NextResponse.json(
        { success: false, error: "Portafolio no encontrado" },
        { status: 404 }
      );
    }

    let allowedAdvisorIds = [advisor!.id];
    if (advisor!.rol === "admin") {
      allowedAdvisorIds = await getSubordinateAdvisorIds(advisor!.id);
    }

    if (!allowedAdvisorIds.includes(existing.advisor_id)) {
      return NextResponse.json(
        { success: false, error: "No tiene permisos para este portafolio" },
        { status: 403 }
      );
    }

    const body = await request.json();

    // Campos actualizables
    const updateData: Record<string, unknown> = {};
    if (body.nombre !== undefined) updateData.nombre = body.nombre;
    if (body.perfil_riesgo !== undefined) updateData.perfil_riesgo = body.perfil_riesgo;
    if (body.descripcion !== undefined) updateData.descripcion = body.descripcion;
    if (body.moneda !== undefined) updateData.moneda = body.moneda;
    if (body.client_id !== undefined) updateData.client_id = body.client_id;

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json(
        { success: false, error: "No hay datos para actualizar" },
        { status: 400 }
      );
    }

    const { data: portfolio, error } = await supabase
      .from("direct_portfolios")
      .update(updateData)
      .eq("id", id)
      .select(`
        *,
        clients (
          id,
          nombre,
          apellido,
          email
        ),
        direct_portfolio_holdings (*)
      `)
      .single();

    if (error) throw error;

    return NextResponse.json({
      success: true,
      portfolio,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Error al actualizar portafolio";
    console.error("Error updating portfolio:", error);
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}

// DELETE - Eliminar portafolio (soft delete)
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { advisor, error: authError } = await requireAdvisor();
  if (authError) return authError;

  const { id } = await params;
  const supabase = createAdminClient();

  try {
    // Verificar permisos
    const { data: existing } = await supabase
      .from("direct_portfolios")
      .select("id, advisor_id")
      .eq("id", id)
      .single();

    if (!existing) {
      return NextResponse.json(
        { success: false, error: "Portafolio no encontrado" },
        { status: 404 }
      );
    }

    let allowedAdvisorIds = [advisor!.id];
    if (advisor!.rol === "admin") {
      allowedAdvisorIds = await getSubordinateAdvisorIds(advisor!.id);
    }

    if (!allowedAdvisorIds.includes(existing.advisor_id)) {
      return NextResponse.json(
        { success: false, error: "No tiene permisos para este portafolio" },
        { status: 403 }
      );
    }

    // Soft delete
    const { error } = await supabase
      .from("direct_portfolios")
      .update({ status: "inactivo" })
      .eq("id", id);

    if (error) throw error;

    return NextResponse.json({
      success: true,
      message: "Portafolio eliminado correctamente",
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Error al eliminar portafolio";
    console.error("Error deleting portfolio:", error);
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
