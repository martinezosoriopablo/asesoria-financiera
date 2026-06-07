# Single Thermometer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Unify all return calculations through a single price service backed by AlphaVantage (international) and CMF (Chilean), eliminating api-prices snapshots and adding configurable per-client benchmarks.

**Architecture:** New `lib/prices/` module provides `getPrice()`, `getPriceRange()`, `getLatestPrice()` backed by DB tables (`fondos_rentabilidades_diarias` for Chilean, new `international_prices` for international). AlphaVantage is primary for international with Yahoo fallback. Backfill runs on cartola upload. All seguimiento components refactored to use price service instead of snapshot value comparisons. Per-client `benchmark_config` JSONB column enables configurable benchmarks.

**Tech Stack:** Next.js 16, Supabase (Postgres), AlphaVantage API, Yahoo Finance API, CMF, Recharts, Vitest

---

## File Structure

### New files
| File | Responsibility |
|------|---------------|
| `lib/prices/alphavantage.ts` | AlphaVantage API client (daily prices, quotes, rate limiting) |
| `lib/prices/yahoo.ts` | Yahoo Finance price fetcher (extracted from fill-prices) |
| `lib/prices/price-service.ts` | Unified price service — resolves instrument → source, fetches/stores prices |
| `lib/prices/types.ts` | Shared types for the price module |
| `lib/prices/alphavantage.test.ts` | Tests for AlphaVantage client |
| `lib/prices/price-service.test.ts` | Tests for price service |
| `supabase/migrations/20260527_international_prices_and_benchmark.sql` | DB migration |
| `app/api/prices/backfill/route.ts` | API route to trigger price backfill for a client |
| `app/api/clients/[id]/benchmark/route.ts` | GET/PUT benchmark config per client |
| `components/seguimiento/BenchmarkConfig.tsx` | UI for advisor to configure client benchmark |

### Modified files
| File | Changes |
|------|---------|
| `components/seguimiento/SeguimientoPage.tsx` | Remove auto-fill-prices logic, add benchmark config, wire price service |
| `components/seguimiento/RetornosComparados.tsx` | Accept benchmark from price service instead of hardcoded UF+2% |
| `components/seguimiento/RentabilidadPorActivo.tsx` | Use price service for per-holding returns |
| `components/seguimiento/PerformanceAttribution.tsx` | Use price service for attribution calculations |
| `app/api/clients/[id]/seguimiento/route.ts` | Filter out api-prices snapshots from response |

### Deprecated (later phase)
| File | Action |
|------|--------|
| `app/api/portfolio/fill-prices/route.ts` | Stop calling; keep code for reference during migration |

---

### Task 1: Database Migration

**Files:**
- Create: `supabase/migrations/20260527_international_prices_and_benchmark.sql`

- [ ] **Step 1: Write migration SQL**

```sql
-- supabase/migrations/20260527_international_prices_and_benchmark.sql

-- International prices table (AlphaVantage/Yahoo/FINRA data)
CREATE TABLE IF NOT EXISTS international_prices (
  id BIGSERIAL PRIMARY KEY,
  symbol TEXT NOT NULL,
  price_date DATE NOT NULL,
  close_price NUMERIC(18,6) NOT NULL,
  currency TEXT NOT NULL DEFAULT 'USD',
  source TEXT NOT NULL,  -- 'alphavantage' | 'yahoo' | 'finra'
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(symbol, price_date)
);

CREATE INDEX IF NOT EXISTS idx_intl_prices_symbol_date
  ON international_prices(symbol, price_date DESC);

-- Benchmark config per client (advisor-configured)
-- Example: [{"ticker":"ACWI","weight":0.8},{"ticker":"AGG","weight":0.2}]
-- Example: [{"ticker":"UF","weight":1.0,"spread":2.0}]
ALTER TABLE clients ADD COLUMN IF NOT EXISTS benchmark_config JSONB;

-- RLS: advisors can read/write international_prices (no per-row restriction needed, shared data)
ALTER TABLE international_prices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read international_prices"
  ON international_prices FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Service role can insert international_prices"
  ON international_prices FOR INSERT
  TO service_role
  WITH CHECK (true);

CREATE POLICY "Service role can update international_prices"
  ON international_prices FOR UPDATE
  TO service_role
  USING (true);
```

- [ ] **Step 2: Verify migration file exists and is valid SQL**

Run: `cat supabase/migrations/20260527_international_prices_and_benchmark.sql | head -5`
Expected: First 5 lines of the migration file

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260527_international_prices_and_benchmark.sql
git commit -m "feat: add international_prices table and benchmark_config column"
```

---

### Task 2: Price Module Types

**Files:**
- Create: `lib/prices/types.ts`

- [ ] **Step 1: Write shared types**

```typescript
// lib/prices/types.ts

export interface PricePoint {
  date: string;       // YYYY-MM-DD
  price: number;      // in original currency
  currency: string;   // 'CLP' | 'USD' | 'EUR'
  source: string;     // 'cmf' | 'alphavantage' | 'yahoo' | 'finra' | 'bcch' | 'fintual'
}

export interface DailyPrice {
  date: string;
  price: number;
}

/** Instrument classification for price routing */
export type PriceSource = 'cmf' | 'alphavantage' | 'yahoo' | 'fintual' | 'finra' | 'bcch';

/** Holding as seen in cartola snapshots */
export interface HoldingForPricing {
  fundName: string;
  securityId?: string | null;
  serie?: string;
  quantity?: number;
  marketValue: number;
  marketValueCLP?: number;
  currency?: string;
  market?: 'CL' | 'INT' | 'US' | null;
  assetClass?: string;
  couponRate?: number | null;
  maturityDate?: string | null;
}

/** Benchmark component (stored in clients.benchmark_config JSONB) */
export interface BenchmarkComponent {
  ticker: string;     // e.g. "ACWI", "AGG", "UF"
  weight: number;     // 0-1
  spread?: number;    // annual spread in % (e.g. 2.0 for UF+2%)
}

/** Result of portfolio valuation at a date */
export interface PortfolioValuePoint {
  date: string;
  value: number;      // in CLP
}
```

- [ ] **Step 2: Commit**

```bash
git add lib/prices/types.ts
git commit -m "feat: add shared types for price module"
```

---

### Task 3: AlphaVantage Client

**Files:**
- Create: `lib/prices/alphavantage.ts`
- Create: `lib/prices/alphavantage.test.ts`

- [ ] **Step 1: Write tests**

```typescript
// lib/prices/alphavantage.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { fetchDailyPrices, fetchQuote, AV_BASE } from "./alphavantage";

