// lib/funds/international_fund_catalog.ts
// Catálogo de fondos internacionales disponibles en Pershing y Allfunds (Stonex)
// Estos son fondos que los clientes típicamente mantienen en cuentas internacionales.
// Fuentes: Morningstar, sitios oficiales de gestoras. Datos de referencia, dic 2024.

export type Platform = "Pershing" | "Allfunds" | "Both";
export type AssetClass = "Equity" | "Fixed Income" | "Multi-Asset" | "Alternative" | "Money Market";
export type Region = "Global" | "USA" | "Europe" | "Asia" | "Emerging Markets" | "LatAm" | "Chile";

export interface InternationalFund {
  isin: string;
  ticker?: string;
  name: string;
  manager: string;
  assetClass: AssetClass;
  region: Region;
  currency: string;
  platform: Platform;
  expenseRatio: number; // en porcentaje (%)
  morningstarRating?: number; // 1-5 estrellas
  minInvestment?: number; // USD
  category: string;
}

// ============================================================
// EQUITY FUNDS
// ============================================================

const EQUITY_FUNDS: InternationalFund[] = [
  // --- Global Equity ---
  {
    isin: "LU0203975437",
    name: "Robeco Global Consumer Trends",
    manager: "Robeco",
    assetClass: "Equity",
    region: "Global",
    currency: "USD",
    platform: "Both",
    expenseRatio: 1.71,
    morningstarRating: 4,
    category: "Global Equity - Consumer",
  },
  {
    isin: "LU0119620416",
    name: "Morgan Stanley Global Brands Fund",
    manager: "Morgan Stanley IM",
    assetClass: "Equity",
    region: "Global",
    currency: "USD",
    platform: "Both",
    expenseRatio: 1.64,
    morningstarRating: 4,
    category: "Global Equity - Quality",
  },
  {
    isin: "LU0690374615",
    name: "Fundsmith Equity Fund",
    manager: "Fundsmith",
    assetClass: "Equity",
    region: "Global",
    currency: "USD",
    platform: "Both",
    expenseRatio: 1.05,
    morningstarRating: 5,
    category: "Global Equity - Quality",
  },
  {
    isin: "LU1623762843",
    name: "Capital Group New Perspective Fund",
    manager: "Capital Group",
    assetClass: "Equity",
    region: "Global",
    currency: "USD",
    platform: "Both",
    expenseRatio: 1.58,
    morningstarRating: 4,
    category: "Global Equity - Growth",
  },
  {
    isin: "LU0218910536",
    name: "T. Rowe Price Global Focused Growth Equity",
    manager: "T. Rowe Price",
    assetClass: "Equity",
    region: "Global",
    currency: "USD",
    platform: "Both",
    expenseRatio: 1.72,
    morningstarRating: 4,
    category: "Global Equity - Growth",
  },

  // --- USA Equity ---
  {
    isin: "LU0073232471",
    name: "JPMorgan US Growth Fund",
    manager: "J.P. Morgan AM",
    assetClass: "Equity",
    region: "USA",
    currency: "USD",
    platform: "Both",
    expenseRatio: 1.70,
    morningstarRating: 4,
    category: "US Equity - Large Cap Growth",
  },
  {
    isin: "LU0106261372",
    name: "Franklin U.S. Opportunities Fund",
    manager: "Franklin Templeton",
    assetClass: "Equity",
    region: "USA",
    currency: "USD",
    platform: "Both",
    expenseRatio: 1.82,
    morningstarRating: 3,
    category: "US Equity - Large Cap Growth",
  },
  {
    isin: "IE00B19Z9505",
    name: "Vanguard U.S. 500 Stock Index Fund",
    manager: "Vanguard",
    assetClass: "Equity",
    region: "USA",
    currency: "USD",
    platform: "Pershing",
    expenseRatio: 0.10,
    morningstarRating: 5,
    category: "US Equity - Large Cap Blend",
  },
  {
    isin: "LU0053666078",
    name: "MFS Meridian U.S. Value Fund",
    manager: "MFS",
    assetClass: "Equity",
    region: "USA",
    currency: "USD",
    platform: "Both",
    expenseRatio: 1.93,
    morningstarRating: 4,
    category: "US Equity - Large Cap Value",
  },

  // --- Europe Equity ---
  {
    isin: "LU0119750205",
    name: "Comgest Growth Europe",
    manager: "Comgest",
    assetClass: "Equity",
    region: "Europe",
    currency: "EUR",
    platform: "Both",
    expenseRatio: 1.52,
    morningstarRating: 5,
    category: "Europe Equity - Large Cap Growth",
  },
  {
    isin: "LU0256839274",
    name: "MFS Meridian European Value Fund",
    manager: "MFS",
    assetClass: "Equity",
    region: "Europe",
    currency: "EUR",
    platform: "Both",
    expenseRatio: 1.93,
    morningstarRating: 4,
    category: "Europe Equity - Large Cap Value",
  },

  // --- Emerging Markets Equity ---
  {
    isin: "LU0602539867",
    name: "JPMorgan Emerging Markets Equity Fund",
    manager: "J.P. Morgan AM",
    assetClass: "Equity",
    region: "Emerging Markets",
    currency: "USD",
    platform: "Both",
    expenseRatio: 1.80,
    morningstarRating: 4,
    category: "Emerging Markets Equity",
  },
  {
    isin: "LU0345361124",
    name: "Fidelity Emerging Markets Fund",
    manager: "Fidelity International",
    assetClass: "Equity",
    region: "Emerging Markets",
    currency: "USD",
    platform: "Both",
    expenseRatio: 1.93,
    morningstarRating: 3,
    category: "Emerging Markets Equity",
  },
  {
    isin: "LU0040507039",
    name: "Templeton Emerging Markets Fund",
    manager: "Franklin Templeton",
    assetClass: "Equity",
    region: "Emerging Markets",
    currency: "USD",
    platform: "Both",
    expenseRatio: 2.08,
    morningstarRating: 3,
    category: "Emerging Markets Equity",
  },

  // --- Asia Equity ---
  {
    isin: "LU0169518387",
    name: "JPMorgan Asia Growth Fund",
    manager: "J.P. Morgan AM",
    assetClass: "Equity",
    region: "Asia",
    currency: "USD",
    platform: "Both",
    expenseRatio: 1.80,
    morningstarRating: 4,
    category: "Asia Equity",
  },

  // --- LatAm Equity ---
  {
    isin: "LU0399010613",
    name: "BlackRock Latin American Fund",
    manager: "BlackRock",
    assetClass: "Equity",
    region: "LatAm",
    currency: "USD",
    platform: "Both",
    expenseRatio: 2.06,
    morningstarRating: 3,
    category: "Latin America Equity",
  },
];

