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
import type { DailyPrice } from "@/lib/prices/types";

/**
 * Serie diaria de una serie BCCH (SI3). Ej: dólar observado
 * "F073.TCO.PRE.Z.D" (CLP/USD), UF "F073.UFF.PRE.Z.D" (CLP). Devuelve [] si
 * faltan credenciales o falla la red.
 */
export async function fetchBcchSeries(
  seriesId: string,
  fromDate: string,
  toDate: string
): Promise<DailyPrice[]> {
  const user = process.env.BCCH_API_USER;
  const pass = process.env.BCCH_API_PASSWORD;
  if (!user || !pass) return [];
  try {
    const url = `https://si3.bcentral.cl/SieteRestWS/SieteRestWS.ashx?user=${user}&pass=${pass}&firstdate=${fromDate}&lastdate=${toDate}&timeseries=${seriesId}&function=GetSeries`;
    const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
    if (!res.ok) return [];
    const data = await res.json();
    const obs = data?.Series?.Obs;
    if (!Array.isArray(obs)) return [];
    const out: DailyPrice[] = [];
    for (const o of obs) {
      const v = parseFloat(String(o.value).replace(",", "."));
      const ds = String(o.indexDateString || ""); // "DD-MM-YYYY"
      const parts = ds.split("-");
      if (parts.length !== 3 || !isFinite(v) || v <= 0) continue;
      out.push({ date: `${parts[2]}-${parts[1]}-${parts[0]}`, price: v });
    }
    out.sort((a, b) => a.date.localeCompare(b.date));
    return out;
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
