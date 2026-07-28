// lib/prices/market-series.ts
// Helpers de red para series de mercado usados por endpoints de comparación
// (recommended-evolution). Series BCCH (USD/UF) y precios de tickers vía
// price-service. IO puro; la matemática vive en recommended-proxies.ts.
import {
  resolveSource,
  getStoredPrices,
  fetchPriceRange,
  storeInternationalPrices,
} from "@/lib/prices/price-service";
import { fetchBcchSeries as fetchBcchSeriesCanonical } from "@/lib/bcch";
import type { DailyPrice } from "@/lib/prices/types";

/**
 * Serie diaria BCCH (dólar observado o UF) como DailyPrice[]. Reusa el cliente
 * canónico lib/bcch.ts; degrada a [] ante fallo (sin credenciales / red / API),
 * para que el endpoint pueda seguir sin romper.
 */
export async function fetchBcchDailyPrices(
  indicator: "dolar" | "uf",
  fromDate: string,
  toDate: string
): Promise<DailyPrice[]> {
  try {
    const obs = await fetchBcchSeriesCanonical(indicator, fromDate, toDate);
    return obs.map((o) => ({ date: o.fecha, price: o.valor }));
  } catch {
    return [];
  }
}

/**
 * ¿Los precios cacheados NO cubren el inicio del rango? true si la caché está
 * vacía o si su fecha más temprana es > 7 días posterior a `fromDate` (caso de
 * historia parcial reciente en `international_prices`). En ese caso hay que
 * traer el rango completo de la fuente en vez de devolver solo el tramo cacheado.
 */
export function needsRangeBackfill(cached: DailyPrice[], fromDate: string): boolean {
  if (cached.length === 0) return true;
  let earliest = cached[0].date;
  for (const c of cached) if (c.date < earliest) earliest = c.date;
  const gapDays = (new Date(earliest).getTime() - new Date(fromDate).getTime()) / 86400000;
  return gapDays > 7;
}

/** Serie de precios de un ticker de mercado (US) vía price-service, con caché. */
export async function getMarketTickerPrices(
  ticker: string,
  fromDate: string,
  toDate: string
): Promise<DailyPrice[]> {
  const resolution = resolveSource({
    fundName: ticker,
    securityId: ticker,
    marketValue: 0,
    market: "US",
  });
  let prices = await getStoredPrices(ticker, fromDate, toDate);
  // Rellena si no hay datos O si la caché no cubre el inicio del rango (historia
  // parcial). El rango completo desde la fuente reemplaza al tramo cacheado.
  if (needsRangeBackfill(prices, fromDate)) {
    const fetched = await fetchPriceRange(resolution, fromDate, toDate);
    if (fetched.length > 0) {
      await storeInternationalPrices(ticker, fetched, resolution.currency, resolution.source);
      prices = fetched;
    }
  }
  return prices;
}
