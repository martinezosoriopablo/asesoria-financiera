// lib/returns/unit-return.ts
// Retorno del portafolio por el método VALOR CUOTA por posición, con fallback
// value-based. Es el método robusto: el valor cuota (marketValue/quantity) no se
// altera con aportes/retiros, así que el retorno es inmune a flujos sin necesidad
// de registrarlos. Las posiciones nuevas/vendidas se excluyen del retorno del
// período (son movimientos de posición, no rentabilidad).

import { keyOf, unitPrice, type FlowHolding } from "./implied-flow";
import type { SnapshotReturnOutput } from "./twr";

/**
 * Retorno % del período entre dos cartolas, ponderado por el valor de inicio de
 * las posiciones presentes en AMBAS. Devuelve null si no hay posiciones matched
 * (o faltan holdings) → el llamador debe usar un fallback.
 */
export function computePeriodUnitReturn(
  prev: FlowHolding[] | undefined,
  curr: FlowHolding[] | undefined,
): number | null {
  if (!prev || !curr || prev.length === 0 || curr.length === 0) return null;

  const currByKey = new Map<string, FlowHolding>();
  for (const h of curr) currByKey.set(keyOf(h), h);

  let base = 0;
  let weighted = 0;
  let matched = 0;
  for (const p of prev) {
    const c = currByKey.get(keyOf(p));
    if (!c) continue;
    const upPrev = unitPrice(p);
    const upCurr = unitPrice(c);
    if (upPrev == null || upCurr == null || upPrev <= 0) continue;
    const ret = upCurr / upPrev - 1;
    base += p.marketValue;
    weighted += p.marketValue * ret;
    matched++;
  }

  if (matched === 0 || base <= 0) return null;
  return (weighted / base) * 100;
}

export interface HybridPoint {
  id: string;
  value: number;
  netCashFlow?: number;
  holdings?: FlowHolding[];
}

/**
 * Retornos por snapshot (daily = período, cumulative = encadenado) usando valor
 * cuota como principal y value-based como fallback por período.
 */
export function computeSnapshotReturnsHybrid(ordered: HybridPoint[]): SnapshotReturnOutput[] {
  let factor = 1;
  return ordered.map((s, i) => {
    if (i === 0) return { id: s.id, dailyReturn: null, cumulativeReturn: 0 };

    const prev = ordered[i - 1];
    let r = computePeriodUnitReturn(prev.holdings, s.holdings);
    if (r == null) {
      // Fallback value-based: (V − V₀ − flujoNeto)/V₀
      const flow = s.netCashFlow ?? 0;
      r = prev.value > 0 ? ((s.value - flow - prev.value) / prev.value) * 100 : 0;
    }

    factor *= 1 + r / 100;
    return { id: s.id, dailyReturn: r, cumulativeReturn: (factor - 1) * 100 };
  });
}
