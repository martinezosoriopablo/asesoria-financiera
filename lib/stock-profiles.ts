// lib/stock-profiles.ts
import { AV_BASE } from "@/lib/prices/alphavantage";
import type { StockProfile } from "@/lib/sector-mapping";

const COUNTRY_NORMALIZE: Record<string, string> = {
  USA: "US",
  "United States": "US",
  "United Kingdom": "GB",
  Brazil: "BR",
  China: "CN",
  India: "IN",
  Mexico: "MX",
  "South Korea": "KR",
  Taiwan: "TW",
  Japan: "JP",
  Canada: "CA",
  Australia: "AU",
  Switzerland: "CH",
  Germany: "DE",
  France: "FR",
  Netherlands: "NL",
  Chile: "CL",
  Colombia: "CO",
  Peru: "PE",
};

/**
 * Parse raw AV OVERVIEW JSON into a StockProfile.
 * Returns null if the response is invalid or an error.
 */
export function parseAVOverview(
  raw: Record<string, unknown>
): StockProfile | null {
  if (!raw || raw.Note || raw.Information || raw["Error Message"]) return null;

  const symbol = raw.Symbol as string;
  const name = raw.Name as string;
  const sector = raw.Sector as string;
  if (!symbol || !sector || sector === "LIFE SCIENCES") return null;

  const rawCountry = (raw.Country as string) || "";
  const country = COUNTRY_NORMALIZE[rawCountry] || rawCountry.slice(0, 2).toUpperCase();

  return {
    ticker: symbol,
    name: name || symbol,
    sector,
    industry: (raw.Industry as string) || "",
    marketCap: parseInt((raw.MarketCapitalization as string) || "0", 10) || 0,
    country,
    exchange: (raw.Exchange as string) || "",
  };
}

/**
 * Fetch a single stock's overview from AlphaVantage.
 * Returns parsed StockProfile or null on error.
 */
export async function fetchStockOverview(
  ticker: string
): Promise<StockProfile | null> {
  const apiKey = process.env.ALPHA_VANTAGE_API_KEY || "";
  if (!apiKey) return null;

  try {
    const url = `${AV_BASE}?function=OVERVIEW&symbol=${encodeURIComponent(ticker)}&apikey=${apiKey}`;
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0" },
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return parseAVOverview(data);
  } catch {
    return null;
  }
}

/**
 * Fetch multiple stock overviews in parallel.
 * Respects AV premium rate (75/min) — no throttling needed.
 */
export async function fetchStockOverviews(
  tickers: string[]
): Promise<Map<string, StockProfile>> {
  const results = new Map<string, StockProfile>();
  await Promise.allSettled(
    tickers.map(async (t) => {
      const profile = await fetchStockOverview(t);
      if (profile) results.set(t, profile);
    })
  );
  return results;
}
