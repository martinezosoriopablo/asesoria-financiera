// lib/prices/price-service.ts

import { createClient } from "@supabase/supabase-js";
import { inferInstrumentType } from "@/lib/instrument-type";
import { fetchDailyPricesRange, fetchQuote } from "./alphavantage";
import { fetchYahooHistorical, fetchYahooQuote } from "./yahoo";
import { fetchEodhdHistorical, fetchEodhdQuote } from "./eodhd";
import { getHistoricalPrices as getBolsaHistorical, getResumenAccion } from "@/lib/bolsa-santiago/client";
import type { DailyPrice, HoldingForPricing, PriceSource } from "./types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SourceResolution {
  source: PriceSource;
  symbol: string;
  currency: string;
}

// ---------------------------------------------------------------------------
// FX tickers routed to BCCH
// ---------------------------------------------------------------------------

const FX_TICKERS = new Set(["UF", "USD", "EUR"]);

// ---------------------------------------------------------------------------
// CUSIP → ticker mapping for international UCITS funds (Raymond James)
// Each entry has primary + fallback source to handle EODHD rate limits (20/day)
// ---------------------------------------------------------------------------

interface IntlFundMapping {
  eodhd?: string;   // ISIN.EUFUND format
  yahoo?: string;   // Morningstar-style 0P000... format
  currency: string;
}

const INTL_FUND_MAP: Record<string, IntlFundMapping> = {
  // DWS Invest Latin American Equities A2 USD (cartola CUSIP: L2R330245)
  L2R330245: { eodhd: "LU0813337184.EUFUND", yahoo: "0P0000XBML", currency: "USD" },
  // BNY Mellon Global Short-Dated High Yield Bond — W class CUSIP not in Yahoo
  // Using C Acc class on Yahoo as proxy (same fund, different fee class)
  G1R06N212: { eodhd: "IE00BD5CTV53.EUFUND", yahoo: "0P00019BP0", currency: "USD" },
  // Jupiter Merian World Equity L USD Acc
  G6016L337: { yahoo: "0P00000ICR", currency: "USD" },
  // UBAM Dynamic Dollar Bond AC USD
  L9381G101: { eodhd: "LU0029761532.EUFUND", yahoo: "0P00000AZP", currency: "USD" },
};

// ---------------------------------------------------------------------------
// resolveSource — pure function, no I/O
// ---------------------------------------------------------------------------

export function resolveSource(h: HoldingForPricing): SourceResolution {
  const secId = (h.securityId || "").trim();
  const name = (h.fundName || "").trim();

  // 1. FX tickers → bcch
  const upperName = name.toUpperCase();
  const upperSecId = secId.toUpperCase();
  if (FX_TICKERS.has(upperSecId) || FX_TICKERS.has(upperName)) {
    const ticker = FX_TICKERS.has(upperSecId) ? upperSecId : upperName;
    return { source: "bcch", symbol: ticker, currency: "CLP" };
  }

  // 2. Numeric securityId (3-6 digits, Chilean RUN) → cmf
  if (/^\d{3,6}$/.test(secId)) {
    return { source: "cmf", symbol: secId, currency: "CLP" };
  }

  // 3. CFIETF* → yahoo with .SN suffix
  if (/^CFIETF/i.test(secId)) {
    const symbol = secId.toUpperCase().endsWith(".SN")
      ? secId.toUpperCase()
      : `${secId.toUpperCase()}.SN`;
    return { source: "yahoo", symbol, currency: "CLP" };
  }

  // 4. CFI* (non-ETF) → CMF (fondos_inversion_precios), with Yahoo .SN as fallback
  if (/^CFI/i.test(secId) && !/^CFIETF/i.test(secId)) {
    return { source: "cmf", symbol: secId.toUpperCase(), currency: "CLP" };
  }

  // 5. Chilean ADR stocks (GOOGLCL, NVDACL) → synthetic CLP via US underlying × FX
  // Santiago ADRs are illiquid; use NYSE price × USD/CLP for accurate CLP valuation
  if (/^[A-Z]{3,10}CL$/.test(secId.toUpperCase()) && !/^CFI/.test(secId.toUpperCase())) {
    const underlying = secId.toUpperCase().replace(/CL$/, "");
    return { source: "cl-adr", symbol: underlying, currency: "CLP" };
  }

  // 5b. CUSIP mapped to international UCITS fund → eodhd or yahoo
  if (secId && INTL_FUND_MAP[secId.toUpperCase()]) {
    const mapping = INTL_FUND_MAP[secId.toUpperCase()];
    if (mapping.eodhd) {
      return { source: "eodhd", symbol: mapping.eodhd, currency: mapping.currency };
    }
    if (mapping.yahoo) {
      return { source: "yahoo", symbol: mapping.yahoo, currency: mapping.currency };
    }
  }

  // 6. Bond with CUSIP → finra
  const iType = inferInstrumentType(h);
  if (iType === "bond" && secId && /^[A-Z0-9]{9}$/i.test(secId)) {
    return { source: "finra", symbol: secId.toUpperCase(), currency: "USD" };
  }

  // 6a. Chilean market stock/ETF → yahoo with .SN suffix
  // When market=CL, always use Santiago exchange (not NYSE ADR)
  if (h.market === "CL" && secId && !/^\d+$/.test(secId)) {
    const symbol = secId.toUpperCase().endsWith(".SN")
      ? secId.toUpperCase()
      : `${secId.toUpperCase()}.SN`;
    return { source: "yahoo", symbol, currency: "CLP" };
  }

  // 6b. US/INT market or short letter-only ticker → alphavantage
  if (h.market === "US" || h.market === "INT") {
    return {
      source: "alphavantage",
      symbol: secId || name,
      currency: h.currency || "USD",
    };
  }

  // 7. .SN suffix already present → yahoo
  if (secId.endsWith(".SN") || secId.endsWith(".sn")) {
    return { source: "yahoo", symbol: secId.toUpperCase(), currency: "CLP" };
  }

  // 8. Has securityId (non-numeric, non-CFI, non-CUSIP-bond) → alphavantage
  if (secId) {
    return {
      source: "alphavantage",
      symbol: secId,
      currency: h.currency || "USD",
    };
  }

  // 9. No securityId → cmf default
  return { source: "cmf", symbol: name, currency: "CLP" };
}

