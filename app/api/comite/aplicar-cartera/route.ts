// app/api/comite/aplicar-cartera/route.ts
// Aplica la cartera recomendada: guarda en cliente, crea modelo

import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { applyRateLimit } from "@/lib/rate-limit";

interface CarteraPosition {
  clase: string;
  ticker: string;
  nombre: string;
  descripcionSimple?: string;
  porcentaje: number;
  justificacion: string;
}

interface CarteraRecomendacion {
  contextoPerfil?: string;
  resumenEjecutivo: string;
  cartera: CarteraPosition[];
  cambiosSugeridos?: Array<{
    tipo: string;
    instrumento: string;
    razon: string;
  }>;
  riesgos: string[];
  proximosMonitorear: string[];
}

interface PortfolioBlock {
  label: string;
  ticker: string;
  descripcion: string;
  neutral_weight: number;
  model_weight: number;
  justificacion: string;
}

interface AplicarCarteraRequest {
  clientId: string;
  cliente: {
    nombre: string;
    perfil: string;
    puntaje: number;
    monto?: number;
  };
  recomendacion: CarteraRecomendacion;
  generadoEn: string;
}

export async function POST(request: NextRequest) {
  const blocked = applyRateLimit(request, "aplicar-cartera", { limit: 10, windowSeconds: 60 });
  if (blocked) return blocked;

  try {
    const supabase = await createSupabaseServerClient();

    // Verify authentication
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json(
        { success: false, error: "No autorizado" },
        { status: 401 }
      );
    }

    const body: AplicarCarteraRequest = await request.json();
    const { clientId, cliente, recomendacion, generadoEn } = body;

    if (!clientId || !recomendacion) {
      return NextResponse.json(
        { success: false, error: "Faltan datos requeridos" },
        { status: 400 }
      );
    }

    // 1. Calculate weights from cartera
    const weights = {
      equities: 0,
      fixedIncome: 0,
      alternatives: 0,
      cash: 0,
    };

    const claseToWeight: Record<string, keyof typeof weights> = {
      "Renta Variable": "equities",
      "Renta Fija": "fixedIncome",
      "Commodities": "alternatives",
      "Alternativos": "alternatives",
      "Cash": "cash",
    };

    for (const position of recomendacion.cartera) {
      const weightKey = claseToWeight[position.clase];
      if (weightKey) {
        weights[weightKey] += position.porcentaje;
      }
    }

    // 2. Build blocks for the model
    const equityBlocks: PortfolioBlock[] = [];
    const fixedIncomeBlocks: PortfolioBlock[] = [];
    const alternativeBlocks: PortfolioBlock[] = [];

    for (const position of recomendacion.cartera) {
      const block = {
        label: position.nombre,
        ticker: position.ticker,
        descripcion: position.descripcionSimple || "",
        neutral_weight: position.porcentaje,
        model_weight: position.porcentaje,
        justificacion: position.justificacion,
      };

      switch (position.clase) {
        case "Renta Variable":
          equityBlocks.push(block);
          break;
        case "Renta Fija":
          fixedIncomeBlocks.push(block);
          break;
        case "Commodities":
        case "Alternativos":
          alternativeBlocks.push(block);
          break;
        case "Cash":
          // Cash doesn't need blocks
          break;
      }
    }

    // 3. Get risk_profile_id for this client
    const { data: riskProfileData } = await supabase
      .from("risk_profiles")
      .select("id")
      .eq("client_id", clientId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    // 4. Save cartera_recomendada to client profile
    const carteraRecomendada = {
      ...recomendacion,
      cliente,
      generadoEn,
      aplicadoEn: new Date().toISOString(),
      aplicadoPor: user.email,
    };

    const { error: updateClientError } = await supabase
      .from("clients")
      .update({
        cartera_recomendada: carteraRecomendada,
        updated_at: new Date().toISOString(),
      })
      .eq("id", clientId);

    if (updateClientError) {
      console.error("Error updating client:", updateClientError);
      return NextResponse.json(
        { success: false, error: "Error al guardar en cliente: " + updateClientError.message },
        { status: 500 }
      );
    }

    // 5. Create portfolio model
    const modelData = {
      client_id: clientId,
      risk_profile_id: riskProfileData?.id || null,
      universe: "global",
      include_alternatives: weights.alternatives > 0,
      portfolio_amount: cliente.monto || null,
      weights,
      equity_blocks: equityBlocks,
      fixed_income_blocks: fixedIncomeBlocks,
      alternative_blocks: alternativeBlocks,
      source: "ai_recommendation",
      generated_at: generadoEn,
    };

    const { data: modelResult, error: modelError } = await supabase
      .from("portfolio_models")
      .insert(modelData)
      .select("id")
      .single();

    if (modelError) {
      console.error("Error creating model:", modelError);
      // Don't fail completely, client was already updated
    }

    // 6. Return success with data needed for UI
    return NextResponse.json({
      success: true,
      message: "Cartera aplicada exitosamente",
      data: {
        clientUpdated: true,
        modelCreated: !modelError,
        modelId: modelResult?.id || null,
        weights,
        positions: recomendacion.cartera.map((p) => ({
          ticker: p.ticker,
          nombre: p.nombre,
          clase: p.clase,
          porcentaje: p.porcentaje,
        })),
      },
    });
  } catch (error: unknown) {
    console.error("Error in aplicar-cartera:", error);
    const message = error instanceof Error ? error.message : "Error interno";
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
