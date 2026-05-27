/**
 * Canonical 16-category system for comite portfolio models.
 * Classifies client holdings, maps risk profiles, and provides
 * lookup tables for fund mapping.
 */

// ── Types ────────────────────────────────────────────────────────────────

export type ComiteRole = "rv" | "rf" | "alt" | "cash";
export type Confidence = "high" | "medium" | "low";

export interface ComiteCategory {
  id: string;
  label: string;
  role: ComiteRole;
  etfUS: string | null;
  etfUCITS: string | null;
}

export interface HoldingForClassification {
  fundName: string;
  securityId?: string | null;
  marketValue: number;
  assetClass?: string;
  currency?: string;
  familiaEstudios?: string | null;
  couponRate?: number | null;
  maturityDate?: string | null;
}

export interface ClassifiedHolding {
  categoryId: string;
  confidence: Confidence;
  fundName: string;
  marketValue: number;
}

// ── Canonical 16 categories ──────────────────────────────────────────────

export const COMITE_CATEGORIES: ComiteCategory[] = [
  // RV (equity)
  { id: "rv_usa_large_cap",      label: "RV USA Large Cap",            role: "rv",   etfUS: "VOO",  etfUCITS: "CSPX" },
  { id: "rv_desarrollados_ex_us", label: "RV Desarrollados ex-US",     role: "rv",   etfUS: "VEA",  etfUCITS: "IWDA" },
  { id: "rv_emergentes",          label: "RV Emergentes",              role: "rv",   etfUS: "VWO",  etfUCITS: "EIMI" },
  { id: "rv_chile",               label: "RV Chile",                   role: "rv",   etfUS: "ECH",  etfUCITS: null },
  // RF (fixed income)
  { id: "rf_ust_belly",           label: "UST 3-10yr Belly",           role: "rf",   etfUS: "IEF",  etfUCITS: "IDTM" },
  { id: "rf_ust_short",           label: "UST 1-3yr Short Duration",   role: "rf",   etfUS: "SHY",  etfUCITS: "IBTS" },
  { id: "rf_ig_corp",             label: "US IG Corporate Bonds",      role: "rf",   etfUS: "LQD",  etfUCITS: "LQDE" },
  { id: "rf_tips",                label: "US TIPS",                    role: "rf",   etfUS: "TIP",  etfUCITS: "ITPS" },
  { id: "rf_high_yield",          label: "US High Yield",              role: "rf",   etfUS: "HYG",  etfUCITS: "IHYG" },
  { id: "rf_em_sovereign",        label: "EM Sovereign USD",           role: "rf",   etfUS: "EMB",  etfUCITS: "EMHC" },
  { id: "rf_chile",               label: "RF Chile",                   role: "rf",   etfUS: null,   etfUCITS: null },
  // Alt
  { id: "alt_gold",               label: "Gold",                      role: "alt",  etfUS: "GLD",  etfUCITS: "SGLN" },
  { id: "alt_reits",              label: "US REITs",                   role: "alt",  etfUS: "VNQ",  etfUCITS: "IPRP" },
  // Cash
  { id: "cash_tbills",            label: "US T-Bills 0-3M",           role: "cash", etfUS: "SGOV", etfUCITS: "ERNS" },
];

// ── Lookup helpers ───────────────────────────────────────────────────────

const categoryMap = new Map(COMITE_CATEGORIES.map((c) => [c.id, c]));

export function getCategoryById(id: string): ComiteCategory | undefined {
  return categoryMap.get(id);
}

// ── ETF ticker → category mapping (primary + secondary) ─────────────────

const ETF_TO_CATEGORY: Record<string, string> = {};

// Primary ETFs (both US and UCITS)
for (const cat of COMITE_CATEGORIES) {
  if (cat.etfUS) ETF_TO_CATEGORY[cat.etfUS] = cat.id;
  if (cat.etfUCITS) ETF_TO_CATEGORY[cat.etfUCITS] = cat.id;
}

