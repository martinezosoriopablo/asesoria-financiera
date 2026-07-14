// lib/returns/twr.ts
// Retorno Time-Weighted (TWR) encadenado — la rentabilidad "de verdad" del
// portafolio, inmune a flujos externos (aportes/retiros) y a rebalanceos.
//
// Por cada par de puntos consecutivos:
//   r_i = (V_i - V_{i-1} - flujoNeto_i) / V_{i-1}
// y se encadena: cumulativo = Π(1 + r_i) - 1.
//
// - flujoNeto (netCashFlow): >0 = aporte (entra plata), <0 = retiro (sale plata).
//   Convención de flujo al final del período (Dietz simple); con snapshots diarios
//   el error de timing es despreciable.
// - Un rebalanceo (vender A, comprar B por el mismo valor) tiene flujoNeto 0 y
//   valor continuo, así que el retorno del período captura solo el movimiento de
//   precios — sin necesidad de conocer el vector.
// - Períodos con V_{i-1} <= 0 se saltan (retorno 0 para ese tramo).

export interface TWRPoint {
  value: number;
  /** Flujo neto externo del período que TERMINA en este punto. >0 aporte, <0 retiro. */
  netCashFlow?: number;
}

export interface TWRResult {
  /** Retorno % de cada período (largo n-1). */
  periodReturns: number[];
  /** Retorno acumulado % del portafolio completo. */
  cumulative: number;
  /** Retorno acumulado % en cada punto (largo n; el primero es 0). */
  cumulativeSeries: number[];
}

export function computeTWR(points: TWRPoint[]): TWRResult {
  const periodReturns: number[] = [];
  const cumulativeSeries: number[] = points.length > 0 ? [0] : [];

  let factor = 1;
  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1].value;
    const curr = points[i].value;
    const flow = points[i].netCashFlow ?? 0;

    let r = 0;
    if (prev > 0) {
      r = ((curr - flow - prev) / prev) * 100;
    }
    periodReturns.push(r);
    factor *= 1 + r / 100;
    cumulativeSeries.push((factor - 1) * 100);
  }

  return {
    periodReturns,
    cumulative: (factor - 1) * 100,
    cumulativeSeries,
  };
}