// Mock global fetch
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

beforeEach(() => {
  vi.clearAllMocks();
  // Set env
  vi.stubEnv("ALPHA_VANTAGE_API_KEY", "test-key");
});

describe("fetchDailyPrices", () => {
  it("parses TIME_SERIES_DAILY response correctly", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        "Time Series (Daily)": {
          "2026-05-27": { "4. close": "450.50" },
          "2026-05-26": { "4. close": "448.00" },
          "2026-05-23": { "4. close": "445.25" },
        },
      }),
    });

    const prices = await fetchDailyPrices("SPY");
    expect(prices).toHaveLength(3);
    expect(prices[0]).toEqual({ date: "2026-05-23", price: 445.25 });
    expect(prices[2]).toEqual({ date: "2026-05-27", price: 450.50 });
  });

  it("returns empty array when API key missing", async () => {
    vi.stubEnv("ALPHA_VANTAGE_API_KEY", "");
    const prices = await fetchDailyPrices("SPY");
    expect(prices).toEqual([]);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("returns empty array on rate limit (Note in response)", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        Note: "Thank you for using Alpha Vantage! Our standard API call frequency is 75 calls per minute.",
      }),
    });

    const prices = await fetchDailyPrices("SPY");
    expect(prices).toEqual([]);
  });

  it("returns empty array on fetch error", async () => {
    mockFetch.mockRejectedValueOnce(new Error("Network error"));
    const prices = await fetchDailyPrices("SPY");
    expect(prices).toEqual([]);
  });
});

describe("fetchQuote", () => {
  it("parses GLOBAL_QUOTE response", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        "Global Quote": {
          "05. price": "450.50",
          "07. latest trading day": "2026-05-27",
        },
      }),
    });

    const quote = await fetchQuote("SPY");
    expect(quote).toEqual({ price: 450.5, date: "2026-05-27" });
  });

  it("returns null when no data", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ "Global Quote": {} }),
    });

    const quote = await fetchQuote("INVALID");
    expect(quote).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run lib/prices/alphavantage.test.ts`
Expected: FAIL — module `./alphavantage` not found

- [ ] **Step 3: Implement AlphaVantage client**

```typescript
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run lib/prices/alphavantage.test.ts`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add lib/prices/alphavantage.ts lib/prices/alphavantage.test.ts
git commit -m "feat: AlphaVantage client with daily prices and quotes"
```

---

### Task 4: Yahoo Price Fetcher

**Files:**
- Create: `lib/prices/yahoo.ts`

- [ ] **Step 1: Extract Yahoo fetcher from fill-prices**

This extracts the existing `fetchYahooHistorical` function from `app/api/portfolio/fill-prices/route.ts` (lines 59-97) into a standalone module.

```typescript
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
      if (closes[i] != null) {
        const date = new Date(timestamps[i] * 1000)
          .toISOString()
          .split("T")[0];
        prices.push({ date, price: closes[i]! });
      }
    }
    return prices.sort((a, b) => a.date.localeCompare(b.date));
  } catch {
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

    // Get the last valid price
    for (let i = timestamps.length - 1; i >= 0; i--) {
      if (closes[i] != null) {
        const date = new Date(timestamps[i] * 1000).toISOString().split("T")[0];
        return { price: closes[i]!, date };
      }
    }
    return null;
  } catch {
    return null;
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add lib/prices/yahoo.ts
git commit -m "feat: Yahoo Finance price fetcher extracted from fill-prices"
```

---

### Task 5: Unified Price Service

**Files:**
- Create: `lib/prices/price-service.ts`
- Create: `lib/prices/price-service.test.ts`

- [ ] **Step 1: Write tests for instrument routing**

```typescript
// lib/prices/price-service.test.ts
import { describe, it, expect } from "vitest";
import { resolveSource } from "./price-service";

describe("resolveSource", () => {
  it("routes Chilean FM (numeric RUN) to cmf", () => {
    const result = resolveSource({ fundName: "Fondo X", securityId: "9085", serie: "A", marketValue: 1000 });
    expect(result.source).toBe("cmf");
  });

  it("routes Chilean ETF (CFIETF*) to yahoo with .SN suffix", () => {
    const result = resolveSource({ fundName: "ETF Singular", securityId: "CFIETFIPSA", marketValue: 1000 });
    expect(result.source).toBe("yahoo");
    expect(result.symbol).toBe("CFIETFIPSA.SN");
  });

  it("routes Chilean FI (CFI*) to yahoo with .SN suffix", () => {
    const result = resolveSource({ fundName: "FI Renta", securityId: "CFICAPITAL", marketValue: 1000 });
    expect(result.source).toBe("yahoo");
    expect(result.symbol).toBe("CFICAPITAL.SN");
  });

  it("routes international ETF to alphavantage", () => {
    const result = resolveSource({ fundName: "iShares MSCI ACWI", securityId: "ACWI", marketValue: 1000, market: "US" });
    expect(result.source).toBe("alphavantage");
    expect(result.symbol).toBe("ACWI");
  });

  it("routes CUSIP bond to finra", () => {
    const result = resolveSource({
      fundName: "ECOPETROL 5.875% 05/28/2045",
      securityId: "279158AN4",
      marketValue: 1000,
      couponRate: 5.875,
      maturityDate: "2045-05-28",
    });
    expect(result.source).toBe("finra");
  });

  it("routes UF to bcch", () => {
    const result = resolveSource({ fundName: "UF", securityId: "UF", marketValue: 0 });
    expect(result.source).toBe("bcch");
  });

  it("defaults international fund (market=INT) to alphavantage", () => {
    const result = resolveSource({ fundName: "Robeco Global Credits", securityId: "LU123456789", marketValue: 5000, market: "INT" });
    expect(result.source).toBe("alphavantage");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run lib/prices/price-service.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement price service**

```typescript
// lib/prices/price-service.ts

import type {
  PricePoint,
  DailyPrice,
  HoldingForPricing,
  BenchmarkComponent,
  PortfolioValuePoint,
} from "./types";
import { fetchDailyPricesRange, fetchQuote } from "./alphavantage";
import { fetchYahooHistorical, fetchYahooQuote } from "./yahoo";
import { inferInstrumentType } from "@/lib/instrument-type";

// --- Source resolution ---

export interface SourceResolution {
  source: 'cmf' | 'alphavantage' | 'yahoo' | 'fintual' | 'finra' | 'bcch';
  symbol: string;
  currency: string;
}

