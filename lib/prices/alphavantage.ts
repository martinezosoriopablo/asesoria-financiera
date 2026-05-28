// lib/prices/alphavantage.ts

import type { DailyPrice } from "./types";

export const AV_BASE = "https://www.alphavantage.co/query";

function getApiKey(): string {
  return process.env.ALPHA_VANTAGE_API_KEY || "";
}

/**
 * Fetch full daily price history from AlphaVantage TIME_SERIES_DAILY.
 * Returns sorted ascending by date. One API call returns up to 20 years.
 * Rate limit: 75 calls/min on paid plan.
 */
export async function fetchDailyPrices(symbol: string): Promise<DailyPrice[]> {
  const apiKey = getApiKey();
  if (!apiKey) return [];

  try {
    const url = `${AV_BASE}?function=TIME_SERIES_DAILY&symbol=${encodeURIComponent(symbol)}&outputsize=full&apikey=${apiKey}`;
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0" },
      signal: AbortSignal.timeout(30000),
    });

    if (!res.ok) return [];
    const data = await res.json();

    // Rate limit or error
    if (data.Note || data.Information || data["Error Message"]) return [];

    const timeSeries = data["Time Series (Daily)"];
    if (!timeSeries) return [];

    const prices: DailyPrice[] = [];
    for (const [date, values] of Object.entries(timeSeries)) {
      const close = parseFloat((values as Record<string, string>)["4. close"]);
      if (!isNaN(close)) {
        prices.push({ date, price: close });
      }
    }
    return prices.sort((a, b) => a.date.localeCompare(b.date));
  } catch {
    return [];
  }
}

/**
 * Fetch real-time quote from AlphaVantage GLOBAL_QUOTE.
 * Returns latest price + date, or null if unavailable.
 */
export async function fetchQuote(
  symbol: string
): Promise<{ price: number; date: string } | null> {
  const apiKey = getApiKey();
  if (!apiKey) return null;

  try {
    const url = `${AV_BASE}?function=GLOBAL_QUOTE&symbol=${encodeURIComponent(symbol)}&apikey=${apiKey}`;
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0" },
      signal: AbortSignal.timeout(15000),
    });

    if (!res.ok) return null;
    const data = await res.json();

    if (data.Note || data.Information) return null;

    const quote = data["Global Quote"];
    if (!quote) return null;

    const price = parseFloat(quote["05. price"]);
    const date = quote["07. latest trading day"];
    if (isNaN(price) || !date) return null;

    return { price, date };
  } catch {
    return null;
  }
}

/**
 * Fetch daily prices filtered to a date range.
 * Wraps fetchDailyPrices with from/to filtering.
 */
export async function fetchDailyPricesRange(
  symbol: string,
  fromDate: string,
  toDate: string
): Promise<DailyPrice[]> {
  const all = await fetchDailyPrices(symbol);
  return all.filter((p) => p.date >= fromDate && p.date <= toDate);
}
