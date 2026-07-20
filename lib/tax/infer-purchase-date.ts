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

// Banda de sugerencia: mucho más laxa que el match exacto (0.5% vs ~0.005%).
// Captura casos donde el unitCost está a centavos de un valor cuota real
// (redondeo/comisión) pero no lo suficiente para el match estricto.
const SUGGEST_EPS_PCT = 0.5;

export interface PurchaseDateSuggestion {
  date: string;
  valorCuota: number;
  diffPct: number; // |unitCost - vc| / unitCost * 100
}

// Cuando NO hay match exacto, devuelve la fecha del valor cuota más cercano
// SIEMPRE que caiga dentro de la banda de sugerencia. Para que el asesor la
// confirme (nunca se aplica sola). Si ya hay match exacto -> null (lo resuelve
// inferPurchaseDate). Si el más cercano está fuera de la banda -> null.
export function suggestPurchaseDate(unitCost: number, serie: VCPoint[]): PurchaseDateSuggestion | null {
  if (!(unitCost > 0) || !serie || serie.length === 0) return null;
  if (inferPurchaseDate(unitCost, serie)) return null; // ya hay match exacto

  let closest: VCPoint | null = null;
  let closestDiff = Infinity;
  for (const p of serie) {
    if (!(p.valorCuota > 0)) continue;
    const diff = Math.abs(p.valorCuota - unitCost);
    if (diff < closestDiff) { closestDiff = diff; closest = p; }
  }
  if (!closest) return null;

  const diffPct = (closestDiff / unitCost) * 100;
  if (diffPct > SUGGEST_EPS_PCT) return null;
  return { date: closest.fecha, valorCuota: closest.valorCuota, diffPct };
}
