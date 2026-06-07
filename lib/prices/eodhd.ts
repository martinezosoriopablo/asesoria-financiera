// lib/prices/eodhd.ts

import type { DailyPrice } from "./types";

/**
 * EODHD API client for international UCITS fund prices.
 * Free tier: 20 calls/day. Funds use .EUFUND exchange suffix.
 * Docs: https://eodhd.com/financial-apis/
 */

function getApiKey(): string {
  return process.env.EODHD_API_KEY || "";
}

/**
 * Fetch historical daily close prices from EODHD.
 * Ticker format: ISIN.EUFUND (e.g. LU0813337184.EUFUND)
 */
export async function fetchEodhdHistorical(
  ticker: string,
  fromDate: string,
  toDate: string
): Promise<DailyPrice[]> {
  const apiKey = getApiKey();
  if (!apiKey) return [];

  try {
    const url = `https://eodhd.com/api/eod/${encodeURIComponent(ticker)}?api_token=${apiKey}&fmt=json&period=d&from=${fromDate}&to=${toDate}`;
    const response = await fetch(url, {
      signal: AbortSignal.timeout(15000),
    });

    if (!response.ok) return [];
    const data = await response.json();
    if (!Array.isArray(data) || data.length === 0) return [];

    return data
      .filter((d: { date: string; close: number }) => d.close != null)
      .map((d: { date: string; close: number }) => ({
        date: d.date,
        price: d.close,
      }))
      .sort((a: DailyPrice, b: DailyPrice) => a.date.localeCompare(b.date));
  } catch {
    return [];
  }
}

/**
 * Fetch latest quote from EODHD (last 7 days of EOD data).
 */
export async function fetchEodhdQuote(
  ticker: string
): Promise<{ price: number; date: string } | null> {
  const apiKey = getApiKey();
  if (!apiKey) return null;

  try {
    const to = new Date().toISOString().split("T")[0];
    const from = new Date(Date.now() - 7 * 86400000).toISOString().split("T")[0];

    const url = `https://eodhd.com/api/eod/${encodeURIComponent(ticker)}?api_token=${apiKey}&fmt=json&period=d&from=${from}&to=${to}`;
    const response = await fetch(url, {
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) return null;
    const data = await response.json();
    if (!Array.isArray(data) || data.length === 0) return null;

    const last = data[data.length - 1];
    if (last.close == null) return null;
    return { price: last.close, date: last.date };
  } catch {
    return null;
  }
}
