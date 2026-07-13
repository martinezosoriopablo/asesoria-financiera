// lib/bonds/prorate-period-return.ts
// Prorratea linealmente el retorno acumulado de un bono para estimar su tramo
// en un período (mes). Fuente única usada por Atribución, email de seguimiento
// y el gráfico Rentabilidad por Activo, para que las 3 vistas coincidan.
//
// Los bonos no tienen histórico de precios (no hay handler FINRA), así que se
// aproxima con devengo ~lineal: el retorno acumulado (accRet) está medido desde
// la cartola hasta la fecha de referencia (hoy), y se reparte por días.
//
//   ret = accRet * (díasEfectivosDelPeríodo / (referencia - cartola))
//
// - Denominador = (referencia - cartola): el lapso que abarca accRet.
// - Días efectivos: acotados a la ventana realmente tenida y no más allá de hoy
//   -> max(inicioPeríodo, cartola) .. min(finPeríodo, referencia).
// - Cap proRatio <= 1: un tramo nunca puede superar el retorno total.

const MS_PER_DAY = 86400000;

function parseDay(d: string): number {
  return new Date(d + "T00:00:00").getTime();
}

export function proratePeriodReturn(params: {
  accumulatedReturnPct: number;
  cartolaDate: string | null | undefined;
  referenceDateMs: number;
  periodStart: string;
  periodEnd: string;
}): number {
  const { accumulatedReturnPct, cartolaDate, referenceDateMs, periodStart, periodEnd } = params;

  // Sin fecha de cartola no se puede prorratear: fallback al acumulado.
  if (!cartolaDate) return accumulatedReturnPct;

  const cartolaMs = parseDay(cartolaDate);
  const totalDays = Math.max(1, (referenceDateMs - cartolaMs) / MS_PER_DAY);

  // Ventana efectivamente tenida dentro del período (no antes de la cartola,
  // no después de la referencia).
  const effStart = Math.max(parseDay(periodStart), cartolaMs);
  const effEnd = Math.min(parseDay(periodEnd), referenceDateMs);
  const periodDays = Math.max(0, (effEnd - effStart) / MS_PER_DAY);

  const proRatio = Math.min(1, periodDays / totalDays);
  return accumulatedReturnPct * proRatio;
}
