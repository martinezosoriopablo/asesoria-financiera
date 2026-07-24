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
  if (prices.length === 0) {
    const fetched = await fetchPriceRange(resolution, fromDate, toDate);
    if (fetched.length > 0) {
      await storeInternationalPrices(ticker, fetched, resolution.currency, resolution.source);
      prices = fetched;
    }
  }
  return prices;
}
