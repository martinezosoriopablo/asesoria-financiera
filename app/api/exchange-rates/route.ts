// app/api/exchange-rates/route.ts
// Obtiene tasas de cambio desde el Banco Central de Chile (API SI3)
// Fallback: mindicador.cl

import { NextRequest, NextResponse } from "next/server";
import { applyRateLimit } from "@/lib/rate-limit";
import { getCurrentRates } from "@/lib/bcch";
import { requireAdvisor } from "@/lib/auth/api-auth";
import { handleApiError } from "@/lib/api-response";

// Cache simple en memoria (10 minutos)
let cache: {
  data: { usd: number; eur: number; uf: number; timestamp: string; source: string } | null;
  expiry: number;
} = { data: null, expiry: 0 };

const CACHE_DURATION = 10 * 60 * 1000; // 10 minutos

export async function GET(request: NextRequest) {
  const { error: authError } = await requireAdvisor();
  if (authError) return authError;

  const blocked = await applyRateLimit(request, "exchange-rates", { limit: 10, windowSeconds: 60 });
  if (blocked) return blocked;

  return handleApiError("exchange-rates-get", async () => {
    // Verificar cache
    if (cache.data && Date.now() < cache.expiry) {
      return NextResponse.json({
        success: true,
        ...cache.data,
        cached: true,
      });
    }

    // Primary: Banco Central de Chile API
    try {
      const rates = await getCurrentRates();
      const result = {
        usd: rates.usd,
        eur: 0, // EUR not available from BCCH, will be enriched below
        uf: rates.uf,
        timestamp: rates.timestamp,
        source: rates.source,
      };

      // Try to get EUR from mindicador.cl (BCCH doesn't have it easily)
      try {
        const minRes = await fetch("https://mindicador.cl/api", {
          next: { revalidate: 600 },
          signal: AbortSignal.timeout(5000),
        });
        if (minRes.ok) {
          const minData = await minRes.json();
          result.eur = minData.euro?.valor || 0;
        }
      } catch { /* EUR is optional */ }

      cache = { data: result, expiry: Date.now() + CACHE_DURATION };
      return NextResponse.json({ success: true, ...result });
    } catch (bcchError) {
      console.warn("[exchange-rates] BCCH failed, trying mindicador.cl:", bcchError);

      try {
        // Fallback: mindicador.cl
        const response = await fetch("https://mindicador.cl/api", {
          headers: { Accept: "application/json" },
          next: { revalidate: 600 },
          signal: AbortSignal.timeout(15000),
        });

        if (!response.ok) throw new Error(`mindicador.cl ${response.status}`);

        const data = await response.json();
        const result = {
          usd: data.dolar?.valor || 950,
          eur: data.euro?.valor || 1020,
          uf: data.uf?.valor || 38000,
          timestamp: data.fecha || new Date().toISOString(),
          source: "mindicador.cl (fallback)",
        };

        cache = { data: result, expiry: Date.now() + CACHE_DURATION };
        return NextResponse.json({ success: true, ...result });
      } catch {
        // Both BCCH and mindicador.cl failed

        // Si hay cache expirado, usarlo
        if (cache.data) {
          return NextResponse.json({
            success: true,
            ...cache.data,
            cached: true,
            stale: true,
          });
        }

        // Valores de fallback estáticos — ÚLTIMA INSTANCIA
        return NextResponse.json({
          success: true,
          usd: 950,
          eur: 1020,
          uf: 38000,
          timestamp: new Date().toISOString(),
          fallback: true,
          error: "Using static fallback values — both BCCH and mindicador.cl failed",
        });
      }
    }
  });
}
