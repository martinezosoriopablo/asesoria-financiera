// lib/openfigi/client.ts
// Cliente para la API de OpenFIGI - búsqueda de bonos

const OPENFIGI_BASE_URL = "https://api.openfigi.com/v3";

export interface OpenFIGIResult {
  figi: string;
  name: string;
  ticker?: string;
  securityType?: string;
  securityType2?: string;
  marketSector?: string;
  exchCode?: string;
  compositeFIGI?: string;
  shareClassFIGI?: string;
  securityDescription?: string;
}

export interface BondSearchResult {
  figi: string;
  cusip?: string;
  isin?: string;
  name: string;
  ticker?: string;
  issuer?: string;
  securityType: string;
  marketSector: string;
  maturityDate?: string;
  couponRate?: number;
}

interface MappingRequest {
  idType: string;
  idValue: string;
  securityType2?: string;
  marketSecDes?: string;
}

interface MappingResponse {
  data?: OpenFIGIResult[];
  warning?: string;
  error?: string;
}

interface SearchRequest {
  query: string;
  securityType2?: string;
  marketSecDes?: string;
}

interface SearchResponse {
  data?: OpenFIGIResult[];
  error?: string;
}

/**
 * Map identifiers (CUSIP, ISIN) to bond information
 */
export async function mapIdentifiers(
  requests: MappingRequest[]
): Promise<MappingResponse[]> {
  try {
    const response = await fetch(`${OPENFIGI_BASE_URL}/mapping`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        // API key is optional but increases rate limits
        // "X-OPENFIGI-APIKEY": process.env.OPENFIGI_API_KEY || "",
      },
      body: JSON.stringify(requests),
    });

    if (!response.ok) {
      console.error("OpenFIGI mapping error:", response.status);
      return requests.map(() => ({ error: `HTTP ${response.status}` }));
    }

    return await response.json();
  } catch (error) {
    console.error("OpenFIGI mapping error:", error);
    return requests.map(() => ({ error: "Network error" }));
  }
}

/**
 * Search for bonds by keyword (issuer name, etc.)
 */
export async function searchBonds(query: string): Promise<BondSearchResult[]> {
  try {
    const searchRequest: SearchRequest = {
      query,
      securityType2: "Corp", // Corporate bonds
    };

    const response = await fetch(`${OPENFIGI_BASE_URL}/search`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(searchRequest),
    });

    if (!response.ok) {
      console.error("OpenFIGI search error:", response.status);
      return [];
    }

    const data: SearchResponse = await response.json();

    if (!data.data || data.data.length === 0) {
      return [];
    }

    // Filter to only bonds and convert to our format
    return data.data
      .filter((item) =>
        item.marketSector === "Corp" ||
        item.marketSector === "Govt" ||
        item.securityType === "Bond" ||
        item.securityType2 === "Bond"
      )
      .slice(0, 20)
      .map((item) => ({
        figi: item.figi,
        name: item.name,
        ticker: item.ticker,
        securityType: item.securityType || "Bond",
        marketSector: item.marketSector || "Corp",
      }));
  } catch (error) {
    console.error("OpenFIGI search error:", error);
    return [];
  }
}

/**
 * Look up a bond by CUSIP
 */
export async function lookupByCUSIP(cusip: string): Promise<BondSearchResult | null> {
  const results = await mapIdentifiers([
    { idType: "ID_CUSIP", idValue: cusip.toUpperCase() }
  ]);

  if (!results[0]?.data || results[0].data.length === 0) {
    return null;
  }

  const bond = results[0].data[0];
  return {
    figi: bond.figi,
    cusip: cusip.toUpperCase(),
    name: bond.name,
    ticker: bond.ticker,
    securityType: bond.securityType || "Bond",
    marketSector: bond.marketSector || "Corp",
  };
}

/**
 * Look up a bond by ISIN
 */
export async function lookupByISIN(isin: string): Promise<BondSearchResult | null> {
  const results = await mapIdentifiers([
    { idType: "ID_ISIN", idValue: isin.toUpperCase() }
  ]);

  if (!results[0]?.data || results[0].data.length === 0) {
    return null;
  }

  const bond = results[0].data[0];
  return {
    figi: bond.figi,
    isin: isin.toUpperCase(),
    name: bond.name,
    ticker: bond.ticker,
    securityType: bond.securityType || "Bond",
    marketSector: bond.marketSector || "Corp",
  };
}

/**
 * Smart search - detects if input is CUSIP, ISIN, or keyword
 */
export async function smartBondSearch(query: string): Promise<BondSearchResult[]> {
  const trimmed = query.trim().toUpperCase();

  // CUSIP format: 9 characters (alphanumeric)
  if (/^[A-Z0-9]{9}$/.test(trimmed)) {
    const result = await lookupByCUSIP(trimmed);
    return result ? [result] : [];
  }

  // ISIN format: 2 letters + 10 characters
  if (/^[A-Z]{2}[A-Z0-9]{10}$/.test(trimmed)) {
    const result = await lookupByISIN(trimmed);
    return result ? [result] : [];
  }

  // Otherwise, search by keyword
  return searchBonds(query);
}
