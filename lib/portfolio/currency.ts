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
