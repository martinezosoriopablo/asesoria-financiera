# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project overview

Greybark Advisors — financial advisory platform for Chilean independent advisors. Manages clients, risk profiling, portfolio analysis (fondos mutuos, FI, ETFs, stocks, bonds), and periodic reporting. Non-transactional: advisors recommend, clients execute at their own custodian.

## Commands

```bash
npm run dev          # Start dev server (Next.js)
npm run build        # Production build
npm run lint         # ESLint (flat config, next/core-web-vitals + typescript)
npm test             # Vitest in watch mode
npm run test:run     # Vitest single run
npx vitest run lib/rate-limit.test.ts   # Run a single test file
```

## Architecture

**Stack:** Next.js 16 (App Router) + React 19 + Supabase (Postgres + Auth + RLS) + Tailwind v4 + Vercel

**Two user roles with separate route trees:**
- **Advisor** — `/advisor/*`, `/clients/*`, `/portfolio-designer`, `/fund-center`, etc. All advisor routes live under `app/(advisor-shell)/` route group (no URL impact). The route group layout provides the persistent sidebar (`AdvisorSidebar`) with navigation, notifications, and user menu. Protected by middleware (redirects unauthenticated to `/login`).
- **Client** — `/portal/*` (inside `app/(portal)/`). Protected by middleware checking `active_role === 'client'`. Advisors are redirected away from portal routes and vice versa.

**Role detection:** `user.user_metadata.active_role` (falls back to `user.user_metadata.role`). Switchable via `/api/auth/switch-role`.

### Key patterns

**API route auth:** Use `requireAuth()`, `requireAdvisor()`, or `requireAdmin()` from `lib/auth/api-auth.ts`. These return `{ user, advisor, error }` — check `if (error) return error` before proceeding.

**Service role client:** After auth check, use `createAdminClient()` from `lib/auth/api-auth.ts` to get a Supabase client that bypasses RLS. Never use service role without prior auth verification.

**API responses:** Use `successResponse()` and `errorResponse()` from `lib/api-response.ts`. Wrap handler logic in `handleApiError("route-name", async () => { ... })` for centralized error handling.

**Rate limiting:** `applyRateLimit(request, "route-name", { limit: N })` from `lib/rate-limit.ts` using Upstash Redis (falls back to in-memory).

**Path alias:** `@/` maps to project root. Use `@/lib/...`, `@/components/...`, etc.

**Returns calculation:** Simple returns per position via `lib/returns/calculator.ts`. Rule: < 365 days = simple return (never annualize), >= 365 days = annualized. No TWR/Sharpe — those were removed.

**HoldingReturnsPanel:** Toggle "Desde Cartola" / "Desde Compra" switches return base between cartola market price and cost basis. All marketValues are CLP-converted (USD×usdRate, UF×ufRate). Weights recalculated AFTER totalValue (non-bond+bond) via `final*Holdings` useMemos. Bonds: `costBasisPricePct` (always real) for MV/devengo/duration; `purchasePricePct` (mode-dependent) only for return %.

**PerformanceAttribution:** Computation in `usePerformanceCalculations` hook, JSX in PerformanceAttribution.tsx (4 inline sub-components: AssetClassSection, PositionSection, BenchmarkSection, ComparisonSection). Position contributions = `(finalCLP - initialCLP) / portfolioInitialCLP × 100` (captures price + FX impact). For new holdings not in first snapshot (initCLP=0), uses `h.contribution` from HoldingReturnsPanel instead of inflating with full marketValue. Initial CLP from snapshot `marketValueCLP` or proportion × total_value. Benchmark comparison shows allocation effect + residual (no Brinson 3-effect — lacks per-class benchmark indices). Sorted highest→lowest contribution (green top, red bottom), all positions shown.

**Composition boxes (RV/RF/Alt/Caja):** Initial values derived from holdingReturnsData: `marketValue × (purchasePrice / currentPrice)` per holding. NOT from snapshot stored class values (those may have classification mismatches). Final values from live holdingReturnsData directly.

**Snapshot data note:** `exchangeRates` is sent from ReviewSnapshotModal but NOT persisted as a DB column. Only `marketValueCLP` per holding (in JSONB) is saved. To reconstruct historical CLP values, use `marketValueCLP` or derive from proportion × `total_value`.

**AI usage tracking:** All Claude API calls go through `lib/ai-usage.ts` which tracks tokens/cost per advisor per month in `advisor_ai_usage` table. Advisors choose model (Sonnet 4 default, Opus 4 premium) in profile settings.

**Fichas CMF extraction:** `lib/ficha-extract.ts` downloads and extracts data from CMF fund folletos (PDF). Uses Gemini 2.5 Flash as primary extractor (sends PDF as base64 inline), regex as fallback. Returns `ExtractionResult = { data: ExtractedFichaData; gemini_exhausted?: boolean }`. The `extraction_method` field exists only in the TS interface, NOT as a DB column — always strip it before upsert: `const { extraction_method: _em, ...dbFields } = extracted;`. Stored in `fund_fichas` (FM, PK: fo_run+fm_serie) and `fi_fichas` (FI, PK: fi_rut+fi_serie).

