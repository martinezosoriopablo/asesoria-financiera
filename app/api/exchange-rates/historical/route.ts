// app/api/exchange-rates/historical/route.ts
// Historical UF/USD/EUR data
// UF/USD: Banco Central de Chile (SI3 API), fallback mindicador.cl
// EUR: mindicador.cl (BCCH doesn't publish EUR)

import { NextRequest, NextResponse } from "next/server";
import { applyRateLimit } from "@/lib/rate-limit";
import { fetchBcchSeries } from "@/lib/bcch";
import { requireAuth } from "@/lib/auth/api-auth";
import { handleApiError } from "@/lib/api-response";

// Cache per indicator+year (1 hour)
const cache: Record<string, { data: Array<{ fecha: string; valor: number }>; expiry: number }> = {};
const CACHE_DURATION = 60 * 60 * 1000; // 1 hour

export async function GET(request: NextRequest) {
  const { error: authError } = await requireAuth();
  if (authError) return authError;

  const blocked = await applyRateLimit(request, "exchange-rates-historical", { limit: 30, windowSeconds: 60 });
  if (blocked) return blocked;

  const indicator = request.nextUrl.searchParams.get("indicator"); // "uf" or "dolar"
  const year = request.nextUrl.searchParams.get("year");

  if (!indicator || !year || !["uf", "dolar", "euro"].includes(indicator)) {
    return NextResponse.json({ success: false, error: "indicator (uf|dolar|euro) and year required" }, { status: 400 });
  }

  const cacheKey = `${indicator}-${year}`;
  if (cache[cacheKey] && Date.now() < cache[cacheKey].expiry) {
    return NextResponse.json({ success: true, serie: cache[cacheKey].data, cached: true });
  }

  return handleApiError("exchange-rates-historical-get", async () => {
    // Primary: Banco Central de Chile for uf/dolar, mindicador.cl for euro
    if (indicator !== "euro") {
      try {
        const serie = await fetchBcchSeries(
          indicator as "dolar" | "uf",
          `${year}-01-01`,
          `${year}-12-31`,
        );

        cache[cacheKey] = { data: serie, expiry: Date.now() + CACHE_DURATION };
        return NextResponse.json({ success: true, serie, source: "Banco Central de Chile" });
      } catch (bcchError) {
        console.warn(`[exchange-rates/historical] BCCH failed for ${indicator}/${year}:`, bcchError);
      }
    }

    // Fallback: mindicador.cl (primary source for euro)
    try {
      const minIndicator = indicator === "dolar" ? "dolar" : indicator === "euro" ? "euro" : "uf";
      const res = await fetch(`https://mindicador.cl/api/${minIndicator}/${year}`, {
        next: { revalidate: 3600 },
      });
      if (!res.ok) throw new Error(`mindicador ${res.status}`);
      const data = await res.json();
      const serie = (data.serie || []).map((e: { fecha: string; valor: number }) => ({
        fecha: e.fecha.split("T")[0],
        valor: e.valor,
      }));

      cache[cacheKey] = { data: serie, expiry: Date.now() + CACHE_DURATION };
      return NextResponse.json({ success: true, serie, source: "mindicador.cl (fallback)" });
    } catch (err) {
      console.warn("[exchange-rates/historical] mindicador fallback failed:", err);
      return NextResponse.json({ success: true, serie: [] });
    }
  });
}
