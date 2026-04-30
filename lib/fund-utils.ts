/**
 * Serie keywords for detecting fund series from holding names.
 * e.g., "BANCA PRIVADA" → BPRIV, "ALTO PATRIMONIO" → ALPAT
 *
 * Includes both full-name patterns and abbreviated suffixes
 * commonly found in cartola fund names (e.g., "PATRIMONIAL BALANCEADA - B").
 */
export const SERIE_KEYWORDS: Array<{ pattern: RegExp; serieCode: string }> = [
  { pattern: /BANCA\s*PRIVADA|BPRIVADA/i, serieCode: "BPRIV" },
  { pattern: /ALTO\s*PATRIMONIO|ALTOPATRIM/i, serieCode: "ALPAT" },
  { pattern: /INSTITUCIONAL/i, serieCode: "INSTI" },
  { pattern: /INVERSIONIST/i, serieCode: "INVER" },
  { pattern: /COLABORADOR/i, serieCode: "COLAB" },
  { pattern: /CLASICA|CLASIC/i, serieCode: "CLASI" },
  { pattern: /\bAPV\b/i, serieCode: "APV" },
  // Abbreviated series from cartola names (e.g., "PATRIMONIAL BALANCEADA - B")
  { pattern: /\s-\s*BPRIV$/i, serieCode: "BPRIV" },
  { pattern: /\s-\s*ALPAT$/i, serieCode: "ALPAT" },
  { pattern: /\s-\s*INSTI$/i, serieCode: "INSTI" },
  { pattern: /\s-\s*B$/i, serieCode: "BPRIV" },
  { pattern: /\s-\s*A$/i, serieCode: "ALPAT" },
  { pattern: /\s-\s*I$/i, serieCode: "INSTI" },
];

/**
 * Detect the serie code from a fund/holding name.
 * Returns the serie code (e.g., "BPRIV") or null if no match.
 */
export function detectSerieCode(name: string): string | null {
  for (const { pattern, serieCode } of SERIE_KEYWORDS) {
    if (pattern.test(name)) return serieCode;
  }
  return null;
}
