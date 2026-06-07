# Single Thermometer Architecture

> **Principle**: All return calculations use market price feeds. Cartola defines portfolio composition only. One data source, one calculation method, consistent numbers everywhere.

## Problem

Currently, return calculations are fragmented across 6+ components, each using different data sources:

- **PerformanceAttribution**: Compares `snapshot[0].holdings` vs `snapshot[-1].holdings` market values
- **RentabilidadPorActivo**: Compares holdings CLP values between consecutive snapshot pairs
- **HoldingReturnsPanel**: Fetches live Yahoo quotes, compares vs cartola price
- **RetornosComparados**: Compares `total_value` between snapshots
- **Summary cards (1M/3M/6M/1Y/YTD)**: Uses `lib/returns/calculator.ts` with historical price series
- **fill-prices pipeline**: Generates `api-prices` snapshots (no holdings, just recalculated total_value)

This causes inconsistencies: the same holding can show different returns in different panels. The `api-prices` snapshots mix with cartola snapshots creating confusion.

## Design Decisions

### D1: AlphaVantage as primary for international prices, Yahoo as fallback

**AlphaVantage** (paid subscription, 75 calls/min, `ALPHA_VANTAGE_API_KEY` in env):
- Primary source for international ETFs, stocks, ADRs
- Better data quality and reliability than Yahoo
- Currently unused despite being paid

**Yahoo Finance** (`yahoo-finance2`):
- Fallback when AlphaVantage fails or for edge cases
- Also handles Chilean `.SN` suffix instruments

**CMF**: Remains canonical for Chilean fondos mutuos and fondos de inversion (unchanged).

**FINRA/TRACE**: Remains source for US corporate bonds (unchanged).

**BCCH**: Remains source for USD/CLP and UF exchange rates (unchanged).

### D2: Hybrid price storage — DB for historical, on-demand for today

- **Historical prices**: Stored in DB tables, backfilled on cartola upload
- **Today's price**: Fetched on-demand, cached briefly (5-15 min)
- Avoids stale "today" values while keeping fast historical queries

### D3: New table for international prices, keep Chilean table separate

```sql
CREATE TABLE international_prices (
  id BIGSERIAL PRIMARY KEY,
  symbol TEXT NOT NULL,           -- e.g. "SPY", "AAPL", "EEM"
  price_date DATE NOT NULL,
  close_price NUMERIC(18,6) NOT NULL,
  currency TEXT NOT NULL DEFAULT 'USD',  -- always store in original currency
  source TEXT NOT NULL,           -- 'alphavantage' | 'yahoo' | 'finra'
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(symbol, price_date)
);

CREATE INDEX idx_intl_prices_symbol_date ON international_prices(symbol, price_date DESC);
```

Chilean fund prices stay in `fondos_rentabilidades_diarias` (CMF source). Separation is clean: different sources, different update cadences, different schemas.

### D4: Eliminate `api-prices` snapshots

The `fill-prices` pipeline that creates synthetic `api-prices` snapshots is eliminated. Instead:

- **Cartola snapshots** (`statement`/`manual`/`excel`) define composition (holdings + quantities)
- **Market prices** (from price tables) provide valuation at any date
- **Portfolio value at date T** = SUM(holdings_i.quantity * price_i(T) * fx_rate(T))

This means `portfolio_snapshots` only contains real cartola uploads. No more phantom snapshots polluting the timeline.

### D5: Backfill from first cartola date (not 1Y back from today)

When a cartola is uploaded:
1. Determine the cartola date
2. For each holding, backfill prices from cartola date to today
3. AlphaVantage `TIME_SERIES_DAILY` returns up to 20 years — one call per symbol
4. CMF backfill already exists and works

This gives us the full price history from the moment the client's portfolio was established.

### D6: Configurable benchmark per client

Benchmark is configured by the advisor (not the client) and stored per client:

```sql
ALTER TABLE clients ADD COLUMN benchmark_config JSONB;
-- Example: [{"ticker": "ACWI", "weight": 0.8}, {"ticker": "AGG", "weight": 0.2}]
-- Example: [{"ticker": "UF", "weight": 1.0, "spread": 2.0}]  -- UF + 2%
```

**Presets** (hardcoded in frontend):
- UF + 2% (default)
- UF + 3%
- 60/40 Global (60% ACWI + 40% AGG)
- 80/20 Agresivo (80% ACWI + 20% AGG)
- MSCI ACWI 100%
- Custom (advisor picks tickers + weights)

**Benchmark return calculation**: Weighted sum of component returns. Each component's return comes from the same price service (AlphaVantage/Yahoo for international indices, BCCH for UF).

**UI**: Small config panel in the client's seguimiento page. Advisor selects preset or builds custom. Saved to `clients.benchmark_config`. RetornosComparados reads this config.