// Secondary / alternative ETFs
const SECONDARY_ETFS: Record<string, string> = {
  // rv_usa_large_cap
  SPY: "rv_usa_large_cap",
  IVV: "rv_usa_large_cap",
  QQQ: "rv_usa_large_cap",
  SPLG: "rv_usa_large_cap",
  SCHX: "rv_usa_large_cap",
  VTI: "rv_usa_large_cap",
  // rv_desarrollados_ex_us
  EFA: "rv_desarrollados_ex_us",
  IEFA: "rv_desarrollados_ex_us",
  SPDW: "rv_desarrollados_ex_us",
  // rv_emergentes
  IEMG: "rv_emergentes",
  SCHE: "rv_emergentes",
  // rf_ust_belly
  AGG: "rf_ust_belly",
  BND: "rf_ust_belly",
  GOVT: "rf_ust_belly",
  VGIT: "rf_ust_belly",
  // rf_ust_short
  VGSH: "rf_ust_short",
  SCHO: "rf_ust_short",
  BIL: "rf_ust_short",
  // rf_ig_corp
  VCIT: "rf_ig_corp",
  IGIB: "rf_ig_corp",
  // rf_tips
  SCHP: "rf_tips",
  VTIP: "rf_tips",
  // rf_high_yield
  JNK: "rf_high_yield",
  USHY: "rf_high_yield",
  // rf_em_sovereign
  VWOB: "rf_em_sovereign",
  PCY: "rf_em_sovereign",
  // alt_gold
  IAU: "alt_gold",
  GLDM: "alt_gold",
  // alt_reits
  SCHH: "alt_reits",
  IYR: "alt_reits",
  // cash_tbills
  SHV: "cash_tbills",
  GBIL: "cash_tbills",
};

Object.assign(ETF_TO_CATEGORY, SECONDARY_ETFS);

// ── Classify holding ─────────────────────────────────────────────────────

export function classifyHolding(h: HoldingForClassification): ClassifiedHolding {
  const base = { fundName: h.fundName, marketValue: h.marketValue };
  const sid = h.securityId?.trim().toUpperCase() ?? "";

  // Priority 1: Direct ETF / ticker match
  if (sid && ETF_TO_CATEGORY[sid]) {
    return { ...base, categoryId: ETF_TO_CATEGORY[sid], confidence: "high" };
  }

  // Priority 2: Chilean fund by familia_estudios
  const familia = h.familiaEstudios?.toLowerCase() ?? "";
  if (familia) {
    const result = classifyByFamilia(familia, h.currency);
    if (result) return { ...base, ...result };
  }

  // Priority 3: Instrument type + geography
  // Chilean ADR
  if (sid && /^[A-Z]{3,10}CL$/.test(sid)) {
    return { ...base, categoryId: "rv_usa_large_cap", confidence: "medium" };
  }

  // Bond (CUSIP pattern or coupon+maturity)
  if (
    (h.couponRate != null && h.maturityDate) ||
    (sid && /^[A-Z0-9]{9}$/.test(sid) && /\d/.test(sid) && /[A-Z]/.test(sid))
  ) {
    return { ...base, categoryId: "rf_ig_corp", confidence: "medium" };
  }

  // Cash by assetClass or name
  const assetLower = h.assetClass?.toLowerCase() ?? "";
  const nameLower = h.fundName.toLowerCase();
  if (assetLower === "cash" || /\bcash\b|\bcaja\b|\bliquidez\b/.test(nameLower)) {
    if (h.currency === "CLP") {
      return { ...base, categoryId: "rf_chile", confidence: "medium" };
    }
    return { ...base, categoryId: "cash_tbills", confidence: "medium" };
  }

  // Priority 4: assetClass fallback
  if (assetLower) {
    const mapped = ASSET_CLASS_FALLBACK[assetLower];
    if (mapped) {
      const catId = mapped === "cash_or_rf" ? (h.currency === "CLP" ? "rf_chile" : "cash_tbills") : mapped;
      return { ...base, categoryId: catId, confidence: "low" };
    }
  }

  // Priority 5: Ultimate fallback
  // Numeric securityId → Chilean fund
  if (sid && /^\d+$/.test(sid)) {
    if (h.currency === "CLP") {
      return { ...base, categoryId: "rf_chile", confidence: "low" };
    }
    return { ...base, categoryId: "rv_usa_large_cap", confidence: "low" };
  }

  return { ...base, categoryId: "rv_usa_large_cap", confidence: "low" };
}

