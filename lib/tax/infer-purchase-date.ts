// Infiere la fecha de compra de un FM chileno matcheando su unitCost (precio de
// compra por cuota) contra el valor cuota histórico. Solo match exacto (tolerante
// a redondeo). Ambigüedad (mismo vc en épocas distintas) o promedio ponderado
// sin match exacto -> null (mejor sin fecha que con una fecha incorrecta).

export interface VCPoint {
  fecha: string; // YYYY-MM-DD
  valorCuota: number;
}

const WINDOW_DAYS = 30;

export function inferPurchaseDate(unitCost: number, serie: VCPoint[]): { date: string } | null {
  if (!(unitCost > 0) || !serie || serie.length === 0) return null;

  const eps = Math.max(0.01, unitCost * 0.00005);
  const matchDates = serie
    .filter((p) => Math.abs(p.valorCuota - unitCost) <= eps)
    .map((p) => p.fecha)
    .sort();

  if (matchDates.length === 0) return null;

  const first = matchDates[0];
  const last = matchDates[matchDates.length - 1];
  const spanDays =
    (new Date(last + "T00:00:00").getTime() - new Date(first + "T00:00:00").getTime()) / 86400000;

  // Matches contiguos (plateau/misma compra) -> una fecha. Dispersos -> ambiguo.
  if (spanDays > WINDOW_DAYS) return null;
  return { date: first };
}
