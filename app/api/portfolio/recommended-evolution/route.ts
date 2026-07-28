// app/api/portfolio/recommended-evolution/route.ts
// Devuelve DOS series en CLP: `series` = instrumentos REALES de la recomendación
// revalorizados a mercado; `benchmarkProxy` = índices por clase (proxy). Comparten
// el fetch de precios. Ver spec 2026-07-27.
import { NextRequest } from "next/server";
import { requireClientAccess, createAdminClient } from "@/lib/auth/api-auth";
import { successResponse, errorResponse, handleApiError } from "@/lib/api-response";
import { applyRateLimit } from "@/lib/rate-limit";
import { fetchBcchDailyPrices, getMarketTickerPrices } from "@/lib/prices/market-series";
import {
  expandRecommendation,
  buildMonthEnds,
  computeRecommendedMonthlyReturnsCLP,
} from "@/lib/prices/recommended-proxies";
import {
  expandRealInstruments,
  classProxyFor,
  type RealComponent,
} from "@/lib/prices/recommended-real";
import { resolveSource } from "@/lib/prices/price-service";
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

    // 1. Recomendación guardada
    const { data: client } = await supabase
      .from("clients")
      .select("cartera_recomendada")
      .eq("id", clientId)
      .single();
    const rec = client?.cartera_recomendada as Record<string, unknown> | null;
    if (!rec) return successResponse({ series: null, benchmarkProxy: null });

    const cartera = (rec.cartera || []) as Array<{ clase: string; ticker: string | null; porcentaje: number }>;

    // 2a. Componentes REALES (instrumentos de la Decisión)
    const realComponents = expandRealInstruments(
      cartera.map((p) => ({ clase: p.clase, ticker: p.ticker ?? null, porcentaje: p.porcentaje })),
      resolveSource
    );

    // 2b. Componentes PROXY (índices por clase) — igual que antes
    const classWeights: Record<string, number> = {};
    for (const p of cartera) {
      if (p.clase && p.porcentaje > 0) classWeights[p.clase] = (classWeights[p.clase] || 0) + p.porcentaje;
    }
    if (Object.keys(classWeights).length === 0) {
      const eq = rec.equity_percent as number | undefined;
      const fi = rec.fixed_income_percent as number | undefined;
      if (eq) classWeights["Renta Variable"] = eq;
      if (fi) classWeights["Renta Fija"] = fi;
    }
    const proxyComponents = expandRecommendation(classWeights);

    if (realComponents.length === 0 && proxyComponents.length === 0) {
      return successResponse({ series: null, benchmarkProxy: null });
    }

    // 3. Rango: primera cartola real → hoy
    const { data: firstSnap } = await supabase
      .from("portfolio_snapshots")
      .select("snapshot_date")
      .eq("client_id", clientId)
      .in("source", ["manual", "statement", "excel"])
      .order("snapshot_date", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (!firstSnap) return successResponse({ series: null, benchmarkProxy: null });
    const fromDate = (firstSnap as { snapshot_date: string }).snapshot_date;
    const toDate = new Date().toISOString().split("T")[0];

    const monthEnds = buildMonthEnds(fromDate, toDate);
    if (monthEnds.length < 2) return successResponse({ series: null, benchmarkProxy: null });

    // 4. Precios: unión de tickers de AMBAS listas (un solo fetch). UF y USD aparte.
    const allComponents = [...realComponents, ...proxyComponents];
    const usdSeries = await fetchBcchDailyPrices("dolar", fromDate, toDate);
    const needUf = allComponents.some((c) => c.ticker === "UF");
    const ufSeries = needUf ? await fetchBcchDailyPrices("uf", fromDate, toDate) : [];

    const uniqueTickers = [...new Set(allComponents.map((c) => c.ticker).filter((t) => t !== "UF"))];
    const pricesByTicker: Record<string, DailyPrice[]> = {};
    for (const ticker of uniqueTickers) {
      pricesByTicker[ticker] = await getMarketTickerPrices(ticker, fromDate, toDate);
    }

    // 5. Swap por serie vacía: un instrumento real sin precios → proxy de su clase.
    const hasPrices = (c: RealComponent): boolean =>
      c.ticker === "UF" ? ufSeries.length > 0 : (pricesByTicker[c.ticker]?.length ?? 0) > 0;
    const resolvedReal: RealComponent[] = realComponents.flatMap((c) =>
      hasPrices(c) ? [c] : classProxyFor(c.clase, c.weight)
    );
    // Los proxies de sustitución (ACWI/AGG/GLD/RWO/UF) ya están en pricesByTicker
    // porque su clase está presente en proxyComponents (misma recomendación).

    // 6. Cálculo en CLP de ambas series
    const real = computeRecommendedMonthlyReturnsCLP(resolvedReal, pricesByTicker, usdSeries, ufSeries, monthEnds);
    const proxy = computeRecommendedMonthlyReturnsCLP(proxyComponents, pricesByTicker, usdSeries, ufSeries, monthEnds);

    return successResponse({
      series: Object.keys(real.returns).length > 0
        ? { returns: real.returns, accumulated: real.accumulated, label: "Recomendado" }
        : null,
      benchmarkProxy: Object.keys(proxy.returns).length > 0
        ? { returns: proxy.returns, accumulated: proxy.accumulated, label: "Proxy de mercado" }
        : null,
    });
  });
}
