// lib/prices/price-service.ts

import { createClient } from "@supabase/supabase-js";
import { inferInstrumentType } from "@/lib/instrument-type";
import { fetchDailyPricesRange, fetchQuote } from "./alphavantage";
import { fetchYahooHistorical, fetchYahooQuote } from "./yahoo";
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

  // 4. CFI* → yahoo with .SN suffix
  if (/^CFI/i.test(secId)) {
    const symbol = secId.toUpperCase().endsWith(".SN")
      ? secId.toUpperCase()
      : `${secId.toUpperCase()}.SN`;
    return { source: "yahoo", symbol, currency: "CLP" };
  }

  // 5. Chilean ADR stocks (GOOGLCL, NVDACL) → yahoo with .SN suffix
  if (/^[A-Z]{3,10}CL$/.test(secId.toUpperCase()) && !/^CFI/.test(secId.toUpperCase())) {
    return { source: "yahoo", symbol: `${secId.toUpperCase()}.SN`, currency: "CLP" };
  }

  // 6. Bond with CUSIP → finra
  const iType = inferInstrumentType(h);
  if (iType === "bond" && secId && /^[A-Z0-9]{9}$/i.test(secId)) {
    return { source: "finra", symbol: secId.toUpperCase(), currency: "USD" };
  }

  // 6. US/INT market or short letter-only ticker → alphavantage
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
    return fetchYahooHistorical(resolution.symbol, fromDate, toDate);
  }

  if (resolution.source === "yahoo") {
    return fetchYahooHistorical(resolution.symbol, fromDate, toDate);
  }

  // cmf, fintual, finra, bcch → handled by existing code elsewhere
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
    return fetchYahooQuote(resolution.symbol);
  }

  if (resolution.source === "yahoo") {
    return fetchYahooQuote(resolution.symbol);
  }

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
      symbol,
      price_date: p.date,
      close_price: p.price,
      currency,
      source,
    }));

    await sb
      .from("international_prices")
      .upsert(batch as any, { onConflict: "symbol,price_date" });
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
    .eq("symbol", symbol)
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
    .eq("symbol", symbol)
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
