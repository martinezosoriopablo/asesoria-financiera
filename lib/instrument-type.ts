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
const CUSIP_RE = /^[A-Z0-9]{9}$/i;

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

  // 6. Non-numeric securityId -> stock (ETF detection could be refined later)
  if (secId) return "stock";

  // 7. No securityId — guess from name
  return "fund";
}
