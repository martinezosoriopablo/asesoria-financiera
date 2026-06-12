// lib/prices/yahoo.ts

import type { DailyPrice } from "./types";

/**
 * Fetch historical daily close prices from Yahoo Finance.
 * Used as fallback when AlphaVantage fails for international instruments.
 * Also primary source for Chilean .SN suffix instruments.
 */
export async function fetchYahooHistorical(
  ticker: string,
  fromDate: string,
  toDate: string
): Promise<DailyPrice[]> {
  try {
    const from = Math.floor(new Date(fromDate).getTime() / 1000);
    const to = Math.floor(new Date(toDate).getTime() / 1000) + 86400;
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?period1=${from}&period2=${to}&interval=1d`;

    const response = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      },
      signal: AbortSignal.timeout(15000),
    });

    if (!response.ok) return [];
    const data = await response.json();
    if (data.chart?.error || !data.chart?.result?.length) return [];

    const result = data.chart.result[0];
    const timestamps: number[] = result.timestamp || [];
    const closes: (number | null)[] = result.indicators?.quote?.[0]?.close || [];

    const prices: DailyPrice[] = [];
    for (let i = 0; i < timestamps.length; i++) {
      if (closes[i] != null && isFinite(closes[i]!) && closes[i]! > 0) {
        const date = new Date(timestamps[i] * 1000)
          .toISOString()
          .split("T")[0];
        prices.push({ date, price: closes[i]! });
      }
    }
    return prices.sort((a, b) => a.date.localeCompare(b.date));
  } catch (err) {
    console.warn(`[yahoo] historical fetch error for ${ticker}:`, err instanceof Error ? err.message : err);
    return [];
  }
}

/**
 * Fetch current quote from Yahoo Finance.
 * Returns the most recent close price.
 */
export async function fetchYahooQuote(
  ticker: string
): Promise<{ price: number; date: string } | null> {
  try {
    const now = Math.floor(Date.now() / 1000);
    const weekAgo = now - 7 * 86400;
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?period1=${weekAgo}&period2=${now}&interval=1d`;

    const response = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      },
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) return null;
    const data = await response.json();
    if (data.chart?.error || !data.chart?.result?.length) return null;

    const result = data.chart.result[0];
    const timestamps: number[] = result.timestamp || [];
    const closes: (number | null)[] = result.indicators?.quote?.[0]?.close || [];

    for (let i = timestamps.length - 1; i >= 0; i--) {
      if (closes[i] != null && isFinite(closes[i]!) && closes[i]! > 0) {
        const date = new Date(timestamps[i] * 1000).toISOString().split("T")[0];
        return { price: closes[i]!, date };
      }
    }
    return null;
  } catch (err) {
    console.warn(`[yahoo] quote error for ${ticker}:`, err instanceof Error ? err.message : err);
    return null;
  }
}