**Shared text utilities:** `lib/text.ts` (stripAccents, normalizeText), `lib/fund-utils.ts` (detectSerieCode), `lib/constants/chilean-finance.ts` (CHILEAN_TICKERS). Do NOT define these locally in routes.

**Portfolio classification:** `lib/portfolio/classify.ts` (detectCurrencyFromName, assetTypeToClass, classifyFund) and `lib/portfolio/currency.ts` (toCLP, fromCLP with ExchangeRates interface). Do NOT define these locally in components.

**ErrorBoundary:** `components/shared/ErrorBoundary.tsx` wraps the advisor shell layout. Add to new route groups as needed.

**Price service logging:** All fallback chains in `lib/prices/price-service.ts` log warnings when primary source fails. EODHD uses a circuit breaker (18 calls/day window) via `lib/prices/circuit-breaker.ts`.

**Questionnaire frequency:** Per-client configurable (`questionnaire_frequency` column: annual/semi-annual/quarterly/biennial). After saving risk profile, `next_questionnaire_date` is computed. ClientDetail shows overdue warning badge.

**Broker email generator:** `/api/portfolio/generar-carta-corredor` generates a formal Chilean-style email draft via Claude. Client copies and sends from their own email. Triggered from RadiografiaCartola component via `CartaCorredorModal`.

**Preferred funds:** Advisors manage a preferred funds list at `/advisor/fondos` (CRUD+PATCH via `/api/advisor/preferred-funds`). Category uses a fixed dropdown (RV Nacional, RF Internacional, Balanceado, etc.). The GET endpoint enriches each fund with ficha data (TAC, beneficio tributario, objetivo) from `fund_fichas` (FM) and `fi_fichas` (FI). Per-client `fund_selection_mode` (only_my_list / my_list_with_fallback / all_funds). AI cartera generation injects preferred funds into the prompt as soft constraint.

### Data flow for prices

1. **CMF** is the canonical source for Chilean fund prices (fondos mutuos + fondos de inversion). Scraped via `lib/cmf-auto.ts` and `lib/cmf-fi-auto.ts`.
2. **Gemini 2.5 Flash** (`lib/ficha-extract.ts`) extracts structured data from CMF fund folleto PDFs (TAC, horizonte, tolerancia riesgo, objetivo, beneficio tributario). Paid tier. Env: `GEMINI_API_KEY`.
3. **AAFM** sync (`lib/aafm-sync.ts`) only works from localhost — AAFM blocks Vercel IPs.
4. **Fintual API** (`lib/fintual-api.ts`) for Fintual-specific funds.
5. **Yahoo Finance** (raw v8 API, NOT `yahoo-finance2` library) for international ETFs/stocks.
6. Cron jobs in `vercel.json` run weekdays: Fintual sync (10:00), report distribution (12:00), drift check (13:00), CMF auto-sync (21:00).

**Unified price service** (`lib/prices/`): Single-thermometer architecture that routes any holding to its correct price source. Key files:
- `types.ts` — `PriceSource`, `HoldingForPricing`, `BenchmarkComponent`, `DailyPrice`
- `price-service.ts` — `resolveSource()` (pure routing: FX→bcch, RUN→cmf, CFIETF/CFI→yahoo, Chilean ADR→cl-adr, CUSIP en INTL_FUND_MAP→eodhd/yahoo, CUSIP-bond→finra, market CL→yahoo(.SN), US/INT→alphavantage, .SN→yahoo, fallback→cmf), `fetchPriceRange()`, `fetchLatestPrice()`, DB ops for `international_prices` table, `backfillSymbol()`
- `price-service.ts` — `INTL_FUND_MAP`: Mapeo CUSIP→fuente para fondos UCITS internacionales (Raymond James). Cada entry tiene `eodhd` (ISIN.EUFUND) y/o `yahoo` (Morningstar ID) + `currency`. EODHD es primario con circuit breaker (18 calls/día), Yahoo es fallback automático. Fondos: DWS LatAm (L2R330245→0P0000XBML), BNY Mellon HY (G1R06N212→0P00019BP0), Jupiter Merian (G6016L337→0P00000ICR), UBAM (L9381G101→0P00000AZP).
- `alphavantage.ts` — AlphaVantage client (daily prices + quotes). Env: `ALPHAVANTAGE_API_KEY`.
- `yahoo.ts` — Yahoo Finance wrapper (historical + quotes) using raw v8 API (NOT the `yahoo-finance2` library which switched to v3).
- `eodhd.ts` — EODHD client for additional price data. Env: `EODHD_API_KEY`.

