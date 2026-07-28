// lib/prices/recommended-real.ts
// Revaloriza los INSTRUMENTOS REALES de la recomendación guardada (cartera[])
// como estrategia de mercado. Cada posición se resuelve a un ticker cotizable
// vía resolveSource; la Caja sin fondo (o cualquier instrumento sin serie de
// precios) cae al proxy de mercado de su clase. Ver spec 2026-07-27.
import {
  RECOMMENDED_PROXIES,
  normalizeClass,
  type FlatProxy,
} from "@/lib/prices/recommended-proxies";

export interface RealPosition {
  clase: string;
  ticker: string | null;
  porcentaje: number;
}

export interface RealComponent extends FlatProxy {
  clase: string;
  substituted: boolean;
}

export type ResolveFn = (h: {
  fundName: string; securityId: string; marketValue: number; market?: "CL" | "INT" | "US";
}) => { symbol: string; currency: string; source: string };

/** Proxies de mercado de una clase, escalados a `weight` (peso global ya normalizado). */
export function classProxyFor(clase: string, weight: number): RealComponent[] {
  const key = normalizeClass(clase);
  if (!key) return [];
  return RECOMMENDED_PROXIES[key].map((p) => ({
    ticker: p.ticker,
    weight: weight * p.weight,
    currency: p.currency,
    spread: p.spread,
    clase: key,
    substituted: true,
  }));
}

/**
 * Convierte cartera[] (posiciones reales) en componentes listos para
 * computeRecommendedMonthlyReturnsCLP. Pesos globales que suman 1. Clases no
 * reconocidas se ignoran y el resto se re-normaliza. Caja con ticker nulo →
 * proxy de su clase (UF). La sustitución por serie de precios vacía se hace en
 * la ruta (tras el fetch), no aquí.
 */
export function expandRealInstruments(
  cartera: RealPosition[],
  resolveFn: ResolveFn
): RealComponent[] {
  const flat: RealComponent[] = [];
  let totalMapped = 0;

  for (const pos of cartera) {
    const pct = Number(pos.porcentaje) || 0;
    if (pct <= 0) continue;
    const key = normalizeClass(pos.clase);
    if (!key) continue; // clase no reconocida → ignora, renormaliza resto
    totalMapped += pct;
    const w = pct / 100;

    if (pos.ticker) {
      const r = resolveFn({
        fundName: pos.ticker, securityId: pos.ticker, marketValue: 0, market: "US",
      });
      const currency: "USD" | "CLP" = r.currency === "CLP" ? "CLP" : "USD";
      flat.push({ ticker: r.symbol, weight: w, currency, clase: key, substituted: false });
    } else {
      // Sin instrumento (Caja) → proxy de clase, escalado por w
      for (const c of classProxyFor(key, w)) flat.push(c);
    }
  }

  if (totalMapped <= 0) return [];
  const scale = 100 / totalMapped;
  return flat.map((f) => ({ ...f, weight: f.weight * scale }));
}
