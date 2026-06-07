// lib/portfolio/currency.ts

export interface ExchangeRates {
  usd: number;
  eur: number;
  uf: number;
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
