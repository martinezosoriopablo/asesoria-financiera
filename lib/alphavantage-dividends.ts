// lib/alphavantage-dividends.ts

const AV_BASE = "https://www.alphavantage.co/query";

export interface DividendEvent {
  ex_dividend_date: string;  // YYYY-MM-DD
  payment_date?: string;
  amount: number;
}

export interface DividendPeriodResult {
  events: DividendEvent[];
  totalAmount: number;
  /** Calculate yield as percent given the market value at period start */
  yieldPercent: (marketValueStart: number) => number;
}

/**
 * Filter dividend events that fall within (startDate, endDate].
 * Start is exclusive (belongs to previous period), end is inclusive.
 * Multiply per-share amount by quantity.
 */
export function calcDividendsInPeriod(
  events: DividendEvent[],
  startDate: string,
  endDate: string,
  quantity: number,
): DividendPeriodResult {
  const filtered = events.filter(
    (e) => e.ex_dividend_date > startDate && e.ex_dividend_date <= endDate
  );
  const totalPerShare = filtered.reduce((s, e) => s + e.amount, 0);
  const totalAmount = totalPerShare * quantity;

  return {
    events: filtered,
    totalAmount,
    yieldPercent: (marketValueStart: number) =>
      marketValueStart > 0 ? (totalAmount / marketValueStart) * 100 : 0,
  };
}

/**
 * Fetch full dividend history from Alpha Vantage DIVIDENDS endpoint.
 * Returns raw events sorted by ex_dividend_date descending.
 */
export async function fetchDividendHistory(
  ticker: string,
  apiKey: string,
): Promise<DividendEvent[]> {
  const url = `${AV_BASE}?function=DIVIDENDS&symbol=${encodeURIComponent(ticker)}&apikey=${apiKey}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(30000) });
  if (!res.ok) throw new Error(`Alpha Vantage error: ${res.status}`);

  const json = await res.json();
  const data = json.data as Array<Record<string, string>> | undefined;
  if (!data || !Array.isArray(data)) return [];

  return data
    .map((d) => ({
      ex_dividend_date: d.ex_dividend_date,
      payment_date: d.payment_date || undefined,
      amount: parseFloat(d.amount) || 0,
    }))
    .filter((d) => d.ex_dividend_date && d.amount > 0)
    .sort((a, b) => b.ex_dividend_date.localeCompare(a.ex_dividend_date));
}