const ASSET_CLASS_FALLBACK: Record<string, string> = {
  equity: "rv_usa_large_cap",
  fixedincome: "rf_ust_belly",
  alternatives: "alt_gold",
  cash: "cash_or_rf",
};

function classifyByFamilia(
  familia: string,
  currency?: string,
): { categoryId: string; confidence: Confidence } | null {
  const isAccionario = familia.includes("accionario");
  const isDeuda = familia.includes("deuda");
  const isBalanceado = familia.includes("balanceado");

  if (isAccionario) {
    if (/nacional|chile/.test(familia)) return { categoryId: "rv_chile", confidence: "medium" };
    if (/emergente/.test(familia)) return { categoryId: "rv_emergentes", confidence: "medium" };
    if (/europa|desarrollado/.test(familia)) return { categoryId: "rv_desarrollados_ex_us", confidence: "medium" };
    if (/usa|internacional|global/.test(familia)) return { categoryId: "rv_usa_large_cap", confidence: "medium" };
    // Generic accionario
    return { categoryId: "rv_usa_large_cap", confidence: "low" };
  }

  if (isDeuda) {
    // Nacional/Chile/local/UF or CLP currency
    if (/nacional|chile|local|uf/.test(familia) || currency === "CLP") {
      return { categoryId: "rf_chile", confidence: "medium" };
    }
    if (/high yield|alto rendimiento/.test(familia)) return { categoryId: "rf_high_yield", confidence: "medium" };
    if (/emergente/.test(familia)) return { categoryId: "rf_em_sovereign", confidence: "medium" };
    if (/corto|< ?365|money market/.test(familia)) return { categoryId: "rf_ust_short", confidence: "medium" };
    // Other deuda
    return { categoryId: "rf_ust_belly", confidence: "medium" };
  }

  if (isBalanceado) {
    return { categoryId: "rv_usa_large_cap", confidence: "low" };
  }

  return null;
}

// ── Profile mapping ──────────────────────────────────────────────────────

const VALID_MODEL_PROFILES = new Set([
  "conservador",
  "moderado_conservador",
  "moderado",
  "moderado_agresivo",
  "agresivo",
]);

const CLIENT_TO_MODEL: Record<string, string> = {
  defensivo: "conservador",
  conservador: "conservador",
  moderado: "moderado",
  agresivo: "moderado_agresivo",
  muy_agresivo: "agresivo",
};

export function mapClientProfile(clientProfile: string): string {
  // Client profile mapping takes priority (handles "agresivo" → "moderado_agresivo")
  if (CLIENT_TO_MODEL[clientProfile]) {
    return CLIENT_TO_MODEL[clientProfile];
  }
  // Passthrough if already a valid model profile
  if (VALID_MODEL_PROFILES.has(clientProfile)) {
    return clientProfile;
  }
  // Unknown → moderado as safe default
  return "moderado";
}

// ── Preferred fund category lookup ───────────────────────────────────────

export const PREFERRED_TO_COMITE: Record<string, string[]> = {
  rv_usa_large_cap:      ["RV Internacional", "RV USA", "RV Global"],
  rv_desarrollados_ex_us: ["RV Internacional", "RV Europa", "RV Desarrollados"],
  rv_emergentes:          ["RV Emergentes", "RV Asia", "RV Internacional"],
  rv_chile:               ["RV Nacional"],
  rf_ust_belly:           ["RF Internacional", "RF USA", "RF Global"],
  rf_ust_short:           ["RF Corto Plazo", "RF Internacional", "Money Market"],
  rf_ig_corp:             ["RF Internacional", "RF Corporativa", "RF USA"],
  rf_tips:                ["RF Internacional", "RF Inflation-Linked"],
  rf_high_yield:          ["RF High Yield", "RF Internacional"],
  rf_em_sovereign:        ["RF Emergentes", "RF Internacional"],
  rf_chile:               ["RF Nacional", "RF Corto Plazo", "RF UF"],
  alt_gold:               ["Alternativos", "Commodities"],
  alt_reits:              ["Alternativos", "Real Estate", "REITs"],
  cash_tbills:            ["Money Market", "Liquidez"],
};