const CUSIP_RE = /^[A-Z0-9]{9}$/i;
const FX_TICKERS = new Set(["UF", "USD", "EUR"]);

/**
 * Determine which price source + symbol to use for a holding.
 * This is the central routing logic — one place for all instruments.
 */
export function resolveSource(h: HoldingForPricing): SourceResolution {
  const secId = (h.securityId || "").trim();

  // FX rates
  if (FX_TICKERS.has(secId.toUpperCase())) {
    return { source: "bcch", symbol: secId.toUpperCase(), currency: "CLP" };
  }

  // Chilean FM: numeric RUN (3-6 digits)
  if (/^\d{3,6}$/.test(secId)) {
    return { source: "cmf", symbol: secId, currency: h.currency || "CLP" };
  }

  // Chilean instruments traded on Bolsa de Santiago
  if (/^CFIETF/i.test(secId)) {
    return { source: "yahoo", symbol: `${secId}.SN`, currency: "CLP" };
  }
  if (/^CFI/i.test(secId)) {
    return { source: "yahoo", symbol: `${secId}.SN`, currency: "CLP" };
  }

  // Bond with CUSIP
  const itype = inferInstrumentType({
    fundName: h.fundName,
    securityId: h.securityId || undefined,
    assetClass: h.assetClass,
    couponRate: h.couponRate,
    maturityDate: h.maturityDate,
  });
  if (itype === "bond" && secId && CUSIP_RE.test(secId)) {
    return { source: "finra", symbol: secId, currency: "USD" };
  }

  // International / US: AlphaVantage primary
  if (h.market === "US" || h.market === "INT" || (secId && !secId.includes("."))) {
    // If it looks like a ticker (all letters, 1-5 chars), use AlphaVantage
    if (/^[A-Z]{1,5}$/i.test(secId)) {
      return { source: "alphavantage", symbol: secId.toUpperCase(), currency: "USD" };
    }
    // ISIN or other international ID — try AlphaVantage
    return { source: "alphavantage", symbol: secId || h.fundName, currency: h.currency || "USD" };
  }

  // Fallback: if secId has .SN suffix already
  if (secId.endsWith(".SN")) {
    return { source: "yahoo", symbol: secId, currency: "CLP" };
  }

  // Default: try AlphaVantage for anything with a securityId
  if (secId) {
    return { source: "alphavantage", symbol: secId, currency: h.currency || "USD" };
  }

  // No securityId — best guess is a Chilean fund
  return { source: "cmf", symbol: "", currency: "CLP" };
}

// --- Price fetching with fallback ---

/**
 * Fetch price range for a symbol, trying primary source then fallback.
 * For alphavantage source: tries AV first, falls back to Yahoo.
 * For yahoo source: Yahoo only.
 * For cmf/fintual/finra/bcch: returns empty (handled by existing specialized code).
 */
export async function fetchPriceRange(
  resolution: SourceResolution,
  fromDate: string,
  toDate: string
): Promise<DailyPrice[]> {
  if (resolution.source === "alphavantage") {
    // Try AlphaVantage first
    const avPrices = await fetchDailyPricesRange(resolution.symbol, fromDate, toDate);
    if (avPrices.length > 0) return avPrices;
    // Fallback to Yahoo
    return fetchYahooHistorical(resolution.symbol, fromDate, toDate);
  }

  if (resolution.source === "yahoo") {
    return fetchYahooHistorical(resolution.symbol, fromDate, toDate);
  }

  // cmf, fintual, finra, bcch — not handled here (use existing specialized APIs)
  return [];
}

/**
 * Fetch latest price for a symbol.
 * Tries AlphaVantage quote, falls back to Yahoo.
 */
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

// --- DB operations (server-side only, called from API routes) ---

import { createClient } from "@supabase/supabase-js";

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

/**
 * Store international prices in the DB (upsert).
 * Returns count of rows inserted/updated.
 */
export async function storeInternationalPrices(
  symbol: string,
  prices: DailyPrice[],
  currency: string,
  source: string
): Promise<number> {
  if (prices.length === 0) return 0;

  const supabase = getAdminClient();
  const rows = prices.map((p) => ({
    symbol,
    price_date: p.date,
    close_price: p.price,
    currency,
    source,
  }));

  // Upsert in batches of 500
  let count = 0;
  for (let i = 0; i < rows.length; i += 500) {
    const batch = rows.slice(i, i + 500);
    const { error } = await supabase
      .from("international_prices")
      .upsert(batch, { onConflict: "symbol,price_date" });
    if (!error) count += batch.length;
  }
  return count;
}

/**
 * Get stored international prices from DB for a date range.
 */
export async function getStoredPrices(
  symbol: string,
  fromDate: string,
  toDate: string
): Promise<DailyPrice[]> {
  const supabase = getAdminClient();
  const { data, error } = await supabase
    .from("international_prices")
    .select("price_date, close_price")
    .eq("symbol", symbol)
    .gte("price_date", fromDate)
    .lte("price_date", toDate)
    .order("price_date", { ascending: true });

  if (error || !data) return [];
  return data.map((r) => ({
    date: r.price_date,
    price: Number(r.close_price),
  }));
}

/**
 * Get price for a specific symbol on a specific date.
 * First checks DB, then fetches if missing.
 */
export async function getPrice(
  symbol: string,
  date: string,
  resolution: SourceResolution
): Promise<PricePoint | null> {
  // Check DB first
  const stored = await getStoredPrices(symbol, date, date);
  if (stored.length > 0) {
    return {
      date: stored[0].date,
      price: stored[0].price,
      currency: resolution.currency,
      source: resolution.source,
    };
  }

  // Fetch on demand — small range around the date for forward-fill
  const weekBefore = new Date(date);
  weekBefore.setDate(weekBefore.getDate() - 7);
  const fromDate = weekBefore.toISOString().split("T")[0];

  const prices = await fetchPriceRange(resolution, fromDate, date);
  if (prices.length === 0) return null;

  // Store for future use
  await storeInternationalPrices(symbol, prices, resolution.currency, resolution.source);

  // Return the closest date <= requested date
  const matching = prices.filter((p) => p.date <= date);
  if (matching.length === 0) return null;

  const closest = matching[matching.length - 1];
  return {
    date: closest.date,
    price: closest.price,
    currency: resolution.currency,
    source: resolution.source,
  };
}

/**
 * Backfill prices for a symbol from a start date to today.
 * Fetches from API, stores in DB.
 * Returns count of prices stored.
 */
