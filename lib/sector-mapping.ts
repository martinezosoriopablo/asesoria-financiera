// lib/sector-mapping.ts

export interface StockProfile {
  ticker: string;
  name: string;
  sector: string;
  industry: string;
  marketCap: number;
  country: string;
  exchange: string;
}

// AV OVERVIEW sector → comite sleeve ID
const SECTOR_TO_SLEEVE: Record<string, string> = {
  "Technology": "us_tech",
  "Healthcare": "us_healthcare",
  "Financial Services": "us_financials",
  "Consumer Cyclical": "us_consumer_discretionary",
  "Consumer Defensive": "us_consumer_staples",
  "Energy": "us_energy",
  "Industrials": "us_industrials",
  "Communication Services": "us_communication",
  "Utilities": "us_utilities",
  "Real Estate": "us_reits",
  "Basic Materials": "us_materials",
};

// Emerging market countries (ISO 2-letter codes)
const EMERGING_COUNTRIES = new Set([
  "BR", "CN", "IN", "MX", "KR", "TW", "ZA", "ID", "TH", "MY",
  "PH", "CL", "CO", "PE", "CZ", "PL", "HU", "TR", "SA", "AE",
  "QA", "KW", "EG", "VN",
]);

// Developed non-US countries
const DEVELOPED_EX_US = new Set([
  "GB", "DE", "FR", "JP", "CA", "AU", "CH", "NL", "SE", "DK",
  "NO", "FI", "IE", "IT", "ES", "PT", "AT", "BE", "SG", "HK",
  "NZ", "IL", "LU",
]);

/**
 * Map an AV sector string to a comite sleeve ID.
 * Returns null if sector is unknown.
 */
export function mapSectorToSleeve(sector: string): string | null {
  return SECTOR_TO_SLEEVE[sector] ?? null;
}

/**
 * Map a stock profile to the appropriate comite category.
 * Priority: country-based geography first, then sector for US stocks.
 */
export function mapSectorToCategory(profile: StockProfile): string {
  // Real Estate → alt_reits regardless of country
  if (profile.sector === "Real Estate") {
    return "alt_reits";
  }

  // Non-US stocks: classify by geography
  if (profile.country && profile.country !== "US") {
    if (EMERGING_COUNTRIES.has(profile.country)) {
      return "rv_emergentes";
    }
    if (DEVELOPED_EX_US.has(profile.country)) {
      return "rv_desarrollados_ex_us";
    }
  }

  // US stocks (or unknown country): all go to rv_usa_large_cap
  return "rv_usa_large_cap";
}
