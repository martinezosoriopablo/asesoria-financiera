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

**AI usage tracking:** All Claude API calls go through `lib/ai-usage.ts` which tracks tokens/cost per advisor per month in `advisor_ai_usage` table. Advisors choose model (Sonnet 4 default, Opus 4 premium) in profile settings.

**Fichas CMF extraction:** `lib/ficha-extract.ts` downloads and extracts data from CMF fund folletos (PDF). Uses Gemini 2.5 Flash as primary extractor (sends PDF as base64 inline), regex as fallback. Returns `ExtractionResult = { data: ExtractedFichaData; gemini_exhausted?: boolean }`. The `extraction_method` field exists only in the TS interface, NOT as a DB column — always strip it before upsert: `const { extraction_method: _em, ...dbFields } = extracted;`. Stored in `fund_fichas` (FM, PK: fo_run+fm_serie) and `fi_fichas` (FI, PK: fi_rut+fi_serie).

**Shared text utilities:** `lib/text.ts` (stripAccents, normalizeText), `lib/fund-utils.ts` (detectSerieCode), `lib/constants/chilean-finance.ts` (CHILEAN_TICKERS). Do NOT define these locally in routes.

**Questionnaire frequency:** Per-client configurable (`questionnaire_frequency` column: annual/semi-annual/quarterly/biennial). After saving risk profile, `next_questionnaire_date` is computed. ClientDetail shows overdue warning badge.

**Broker email generator:** `/api/portfolio/generar-carta-corredor` generates a formal Chilean-style email draft via Claude. Client copies and sends from their own email. Triggered from RadiografiaCartola component via `CartaCorredorModal`.

**Preferred funds:** Advisors manage a preferred funds list at `/advisor/fondos` (CRUD+PATCH via `/api/advisor/preferred-funds`). Category uses a fixed dropdown (RV Nacional, RF Internacional, Balanceado, etc.). The GET endpoint enriches each fund with ficha data (TAC, beneficio tributario, objetivo) from `fund_fichas` (FM) and `fi_fichas` (FI). Per-client `fund_selection_mode` (only_my_list / my_list_with_fallback / all_funds). AI cartera generation injects preferred funds into the prompt as soft constraint.

### Data flow for prices

1. **CMF** is the canonical source for Chilean fund prices (fondos mutuos + fondos de inversion). Scraped via `lib/cmf-auto.ts` and `lib/cmf-fi-auto.ts`.
2. **Gemini 2.5 Flash** (`lib/ficha-extract.ts`) extracts structured data from CMF fund folleto PDFs (TAC, horizonte, tolerancia riesgo, objetivo, beneficio tributario). Paid tier. Env: `GEMINI_API_KEY`.
3. **AAFM** sync (`lib/aafm-sync.ts`) only works from localhost — AAFM blocks Vercel IPs.
4. **Fintual API** (`lib/fintual-api.ts`) for Fintual-specific funds.
5. **Yahoo Finance** (`yahoo-finance2`) for international ETFs/stocks.
6. Cron jobs in `vercel.json` run weekdays: Fintual sync (10:00), report distribution (12:00), drift check (13:00), CMF auto-sync (21:00).

### Database

Supabase Postgres with RLS on all sensitive tables. Migrations in `supabase/migrations/` (chronological, `YYYYMMDD_description.sql`). **Max rows per request set to 5000** in Supabase dashboard (default was 1000). For queries that may exceed this (e.g., `vw_fondos_completo` ~3000 rows), always paginate with `.range()` as a safety net.

Key tables: `clients`, `advisors`, `portfolio_snapshots`, `risk_profiles`, `client_cartolas`, `messages`, `direct_portfolios`, `direct_portfolio_holdings`, `client_reports`, `client_report_config`, `client_advisors` (sharing), `advisor_ai_usage`, `tac_upload_log`, `fund_fichas` (FM folleto data), `fi_fichas` (FI folleto data), `fondos_inversion` (FI catalog).

RLS uses `get_accessible_advisor_ids()` (self + subordinates) and `get_accessible_client_ids()` (own + subordinates + shared + orphan clients).

### Directory layout

- `app/` — Next.js App Router pages and API routes
- `app/(advisor-shell)/` — All advisor-facing pages (route group with sidebar layout). Contains: `advisor/`, `clients/`, `fund-center/`, `portfolio-designer/`, `analisis-cartola/`, `calculadora-apv/`, `educacion-financiera/`, `admin/`, `dashboard/`, `direct-portfolio/`, `modelo-cartera/`, `portfolio-comparison/`, `nav-upload/`
- `app/api/` — ~112 API route handlers
- `app/(portal)/` — Client portal pages (route group)
- `components/` — React components organized by domain (seguimiento, portfolio, risk, market, etc.)
- `lib/returns/` — Returns calculator (pure functions, replaces TWR)
- `lib/auth/` — Auth helpers (`api-auth.ts` for API routes, `require-client.ts` for portal)
- `lib/supabase/` — Supabase client factories (browser, server, middleware)
- `lib/risk/` — Risk scoring, benchmarks, questionnaire logic
- `scripts/` — One-off Node.js scripts (migrations, imports, syncs). Excluded from tsconfig.
- `supabase/migrations/` — SQL migration files
- `data/cmf/` — CMF scraped data files

## Language

The codebase, DB columns, UI, and comments are primarily in Spanish. Variable names mix Spanish and English. API responses use Spanish error messages.
