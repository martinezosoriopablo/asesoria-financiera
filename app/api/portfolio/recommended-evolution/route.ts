// app/api/portfolio/recommended-evolution/route.ts
// Revaloriza la cartera recomendada (nivel-clase) como estrategia de mercado
// real y devuelve sus retornos mensuales en CLP. Paralelo a baseline-evolution
// (que hace lo análogo para el portafolio inicial). Ver spec 2026-07-23.
import { NextRequest } from "next/server";
import { requireClientAccess, createAdminClient } from "@/lib/auth/api-auth";
import { successResponse, errorResponse, handleApiError } from "@/lib/api-response";
import { applyRateLimit } from "@/lib/rate-limit";
import { fetchBcchSeries, getMarketTickerPrices } from "@/lib/prices/market-series";
import {
  expandRecommendation,
  buildMonthEnds,
  computeRecommendedMonthlyReturnsCLP,
} from "@/lib/prices/recommended-proxies";
import type { DailyPrice } from "@/lib/prices/types";

export async function POST(request: NextRequest) {
  const rl = await applyRateLimit(request, "recommended-evolution", { limit: 10 });
  if (rl) return rl;

  return handleApiError("recommended-evolution", async () => {
    const { clientId } = await request.json();
    if (!clientId) return errorResponse("clientId es requerido", 400);

    const { error: accessError } = await requireClientAccess(clientId);
    if (accessError) return accessError;

    const supabase = createAdminClient();

    // 1. Recomendación (nivel-clase)
    const { data: client } = await supabase
      .from("clients")
      .select("cartera_recomendada")
      .eq("id", clientId)
      .single();
    const rec = client?.cartera_recomendada as Record<string, unknown> | null;
    if (!rec) return successResponse({ series: null });

    // 2. Pesos por clase (mismo patrón que check-drift)
    const cartera = (rec.cartera || []) as Array<{ clase: string; porcentaje: number }>;
    const classWeights: Record<string, number> = {};
    for (const p of cartera) {
      if (p.clase && p.porcentaje) classWeights[p.clase] = (classWeights[p.clase] || 0) + p.porcentaje;
    }
    if (Object.keys(classWeights).length === 0) {
      const eq = rec.equity_percent as number | undefined;
      const fi = rec.fixed_income_percent as number | undefined;
      if (eq) classWeights["Renta Variable"] = eq;
      if (fi) classWeights["Renta Fija"] = fi;
    }
    const components = expandRecommendation(classWeights);
    if (components.length === 0) return successResponse({ series: null });

    // 3. Rango: primera cartola real → hoy
    const { data: firstSnap } = await supabase
      .from("portfolio_snapshots")
      .select("snapshot_date")
      .eq("client_id", clientId)
      .in("source", ["manual", "statement", "excel"])
      .order("snapshot_date", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (!firstSnap) return successResponse({ series: null });
    const fromDate = (firstSnap as { snapshot_date: string }).snapshot_date;
    const toDate = new Date().toISOString().split("T")[0];

    // 4. Cierres de mes
    const monthEnds = buildMonthEnds(fromDate, toDate);
    if (monthEnds.length < 2) return successResponse({ series: null });

    // 5. Precios + FX
    const usdSeries = await fetchBcchSeries("F073.TCO.PRE.Z.D", fromDate, toDate);
    const needUf = components.some((c) => c.ticker === "UF");
    const ufSeries = needUf ? await fetchBcchSeries("F073.UFF.PRE.Z.D", fromDate, toDate) : [];

    const pricesByTicker: Record<string, DailyPrice[]> = {};
    for (const c of components) {
      if (c.ticker === "UF") continue;
      if (!pricesByTicker[c.ticker]) {
        pricesByTicker[c.ticker] = await getMarketTickerPrices(c.ticker, fromDate, toDate);
      }
    }

    // 6. Cálculo en CLP
    const { returns, accumulated } = computeRecommendedMonthlyReturnsCLP(
      components,
      pricesByTicker,
      usdSeries,
      ufSeries,
      monthEnds
    );

    return successResponse({ series: { returns, accumulated, label: "Recomendado" } });
  });
}