// ---------------------------------------------------------------------------
// Supabase admin client (lazy singleton)
// ---------------------------------------------------------------------------

let _admin: ReturnType<typeof createClient> | null = null;

function adminClient() {
  if (!_admin) {
    _admin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
  }
  return _admin;
}

// ---------------------------------------------------------------------------
// CL ADR synthetic prices — US underlying × USD/CLP exchange rate
// ---------------------------------------------------------------------------

async function fetchUsdClpRates(
  fromDate: string,
  toDate: string
): Promise<Map<string, number>> {
  const rates = new Map<string, number>();
  const from = Math.floor(new Date(fromDate).getTime() / 1000);
  const to = Math.floor(new Date(toDate).getTime() / 1000) + 86400;
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/CLP%3DX?period1=${from}&period2=${to}&interval=1d`;
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" },
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return rates;
    const data = await res.json();
    const result = data.chart?.result?.[0];
    if (!result) return rates;
    const timestamps: number[] = result.timestamp || [];
    const closes: (number | null)[] = result.indicators?.quote?.[0]?.close || [];
    for (let i = 0; i < timestamps.length; i++) {
      if (closes[i] != null && isFinite(closes[i]!) && closes[i]! > 0) {
        const date = new Date(timestamps[i] * 1000).toISOString().split("T")[0];
        rates.set(date, closes[i]!);
      }
    }
  } catch (err) {
    console.warn("[price-service] CLP=X FX fetch error:", err instanceof Error ? err.message : err);
  }
  return rates;
}

async function fetchClAdrHistorical(
  usUnderlying: string,
  fromDate: string,
  toDate: string
): Promise<DailyPrice[]> {
  const [usPrices, fxRates] = await Promise.all([
    fetchYahooHistorical(usUnderlying, fromDate, toDate),
    fetchUsdClpRates(fromDate, toDate),
  ]);
  if (usPrices.length === 0 || fxRates.size === 0) return [];

  // Forward-fill FX rate (max 7 days) for dates where we have a US price but no exact FX match
  const sortedFxDates = [...fxRates.keys()].sort();
  const getFx = (date: string): number | null => {
    if (fxRates.has(date)) return fxRates.get(date)!;
    // Find closest previous FX rate within 7-day window
    let last: number | null = null;
    const minDate = new Date(date);
    minDate.setDate(minDate.getDate() - 7);
    const minDateStr = minDate.toISOString().split("T")[0];
    for (const d of sortedFxDates) {
      if (d > date) break;
      if (d >= minDateStr) last = fxRates.get(d)!;
    }
    return last;
  };

  const result: DailyPrice[] = [];
  for (const p of usPrices) {
    const fx = getFx(p.date);
    if (fx && isFinite(p.price) && isFinite(fx)) {
      result.push({ date: p.date, price: Math.round(p.price * fx) });
    }
  }
  return result;
}

async function fetchClAdrLatest(
  usUnderlying: string
): Promise<{ price: number; date: string } | null> {
  const quote = await fetchYahooQuote(usUnderlying);
  if (!quote) return null;

  // Fetch current FX rate
  const fxQuote = await fetchYahooQuote("CLP=X");
  if (!fxQuote) return null;

  const clpPrice = quote.price * fxQuote.price;
  if (!isFinite(clpPrice) || clpPrice <= 0) return null;
  return { price: Math.round(clpPrice), date: quote.date };
}

// ---------------------------------------------------------------------------
// fetchPriceRange — delegates to AV / Yahoo depending on source
// ---------------------------------------------------------------------------

export async function fetchPriceRange(
  resolution: SourceResolution,
  fromDate: string,
  toDate: string
): Promise<DailyPrice[]> {
  if (resolution.source === "alphavantage") {
    // Try AV first, fall back to Yahoo
    const avPrices = await fetchDailyPricesRange(
      resolution.symbol,
      fromDate,
      toDate
    );
    if (avPrices.length > 0) return avPrices;
    console.warn(`[price-service] alphavantage returned no data for ${resolution.symbol}, falling back to yahoo`);
    return fetchYahooHistorical(resolution.symbol, fromDate, toDate);
  }

  if (resolution.source === "eodhd") {
    // Try EODHD first, fall back to Yahoo if mapping exists
    const prices = await fetchEodhdHistorical(resolution.symbol, fromDate, toDate);
    if (prices.length > 0) return prices;
    // Find Yahoo fallback from mapping
    const mapping = Object.values(INTL_FUND_MAP).find(m => m.eodhd === resolution.symbol);
    if (mapping?.yahoo) {
      console.warn(`[price-service] eodhd returned no data for ${resolution.symbol}, falling back to yahoo (${mapping.yahoo})`);
      return fetchYahooHistorical(mapping.yahoo, fromDate, toDate);
    }
    console.warn(`[price-service] eodhd returned no data for ${resolution.symbol}, no yahoo mapping found`);
    return [];
  }

  if (resolution.source === "yahoo") {
    return fetchYahooHistorical(resolution.symbol, fromDate, toDate);
  }

  if (resolution.source === "bolsa-santiago") {
    // Try Bolsa de Santiago API first, fall back to Yahoo .SN
    try {
      const bsData = await getBolsaHistorical(resolution.symbol, fromDate, toDate);
      if (bsData.length > 0) {
        return bsData.map((d) => ({ date: d.date, price: d.close }));
      }
    } catch {
      // Bolsa API may be unavailable outside market hours
      console.warn(`[price-service] bolsa-santiago threw error for ${resolution.symbol}, falling back to yahoo .SN`);
    }
    // Fallback: Yahoo with .SN suffix
    const yahooSymbol = resolution.symbol.toUpperCase().endsWith(".SN")
      ? resolution.symbol
      : `${resolution.symbol}.SN`;
    return fetchYahooHistorical(yahooSymbol, fromDate, toDate);
  }

  if (resolution.source === "cl-adr") {
    return fetchClAdrHistorical(resolution.symbol, fromDate, toDate);
  }

  // cmf, fintual, finra, bcch → handled by existing code elsewhere
  console.warn(`[price-service] fetchPriceRange: no handler matched for source=${resolution.source}, symbol=${resolution.symbol}`);
  return [];
}

// ---------------------------------------------------------------------------
// fetchLatestPrice — delegates similarly
// ---------------------------------------------------------------------------

export async function fetchLatestPrice(
  resolution: SourceResolution
): Promise<{ price: number; date: string } | null> {
  if (resolution.source === "alphavantage") {
    const avQuote = await fetchQuote(resolution.symbol);
    if (avQuote) return avQuote;
    console.warn(`[price-service] alphavantage returned no quote for ${resolution.symbol}, falling back to yahoo`);
    return fetchYahooQuote(resolution.symbol);
  }

  if (resolution.source === "eodhd") {
    const quote = await fetchEodhdQuote(resolution.symbol);
    if (quote) return quote;
    const mapping = Object.values(INTL_FUND_MAP).find(m => m.eodhd === resolution.symbol);
    if (mapping?.yahoo) {
      console.warn(`[price-service] eodhd returned no quote for ${resolution.symbol}, falling back to yahoo (${mapping.yahoo})`);
      return fetchYahooQuote(mapping.yahoo);
    }
    console.warn(`[price-service] eodhd returned no quote for ${resolution.symbol}, no yahoo mapping found`);
    return null;
  }

  if (resolution.source === "yahoo") {
    return fetchYahooQuote(resolution.symbol);
  }

  if (resolution.source === "cl-adr") {
    return fetchClAdrLatest(resolution.symbol);
  }

  if (resolution.source === "bolsa-santiago") {
    try {
      const stock = await getResumenAccion(resolution.symbol);
      if (stock && stock.price > 0) {
        const today = new Date().toISOString().split("T")[0];
        return { price: stock.price, date: stock.lastUpdate?.split("T")[0] || today };
      }
    } catch {
      // Bolsa API unavailable
      console.warn(`[price-service] bolsa-santiago threw error for ${resolution.symbol}, falling back to yahoo .SN`);
    }
    // Fallback: Yahoo .SN
    const yahooSymbol = resolution.symbol.toUpperCase().endsWith(".SN")
      ? resolution.symbol
      : `${resolution.symbol}.SN`;
    return fetchYahooQuote(yahooSymbol);
  }

  console.warn(`[price-service] fetchLatestPrice: no handler matched for source=${resolution.source}, symbol=${resolution.symbol}`);
  return null;
}

// ---------------------------------------------------------------------------
// DB operations — international_prices table
// ---------------------------------------------------------------------------

const BATCH_SIZE = 500;

export async function storeInternationalPrices(
  symbol: string,
  prices: DailyPrice[],
  currency: string,
  source: string
): Promise<void> {
  if (prices.length === 0) return;
  const sb = adminClient();

  for (let i = 0; i < prices.length; i += BATCH_SIZE) {
    const batch = prices.slice(i, i + BATCH_SIZE).map((p) => ({
      ticker: symbol,
      price_date: p.date,
      close_price: p.price,
      currency,
      source,
    }));

    const { error } = await sb
      .from("international_prices")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .upsert(batch as any, { onConflict: "ticker,price_date" });
    if (error) {
      console.error(`[price-service] upsert error for ${symbol}:`, error.message);
    }
  }
}

export async function getStoredPrices(
  symbol: string,
  fromDate: string,
  toDate: string
): Promise<DailyPrice[]> {
  const sb = adminClient();
  const { data, error } = await sb
    .from("international_prices")
    .select("price_date, close_price")
    .eq("ticker", symbol)
    .gte("price_date", fromDate)
    .lte("price_date", toDate)
    .order("price_date", { ascending: true });

  if (error || !data) return [];
  return (data as Array<{ price_date: string; close_price: number }>).map((row) => ({
    date: row.price_date,
    price: Number(row.close_price),
  }));
}

/**
 * Get price for a symbol at a specific date.
 * Checks DB first; if missing, fetches on demand and stores for future.
 */
export async function getPrice(
  symbol: string,
  date: string,
  resolution: SourceResolution
): Promise<{ price: number; date: string } | null> {
  // Check DB first
  const stored = await getStoredPrices(symbol, date, date);
  if (stored.length > 0) {
    return { price: stored[0].price, date: stored[0].date };
  }

  // Fetch on demand — small range around the requested date
  const from = date;
  const to = date;
  const fetched = await fetchPriceRange(resolution, from, to);
  if (fetched.length === 0) return null;

  // Store for future
  await storeInternationalPrices(
    symbol,
    fetched,
    resolution.currency,
    resolution.source
  );

  // Return the closest match
  const exact = fetched.find((p) => p.date === date);
  if (exact) return { price: exact.price, date: exact.date };
  return { price: fetched[fetched.length - 1].price, date: fetched[fetched.length - 1].date };
}

/**
 * Backfill prices from the last stored date (or fromDate) up to today.
 */
export async function backfillSymbol(
  symbol: string,
  fromDate: string,
  resolution: SourceResolution
): Promise<number> {
  const sb = adminClient();

  // Find last stored date
  const { data: latest } = await sb
    .from("international_prices")
    .select("price_date")
    .eq("ticker", symbol)
    .order("price_date", { ascending: false })
    .limit(1);

  const lastStored = (latest as Array<{ price_date: string }> | null)?.[0]?.price_date;
  const start = lastStored && lastStored > fromDate ? lastStored : fromDate;
  const today = new Date().toISOString().split("T")[0];

  if (start >= today) return 0;

  const prices = await fetchPriceRange(resolution, start, today);
  if (prices.length === 0) return 0;

  await storeInternationalPrices(symbol, prices, resolution.currency, resolution.source);
  return prices.length;
}