## Unified Price Service

New module: `lib/prices/price-service.ts`

```typescript
interface PricePoint {
  date: string;       // YYYY-MM-DD
  price: number;      // in original currency
  currency: string;   // 'CLP' | 'USD' | 'EUR'
  source: string;     // 'cmf' | 'alphavantage' | 'yahoo' | 'finra' | 'bcch'
}

// Core functions:
getPrice(symbol: string, date: string): Promise<PricePoint | null>
getPriceRange(symbol: string, from: string, to: string): Promise<PricePoint[]>
getLatestPrice(symbol: string): Promise<PricePoint | null>
backfillPrices(symbol: string, from: string): Promise<number>  // returns count

// Portfolio-level:
getPortfolioValue(holdings: Holding[], date: string, fxRates: FxRates): Promise<number>
getPortfolioSeries(holdings: Holding[], from: string, to: string): Promise<{date: string, value: number}[]>
```

**Resolution order by instrument type:**
1. **Chilean FM/FI** (RUN-based): `fondos_rentabilidades_diarias` (CMF)
2. **Chilean stocks/ETFs** (`.SN`): AlphaVantage > Yahoo
3. **International ETFs/stocks**: AlphaVantage > Yahoo
4. **Bonds (CUSIP)**: FINRA/TRACE
5. **FX rates (USD, UF)**: BCCH > mindicador.cl

**Caching**:
- Historical (DB): permanent, backfilled once
- Today's price: in-memory cache, 10-min TTL
- FX rates: in-memory cache, 30-min TTL

## Refactored Components

### PerformanceAttribution
- **Before**: Compares market values from two snapshots' holdings arrays
- **After**: For each holding in the latest cartola, fetch price at cartola date and price today (or at selected date) from price service. Calculate return = (price_end - price_start) / price_start. Weight by portfolio allocation.

### RentabilidadPorActivo
- **Before**: Compares `marketValueCLP` between snapshot pairs
- **After**: For each holding, use price service to get price at month start and month end. Calculate per-holding return from prices. Month navigation stays the same.

### RetornosComparados
- **Before**: Compares `total_value` between snapshots, hardcoded UF+2% benchmark
- **After**: Uses `getPortfolioSeries()` to compute portfolio value at month boundaries. Benchmark returns from price service using `clients.benchmark_config`. Comparison series optional (e.g., another client or model portfolio).

### HoldingReturnsPanel
- **Before**: Fetches Yahoo quotes independently, has its own price logic
- **After**: Uses price service `getLatestPrice()` + `getPrice(symbol, cartolaDate)`. Single source.

### Summary cards (1M/3M/6M/1Y/YTD)
- **Before**: Uses `lib/returns/calculator.ts` with data from mixed snapshot sources
- **After**: Uses `getPortfolioSeries()` to get value at T-1M, T-3M, etc. Calculator logic stays the same (simple return < 365d, annualized >= 365d).

### fill-prices pipeline
- **Eliminated**. No more `api-prices` snapshots. The cron job that ran fill-prices is removed. Historical price data lives in price tables, not in snapshot rows.

## AlphaVantage Integration

New module: `lib/prices/alphavantage.ts`

```typescript
// TIME_SERIES_DAILY (full history, 1 call per symbol)
fetchDailyPrices(symbol: string): Promise<{date: string, close: number}[]>

// GLOBAL_QUOTE (real-time, 1 call)
fetchQuote(symbol: string): Promise<{price: number, date: string}>

// CURRENCY_EXCHANGE_RATE
fetchFxRate(from: string, to: string): Promise<number>
```

Rate limit: 75 calls/min. Use a simple queue/throttle. Each backfill = 1 call (TIME_SERIES_DAILY returns full history). Real-time quotes during page load = 1 call per unique symbol.

## Migration Path

1. **Create `international_prices` table** + `benchmark_config` column on clients
2. **Build `lib/prices/` module** (alphavantage.ts, price-service.ts)
3. **Backfill trigger**: On cartola upload, backfill prices for all holdings
4. **Refactor components** one by one to use price service (PerformanceAttribution first as proof)
5. **Add benchmark config UI** to seguimiento page
6. **Update RetornosComparados** to use configurable benchmark
7. **Deprecate fill-prices**: Stop creating api-prices snapshots
8. **Clean up**: Remove fill-prices route, remove api-prices snapshot handling from seguimiento API

## Out of Scope

- Portfolio Designer changes (separate project, radiografia absorbs comparison mode later)
- Bond pricing improvements (FINRA integration already exists)
- Dividend adjustments (separate concern, handled by existing dividend tracking)
- Model portfolio comparison in RetornosComparados (future: use model portfolio returns as comparison series)
