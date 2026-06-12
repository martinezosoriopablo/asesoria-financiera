// lib/instrument-type.ts

export type InstrumentType = "bond" | "stock" | "etf" | "fund" | "cash";

interface HoldingLike {
  fundName: string;
  instrumentType?: string;
  assetType?: string;      // backward compat
  assetClass?: string;
  securityId?: string | null;
  couponRate?: number | null;
  maturityDate?: string | null;
}

const VALID_TYPES = new Set<string>(["bond", "stock", "etf", "fund", "cash"]);

const CASH_RE = /cash|efect|money\s*market|liquidez|sweep|deposito|depósito/i;
const ETF_NAME_RE = /\bETF\b|\bSPDR\b|\biShares\b|\bVanguard\b.*\b(Index|Total|Growth|Value)\b/i;
const ETF_TICKER_SET = new Set([
  // Core & broad market
  "SPY","QQQ","IVV","VOO","VTI","VEA","VWO","EFA","EEM","AGG","BND","LQD","HYG","TLT","IEF",
  "SHY","GLD","SLV","XLF","XLK","XLE","XLV","XLI","XLY","XLP","XLU","XLB","XLRE","XLC",
  "SMH","SOXX","ARKK","ARKW","ARKF","ARKG","DIA","IWM","IWF","IWD","MDY","VIG","VYM","SCHD",
  "ITOT","IEMG","IJR","IJH","DVY","PFF","EMB","VCIT","VCSH","BNDX","VXUS",
  // Comite categories (primary + UCITS)
  "ECH","TIP","VNQ","SGOV",
  "CSPX","IWDA","EIMI","IDTM","IBTS","LQDE","ITPS","IHYG","EMHC","SGLN","IPRP","ERNS",
  // Secondary / additional
  "SPLG","SCHX","IEFA","SPDW","SCHE","GOVT","VGIT","VGSH","SCHO","BIL",
  "IGIB","SCHP","VTIP","JNK","USHY","VWOB","PCY","IAU","GLDM","SCHH","IYR","SHV","GBIL",
]);
const CUSIP_RE = /^[A-Z0-9]{9}$/i;

// Chilean ETF nemotécnicos (fondos de inversión tipo ETF en Bolsa de Santiago)
const CHILEAN_ETF_RE = /^CFI\s*ETF/i;

/**
 * Infer instrument type from holding fields.
 * Priority: explicit field -> bond markers -> RUN -> ticker -> name -> default.
 *
 * Key rule: assetClass ("fixedIncome") does NOT make something a bond.
 * Only direct bonds with couponRate + maturityDate (and optionally CUSIP) are bonds.
 */
export function inferInstrumentType(h: HoldingLike): InstrumentType {
  // 1. Explicit instrumentType or assetType (backward compat)
  const explicit = h.instrumentType || h.assetType;
  if (explicit && VALID_TYPES.has(explicit)) return explicit as InstrumentType;

  const secId = (h.securityId || "").trim();
  const name = (h.fundName || "").toLowerCase();

  // 2. Cash — check early (name or assetClass)
  if (h.assetClass === "cash" || CASH_RE.test(name)) return "cash";

  // 3. Bond: requires couponRate + maturityDate (actual bond-specific data)
  const hasCoupon = h.couponRate != null && h.couponRate > 0;
  const hasMaturity = h.maturityDate != null && h.maturityDate.length > 0;
  if (hasCoupon && hasMaturity) return "bond";

  // 4. CUSIP-shaped securityId without coupon data — still likely a bond
  //    (bond data may come from FINRA lookup later)
  if (secId && CUSIP_RE.test(secId) && !(/^\d+$/.test(secId))) return "bond";

  // 5. Numeric securityId -> Chilean fund (RUN)
  if (/^\d+$/.test(secId)) return "fund";

  // 6. Chilean fondos de inversión (CFI* nemotécnicos, transados en Bolsa de Santiago)
  //    CFIETF* = ETF, other CFI* = fund (FI regular)
  if (/^CFIETF/i.test(secId)) return "etf";
  if (/^CFI/i.test(secId)) return "fund";

  // 7. ETF detection: by ticker set or name pattern
  if (ETF_TICKER_SET.has(secId.toUpperCase()) || ETF_NAME_RE.test(name)) return "etf";

  // 8. Chilean ETF by name (e.g. "FI ETF SINGULAR...")
  if (CHILEAN_ETF_RE.test(name)) return "etf";

  // 9. Non-numeric securityId -> stock (includes GOOGLCL, NVDACL — Chilean ADRs)
  if (secId) return "stock";

  // 10. No securityId — check name for ETF, else default to fund
  if (ETF_NAME_RE.test(name)) return "etf";
  return "fund";
}

/** Alias for inferInstrumentType — used by radiografia v2 pipeline */
export const detectInstrumentType = inferInstrumentType;