export async function backfillSymbol(
  symbol: string,
  fromDate: string,
  resolution: SourceResolution
): Promise<number> {
  const today = new Date().toISOString().split("T")[0];

  // Check what we already have
  const existing = await getStoredPrices(symbol, fromDate, today);
  if (existing.length > 0) {
    // Find the gap — only fetch what's missing
    const lastStored = existing[existing.length - 1].date;
    const nextDay = new Date(lastStored);
    nextDay.setDate(nextDay.getDate() + 1);
    const gapStart = nextDay.toISOString().split("T")[0];
    if (gapStart > today) return 0; // fully up to date

    const newPrices = await fetchPriceRange(resolution, gapStart, today);
    return storeInternationalPrices(symbol, newPrices, resolution.currency, resolution.source);
  }

  // Full backfill
  const prices = await fetchPriceRange(resolution, fromDate, today);
  return storeInternationalPrices(symbol, prices, resolution.currency, resolution.source);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run lib/prices/price-service.test.ts`
Expected: All tests PASS (only `resolveSource` is tested; DB/fetch functions tested via integration)

- [ ] **Step 5: Commit**

```bash
git add lib/prices/price-service.ts lib/prices/price-service.test.ts
git commit -m "feat: unified price service with source routing and DB storage"
```

---

### Task 6: Backfill API Route

**Files:**
- Create: `app/api/prices/backfill/route.ts`

- [ ] **Step 1: Implement backfill endpoint**

This route is called after a cartola is uploaded to backfill all holdings' prices.

```typescript
// app/api/prices/backfill/route.ts

import { NextRequest } from "next/server";
import { requireAdvisor, createAdminClient } from "@/lib/auth/api-auth";
import { successResponse, errorResponse } from "@/lib/api-response";
import { handleApiError } from "@/lib/api-response";
import { applyRateLimit } from "@/lib/rate-limit";
import { resolveSource, backfillSymbol } from "@/lib/prices/price-service";
import type { HoldingForPricing } from "@/lib/prices/types";

export async function POST(request: NextRequest) {
  return handleApiError("prices-backfill", async () => {
    const rateLimitError = await applyRateLimit(request, "prices-backfill", { limit: 10 });
    if (rateLimitError) return rateLimitError;

    const { error } = await requireAdvisor();
    if (error) return error;

    const body = await request.json();
    const { clientId } = body;
    if (!clientId) return errorResponse("clientId es requerido", 400);

    const supabase = createAdminClient();

    // Get the latest cartola snapshot for this client
    const { data: snapshots } = await supabase
      .from("portfolio_snapshots")
      .select("snapshot_date, holdings")
      .eq("client_id", clientId)
      .in("source", ["statement", "manual", "excel"])
      .order("snapshot_date", { ascending: true })
      .limit(10);

    if (!snapshots || snapshots.length === 0) {
      return errorResponse("No hay cartolas para este cliente", 404);
    }

    // Use earliest cartola date as backfill start
    const firstCartolaDate = snapshots[0].snapshot_date;

    // Collect unique symbols from all cartola holdings
    const latestSnap = snapshots[snapshots.length - 1];
    const holdings = (latestSnap.holdings || []) as HoldingForPricing[];

    const results: Array<{ symbol: string; source: string; count: number }> = [];
    const seen = new Set<string>();

    for (const h of holdings) {
      const resolution = resolveSource(h);

      // Skip CMF (handled by existing cmf-auto), FINRA (handled by existing bond pipeline), BCCH
      if (resolution.source === "cmf" || resolution.source === "fintual" || resolution.source === "finra" || resolution.source === "bcch") {
        continue;
      }

      // Skip if no valid symbol or already processed
      if (!resolution.symbol || seen.has(resolution.symbol)) continue;
      seen.add(resolution.symbol);

      const count = await backfillSymbol(resolution.symbol, firstCartolaDate, resolution);
      results.push({
        symbol: resolution.symbol,
        source: resolution.source,
        count,
      });
    }

    return successResponse({
      backfilled: results.length,
      details: results,
      fromDate: firstCartolaDate,
    });
  });
}
```

- [ ] **Step 2: Commit**

```bash
git add app/api/prices/backfill/route.ts
git commit -m "feat: backfill API route triggers price download for client holdings"
```

---

### Task 7: Benchmark Config API

**Files:**
- Create: `app/api/clients/[id]/benchmark/route.ts`

- [ ] **Step 1: Implement GET and PUT endpoints**

```typescript
// app/api/clients/[id]/benchmark/route.ts

import { NextRequest } from "next/server";
import { requireAdvisor, createAdminClient } from "@/lib/auth/api-auth";
import { successResponse, errorResponse } from "@/lib/api-response";
import { handleApiError } from "@/lib/api-response";
import type { BenchmarkComponent } from "@/lib/prices/types";

// Default benchmark: UF + 2%
const DEFAULT_BENCHMARK: BenchmarkComponent[] = [
  { ticker: "UF", weight: 1.0, spread: 2.0 },
];

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return handleApiError("benchmark-get", async () => {
    const { error } = await requireAdvisor();
    if (error) return error;

    const { id: clientId } = await params;
    const supabase = createAdminClient();

    const { data, error: dbError } = await supabase
      .from("clients")
      .select("benchmark_config")
      .eq("id", clientId)
      .single();

    if (dbError) return errorResponse("Cliente no encontrado", 404);

    return successResponse({
      benchmark: (data.benchmark_config as BenchmarkComponent[] | null) || DEFAULT_BENCHMARK,
    });
  });
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return handleApiError("benchmark-put", async () => {
    const { error } = await requireAdvisor();
    if (error) return error;

    const { id: clientId } = await params;
    const body = await request.json();
    const { benchmark } = body as { benchmark: BenchmarkComponent[] };

    // Validate
    if (!Array.isArray(benchmark) || benchmark.length === 0) {
      return errorResponse("benchmark debe ser un array no vacío", 400);
    }

    const totalWeight = benchmark.reduce((s, b) => s + (b.weight || 0), 0);
    if (Math.abs(totalWeight - 1.0) > 0.01) {
      return errorResponse(`Los pesos deben sumar 1.0 (actual: ${totalWeight.toFixed(2)})`, 400);
    }

    for (const b of benchmark) {
      if (!b.ticker || typeof b.weight !== "number") {
        return errorResponse("Cada componente requiere ticker y weight", 400);
      }
    }

    const supabase = createAdminClient();
    const { error: dbError } = await supabase
      .from("clients")
      .update({ benchmark_config: benchmark })
      .eq("id", clientId);

    if (dbError) return errorResponse("Error al guardar benchmark", 500);

    return successResponse({ benchmark });
  });
}
```

- [ ] **Step 2: Commit**

```bash
git add "app/api/clients/[id]/benchmark/route.ts"
git commit -m "feat: benchmark config API (GET/PUT per client)"
```

---

### Task 8: Benchmark Config UI Component

**Files:**
- Create: `components/seguimiento/BenchmarkConfig.tsx`

- [ ] **Step 1: Implement benchmark config panel**

```tsx
// components/seguimiento/BenchmarkConfig.tsx
"use client";

