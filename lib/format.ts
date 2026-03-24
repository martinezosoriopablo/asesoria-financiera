// lib/format.ts
// Funciones de formato compartidas — formato chileno

/**
 * Formato numérico chileno: puntos para miles, comas para decimales
 */
export function formatNumber(value: number, decimals: number = 0): string {
  const fixed = Math.abs(value).toFixed(decimals);
  const [intPart, decPart] = fixed.split(".");
  const withThousands = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  const formatted = decPart ? `${withThousands},${decPart}` : withThousands;
  return value < 0 ? `-${formatted}` : formatted;
}

/**
 * Formato moneda CLP: $1.234.567
 */
export function formatCurrency(value: number): string {
  return `$${formatNumber(value, 0)}`;
}

/**
 * Formato porcentaje con signo: +12,34%
 */
export function formatPercent(value: number | null | undefined, showSign: boolean = true): string {
  if (value === null || value === undefined) return "-";
  const sign = showSign && value >= 0 ? "+" : "";
  return `${sign}${formatNumber(value, 2)}%`;
}

/**
 * Formato fecha corta: 23 mar 2026
 */
export function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("es-CL", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

/**
 * Formato fecha corta sin año: 23 mar
 */
export function formatDateShort(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("es-CL", {
    day: "2-digit",
    month: "short",
  });
}
