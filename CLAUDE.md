# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project overview

Global Advisors — financial advisory platform for Chilean independent advisors. Manages clients, risk profiling, portfolio analysis (fondos mutuos, FI, ETFs, stocks, bonds), and periodic reporting. Non-transactional: advisors recommend, clients execute at their own custodian.

## Brand (Global Advisors)

Canonical palette — keep UI, emails, and reports consistent with the marketing site:

- Navy (bg/header) `#05162C` · Navy-2 `#0A2140` · Panels `#0F2D54`
- Ink (text on dark) `#EEF3FA` · Muted (secondary) `#9DB0CA`
- Azure (links/data/CTA) `#5AA0E6`
- Gold `#C99A5E` · Gold-2 `#E3B877` · **Copper `#EB7838`** (accent: logo bars, rules, key figures)
- Up `#2ECC8F` / Down `#EF5B5B`

Rule: navy dominates; copper/gold are accents (never large fills); azure for actions/data; green/red only for market variations.

**Platform (app) palette — `app/globals.css` tokens (light scheme, aligned with the globalcompanies site).** The advisor app + client portal use a warm off-white surface, not the dark marketing navy. This is the canonical source for `--gb-*`/`--gl-*` tokens (use the tokens/Tailwind classes, don't hardcode hex):
- Surface `#F7F6F2` (`--background`/`--gb-light`) · Border `#E7E4DD` (`--gb-border`)
- Navy `#0B2140` (`--gb-black`/`--gb-sidebar`; canonical app navy) · Navy-dark `#1A3558` (`--gb-dark`) · Sidebar-hover `#132D52`
- Text `#2C3A4E` (`--foreground`) · Gray `#6E7787` (`--gb-gray`) · Light-gray `#a9a49c`
- Copper primary `#EB7838` (`--gb-primary`/`--gb-accent`) · Copper-dark `#D0682E` · Copper-light `#FEF3EC`
- Azure `#5AA0E6` (`--gb-info`; links/CTA/single-series chart lines) · Up `#2ECC8F` (`--gb-success`) · Down `#EF5B5B` (`--gb-danger`)
- Emails/PDFs (no CSS vars) hardcode these hex directly. Chart **categorical** palettes (per-asset-class color maps, multi-series arrays) are data colors — NOT brand chrome — leave them.

Fonts (advisor app + client portal + marketing site, aligned Aug 2026): **Source Serif 4** (serif display/numbers), **Inter** (UI/body), **JetBrains Mono** (data). Loaded via the `<link>` in `app/layout.tsx` and the `--font-serif`/`--font-sans`/`--font-mono` tokens in `app/globals.css` (the `(public)` route group loads the same families via `next/font`). Previously Fraunces / Hanken Grotesk / IBM Plex Mono — do NOT reintroduce those. Emails/PDFs use their own system-font stack (`-apple-system, …, sans-serif` + `monospace`), not the webfonts, so where webfonts may not load the fallback is Georgia / Arial / Consolas.

Logo: inline SVG in `components/landing/GlobalLogo.tsx` — G icon with copper `#EB7838` bars, `currentColor` paths (white on dark via `variant="light"`, navy `#0B2140` on light via `variant="dark"`). `GBrandMark.tsx` is a simplified G+bars mark. Master brand = **Global Companies**; Wealth / Planning / Properties / Markets are the four service lines (Markets = departamento de estudios / research aumentado por IA).

**Marketing site:** 5 static HTML pages in `public/` (autocontenidos: CSS/JS inline, imágenes en `public/media/`): Global Companies (home) + 4 divisiones Wealth / Planning / Properties / Markets. `app/page.tsx` redirects `/` → `/global-companies.html`; middleware excludes `.html` from auth. Nav = 4 division boxes + "Portal Clientes" (`/portal/login`) / "Acceso Asesores" (`/login`). Cada división lleva SU logo (header 20px, footer siempre Global Companies 26px), generados como PNG blanco desde los SVG oficiales de Figma vía `sharp` (recolor `#111111`→`#FFFFFF`, barras cobre intactas, escala a altura uniforme) — NO el SVG de impresión inline (borroso). Tarjetas de servicio = efecto imagen de fondo velada + hover-reveal (visible siempre en táctil vía `@media (hover:hover) and (pointer:fine)`). Textura de letras griegas en secciones claras + bandas de foto fija (parallax). Foco por división: Wealth = universo invertible (acciones/RF/fondos/ETF/alternativos); Planning = ahorro, inmobiliario, seguros, estructuración patrimonial; Properties = administración + arriendo de departamentos (modelo tipo Rentex); Markets = research IA de Global Companies + CRM para asesores. Copy sobrio, impersonal/usted, sin tutear, sin em-dashes. Trabajo en rama `sitio-web-marca` (PR a `master`).

Compliance (CMF): no invented returns or track records (illustrative figures must be labeled); "IA" never "AGI"; mandatory risk disclaimer on public-facing reports.

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

**Bond price fallback:** `resolveSource()` routes bonds (CUSIP with coupon+maturity) to "finra", but `fetchPriceRange()` has NO FINRA historical handler → returns empty array → `returnPct: null`. Working bond pipeline: `useHoldingQuotes` → `/api/bonds/latest-prices` → `bond_prices` table → `useBondCalculations`. Three consumers inject bond returns from `holdingReturnsData.bondHoldings` as fallback when `prices-at-date` returns null: `RentabilidadPorActivo.tsx`, `usePerformanceCalculations.ts`, `useSeguimientoEmail.ts` (fetchMonthlyFromAPI). Pattern: track `coveredNames` Set from API results, then iterate `bondHoldings` for uncovered bonds.

**PerformanceAttribution:** Computation in `usePerformanceCalculations` hook, JSX in PerformanceAttribution.tsx (4 inline sub-components: AssetClassSection, PositionSection, BenchmarkSection, ComparisonSection). Position contributions = `(finalCLP - initialCLP) / portfolioInitialCLP × 100` (captures price + FX impact). For new holdings not in first snapshot (initCLP=0), uses `h.contribution` from HoldingReturnsPanel instead of inflating with full marketValue. Initial CLP from snapshot `marketValueCLP` or proportion × total_value. Benchmark comparison shows allocation effect + residual (no Brinson 3-effect — lacks per-class benchmark indices). Sorted highest→lowest contribution (green top, red bottom), all positions shown.

**Composition boxes (RV/RF/Alt/Caja):** "Desde inicio" uses `initFromReturn` pattern: `marketValue / (1 + totalReturn/100)` per holding. "Desde fecha" looks up each holding's CLP value in the selected base snapshot by `fundName`, grouped by CURRENT classification from holdingReturnsData (avoids classification mismatch with old snapshots). Final values from live holdingReturnsData directly.

**Email report (useSeguimientoEmail):** Tries monthly computation first (`computeMonthlyData`), falls back to `fetchMonthlyFromAPI()` (calls `prices-at-date` API for price-based returns when < 2 cartola snapshots), then falls back to "desde inicio". Monthly: finds two cartola snapshots (endSnap <= monthEnd, startSnap = previous cartola), builds CLP maps from holdings, classifies by current holdingReturnsData, computes composition/returns/attribution for the period. `reportMonth` auto-detected from client closings. Template in `lib/seguimiento-email.ts` with Global Advisors branding (navy #05162C header with inline SVG logo, copper #D0834C accents/rules, azure #5AA0E6 links/data, ink #EEF3FA footer — `BRAND` constant). Contextual disclaimer (`isMonthly` flag toggles "Periodo: X al Y" vs "Desde inicio del seguimiento (X)").

**Snapshot data note:** `exchangeRates` is sent from ReviewSnapshotModal but NOT persisted as a DB column. Only `marketValueCLP` per holding (in JSONB) is saved. To reconstruct historical CLP values, use `marketValueCLP` or derive from proportion × `total_value`.

**AI usage tracking:** All Claude API calls go through `lib/ai-usage.ts` which tracks tokens/cost per advisor per month in `advisor_ai_usage` table. Advisors choose model (Sonnet 4 default, Opus 4 premium) in profile settings.

**Fichas CMF extraction:** `lib/ficha-extract.ts` downloads and extracts data from CMF fund folletos (PDF). Uses Gemini 2.5 Flash as primary extractor (sends PDF as base64 inline), regex as fallback. Returns `ExtractionResult = { data: ExtractedFichaData; gemini_exhausted?: boolean }`. The `extraction_method` field exists only in the TS interface, NOT as a DB column — always strip it before upsert: `const { extraction_method: _em, ...dbFields } = extracted;`. Stored in `fund_fichas` (FM, PK: fo_run+fm_serie) and `fi_fichas` (FI, PK: fi_rut+fi_serie).

**Sync de fichas FI — FIRES vs FINRE (jul 2026):** Los FI son de dos tipos (`fondos_inversion.tipo`): FIRES (rescatables) y FINRE (no rescatables), en páginas CMF distintas (`entidad.php?...&tipoentidad=FIRES|FINRE`). `discoverFromCmfPage(rut, tipo)` en `lib/cmf-fichas.ts` (EntityType `RGFMU|FIRES|FINRE`); `/api/fondos-inversion/sync-fichas` pasa `fondo.tipo` (NO hardcodear FIRES — Larraín Vial es 91/99 FINRE, antes daba "0 ok, N errores"). El sync procesa en pool de concurrencia (evita timeout serverless) y devuelve `sin_folleto` aparte de `errors` (muchos FINRE de deuda privada genuinamente no publican folleto; se marca `fondos_inversion.sin_folleto=true`). La UI (SyncFichasModal) muestra "X con folleto · Y sin folleto" y nunca queda en blanco (surface de timeout/errores). El `/api/fondos/sync-fichas` (FM) tiene el mismo pool.

**Parser de cartolas PDF (`/api/parse-portfolio-statement`):** Usa **Claude Sonnet** (envía el PDF como `document` base64) para extraer holdings a JSON. NO es regex. El prompt define `securityId`: acciones/ETF→ticker, FONDOS→ISIN (o CUSIP/"Código de Identificación de Títulos"), bonos→CUSIP/ISIN, **NUNCA** un código de moneda. Bug histórico (jul 2026, commit 8c1da80): el prompt no cubría fondos → tomaba "USD" de "CLASS A (USD)" en cartolas BICE/Pershing. Guard defensivo post-parseo con `isCurrencyCode`. Custodios detectados: agf/corredora/internacional. Excel va por `/api/parse-portfolio-excel` (distinto). **Dos vías según `password`:** sin clave → PDF como `document` (Claude ve las columnas alineadas, lee bien); con clave → desencripta con `unpdf` y manda **texto extraído** — que llega **aplanado y con la fila de datos en orden INVERTIDO** respecto de los encabezados. Bug (ago 2026, commit c22b431): en cartolas de AGF chilena con clave (ej. Itaú "Detalle Posiciones"), el modelo invertía **`quantity` ↔ `marketPrice`** (ponía el valor cuota en cantidad de cuotas y viceversa) → precio absurdo. Un sanity check `marketValue ≈ quantity × marketPrice` NO sirve (producto conmutativo, da igual invertido). Fix: (1) reglas explícitas para `assetType="fund"` — mapear **por ETIQUETA de columna, nunca por magnitud** (`Cantidad`/`Cantidad Cuotas`/`N° Cuotas`=quantity, `Valor Cuota`/`NAV`=marketPrice); (2) aviso extra **solo en la vía con clave** (texto aplanado, valores posiblemente en orden invertido) — no se añade a la vía de documento. Verificado reproduciendo el swap (1/1) y el arreglo (5/5) contra la cartola real.

**⚠️ Entorno OneDrive:** el repo vive en OneDrive → el file-watcher de `next dev` a veces NO detecta ediciones a disco (el cambio no se refleja en localhost). Solución: reiniciar `npm run dev`. En Vercel (build fresco) siempre toma los cambios. Si algo "no funciona en local" tras un edit, sospechar esto ANTES de re-debuggear el código.

**Fecha de compra (tributario, jul 2026):** `lib/tax/infer-purchase-date.ts` — `inferPurchaseDate(unitCost, serie)` matchea el precio de compra contra el valor cuota histórico (`fund_cuota_history` para FM, `fondos_inversion_precios` para FI) con match EXACTO (EPS=max(0.01, unitCost*0.00005); ambiguo/promedio→null). `suggestPurchaseDate()` devuelve el valor cuota más cercano dentro de 0.5% cuando no hay exacto (sugerencia, el asesor confirma con un clic). `enrichPurchaseDates()` rellena `holding.purchaseDate` en el POST de snapshots; `scripts/backfill-purchase-dates.mjs` para existentes. `POST /api/portfolio/suggest-purchase-dates` alimenta las sugerencias en `HoldingsEditTable` (columna "F. Compra", editable para TODOS los holdings, no solo bonos). `lib/tax/bridge.ts` prioriza `raw.purchaseDate` como fecha de adquisición para la corrección monetaria.

**Shared text utilities:** `lib/text.ts` (stripAccents, normalizeText), `lib/fund-utils.ts` (detectSerieCode), `lib/constants/chilean-finance.ts` (CHILEAN_TICKERS). Do NOT define these locally in routes.

**Portfolio classification:** `lib/portfolio/classify.ts` (detectCurrencyFromName, assetTypeToClass, classifyFund) and `lib/portfolio/currency.ts` (toCLP, fromCLP with ExchangeRates interface). Do NOT define these locally in components.

**ErrorBoundary:** `components/shared/ErrorBoundary.tsx` wraps the advisor shell layout. Add to new route groups as needed.

**Price service logging:** All fallback chains in `lib/prices/price-service.ts` log warnings when primary source fails. EODHD uses a circuit breaker (18 calls/day window) via `lib/prices/circuit-breaker.ts`.

**Questionnaire frequency:** Per-client configurable (`questionnaire_frequency` column: annual/semi-annual/quarterly/biennial). After saving risk profile, `next_questionnaire_date` is computed. ClientDetail shows overdue warning badge.

**Broker email generator:** `/api/portfolio/generar-carta-corredor` generates a formal Chilean-style email draft via Claude. Client copies and sends from their own email. Triggered from RadiografiaCartola component via `CartaCorredorModal`.

**Match de holdings a fondos (`/api/fondos/match-holdings`):** matchea cada holding de la cartola a su fo_run+serie. Estrategia **"PRICE IS KING"**: detecta el AGF del `cartolaSource` (nombre del custodio elegido en `AddSnapshotModal`), pre-carga los fondos de ese AGF de `vw_fondos_completo`, y compara el `marketPrice` (valor cuota) del holding contra el valor cuota de la BD (`fondos_rentabilidades_diarias`, ventana 7 días ≤ fecha) con tolerancia 1% → match confirmado. Sin AGF detectado → búsqueda general (débil). **La detección de AGF (`AGF_NAME_MAP` + `.includes`) DEBE normalizar tildes con `stripAccents`** (bug ago 2026, fix 739bb30: el value del dropdown "Itaú AGF" no matcheaba la key "itau" → fondos Itaú quedaban sin precio ni serie). Consumido por `useAutoMatch` (seguimiento).

**Preferred funds:** Advisors manage a preferred funds list at `/advisor/fondos` (CRUD+PATCH via `/api/advisor/preferred-funds`). Category uses a fixed dropdown (RV Nacional, RF Internacional, Balanceado, etc.). The GET endpoint enriches each fund with ficha data (TAC, beneficio tributario, objetivo) from `fund_fichas` (FM) and `fi_fichas` (FI). Per-client `fund_selection_mode` (only_my_list / my_list_with_fallback / all_funds). AI cartera generation injects preferred funds into the prompt as soft constraint.

**Patrimonio del cliente (A):** modelo en `lib/patrimonio/` (types + validate + entidades). API REST bajo `/api/clients/[id]/patrimonio` con segmento `[entidad]` dinámico (seguros/inmuebles/activos → client_seguros/client_inmuebles/client_activos_financieros). UI: `components/clients/patrimonio/PatrimonioSection` (acordeón dirigido por schema en `schemas.ts`) montada en `ClientDetail`. El portafolio de inversiones NO se digita aquí (híbrido: se toma del Seguimiento). B (espejo/agregación) y C (simulador que reemplaza APV) son sub-proyectos aparte.

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
- `price-service.ts` — `INTL_FUND_MAP`: Mapeo CUSIP/ISIN→fuente para fondos UCITS internacionales. Cada entry tiene `eodhd` (ISIN.EUFUND) y/o `yahoo` (Morningstar ID `0P…`) + `currency`. EODHD es primario con circuit breaker (18 calls/día), Yahoo es fallback automático. Seed: DWS LatAm, BNY Mellon HY/Credit/Short-Dated, Jupiter Merian, UBAM, JPMorgan Global Select Equity, MFS Ltd Maturity, Schroder ISF Latin American, BICE Global Eq/RF.
- **`ensureIntlMappings()` (auto-resolución, jul 2026)** en `price-service.ts`: para CUALQUIER `securityId` con forma de CUSIP (9 alfanum) o ISIN (12) que no esté mapeado, lo resuelve automáticamente vía **Yahoo search** (`search?q=<CUSIP/ISIN>` → ID Morningstar `0P…`), verifica que tenga serie de precios, y lo cachea en la tabla **`international_fund_map`** + `runtimeIntlMap` (memoria de proceso). `resolveSource()` consulta `getIntlMapping()` = INTL_FUND_MAP hardcoded + runtime cache. Se llama en las rutas `historical-prices` y `prices-at-date` ANTES de procesar internacionales. **Ya NO hay que agregar fondos UCITS a mano.** Resiliente: si la tabla no existe, resuelve vía Yahoo igual (sin persistir). Para identificar el fondo correcto: buscar por CUSIP en Yahoo (da el `0P` exacto; más confiable que por nombre) y **confirmar por PRECIO** (marketValue/quantity vs último Yahoo), NUNCA a ciegas — un ID equivocado inyecta precios de otro instrumento.
- `lib/portfolio/currency.ts` — `isCurrencyCode()`: guard para que un código de moneda mal cargado como securityId (ej. "USD") NO se cotice como ticker (Yahoo tiene un ETF real "USD"). Usado en `resolveSource`/`useHistoricalSeries`/rutas.
- `alphavantage.ts` — AlphaVantage client (daily prices + quotes). Env: `ALPHAVANTAGE_API_KEY`.
- `yahoo.ts` — Yahoo Finance wrapper (historical + quotes) using raw v8 API (NOT the `yahoo-finance2` library which switched to v3).
- `eodhd.ts` — EODHD client for additional price data. Env: `EODHD_API_KEY`.

**Price API routes:**
- `POST /api/prices/backfill` — Backfills international prices for a client's holdings (AV/Yahoo sources only)
- `GET /api/prices/quote` — Single quote for a symbol
- `GET /api/prices/historical` — Historical range for a symbol
- `GET /api/benchmark/config` + `PUT /api/benchmark/config` — Per-client benchmark configuration (stored in `clients.benchmark_config` JSONB)
- `POST /api/portfolio/historical-prices` — Dot-product portfolio evolution: accepts `holdings` (by RUN), `holdingsByName` (name-matching), `internationalHoldings` (Yahoo/AV) y `flatHoldings` (sin precio → valor constante). Procesa internacionales en paralelo (`Promise.allSettled`). Requiere ≥50% de instrumentos con dato por fecha. Llama `ensureIntlMappings()` antes de procesar internacionales.
  - **Retorno FALSO por FX — supresión sin cobertura (jul 2026):** un holding sin precio queda "flat" (valor constante). Si es USD, al convertir a CLP con dólar histórico el total "se mueve" por PURO tipo de cambio → aparecían retornos por período que no eran rentabilidad real. `useHistoricalSeries.hasPriceCoverage` = hay ≥1 fondo con `run!=="flat"`; si NO hay cobertura real, NO se calculan `periodReturns`/`accumulatedReturn` (serían solo FX) y SeguimientoPage muestra aviso "sin precios de mercado". `isTradeableInternational` reconoce ISIN (12 chars) y trata un FONDO de renta fija como fondo (no bono).
- `POST /api/portfolio/prices-at-date` — Per-holding prices at two dates for return calculation. On-demand Yahoo/AV fallback when `international_prices` DB is empty. Llama `ensureIntlMappings()` para auto-resolver CUSIP/ISIN antes de valorizar. **CRÍTICO: holdings internacionales (resueltos a EODHD/Yahoo/AV por `resolveSource`) NUNCA deben caer al fallback de name-matching de fondos chilenos (`getChileanFundPriceByName`). El guard `isInternational` lo impide. Sin él, un fondo USD como "DWS Invest Latin American" matchea un fondo chileno CLP y produce retornos absurdos (~9900%). NUNCA eliminar este guard.**
  - **Precio actual con rezago de reporte (jul 2026):** los FM chilenos publican su `valor_cuota` en `fondos_rentabilidades_diarias` con **rezago de varios días** (~8). La búsqueda por `fo_run` primero intenta una ventana de 7 días alrededor de `targetDate`; si no hay dato (el último precio quedó fuera de los 7 días), **cae al ÚLTIMO valor cuota disponible ≤ targetDate** y devuelve su fecha real (la UI muestra "precio al <fecha>"). Sin ese fallback, el precio actual salía **null** para fondos identificados y correctos (síntoma: "no trae precios actuales" aunque el fondo esté en el catálogo). NO volver a exigir la ventana estricta sin fallback. Nota: `fund_cuota_history` suele estar más fresca que `fondos_rentabilidades_diarias`; el fill-prices CMF usa la primera, prices-at-date la segunda.
- `POST /api/portfolio/recommended-evolution` — Retornos mensuales en CLP de la cartera recomendada revalorizada a mercado (proxies por clase en `lib/prices/recommended-proxies.ts`: ACWI/AGG/GLD+RWO/UF; ETFs USD→CLP con dólar observado). Consumido por la 4ª serie 'Recomendado' de RetornosComparados.

**Seguimiento API filters:** The `GET /api/clients/[id]/seguimiento` route excludes `source=api-prices` snapshots to avoid polluting manual cartola tracking with auto-generated price snapshots.

### Database

Supabase Postgres with RLS on all sensitive tables. Migrations in `supabase/migrations/` (chronological, `YYYYMMDD_description.sql`). **Max rows per request set to 5000** in Supabase dashboard (default was 1000). For queries that may exceed this (e.g., `vw_fondos_completo` ~3000 rows), always paginate with `.range()` as a safety net.

Key tables: `clients`, `advisors`, `portfolio_snapshots`, `risk_profiles`, `client_cartolas`, `messages`, `direct_portfolios`, `direct_portfolio_holdings`, `client_reports`, `client_report_config`, `client_advisors` (sharing), `advisor_ai_usage`, `tac_upload_log`, `fund_fichas` (FM folleto data), `fi_fichas` (FI folleto data), `fondos_inversion` (FI catalog), `international_prices` (ticker+price_date→close_price, for AV/Yahoo prices), `international_fund_map` (CUSIP/ISIN→yahoo_symbol/currency, caché de auto-resolución, migración `20260721`), `client_monthly_closings` (cierre mensual por cliente), `dividend_history` (historial de dividendos), `client_seguros`, `client_inmuebles`, `client_activos_financieros` (patrimonio del cliente — sub-proyecto A, moneda por campo `*_monto`+`*_moneda`, RLS por get_accessible_client_ids). Columnas agregadas jul 2026: `fondos_inversion.sin_folleto` (bool, marca FI sin folleto CMF), `portfolio_snapshots.returns_confidence` (high/low). **NOTE:** DB column is `ticker`, not `symbol`. Code maps `SourceResolution.symbol` → DB `ticker`. Clients table has `display_currency` column and `servicios_adicionales` JSONB.

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