**Price API routes:**
- `POST /api/prices/backfill` — Backfills international prices for a client's holdings (AV/Yahoo sources only)
- `GET /api/prices/quote` — Single quote for a symbol
- `GET /api/prices/historical` — Historical range for a symbol
- `GET /api/benchmark/config` + `PUT /api/benchmark/config` — Per-client benchmark configuration (stored in `clients.benchmark_config` JSONB)
- `POST /api/portfolio/historical-prices` — Dot-product portfolio evolution: accepts `holdings` (by RUN), `holdingsByName` (name-matching), and `internationalHoldings` (Yahoo/AV). Processes international holdings in parallel via `Promise.allSettled`. Requires ≥50% of instruments to have data per date (not all).
- `POST /api/portfolio/prices-at-date` — Per-holding prices at two dates for return calculation. On-demand Yahoo/AV fallback when `international_prices` DB is empty. **CRÍTICO: holdings internacionales (resueltos a EODHD/Yahoo/AV por `resolveSource`) NUNCA deben caer al fallback de name-matching de fondos chilenos (`getChileanFundPriceByName`). El guard `isInternational` lo impide. Sin él, un fondo USD como "DWS Invest Latin American" matchea un fondo chileno CLP y produce retornos absurdos (~9900%). NUNCA eliminar este guard.**

**Seguimiento API filters:** The `GET /api/clients/[id]/seguimiento` route excludes `source=api-prices` snapshots to avoid polluting manual cartola tracking with auto-generated price snapshots.

### Database

Supabase Postgres with RLS on all sensitive tables. Migrations in `supabase/migrations/` (chronological, `YYYYMMDD_description.sql`). **Max rows per request set to 5000** in Supabase dashboard (default was 1000). For queries that may exceed this (e.g., `vw_fondos_completo` ~3000 rows), always paginate with `.range()` as a safety net.

Key tables: `clients`, `advisors`, `portfolio_snapshots`, `risk_profiles`, `client_cartolas`, `messages`, `direct_portfolios`, `direct_portfolio_holdings`, `client_reports`, `client_report_config`, `client_advisors` (sharing), `advisor_ai_usage`, `tac_upload_log`, `fund_fichas` (FM folleto data), `fi_fichas` (FI folleto data), `fondos_inversion` (FI catalog), `international_prices` (ticker+price_date→close_price, for AV/Yahoo prices), `client_monthly_closings` (cierre mensual por cliente), `dividend_history` (historial de dividendos). **NOTE:** DB column is `ticker`, not `symbol`. Code maps `SourceResolution.symbol` → DB `ticker`. Clients table has `display_currency` column and `servicios_adicionales` JSONB.

RLS uses `get_accessible_advisor_ids()` (self + subordinates) and `get_accessible_client_ids()` (own + subordinates + shared + orphan clients).

### Directory layout

- `app/` — Next.js App Router pages and API routes
- `app/(advisor-shell)/` — All advisor-facing pages (route group with sidebar layout). Contains: `advisor/`, `clients/`, `fund-center/`, `portfolio-designer/`, `analisis-cartola/`, `calculadora-apv/`, `educacion-financiera/`, `admin/`, `dashboard/`, `direct-portfolio/`, `modelo-cartera/`, `portfolio-comparison/`, `nav-upload/`
- `app/api/` — ~149 API route handlers
- `app/(portal)/` — Client portal pages (route group)
- `components/` — React components organized by domain (seguimiento, portfolio, risk, market, etc.)
- `components/seguimiento/hooks/` — Extracted hooks: useSeguimientoData (state+fetch+handlers), useSeguimientoEmail (email assembly), usePerformanceCalculations (attribution logic), useExchangeRates, useHistoricalSeries, useBenchmarkConfig, useSnapshotExchangeRates, useAutoMatch, useSnapshotForm, useHoldingQuotes, useHoldingSummaries, useBondCalculations, useXrayProposal
- `components/seguimiento/` — Sub-components: SeguimientoHeader, SeguimientoSummaryCards, CompositionBoxes, CartolaHistory, RebalancingTable, HoldingsEditTable, AutoMatchSuggestions, XraySummaryCards, XrayHoldingsTable, XrayProposalTable, XrayTaxSummary, XrayReportSection
- `components/clients/hooks/` — Extracted hooks: useClientData, useClientModals
- `components/clients/ClientInfoCard.tsx` — Client info card sub-component
- `lib/prices/` — Unified price service (source routing, AV/Yahoo/EODHD clients, DB ops, 34 tests)
- `lib/returns/` — Returns calculator (pure functions, replaces TWR)
- `lib/bonds/` — Bond utilities (duration, accrued interest calculations + tests)
- `lib/auth/` — Auth helpers (`api-auth.ts` for API routes, `require-client.ts` for portal)
- `lib/supabase/` — Supabase client factories (browser, server, middleware)
- `lib/risk/` — Risk scoring, benchmarks, questionnaire logic
- `scripts/` — One-off Node.js scripts (migrations, imports, syncs). Excluded from tsconfig.
- `supabase/migrations/` — SQL migration files
- `data/cmf/` — CMF scraped data files

## Language

The codebase, DB columns, UI, and comments are primarily in Spanish. Variable names mix Spanish and English. API responses use Spanish error messages.
