/**
 * Common Chilean stock tickers traded on Bolsa de Santiago.
 * Stored WITHOUT exchange suffix — callers can add .SN or .CL as needed.
 *
 * Merged from:
 *   - app/api/fondos/search-price/route.ts (29 tickers)
 *   - app/api/securities/search/route.ts (14 tickers with .SN suffix)
 */
export const CHILEAN_TICKERS = [
  "AGUAS-A",
  "ANDINA-B",
  "BCI",
  "BESALCO",
  "BSANTANDER",
  "CAP",
  "CCU",
  "CENCOSUD",
  "CHILE",
  "CMPC",
  "COLBUN",
  "COPEC",
  "ENELAM",
  "ENELCHILE",
  "FALABELLA",
  "HABITAT",
  "ITAUCORP",
  "LTM",
  "MASISA",
  "ORO BLANCO",
  "PARAUCO",
  "QUINENCO",
  "RIPLEY",
  "SALFACORP",
  "SECURITY",
  "SM-CHILE B",
  "SONDA",
  "SQM-A",
  "SQM-B",
  "VAPORES",
];

/**
 * Check if a ticker symbol is a known Chilean stock.
 * Handles .SN and .CL suffixes automatically.
 */
export function isChileanTicker(symbol: string): boolean {
  const clean = symbol.toUpperCase().replace(/\.(SN|CL)$/i, "");
  return CHILEAN_TICKERS.includes(clean);
}
