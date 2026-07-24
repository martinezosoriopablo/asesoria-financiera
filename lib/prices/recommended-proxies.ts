// lib/prices/recommended-proxies.ts
// Índices de mercado representativos por clase de activo. Sirven para
// revalorizar la cartera recomendada (nivel-clase RV/RF/Alt/Caja) como una
// estrategia de mercado real, y compararla contra el portafolio del cliente,
// el portafolio inicial y el benchmark. Ver spec 2026-07-23-comparacion-triple.
import { stripAccents } from "@/lib/text";
import type { DailyPrice } from "@/lib/prices/types";

export interface FlatProxy {
  ticker: string;
  weight: number; // peso global consolidado (clase × blend); el conjunto suma 1
  currency: "USD" | "CLP";
  spread?: number; // solo UF: spread anual %, retorno = inflación UF + spread/12
}

type ProxyBlend = Array<{ ticker: string; weight: number; currency: "USD" | "CLP"; spread?: number }>;

// clase normalizada (minúsculas, sin acentos) → blend de proxies (pesos suman 1 por clase)
export const RECOMMENDED_PROXIES: Record<string, ProxyBlend> = {
  "renta variable": [{ ticker: "ACWI", weight: 1, currency: "USD" }],
  "renta fija": [{ ticker: "AGG", weight: 1, currency: "USD" }],
  alternativos: [
    { ticker: "GLD", weight: 0.5, currency: "USD" },
    { ticker: "RWO", weight: 0.5, currency: "USD" },
  ],
  caja: [{ ticker: "UF", weight: 1, currency: "CLP", spread: 0 }],
};

function normalizeClass(clase: string): string | null {
  const c = stripAccents(clase).trim().toLowerCase();
  if (c === "renta variable") return "renta variable";
  if (c === "renta fija") return "renta fija";
  if (c === "alternativos" || c === "alternativas" || c === "instrumentos alternativos")
    return "alternativos";
  if (c === "caja" || c === "liquidez" || c === "efectivo") return "caja";
  return null;
}

/**
 * Expande pesos por clase (porcentajes, ej. { "Renta Variable": 60 }) a una
 * lista plana de proxies con pesos globales que suman 1. Clases no reconocidas
 * se ignoran y los pesos restantes se re-normalizan.
 */
export function expandRecommendation(classWeights: Record<string, number>): FlatProxy[] {
  const flat: FlatProxy[] = [];
  let totalMapped = 0;
  for (const [clase, pct] of Object.entries(classWeights)) {
    if (!pct || pct <= 0) continue;
    const key = normalizeClass(clase);
    if (!key) continue;
    totalMapped += pct;
    for (const p of RECOMMENDED_PROXIES[key]) {
      flat.push({
        ticker: p.ticker,
        weight: (pct / 100) * p.weight,
        currency: p.currency,
        spread: p.spread,
      });
    }
  }
  if (totalMapped <= 0) return [];
  const scale = 100 / totalMapped;
  return flat.map((f) => ({ ...f, weight: f.weight * scale }));
}

/** Cierres de mes ("YYYY-MM-DD") dentro de [fromDate, toDate], en UTC. */
export function buildMonthEnds(fromDate: string, toDate: string): string[] {
  const start = new Date(fromDate + "T00:00:00Z");
  const end = new Date(toDate + "T00:00:00Z");
  if (isNaN(start.getTime()) || isNaN(end.getTime())) return [];
  const ends: string[] = [];
  let y = start.getUTCFullYear();
  let m = start.getUTCMonth();
  while (true) {
    const monthEnd = new Date(Date.UTC(y, m + 1, 0)); // último día del mes (y, m)
    if (monthEnd > end) break;
    ends.push(monthEnd.toISOString().split("T")[0]);
    m++;
    if (m > 11) {
      m = 0;
      y++;
    }
  }
  return ends;
}

function closest(prices: DailyPrice[], target: string): number | null {
  let best: DailyPrice | null = null;
  for (const p of prices) {
    if (p.date <= target) best = p;
    else break;
  }
  if (!best) return null;
  const diff = (new Date(target).getTime() - new Date(best.date).getTime()) / 86400000;
  return diff <= 7 ? best.price : null;
}

/**
 * Retornos mensuales en CLP de la estrategia recomendada. Cada componente:
 * - USD: retorno CLP = (1 + retorno_nativo) × (usd_fin / usd_ini) − 1
 * - UF:  retorno CLP = inflación_UF_del_mes + spread/12
 * Se ponderan por `weight`. Si un componente no tiene precio en un mes, se
 * re-normaliza por el peso efectivamente cubierto (no subvalora el mes).
 * Requiere que `prices` esté ordenado ascendente por fecha.
 */
export function computeRecommendedMonthlyReturnsCLP(
  components: FlatProxy[],
  pricesByTicker: Record<string, DailyPrice[]>,
  usdSeries: DailyPrice[],
  ufSeries: DailyPrice[],
  monthEnds: string[]
): { returns: Record<string, number>; accumulated: number } {
  const returns: Record<string, number> = {};
  for (let i = 1; i < monthEnds.length; i++) {
    const prevEnd = monthEnds[i - 1];
    const currEnd = monthEnds[i];
    const key = currEnd.substring(0, 7);
    let weighted = 0;
    let weightCovered = 0;
    for (const c of components) {
      let clpRet: number | null = null;
      if (c.ticker === "UF") {
        const prevUf = closest(ufSeries, prevEnd);
        const currUf = closest(ufSeries, currEnd);
        if (prevUf && currUf && prevUf > 0) {
          clpRet = (currUf / prevUf - 1) * 100 + (c.spread ?? 0) / 12;
        }
      } else {
        const prices = pricesByTicker[c.ticker] || [];
        const prevP = closest(prices, prevEnd);
        const currP = closest(prices, currEnd);
        if (prevP && currP && prevP > 0) {
          const nativeRet = currP / prevP - 1;
          if (c.currency === "USD") {
            const usdStart = closest(usdSeries, prevEnd);
            const usdEnd = closest(usdSeries, currEnd);
            if (usdStart && usdEnd && usdStart > 0) {
              clpRet = ((1 + nativeRet) * (usdEnd / usdStart) - 1) * 100;
            }
          } else {
            clpRet = nativeRet * 100;
          }
        }
      }
      if (clpRet != null) {
        weighted += c.weight * clpRet;
        weightCovered += c.weight;
      }
    }
    if (weightCovered > 0) returns[key] = weighted / weightCovered;
  }
  let compound = 1;
  for (const v of Object.values(returns)) compound *= 1 + v / 100;
  return { returns, accumulated: (compound - 1) * 100 };
}
