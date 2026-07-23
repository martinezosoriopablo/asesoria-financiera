// lib/portfolio/currency.ts

export interface ExchangeRates {
  usd: number;
  eur: number;
  uf: number;
}

// Códigos de moneda (ISO 4217 + unidades chilenas UF/CLF). Se usan para EVITAR
// que un código de moneda mal cargado como securityId se cotice como ticker.
// Caso real: un holding con securityId "USD" matcheaba el ETF Yahoo "USD"
// (ProShares Ultra Semiconductors) e inyectaba una serie de precios falsa.
const CURRENCY_CODES = new Set([
  "USD", "EUR", "CLP", "UF", "CLF", "GBP", "JPY", "CHF", "CAD", "AUD", "NZD",
  "BRL", "ARS", "MXN", "PEN", "COP", "UYU", "CNY", "CNH", "HKD", "SGD",
]);

/**
 * ¿El string es un código de moneda (no un ticker/RUN)? Case-insensitive.
 * Úsalo como guard antes de rutear un securityId a una fuente de precios.
 */
export function isCurrencyCode(code: string | null | undefined): boolean {
  if (!code) return false;
  return CURRENCY_CODES.has(code.trim().toUpperCase());
}

/**
 * Convert a value in any currency to CLP.
 * Pure function — extracted from ReviewSnapshotModal.
 */
export function toCLP(value: number, currency: string, rates: ExchangeRates): number {
  switch (currency) {
    case "USD": return value * rates.usd;
    case "EUR": return value * rates.eur;
    case "UF": return value * rates.uf;
    case "CLP": return value;
    default: return value;
  }
}

/**
 * Convert a CLP value to target currency.
 * Pure function — extracted from ReviewSnapshotModal.
 */
export function fromCLP(clpValue: number, targetCurrency: string, rates: ExchangeRates): number {
  switch (targetCurrency) {
    case "USD": return clpValue / rates.usd;
    case "EUR": return clpValue / rates.eur;
    case "UF": return clpValue / rates.uf;
    case "CLP": return clpValue;
    default: return clpValue;
  }
}

/**
 * Factor de ajuste FX por moneda para re-expresar retornos.
 * Para cada moneda X: `FxAdjust[X] = fx(X, fechaInicio) / fx(X, fechaFin)`,
 * donde fx(X, fecha) = CLP por 1 unidad de X en esa fecha (CLP→1, USD→dólar
 * observado, UF→valor UF, EUR→euro). Se construye en SeguimientoPage a partir
 * de `cartolaExchangeRates` (inicio) y `currentExchangeRates` (fin).
 */
export type FxAdjust = Record<string, number>;

/**
 * Re-expresa un retorno NATIVO (en la moneda del instrumento) a la moneda de
 * reporte R. Regla honesta por moneda (ver project_moneda_reporte_seguimiento):
 *
 *   return_R = (1 + nativo) × adj(R) / adj(C) − 1
 *
 * donde C = moneda del holding, adj = FxAdjust. Si C === R los factores se
 * cancelan y devuelve el retorno nativo (sin FX). Ejemplo B&B (holding USD):
 * nativo −0,40% → CLP +1,13% (dólar 922→936 dentro) / USD −0,40% / UF ~+1,07%.
 *
 * Todos los valores en PUNTOS PORCENTUALES (ej. −0.4 = −0,4%).
 */
export function rebaseReturnPct(
  nativePct: number,
  holdingCurrency: string | null | undefined,
  reportCurrency: string | null | undefined,
  adj: FxAdjust | null | undefined
): number {
  if (!adj) return nativePct;
  const c = (holdingCurrency || "CLP").toUpperCase();
  const r = (reportCurrency || "CLP").toUpperCase();
  if (c === r) return nativePct;
  const adjC = adj[c];
  const adjR = adj[r];
  if (!adjC || !adjR || !isFinite(adjC) || !isFinite(adjR)) return nativePct;
  return ((1 + nativePct / 100) * (adjR / adjC) - 1) * 100;
}
