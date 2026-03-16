// app/api/securities/bonds/status/route.ts
// API para verificar el estado de la integración con Finnhub

import { NextRequest, NextResponse } from "next/server";
import { requireAdvisor } from "@/lib/auth/api-auth";
import { isFinnhubConfigured } from "@/lib/finnhub/bond-client";
import { applyRateLimit } from "@/lib/rate-limit";

export async function GET(request: NextRequest) {
  const blocked = applyRateLimit(request, "bonds-status", { limit: 30, windowSeconds: 60 });
  if (blocked) return blocked;

  // Verificar autenticación
  const { error: authError } = await requireAdvisor();
  if (authError) return authError;

  const configured = isFinnhubConfigured();

  return NextResponse.json({
    success: true,
    finnhub: {
      configured,
      features: configured
        ? ["bond_historical", "bond_profile", "bond_ticks"]
        : [],
      message: configured
        ? "Finnhub Bond API está configurada y lista para usar"
        : "Finnhub no configurada. Agregue FINNHUB_API_KEY al entorno.",
      setupUrl: configured ? null : "https://finnhub.io/pricing-bonds-api-finra-trace",
    },
  });
}
