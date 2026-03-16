// app/api/securities/bonds/search/route.ts
// API para buscar bonos usando OpenFIGI

import { NextRequest, NextResponse } from "next/server";
import { requireAdvisor } from "@/lib/auth/api-auth";
import { smartBondSearch, type BondSearchResult } from "@/lib/openfigi/client";
import { applyRateLimit } from "@/lib/rate-limit";

export async function GET(request: NextRequest) {
  const blocked = applyRateLimit(request, "bonds-search", { limit: 10, windowSeconds: 60 });
  if (blocked) return blocked;

  // Verificar autenticación
  const { error: authError } = await requireAdvisor();
  if (authError) return authError;

  const { searchParams } = new URL(request.url);
  const query = searchParams.get("q");

  if (!query || query.length < 2) {
    return NextResponse.json({
      success: true,
      results: [],
      message: "Ingrese al menos 2 caracteres para buscar",
    });
  }

  try {
    const results: BondSearchResult[] = await smartBondSearch(query);

    return NextResponse.json({
      success: true,
      results,
      total: results.length,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Error en búsqueda de bonos";
    console.error("Bond search error:", error);
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
