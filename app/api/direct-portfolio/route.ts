// app/api/direct-portfolio/route.ts
// CRUD para portafolios directos de acciones y bonos

import { NextRequest, NextResponse } from "next/server";
import { requireAdvisor, createAdminClient, getSubordinateAdvisorIds } from "@/lib/auth/api-auth";

// GET - Listar portafolios directos
export async function GET(request: NextRequest) {
  const { advisor, error: authError } = await requireAdvisor();
  if (authError) return authError;

  const supabase = createAdminClient();

  try {
    const { searchParams } = new URL(request.url);
    const clientId = searchParams.get("client_id");
    const status = searchParams.get("status");

    // Determinar qué asesores puede ver este usuario
    let allowedAdvisorIds: string[] = [advisor!.id];
    if (advisor!.rol === "admin") {
      allowedAdvisorIds = await getSubordinateAdvisorIds(advisor!.id);
    }

    // Construir filtro de asesores
    const idsFilter = allowedAdvisorIds.map(id => `advisor_id.eq.${id}`).join(",");

    let query = supabase
      .from("direct_portfolios")
      .select(`
        *,
        clients (
          id,
          nombre,
          apellido,
          email,
          perfil_riesgo
        ),
        direct_portfolio_holdings (
          id,
          tipo,
          ticker,
          nombre,
          cantidad,
          precio_compra,
          cupon,
          vencimiento,
          valor_nominal
        )
      `)
      .or(idsFilter)
      .order("created_at", { ascending: false });

    if (clientId) {
      query = query.eq("client_id", clientId);
    }

    if (status) {
      query = query.eq("status", status);
    } else {
      // Por defecto, solo activos
      query = query.eq("status", "activo");
    }

    const { data: portfolios, error } = await query;

    if (error) throw error;

    return NextResponse.json({
      success: true,
      portfolios: portfolios || [],
      total: portfolios?.length || 0,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Error al obtener portafolios";
    console.error("Error fetching portfolios:", error);
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}

// POST - Crear nuevo portafolio directo
export async function POST(request: NextRequest) {
  const { advisor, error: authError } = await requireAdvisor();
  if (authError) return authError;

  const supabase = createAdminClient();

  try {
    const body = await request.json();

    // Validar campos requeridos
    if (!body.nombre) {
      return NextResponse.json(
        { success: false, error: "El nombre del portafolio es requerido" },
        { status: 400 }
      );
    }

    // Si se especifica un cliente, verificar que pertenezca al advisor
    if (body.client_id) {
      const { data: client } = await supabase
        .from("clients")
        .select("id, asesor_id")
        .eq("id", body.client_id)
        .single();

      if (!client) {
        return NextResponse.json(
          { success: false, error: "Cliente no encontrado" },
          { status: 404 }
        );
      }

      // Verificar permisos
      let allowedAdvisorIds = [advisor!.id];
      if (advisor!.rol === "admin") {
        allowedAdvisorIds = await getSubordinateAdvisorIds(advisor!.id);
      }

      if (client.asesor_id && !allowedAdvisorIds.includes(client.asesor_id)) {
        return NextResponse.json(
          { success: false, error: "No tiene permisos para este cliente" },
          { status: 403 }
        );
      }
    }

    // Crear el portafolio
    const { data: portfolio, error } = await supabase
      .from("direct_portfolios")
      .insert([
        {
          advisor_id: advisor!.id,
          client_id: body.client_id || null,
          nombre: body.nombre,
          perfil_riesgo: body.perfil_riesgo || null,
          descripcion: body.descripcion || null,
          moneda: body.moneda || "USD",
          status: "activo",
        },
      ])
      .select()
      .single();

    if (error) throw error;

    // Si se proporcionaron holdings iniciales, crearlos
    if (body.holdings && Array.isArray(body.holdings) && body.holdings.length > 0) {
      const holdingsToInsert = body.holdings.map((h: {
        tipo: string;
        ticker?: string;
        nombre: string;
        cantidad: number;
        precio_compra?: number;
        fecha_compra?: string;
        cupon?: number;
        vencimiento?: string;
        valor_nominal?: number;
        cusip?: string;
        isin?: string;
      }) => ({
        portfolio_id: portfolio.id,
        tipo: h.tipo,
        ticker: h.ticker || null,
        nombre: h.nombre,
        cantidad: h.cantidad,
        precio_compra: h.precio_compra || null,
        fecha_compra: h.fecha_compra || null,
        cupon: h.cupon || null,
        vencimiento: h.vencimiento || null,
        valor_nominal: h.valor_nominal || null,
        cusip: h.cusip || null,
        isin: h.isin || null,
      }));

      const { error: holdingsError } = await supabase
        .from("direct_portfolio_holdings")
        .insert(holdingsToInsert);

      if (holdingsError) {
        console.error("Error creating holdings:", holdingsError);
      }
    }

    // Obtener el portafolio completo con holdings
    const { data: fullPortfolio } = await supabase
      .from("direct_portfolios")
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
      .eq("id", portfolio.id)
      .single();

    return NextResponse.json({
      success: true,
      portfolio: fullPortfolio || portfolio,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Error al crear portafolio";
    console.error("Error creating portfolio:", error);
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
