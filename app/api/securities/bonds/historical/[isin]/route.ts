// app/api/securities/bonds/historical/[isin]/route.ts
// API para obtener datos históricos de bonos usando Finnhub
//
// REQUIERE: FINNHUB_API_KEY en .env.local
// Comprar en: https://finnhub.io/pricing-bonds-api-finra-trace ($99.99)

import { NextRequest, NextResponse } from "next/server";
import { requireAdvisor } from "@/lib/auth/api-auth";
import {
  isFinnhubConfigured,
  getBondHistorical,
  getBondProfile,
  calculateBondMetrics,
} from "@/lib/finnhub/bond-client";

type RangeType = "1mo" | "3mo" | "6mo" | "1y" | "2y" | "5y";

const RANGE_TO_DAYS: Record<RangeType, number> = {
  "1mo": 30,
  "3mo": 90,
  "6mo": 180,
  "1y": 365,
  "2y": 730,
  "5y": 1825,
};

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ isin: string }> }
) {
  // Verificar autenticación
  const { error: authError } = await requireAdvisor();
  if (authError) return authError;

  // Verificar si Finnhub está configurado
  if (!isFinnhubConfigured()) {
    return NextResponse.json(
      {
        success: false,
        error: "Finnhub API no configurada",
        message: "Agregue FINNHUB_API_KEY a las variables de entorno. Comprar en: https://finnhub.io/pricing-bonds-api-finra-trace",
        configured: false,
      },
      { status: 503 }
    );
  }

  const { isin } = await params;

  if (!isin) {
    return NextResponse.json(
      { success: false, error: "ISIN es requerido" },
      { status: 400 }
    );
  }

  const { searchParams } = new URL(request.url);
  const range = (searchParams.get("range") || "1y") as RangeType;
  const includeProfile = searchParams.get("profile") === "true";

  // Validar range
  const validRanges = Object.keys(RANGE_TO_DAYS);
  if (!validRanges.includes(range)) {
    return NextResponse.json(
      { success: false, error: `Range inválido. Use: ${validRanges.join(", ")}` },
      { status: 400 }
    );
  }

  try {
    const days = RANGE_TO_DAYS[range];

    // Obtener datos históricos
    const historical = await getBondHistorical(isin.toUpperCase(), days);

    if (historical.length === 0) {
      return NextResponse.json(
        {
          success: false,
          error: `No se encontraron datos históricos para ${isin}`,
          hint: "Verifique que el ISIN sea correcto y que el bono esté cubierto por FINRA TRACE",
        },
        { status: 404 }
      );
    }

    // Calcular métricas
    const metrics = calculateBondMetrics(historical);

    // Opcionalmente obtener perfil del bono
    let profile = null;
    if (includeProfile) {
      profile = await getBondProfile(isin.toUpperCase());
    }

    return NextResponse.json({
      success: true,
      isin: isin.toUpperCase(),
      range,
      data: historical,
      metrics: metrics ? {
        totalReturn: metrics.totalReturn.toFixed(2),
        avgYield: metrics.avgYield.toFixed(2),
        volatility: metrics.volatility.toFixed(2),
        minPrice: metrics.minPrice.toFixed(2),
        maxPrice: metrics.maxPrice.toFixed(2),
        dataPoints: historical.length,
        startDate: historical[0].date,
        endDate: historical[historical.length - 1].date,
      } : null,
      profile,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Error obteniendo datos históricos del bono";
    console.error("Bond historical error:", error);
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