// ============================================================
// FIXED INCOME FUNDS
// ============================================================

const FIXED_INCOME_FUNDS: InternationalFund[] = [
  // --- Global IG Bonds ---
  {
    isin: "LU0133806256",
    name: "PIMCO GIS Income Fund",
    manager: "PIMCO",
    assetClass: "Fixed Income",
    region: "Global",
    currency: "USD",
    platform: "Both",
    expenseRatio: 1.54,
    morningstarRating: 4,
    category: "Global Flexible Bond",
  },
  {
    isin: "LU0517222523",
    name: "JPMorgan Global Bond Opportunities",
    manager: "J.P. Morgan AM",
    assetClass: "Fixed Income",
    region: "Global",
    currency: "USD",
    platform: "Both",
    expenseRatio: 1.40,
    morningstarRating: 3,
    category: "Global Flexible Bond",
  },
  {
    isin: "LU1670720629",
    name: "Capital Group Global Bond Fund",
    manager: "Capital Group",
    assetClass: "Fixed Income",
    region: "Global",
    currency: "USD",
    platform: "Both",
    expenseRatio: 1.15,
    morningstarRating: 4,
    category: "Global Bond - Aggregate",
  },

  // --- US Bonds ---
  {
    isin: "IE0032080503",
    name: "Vanguard U.S. Government Bond Index",
    manager: "Vanguard",
    assetClass: "Fixed Income",
    region: "USA",
    currency: "USD",
    platform: "Pershing",
    expenseRatio: 0.12,
    morningstarRating: 4,
    category: "US Government Bond",
  },

  // --- High Yield ---
  {
    isin: "LU0592907462",
    name: "Robeco High Yield Bonds",
    manager: "Robeco",
    assetClass: "Fixed Income",
    region: "Global",
    currency: "USD",
    platform: "Both",
    expenseRatio: 1.39,
    morningstarRating: 4,
    category: "Global High Yield Bond",
  },
  {
    isin: "LU0138643068",
    name: "T. Rowe Price Global High Income Bond",
    manager: "T. Rowe Price",
    assetClass: "Fixed Income",
    region: "Global",
    currency: "USD",
    platform: "Both",
    expenseRatio: 1.52,
    morningstarRating: 3,
    category: "Global High Yield Bond",
  },

  // --- EM Debt ---
  {
    isin: "LU0280437160",
    name: "Ashmore Emerging Markets Debt Fund",
    manager: "Ashmore",
    assetClass: "Fixed Income",
    region: "Emerging Markets",
    currency: "USD",
    platform: "Both",
    expenseRatio: 1.50,
    morningstarRating: 3,
    category: "Emerging Markets Bond",
  },
  {
    isin: "LU0455009141",
    name: "PIMCO GIS Emerging Markets Bond Fund",
    manager: "PIMCO",
    assetClass: "Fixed Income",
    region: "Emerging Markets",
    currency: "USD",
    platform: "Both",
    expenseRatio: 1.65,
    morningstarRating: 4,
    category: "Emerging Markets Bond",
  },

  // --- Inflation-Linked ---
  {
    isin: "IE00B1FZS798",
    name: "iShares Global Inflation-Linked Bond UCITS ETF",
    ticker: "IGIL",
    manager: "BlackRock",
    assetClass: "Fixed Income",
    region: "Global",
    currency: "USD",
    platform: "Pershing",
    expenseRatio: 0.20,
    morningstarRating: 3,
    category: "Global Inflation-Linked Bond",
  },
];

