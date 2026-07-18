// lib/returns/unit-return.ts
// Retorno del portafolio por el método VALOR CUOTA por posición, con fallback
// value-based y un guard de COBERTURA. El valor cuota (marketValue/quantity) no
// se altera con aportes/retiros, así que el retorno es inmune a flujos sin
// necesidad de registrarlos. Las posiciones nuevas/vendidas se excluyen del
// retorno del período (son movimientos, no rentabilidad).
//
// Guard de cobertura: si las posiciones matcheadas cubren < COVERAGE_THRESHOLD
// del valor previo (rebalanceo grande sin serie diaria) y no hay flujo
// registrado, el retorno es poco confiable → confidence 'low' (dato estimado).

import { keyOf, unitPrice, type FlowHolding } from "./implied-flow";

const COVERAGE_THRESHOLD = 0.8;

export interface PeriodUnitReturn {
  returnPct: number | null; // null si no hay posiciones matched
  coverage: number; // fracción del valor previo que matcheó [0..1]
}

/**
 * Retorno % del período entre dos cartolas, ponderado por el valor de inicio de
 * las posiciones presentes en AMBAS, más la cobertura (fracción del valor previo
 * que matcheó).
 */
export function computePeriodUnitReturn(
  prev: FlowHolding[] | undefined,
  curr: FlowHolding[] | undefined,
): PeriodUnitReturn {
  if (!prev || !curr || prev.length === 0 || curr.length === 0) {
    return { returnPct: null, coverage: 0 };
  }

  const totalPrev = prev.reduce((s, h) => s + (h.marketValue || 0), 0);
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

  if (matched === 0 || base <= 0) return { returnPct: null, coverage: 0 };
  return {
    returnPct: (weighted / base) * 100,
    coverage: totalPrev > 0 ? base / totalPrev : 0,
  };
}

export interface HybridPoint {
  id: string;
  value: number;
  netCashFlow?: number;
  holdings?: FlowHolding[];
}

export interface HybridReturnOutput {
  id: string;
  dailyReturn: number | null;
  cumulativeReturn: number;
  confidence: "high" | "low";
}

/**
 * Retornos por snapshot (daily = período, cumulative = encadenado) usando valor
 * cuota como principal, value-based como fallback, y un guard de cobertura.
 * confidence 'low' se propaga por la cadena una vez que un período no es confiable.
 */
export function computeSnapshotReturnsHybrid(ordered: HybridPoint[]): HybridReturnOutput[] {
  let factor = 1;
  let chainConfidence: "high" | "low" = "high";

  return ordered.map((s, i) => {
    if (i === 0) return { id: s.id, dailyReturn: null, cumulativeReturn: 0, confidence: "high" };

    const prev = ordered[i - 1];
    const { returnPct, coverage } = computePeriodUnitReturn(prev.holdings, s.holdings);

    let r: number;
    let periodConfidence: "high" | "low";
    if (returnPct != null && coverage >= COVERAGE_THRESHOLD) {
      // Valor cuota confiable
      r = returnPct;
      periodConfidence = "high";
    } else {
      // Fallback value-based
      const flow = s.netCashFlow ?? 0;
      r = prev.value > 0 ? ((s.value - flow - prev.value) / prev.value) * 100 : 0;
      // Si el asesor registró un flujo, el value-based es confiable; si no (cobertura
      // baja sin flujo registrado) es un dato estimado.
      periodConfidence = Math.abs(flow) > 0 ? "high" : "low";
    }

    if (periodConfidence === "low") chainConfidence = "low";
    factor *= 1 + r / 100;
    return { id: s.id, dailyReturn: r, cumulativeReturn: (factor - 1) * 100, confidence: chainConfidence };
  });
}
