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
- **Advisor** — `/advisor/*`, `/clients/*`, `/portfolio-designer`, `/fund-center`, etc. Protected by middleware (redirects unauthenticated to `/login`).
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

**Shared text utilities:** `lib/text.ts` (stripAccents, normalizeText), `lib/fund-utils.ts` (detectSerieCode), `lib/constants/chilean-finance.ts` (CHILEAN_TICKERS). Do NOT define these locally in routes.

### Data flow for prices

1. **CMF** is the canonical source for Chilean fund prices (fondos mutuos + fondos de inversion). Scraped via `lib/cmf-auto.ts` and `lib/cmf-fi-auto.ts`.
2. **AAFM** sync (`lib/aafm-sync.ts`) only works from localhost — AAFM blocks Vercel IPs.
3. **Fintual API** (`lib/fintual-api.ts`) for Fintual-specific funds.
4. **Yahoo Finance** (`yahoo-finance2`) for international ETFs/stocks.
5. Cron jobs in `vercel.json` run weekdays: Fintual sync (10:00), report distribution (12:00), drift check (13:00), CMF auto-sync (21:00).

### Database

Supabase Postgres with RLS on all sensitive tables. Migrations in `supabase/migrations/` (chronological, `YYYYMMDD_description.sql`).

Key tables: `clients`, `advisors`, `portfolio_snapshots`, `risk_profiles`, `client_cartolas`, `messages`, `direct_portfolios`, `direct_portfolio_holdings`, `client_reports`, `client_report_config`, `client_advisors` (sharing), `advisor_ai_usage`, `tac_upload_log`.

RLS uses `get_accessible_advisor_ids()` (self + subordinates) and `get_accessible_client_ids()` (own + subordinates + shared + orphan clients).

### Directory layout

- `app/` — Next.js App Router pages and API routes
- `app/api/` — ~90 API route handlers
- `app/(portal)/` — Client portal pages (route group)
- `components/` — React components organized by domain (seguimiento, portfolio, risk, market, etc.)
- `lib/` — Shared utilities, API clients, business logic
- `lib/returns/` — Returns calculator (pure functions, replaces TWR)
- `lib/auth/` — Auth helpers (`api-auth.ts` for API routes, `require-client.ts` for portal)
- `lib/supabase/` — Supabase client factories (browser, server, middleware)
- `lib/risk/` — Risk scoring, benchmarks, questionnaire logic
- `scripts/` — One-off Node.js scripts (migrations, imports, syncs). Excluded from tsconfig.
- `supabase/migrations/` — SQL migration files
- `data/cmf/` — CMF scraped data files

## Language

The codebase, DB columns, UI, and comments are primarily in Spanish. Variable names mix Spanish and English. API responses use Spanish error messages.
