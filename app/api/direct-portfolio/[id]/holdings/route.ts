// app/api/direct-portfolio/[id]/holdings/route.ts
// CRUD para holdings dentro de un portafolio directo

import { NextRequest, NextResponse } from "next/server";
import { requireAdvisor, createAdminClient, getSubordinateAdvisorIds } from "@/lib/auth/api-auth";
import { applyRateLimit } from "@/lib/rate-limit";

// Helper para verificar permisos sobre el portafolio
async function verifyPortfolioAccess(
  portfolioId: string,
  advisorId: string,
  isAdmin: boolean
): Promise<{ allowed: boolean; portfolio?: { id: string; advisor_id: string } }> {
  const supabase = createAdminClient();

  const { data: portfolio } = await supabase
    .from("direct_portfolios")
    .select("id, advisor_id")
    .eq("id", portfolioId)
    .single();

  if (!portfolio) {
    return { allowed: false };
  }

  let allowedIds = [advisorId];
  if (isAdmin) {
    allowedIds = await getSubordinateAdvisorIds(advisorId);
  }

  return {
    allowed: allowedIds.includes(portfolio.advisor_id),
    portfolio,
  };
}

// GET - Listar holdings del portafolio
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const blocked = applyRateLimit(request, "portfolio-holdings", { limit: 30, windowSeconds: 60 });
  if (blocked) return blocked;

  const { advisor, error: authError } = await requireAdvisor();
  if (authError) return authError;

  const { id } = await params;

  const { allowed } = await verifyPortfolioAccess(
    id,
    advisor!.id,
    advisor!.rol === "admin"
  );

  if (!allowed) {
    return NextResponse.json(
      { success: false, error: "Portafolio no encontrado o sin permisos" },
      { status: 404 }
    );
  }

  const supabase = createAdminClient();

  try {
    const { data: holdings, error } = await supabase
      .from("direct_portfolio_holdings")
      .select("*")
      .eq("portfolio_id", id)
      .order("created_at", { ascending: false });

    if (error) throw error;

    return NextResponse.json({
      success: true,
      holdings: holdings || [],
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Error al obtener holdings";
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}

// POST - Agregar holding al portafolio
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const blocked = applyRateLimit(request, "holdings-post", { limit: 10, windowSeconds: 60 });
  if (blocked) return blocked;

  const { advisor, error: authError } = await requireAdvisor();
  if (authError) return authError;

  const { id } = await params;

  const { allowed } = await verifyPortfolioAccess(
    id,
    advisor!.id,
    advisor!.rol === "admin"
  );

  if (!allowed) {
    return NextResponse.json(
      { success: false, error: "Portafolio no encontrado o sin permisos" },
      { status: 404 }
    );
  }

  const supabase = createAdminClient();

  try {
    const body = await request.json();

    // Validar campos requeridos
    if (!body.tipo || !body.nombre || body.cantidad === undefined) {
      return NextResponse.json(
        { success: false, error: "tipo, nombre y cantidad son requeridos" },
        { status: 400 }
      );
    }

    // Validar tipo
    const validTypes = ["stock_us", "stock_cl", "bond", "etf"];
    if (!validTypes.includes(body.tipo)) {
      return NextResponse.json(
        { success: false, error: `tipo debe ser uno de: ${validTypes.join(", ")}` },
        { status: 400 }
      );
    }

    // Si es bono, validar campos adicionales
    if (body.tipo === "bond") {
      if (!body.cupon || !body.vencimiento || !body.valor_nominal) {
        return NextResponse.json(
          { success: false, error: "Para bonos se requiere cupon, vencimiento y valor_nominal" },
          { status: 400 }
        );
      }
    }

    const { data: holding, error } = await supabase
      .from("direct_portfolio_holdings")
      .insert([
        {
          portfolio_id: id,
          tipo: body.tipo,
          ticker: body.ticker || null,
          nombre: body.nombre,
          cantidad: body.cantidad,
          precio_compra: body.precio_compra || null,
          fecha_compra: body.fecha_compra || null,
          cupon: body.cupon || null,
          vencimiento: body.vencimiento || null,
          valor_nominal: body.valor_nominal || null,
          cusip: body.cusip || null,
          isin: body.isin || null,
        },
      ])
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({
      success: true,
      holding,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Error al agregar holding";
    console.error("Error adding holding:", error);
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}

// PUT - Actualizar holding (usando query param holding_id)
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const blocked = applyRateLimit(request, "holdings-put", { limit: 10, windowSeconds: 60 });
  if (blocked) return blocked;

  const { advisor, error: authError } = await requireAdvisor();
  if (authError) return authError;

  const { id } = await params;
  const { searchParams } = new URL(request.url);
  const holdingId = searchParams.get("holding_id");

  if (!holdingId) {
    return NextResponse.json(
      { success: false, error: "holding_id es requerido" },
      { status: 400 }
    );
  }

  const { allowed } = await verifyPortfolioAccess(
    id,
    advisor!.id,
    advisor!.rol === "admin"
  );

  if (!allowed) {
    return NextResponse.json(
      { success: false, error: "Portafolio no encontrado o sin permisos" },
      { status: 404 }
    );
  }

  const supabase = createAdminClient();

  try {
    const body = await request.json();

    // Verificar que el holding pertenece al portafolio
    const { data: existing } = await supabase
      .from("direct_portfolio_holdings")
      .select("id")
      .eq("id", holdingId)
      .eq("portfolio_id", id)
      .single();

    if (!existing) {
      return NextResponse.json(
        { success: false, error: "Holding no encontrado" },
        { status: 404 }
      );
    }

    // Campos actualizables
    const updateData: Record<string, unknown> = {};
    if (body.cantidad !== undefined) updateData.cantidad = body.cantidad;
    if (body.precio_compra !== undefined) updateData.precio_compra = body.precio_compra;
    if (body.fecha_compra !== undefined) updateData.fecha_compra = body.fecha_compra;
    if (body.nombre !== undefined) updateData.nombre = body.nombre;
    if (body.cupon !== undefined) updateData.cupon = body.cupon;
    if (body.vencimiento !== undefined) updateData.vencimiento = body.vencimiento;
    if (body.valor_nominal !== undefined) updateData.valor_nominal = body.valor_nominal;

    const { data: holding, error } = await supabase
      .from("direct_portfolio_holdings")
      .update(updateData)
      .eq("id", holdingId)
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({
      success: true,
      holding,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Error al actualizar holding";
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}

// DELETE - Eliminar holding
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const blocked = applyRateLimit(request, "holdings-delete", { limit: 5, windowSeconds: 60 });
  if (blocked) return blocked;

  const { advisor, error: authError } = await requireAdvisor();
  if (authError) return authError;

  const { id } = await params;
  const { searchParams } = new URL(request.url);
  const holdingId = searchParams.get("holding_id");

  if (!holdingId) {
    return NextResponse.json(
      { success: false, error: "holding_id es requerido" },
      { status: 400 }
    );
  }

  const { allowed } = await verifyPortfolioAccess(
    id,
    advisor!.id,
    advisor!.rol === "admin"
  );

  if (!allowed) {
    return NextResponse.json(
      { success: false, error: "Portafolio no encontrado o sin permisos" },
      { status: 404 }
    );
  }

  const supabase = createAdminClient();

  try {
    // Verificar que el holding pertenece al portafolio
    const { data: existing } = await supabase
      .from("direct_portfolio_holdings")
      .select("id")
      .eq("id", holdingId)
      .eq("portfolio_id", id)
      .single();

    if (!existing) {
      return NextResponse.json(
        { success: false, error: "Holding no encontrado" },
        { status: 404 }
      );
    }

    // Eliminar (hard delete para holdings)
    const { error } = await supabase
      .from("direct_portfolio_holdings")
      .delete()
      .eq("id", holdingId);

    if (error) throw error;

    return NextResponse.json({
      success: true,
      message: "Holding eliminado correctamente",
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Error al eliminar holding";
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
