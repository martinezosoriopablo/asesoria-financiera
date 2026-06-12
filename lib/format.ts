// lib/format.ts
// Funciones de formato compartidas — formato chileno
// Incluye parsing (input) y formateo (output)

// ─── Parsing (Chilean format → number) ──────────────────────────────

/**
 * Parse Chilean-formatted number string: 1.234,56 → 1234.56
 * Handles: "1.234,56", "1234.56", "1234", "-5,3", whitespace, currency symbols.
 * Returns 0 for null/undefined/empty/unparseable.
 */
export function parseChileanNumber(val: unknown): number {
  if (val === null || val === undefined || val === "") return 0;
  if (typeof val === "number") return val;
  const s = String(val).trim();
  if (!s) return 0;
  // Try direct parse first (handles "1234.56" / "1234" without Chilean formatting)
  const direct = parseFloat(s);
  if (!isNaN(direct) && !s.includes(",")) return direct;
  // Chilean format: strip thousand dots, replace decimal comma
  const cleaned = s.replace(/\s/g, "").replace(/[^\d.,-]/g, "").replace(/\./g, "").replace(",", ".");
  const num = parseFloat(cleaned);
  return isNaN(num) ? 0 : num;
}

/**
 * Same as parseChileanNumber but returns null instead of 0 for invalid/empty.
 * Use when distinguishing "no data" from "zero" matters.
 */
export function parseChileanNumberOrNull(val: unknown): number | null {
  if (val === null || val === undefined || val === "") return null;
  if (typeof val === "number") return val;
  const s = String(val).trim();
  if (!s) return null;
  const direct = parseFloat(s);
  if (!isNaN(direct) && !s.includes(",")) return direct;
  const cleaned = s.replace(/\s/g, "").replace(/[^\d.,-]/g, "").replace(/\./g, "").replace(",", ".");
  if (!cleaned) return null;
  const num = parseFloat(cleaned);
  return isNaN(num) ? null : num;
}

// ─── Formatting (number → display string) ───────────────────────────

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