// ============================================================
// MULTI-ASSET & BALANCED FUNDS
// ============================================================

const MULTI_ASSET_FUNDS: InternationalFund[] = [
  {
    isin: "LU0218912319",
    name: "JPMorgan Global Income Fund",
    manager: "J.P. Morgan AM",
    assetClass: "Multi-Asset",
    region: "Global",
    currency: "USD",
    platform: "Both",
    expenseRatio: 1.60,
    morningstarRating: 4,
    category: "Global Multi-Asset - Income",
  },
  {
    isin: "LU0195139547",
    name: "BlackRock Global Allocation Fund",
    manager: "BlackRock",
    assetClass: "Multi-Asset",
    region: "Global",
    currency: "USD",
    platform: "Both",
    expenseRatio: 1.78,
    morningstarRating: 3,
    category: "Global Multi-Asset - Balanced",
  },
  {
    isin: "LU0056886558",
    name: "Capital Group Global Allocation Fund",
    manager: "Capital Group",
    assetClass: "Multi-Asset",
    region: "Global",
    currency: "USD",
    platform: "Both",
    expenseRatio: 1.58,
    morningstarRating: 4,
    category: "Global Multi-Asset - Balanced",
  },
];

// ============================================================
// ALTERNATIVE FUNDS
// ============================================================

const ALTERNATIVE_FUNDS: InternationalFund[] = [
  // --- Real Estate ---
  {
    isin: "LU0705260189",
    name: "Janus Henderson Global Property Equities",
    manager: "Janus Henderson",
    assetClass: "Alternative",
    region: "Global",
    currency: "USD",
    platform: "Both",
    expenseRatio: 1.84,
    morningstarRating: 3,
    category: "Global Real Estate",
  },
  // --- Infrastructure ---
  {
    isin: "LU1434519846",
    name: "DWS Invest Global Infrastructure",
    manager: "DWS",
    assetClass: "Alternative",
    region: "Global",
    currency: "USD",
    platform: "Allfunds",
    expenseRatio: 1.59,
    morningstarRating: 4,
    category: "Global Infrastructure",
  },
  // --- Multi-Strategy Alternatives ---
  {
    isin: "LU0599946893",
    name: "Man AHL Trend Alternative",
    manager: "Man Group",
    assetClass: "Alternative",
    region: "Global",
    currency: "USD",
    platform: "Both",
    expenseRatio: 2.28,
    morningstarRating: 4,
    category: "Systematic Trend / CTA",
  },
  {
    isin: "LU0490817821",
    name: "BlackRock Strategic Funds - Global Event Driven",
    manager: "BlackRock",
    assetClass: "Alternative",
    region: "Global",
    currency: "USD",
    platform: "Both",
    expenseRatio: 1.76,
    morningstarRating: 3,
    category: "Event Driven / Multi-Strategy",
  },
];

// ============================================================
// MONEY MARKET / CASH
// ============================================================

const MONEY_MARKET_FUNDS: InternationalFund[] = [
  {
    isin: "LU0568621618",
    name: "JPMorgan USD Liquidity Fund",
    manager: "J.P. Morgan AM",
    assetClass: "Money Market",
    region: "USA",
    currency: "USD",
    platform: "Both",
    expenseRatio: 0.20,
    morningstarRating: 5,
    category: "USD Money Market",
  },
  {
    isin: "LU0099730524",
    name: "Goldman Sachs USD Treasury Liquid Reserves",
    manager: "Goldman Sachs AM",
    assetClass: "Money Market",
    region: "USA",
    currency: "USD",
    platform: "Pershing",
    expenseRatio: 0.18,
    morningstarRating: 5,
    category: "USD Money Market",
  },
];

// ============================================================
// CATÁLOGO COMPLETO & HELPERS
// ============================================================

export const INTERNATIONAL_FUND_CATALOG: InternationalFund[] = [
  ...EQUITY_FUNDS,
  ...FIXED_INCOME_FUNDS,
  ...MULTI_ASSET_FUNDS,
  ...ALTERNATIVE_FUNDS,
  ...MONEY_MARKET_FUNDS,
];

/** Buscar fondo por ISIN */
export function getFundByISIN(isin: string): InternationalFund | undefined {
  return INTERNATIONAL_FUND_CATALOG.find((f) => f.isin === isin);
}

/** Filtrar fondos por clase de activo */
export function getFundsByAssetClass(assetClass: AssetClass): InternationalFund[] {
  return INTERNATIONAL_FUND_CATALOG.filter((f) => f.assetClass === assetClass);
}

/** Filtrar fondos por plataforma */
export function getFundsByPlatform(platform: "Pershing" | "Allfunds"): InternationalFund[] {
  return INTERNATIONAL_FUND_CATALOG.filter(
    (f) => f.platform === platform || f.platform === "Both"
  );
}

/** Filtrar fondos por región */
export function getFundsByRegion(region: Region): InternationalFund[] {
  return INTERNATIONAL_FUND_CATALOG.filter((f) => f.region === region);
}

/** Todos los ISINs disponibles */
export const AVAILABLE_ISINS = INTERNATIONAL_FUND_CATALOG.map((f) => f.isin);