import React, { useState, useEffect } from "react";
import { Settings, Check, Plus, Trash2 } from "lucide-react";
import type { BenchmarkComponent } from "@/lib/prices/types";

interface Props {
  clientId: string;
  onBenchmarkChange?: (benchmark: BenchmarkComponent[]) => void;
}

const PRESETS: { label: string; config: BenchmarkComponent[] }[] = [
  { label: "UF + 2%", config: [{ ticker: "UF", weight: 1.0, spread: 2.0 }] },
  { label: "UF + 3%", config: [{ ticker: "UF", weight: 1.0, spread: 3.0 }] },
  {
    label: "60/40 Global",
    config: [
      { ticker: "ACWI", weight: 0.6 },
      { ticker: "AGG", weight: 0.4 },
    ],
  },
  {
    label: "80/20 Agresivo",
    config: [
      { ticker: "ACWI", weight: 0.8 },
      { ticker: "AGG", weight: 0.2 },
    ],
  },
  { label: "MSCI ACWI 100%", config: [{ ticker: "ACWI", weight: 1.0 }] },
];

export default function BenchmarkConfig({ clientId, onBenchmarkChange }: Props) {
  const [benchmark, setBenchmark] = useState<BenchmarkComponent[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [open, setOpen] = useState(false);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    fetch(`/api/clients/${clientId}/benchmark`)
      .then((r) => r.json())
      .then((d) => {
        if (d.success) {
          setBenchmark(d.data.benchmark);
          onBenchmarkChange?.(d.data.benchmark);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [clientId, onBenchmarkChange]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/clients/${clientId}/benchmark`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ benchmark }),
      });
      const d = await res.json();
      if (d.success) {
        setDirty(false);
        onBenchmarkChange?.(benchmark);
      }
    } catch {
      // silently fail
    } finally {
      setSaving(false);
    }
  };

  const applyPreset = (config: BenchmarkComponent[]) => {
    setBenchmark(config);
    setDirty(true);
  };

  const updateComponent = (idx: number, field: keyof BenchmarkComponent, value: string | number) => {
    const next = [...benchmark];
    next[idx] = { ...next[idx], [field]: value };
    setBenchmark(next);
    setDirty(true);
  };

  const removeComponent = (idx: number) => {
    setBenchmark(benchmark.filter((_, i) => i !== idx));
    setDirty(true);
  };

  const addComponent = () => {
    setBenchmark([...benchmark, { ticker: "", weight: 0 }]);
    setDirty(true);
  };

  const totalWeight = benchmark.reduce((s, b) => s + (b.weight || 0), 0);
  const label = benchmark
    .map((b) => {
      const parts = [b.ticker, `${(b.weight * 100).toFixed(0)}%`];
      if (b.spread) parts.push(`+${b.spread}%`);
      return parts.join(" ");
    })
    .join(" / ");

  if (loading) return null;

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 text-xs text-gb-gray hover:text-gb-black transition-colors"
      >
        <Settings className="w-3.5 h-3.5" />
        <span>Benchmark: {label}</span>
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1 z-50 bg-white border border-gb-border rounded-lg shadow-lg p-4 w-96">
          <h4 className="text-sm font-semibold text-gb-black mb-3">Configurar Benchmark</h4>

          {/* Presets */}
          <div className="flex flex-wrap gap-1.5 mb-3">
            {PRESETS.map((p) => (
              <button
                key={p.label}
                onClick={() => applyPreset(p.config)}
                className="text-xs px-2 py-1 rounded border border-gb-border hover:bg-gb-light transition-colors"
              >
                {p.label}
              </button>
            ))}
          </div>

          {/* Custom components */}
          <div className="space-y-2 mb-3">
            {benchmark.map((b, i) => (
              <div key={i} className="flex items-center gap-2">
                <input
                  type="text"
                  value={b.ticker}
                  onChange={(e) => updateComponent(i, "ticker", e.target.value.toUpperCase())}
                  placeholder="Ticker"
                  className="w-20 text-xs border border-gb-border rounded px-2 py-1"
                />
                <input
                  type="number"
                  value={(b.weight * 100).toFixed(0)}
                  onChange={(e) => updateComponent(i, "weight", parseFloat(e.target.value) / 100 || 0)}
                  placeholder="%"
                  className="w-16 text-xs border border-gb-border rounded px-2 py-1 text-right"
                  min={0}
                  max={100}
                />
                <span className="text-xs text-gb-gray">%</span>
                {b.ticker === "UF" && (
                  <>
                    <span className="text-xs text-gb-gray">+</span>
                    <input
                      type="number"
                      value={b.spread || 0}
                      onChange={(e) => updateComponent(i, "spread", parseFloat(e.target.value) || 0)}
                      className="w-14 text-xs border border-gb-border rounded px-2 py-1 text-right"
                      step={0.5}
                    />
                    <span className="text-xs text-gb-gray">%</span>
                  </>
                )}
                <button onClick={() => removeComponent(i)} className="text-gb-gray hover:text-red-500">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>

          <div className="flex items-center justify-between">
            <button
              onClick={addComponent}
              className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800"
            >
              <Plus className="w-3.5 h-3.5" /> Agregar componente
            </button>
            <div className="flex items-center gap-2">
              <span className={`text-xs ${Math.abs(totalWeight - 1) > 0.01 ? "text-red-500" : "text-gb-gray"}`}>
                Total: {(totalWeight * 100).toFixed(0)}%
              </span>
              <button
                onClick={handleSave}
                disabled={saving || !dirty || Math.abs(totalWeight - 1) > 0.01}
                className="flex items-center gap-1 text-xs px-3 py-1.5 bg-gb-black text-white rounded hover:bg-gb-black/90 disabled:opacity-40 transition-colors"
              >
                <Check className="w-3.5 h-3.5" />
                {saving ? "Guardando..." : "Guardar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add components/seguimiento/BenchmarkConfig.tsx
git commit -m "feat: benchmark config UI component for advisor"
```

---

### Task 9: Update RetornosComparados for Configurable Benchmark

**Files:**
- Modify: `components/seguimiento/RetornosComparados.tsx`

The component already accepts `benchmarkReturns?: Record<string, number>` and `benchmarkLabel`. The change is to accept the new `BenchmarkComponent[]` config and compute benchmark returns from price data.

- [ ] **Step 1: Add benchmark returns computation API route**

Create a lightweight API that computes monthly benchmark returns from price data:

```typescript
// app/api/prices/benchmark-returns/route.ts

import { NextRequest } from "next/server";
import { requireAdvisor } from "@/lib/auth/api-auth";
import { successResponse, errorResponse } from "@/lib/api-response";
import { handleApiError } from "@/lib/api-response";
import { resolveSource, getStoredPrices, fetchPriceRange, storeInternationalPrices } from "@/lib/prices/price-service";
import type { BenchmarkComponent, DailyPrice } from "@/lib/prices/types";

async function getPricesForTicker(
  ticker: string,
  fromDate: string,
  toDate: string
): Promise<DailyPrice[]> {
  if (ticker === "UF") {
    // UF prices come from BCCH — use exchange-rates/historical API
    // For now, return empty and let the caller handle UF via spread
    return [];
  }

  const resolution = resolveSource({
    fundName: ticker,
    securityId: ticker,
    marketValue: 0,
    market: "US",
  });

  // Try stored first
  let prices = await getStoredPrices(ticker, fromDate, toDate);
  if (prices.length === 0) {
    // Fetch and store
    const fetched = await fetchPriceRange(resolution, fromDate, toDate);
    if (fetched.length > 0) {
      await storeInternationalPrices(ticker, fetched, resolution.currency, resolution.source);
      prices = fetched;
    }
  }
  return prices;
}

/**
 * Compute monthly returns for a benchmark config.
 * POST body: { benchmark: BenchmarkComponent[], fromDate: string, toDate: string }
 * Returns: { returns: Record<string, number>, label: string }
 */
export async function POST(request: NextRequest) {
  return handleApiError("benchmark-returns", async () => {
    const { error } = await requireAdvisor();
    if (error) return error;

    const { benchmark, fromDate, toDate } = (await request.json()) as {
      benchmark: BenchmarkComponent[];
      fromDate: string;
      toDate: string;
    };

    if (!benchmark || !fromDate || !toDate) {
      return errorResponse("benchmark, fromDate y toDate son requeridos", 400);
    }

    // Build label
    const label = benchmark
      .map((b) => {
        if (b.spread) return `${b.ticker} +${b.spread}%`;
        return `${(b.weight * 100).toFixed(0)}% ${b.ticker}`;
      })
      .join(" / ");

    // For each component, get monthly prices and compute returns
    const monthlyReturns: Record<string, number> = {};

    // Collect all month boundaries between fromDate and toDate
    const start = new Date(fromDate);
    const end = new Date(toDate);
    const monthEnds: string[] = [];
    const cursor = new Date(start.getFullYear(), start.getMonth() + 1, 0); // last day of start month
    while (cursor <= end) {
      monthEnds.push(cursor.toISOString().split("T")[0]);
      cursor.setMonth(cursor.getMonth() + 1);
      cursor.setDate(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0).getDate());
    }

    for (const comp of benchmark) {
      if (comp.ticker === "UF" && comp.spread != null) {
        // UF + spread: monthly return = spread / 12
        const monthlyReturn = comp.spread / 12;
        for (let i = 1; i < monthEnds.length; i++) {
          const key = monthEnds[i].substring(0, 7); // YYYY-MM
          monthlyReturns[key] = (monthlyReturns[key] || 0) + comp.weight * monthlyReturn;
        }
        continue;
      }

      // Market-based component
      const prices = await getPricesForTicker(comp.ticker, fromDate, toDate);
      if (prices.length === 0) continue;

      // Find price closest to each month end
      for (let i = 1; i < monthEnds.length; i++) {
        const prevEnd = monthEnds[i - 1];
        const currEnd = monthEnds[i];
        const key = currEnd.substring(0, 7);

        const prevPrice = findClosestPrice(prices, prevEnd);
        const currPrice = findClosestPrice(prices, currEnd);

        if (prevPrice && currPrice && prevPrice > 0) {
          const ret = ((currPrice - prevPrice) / prevPrice) * 100;
          monthlyReturns[key] = (monthlyReturns[key] || 0) + comp.weight * ret;
        }
      }
    }

    return successResponse({ returns: monthlyReturns, label });
  });
}

function findClosestPrice(prices: DailyPrice[], targetDate: string): number | null {
  // Find the price on or just before targetDate (max 7 days back)
  let best: DailyPrice | null = null;
  for (const p of prices) {
    if (p.date <= targetDate) {
      best = p;
    } else {
      break;
    }
  }
  if (!best) return null;

  // Check it's within 7 days
  const diff = (new Date(targetDate).getTime() - new Date(best.date).getTime()) / (1000 * 60 * 60 * 24);
  return diff <= 7 ? best.price : null;
}
```

- [ ] **Step 2: Commit**

```bash
git add app/api/prices/benchmark-returns/route.ts
git commit -m "feat: benchmark returns API computes monthly returns from price data"
```

---

### Task 10: Wire Benchmark into SeguimientoPage

**Files:**
- Modify: `components/seguimiento/SeguimientoPage.tsx`

This task modifies SeguimientoPage to:
1. Remove the auto-fill-prices logic (lines 198-244)
2. Add benchmark config state + fetch
3. Pass benchmark returns to RetornosComparados
4. Trigger backfill on cartola upload instead of fill-prices

- [ ] **Step 1: Add benchmark imports and state**

At the top of `SeguimientoPage.tsx`, add the import for BenchmarkConfig and new state variables. After the existing imports (around line 20), add:

```typescript
import BenchmarkConfig from "./BenchmarkConfig";
import type { BenchmarkComponent } from "@/lib/prices/types";
```

After the existing state declarations (around line 146), add:

```typescript
  const [benchmarkConfig, setBenchmarkConfig] = useState<BenchmarkComponent[] | null>(null);
  const [benchmarkReturns, setBenchmarkReturns] = useState<Record<string, number> | null>(null);
  const [benchmarkLabel, setBenchmarkLabel] = useState("UF +2%");
```

- [ ] **Step 2: Remove auto-fill-prices useEffect**

Delete the entire `useEffect` block that auto-triggers fill-prices (lines 198-244 approximately — the block that starts with `// Auto-fill prices if snapshots exist but prices are stale`).

Also remove these now-unused state variables from their declarations:
- `fillingPrices` / `setFillingPrices`
- `fillResult` / `setFillResult`
- `fillDetails` / `setFillDetails`
- `autoFillTriggered` / `setAutoFillTriggered`
- `lastPriceUpdate` / `setLastPriceUpdate`

And remove the corresponding tracking in `fetchData` (lines 170-176 that track `apiPriceSnaps`).

- [ ] **Step 3: Add benchmark returns fetch**

Add a new `useEffect` that fetches benchmark returns when data and benchmarkConfig are available. Place this after the `fetchData` useEffect:

```typescript
  // Fetch benchmark returns when config and snapshots are available
  useEffect(() => {
    if (!data || !benchmarkConfig || data.snapshots.length < 2) return;

    const cartolaSnaps = data.snapshots.filter(
      (s) => s.source === "statement" || s.source === "manual" || s.source === "excel"
    );
    if (cartolaSnaps.length < 1) return;

    const firstDate = cartolaSnaps[0].snapshot_date;
    const today = new Date().toISOString().split("T")[0];

    fetch("/api/prices/benchmark-returns", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        benchmark: benchmarkConfig,
        fromDate: firstDate,
        toDate: today,
      }),
    })
      .then((r) => r.json())
      .then((d) => {
        if (d.success) {
          setBenchmarkReturns(d.data.returns);
          setBenchmarkLabel(d.data.label);
        }
      })
      .catch(() => {});
  }, [data, benchmarkConfig]);
```

- [ ] **Step 4: Add backfill trigger after cartola upload**

In the callback where cartola upload completes (look for `setShowAddModal(false)` or the `onSave` callback in `AddSnapshotModal`), add a backfill call:

```typescript
  // After successful cartola upload, trigger price backfill
  const triggerBackfill = useCallback(async () => {
    try {
      await fetch("/api/prices/backfill", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId }),
      });
    } catch {
      // Backfill is best-effort, don't block UI
    }
  }, [clientId]);
```

Call `triggerBackfill()` after `fetchData()` in the modal close handler.

- [ ] **Step 5: Wire BenchmarkConfig and RetornosComparados**

In the JSX, add BenchmarkConfig near the chart section header. Find where `RetornosComparados` is rendered and update its props:

```tsx
{/* Near the RetornosComparados section */}
<div className="flex items-center justify-between mb-2">
  <span className="text-sm font-medium text-gb-black">Retornos</span>
  <BenchmarkConfig clientId={clientId} onBenchmarkChange={setBenchmarkConfig} />
</div>
<RetornosComparados
  snapshots={data.snapshots.filter((s) => s.source !== "api-prices")}
  benchmarkLabel={benchmarkLabel}
  benchmarkReturns={benchmarkReturns || undefined}
  benchmarkMonthlyReturn={!benchmarkReturns ? 0.5 : undefined}
/>
```

- [ ] **Step 6: Filter out api-prices snapshots from all chart components**

Where `RentabilidadPorActivo` and `PerformanceAttribution` receive snapshots, filter them:

```tsx
<RentabilidadPorActivo
  snapshots={data.snapshots.filter((s) => s.source !== "api-prices")}
/>
```

Note: `RentabilidadPorActivo` already filters to snapshots with holdings, so api-prices (which have no holdings) are already excluded. This filter is defensive.

- [ ] **Step 7: Commit**

```bash
git add components/seguimiento/SeguimientoPage.tsx
git commit -m "feat: wire benchmark config and remove auto-fill-prices from SeguimientoPage"
```

---

### Task 11: Filter api-prices from Seguimiento API

**Files:**
- Modify: `app/api/clients/[id]/seguimiento/route.ts`

- [ ] **Step 1: Add source filter to the query**

In the seguimiento API route, the Supabase query fetches all snapshots. Add a filter to exclude `api-prices` source. Find the query (around line 50-70) and add `.neq("source", "api-prices")`:

```typescript
    // Existing query — add .neq filter
    const { data: snapshots, error: snapError } = await supabase
      .from("portfolio_snapshots")
      .select("*")
      .eq("client_id", clientId)
      .neq("source", "api-prices")  // <-- ADD THIS LINE
      .gte("snapshot_date", fromDate)
      .order("snapshot_date", { ascending: true })
      .range(0, limit - 1);
```

This ensures the API no longer returns synthetic snapshots to the frontend.

- [ ] **Step 2: Commit**

```bash
git add "app/api/clients/[id]/seguimiento/route.ts"
git commit -m "feat: filter out api-prices snapshots from seguimiento API"
```

---

### Task 12: Refactor RentabilidadPorActivo to Use Price Service

**Files:**
- Modify: `components/seguimiento/RentabilidadPorActivo.tsx`

Currently this component compares `marketValueCLP` between snapshots. The refactor makes it fetch per-holding returns from the price service via a new lightweight API endpoint.

- [ ] **Step 1: Create per-holding returns API**

```typescript
// app/api/prices/holding-returns/route.ts

import { NextRequest } from "next/server";
import { requireAdvisor } from "@/lib/auth/api-auth";
import { successResponse, errorResponse } from "@/lib/api-response";
import { handleApiError } from "@/lib/api-response";
import { resolveSource, getPrice } from "@/lib/prices/price-service";
import type { HoldingForPricing } from "@/lib/prices/types";

/**
 * Compute per-holding returns between two dates using price service.
 * POST body: { holdings: HoldingForPricing[], startDate: string, endDate: string }
 * Returns: { returns: Array<{ fundName, returnPct, assetClass }> }
 */
export async function POST(request: NextRequest) {
  return handleApiError("holding-returns", async () => {
    const { error } = await requireAdvisor();
    if (error) return error;

    const { holdings, startDate, endDate } = (await request.json()) as {
      holdings: HoldingForPricing[];
      startDate: string;
      endDate: string;
    };

    if (!holdings || !startDate || !endDate) {
      return errorResponse("holdings, startDate y endDate son requeridos", 400);
    }

    const results: Array<{
      fundName: string;
      returnPct: number;
      assetClass?: string;
      startPrice?: number;
      endPrice?: number;
    }> = [];

    for (const h of holdings) {
      const resolution = resolveSource(h);

      // For CMF (Chilean funds), prices are in fondos_rentabilidades_diarias
      // which is already handled by historical-prices API. Skip for now.
      if (resolution.source === "cmf" || resolution.source === "fintual") {
        // Fallback: use snapshot values (existing behavior preserved)
        continue;
      }

      if (!resolution.symbol) continue;

      const startPt = await getPrice(resolution.symbol, startDate, resolution);
      const endPt = await getPrice(resolution.symbol, endDate, resolution);

      if (startPt && endPt && startPt.price > 0) {
        results.push({
          fundName: h.fundName,
          returnPct: ((endPt.price - startPt.price) / startPt.price) * 100,
          assetClass: h.assetClass,
          startPrice: startPt.price,
          endPrice: endPt.price,
        });
      }
    }

    return successResponse({ returns: results });
  });
}
```

- [ ] **Step 2: Commit**

```bash
git add app/api/prices/holding-returns/route.ts
git commit -m "feat: holding returns API using price service"
```

Note: `RentabilidadPorActivo` already works with snapshot values for Chilean funds (CMF). The holding-returns API adds international holdings. The component itself doesn't change yet — it will be enhanced in a follow-up to call this API for non-CMF holdings. For now the snapshot-based approach works correctly for Chilean funds which are the majority of holdings.

---

### Task 13: Update PerformanceAttribution for Price Service

**Files:**
- Modify: `components/seguimiento/PerformanceAttribution.tsx`

The current component calculates attribution from snapshot asset class values. The key fix: when only 1 cartola exists, use `holdingReturnsData` (from HoldingReturnsPanel which already fetches live quotes). The component already has this fallback at line ~150.

- [ ] **Step 1: Ensure PerformanceAttribution uses holdingReturnsData when snapshots are insufficient**

Read the current file to verify the fallback exists. The component should already work with the `holdingReturnsData` prop which is fed by `HoldingReturnsPanel` (which fetches live Yahoo/Fintual quotes). No code change needed if the fallback is properly implemented.

Verify by reading the component and confirming the guard:

```typescript
// This should already exist in the component:
if (!holdingReturnsData && snapshots.length < 2) return null;
// If holdingReturnsData exists, use its instrumentBreakdown for attribution
```

- [ ] **Step 2: Commit (if changes needed)**

```bash
git add components/seguimiento/PerformanceAttribution.tsx
git commit -m "fix: ensure PerformanceAttribution uses holdingReturnsData fallback"
```

---

### Task 14: Integration Test — End-to-End Price Flow

**Files:**
- Create: `lib/prices/integration.test.ts`

- [ ] **Step 1: Write integration test for the full price pipeline**

```typescript
// lib/prices/integration.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { resolveSource } from "./price-service";

describe("Price pipeline integration", () => {
  describe("resolveSource covers all instrument types", () => {
    it("Chilean FM → cmf", () => {
      expect(resolveSource({ fundName: "Fondo BTG", securityId: "9085", serie: "A", marketValue: 1000 }).source).toBe("cmf");
    });

    it("Chilean ETF (CFIETF) → yahoo .SN", () => {
      const r = resolveSource({ fundName: "ETF", securityId: "CFIETFIPSA", marketValue: 1000 });
      expect(r.source).toBe("yahoo");
      expect(r.symbol).toBe("CFIETFIPSA.SN");
    });

    it("US ETF → alphavantage", () => {
      const r = resolveSource({ fundName: "SPDR S&P 500", securityId: "SPY", marketValue: 5000, market: "US" });
      expect(r.source).toBe("alphavantage");
      expect(r.symbol).toBe("SPY");
    });

    it("International fund with ISIN → alphavantage", () => {
      const r = resolveSource({ fundName: "Robeco", securityId: "LU0230242504", marketValue: 3000, market: "INT" });
      expect(r.source).toBe("alphavantage");
    });

    it("Bond with CUSIP → finra", () => {
      const r = resolveSource({
        fundName: "ECOPETROL 5.875%",
        securityId: "279158AN4",
        marketValue: 10000,
        couponRate: 5.875,
        maturityDate: "2045-05-28",
      });
      expect(r.source).toBe("finra");
    });

    it("UF → bcch", () => {
      expect(resolveSource({ fundName: "UF", securityId: "UF", marketValue: 0 }).source).toBe("bcch");
    });

    it("Chilean stock on Santiago → yahoo .SN", () => {
      const r = resolveSource({ fundName: "Cencosud", securityId: "CENCOSUD.SN", marketValue: 2000 });
      expect(r.source).toBe("yahoo");
      expect(r.symbol).toBe("CENCOSUD.SN");
    });

    it("No securityId defaults to cmf", () => {
      const r = resolveSource({ fundName: "Fondo Desconocido", marketValue: 1000 });
      expect(r.source).toBe("cmf");
    });
  });
});
```

- [ ] **Step 2: Run all tests**

Run: `npx vitest run lib/prices/`
Expected: All tests PASS

- [ ] **Step 3: Commit**

```bash
git add lib/prices/integration.test.ts
git commit -m "test: integration tests for price pipeline routing"
```

---

### Task 15: Final Cleanup and Documentation

**Files:**
- Modify: `docs/superpowers/specs/2026-05-27-single-thermometer-design.md` (mark completed sections)

- [ ] **Step 1: Verify build passes**

Run: `npm run build`
Expected: Build succeeds with no errors

- [ ] **Step 2: Run all tests**

Run: `npm run test:run`
Expected: All tests pass

- [ ] **Step 3: Final commit**

```bash
git add -A
git commit -m "feat: single thermometer architecture — unified price service, configurable benchmarks, AlphaVantage integration"
```

---

## Summary of API Routes Created

| Route | Method | Purpose |
|-------|--------|---------|
| `/api/prices/backfill` | POST | Backfill prices for a client's holdings |
| `/api/prices/benchmark-returns` | POST | Compute monthly benchmark returns from config |
| `/api/prices/holding-returns` | POST | Compute per-holding returns between dates |
| `/api/clients/[id]/benchmark` | GET/PUT | Read/write benchmark config per client |

## What's NOT Changed (Preserved)

- `lib/returns/calculator.ts` — unchanged, still the source of truth for return math
- `app/api/portfolio/historical-prices/route.ts` — still used for CMF-based Chilean fund series
- `app/api/portfolio/fill-prices/route.ts` — still exists but no longer auto-triggered
- `components/seguimiento/HoldingReturnsPanel.tsx` — still fetches live quotes (will migrate to price service in future)
- `components/seguimiento/EvolucionChart.tsx` — still uses historical-prices for the time series chart
