# Auditoria de Codigo y Arquitectura — Julio 2026

**Fecha:** 2026-07-09
**Alcance:** Codigo muerto, inconsistencias, duplicacion, archivos sobredimensionados, dependencias, estructura
**Metodo:** 4 agentes paralelos (API routes, componentes/hooks, lib/utilidades, estructura/config)

---

## CRITICO

### C1. Archivos .env.local con credenciales en subdirectorios de app/

Tres archivos `.env.local` anidados contienen claves reales (Supabase URL, anon key, service role key, AlphaVantage, Anthropic):

- `app/(public)/risk-profile/.env.local`
- `app/client/risk-profile/.env.local`
- `app/(advisor-shell)/advisor/.env.local` (contiene SERVICE_ROLE_KEY + ANTHROPIC_API_KEY)

Next.js solo lee `.env.local` de la raiz — estos archivos son inertes pero exponen credenciales.

**Accion:** Eliminar los 3 archivos. Rotar las claves expuestas. Agregar `**/.env.local` al `.gitignore`.

### C2. Fallback hardcoded `return 950` para USD/CLP

- **Archivo:** `app/api/portfolio/current-prices/route.ts:52`
- `fetchDolarObservado()` retorna `950` como fallback cuando falla mindicador.cl
- Ademas usa mindicador.cl en vez del canonico `lib/bcch.ts` (Banco Central API)
- **Accion:** Reemplazar con `getDolarObservado()` de `lib/bcch.ts`, retornar null si falla

### C3. `portfolio/snapshots/route.ts` usa cliente RLS en vez de admin

- **Archivo:** `app/api/portfolio/snapshots/route.ts`
- Usa `createSupabaseServerClient()` (RLS-bound) despues de `requireAuth()`, mientras todas las demas rutas usan `createAdminClient()`
- Puede silenciosamente perder filas por RLS
- **Accion:** Cambiar a `createAdminClient()`

---

## ALTO — CODIGO MUERTO (~6,000 lineas eliminables)

### Componentes sin uso

| Componente | Lineas | Razon |
|---|---|---|
| `ComparisonModeV2` usa `supabaseBrowserClient` | 2,369 | Acceso directo a BD desde browser (antipatron) |
| `ProposedFundFormV2.tsx` | 735 | No importado en ningun archivo |
| `CalculadoraAPV.tsx` (component) | 596 | Dead — `calculadora-apv/page.tsx` tiene su propia implementacion (1,141 lineas) |
| `AdvisorHeader.tsx` | 397 | Legacy — reemplazado por AdvisorSidebar |
| `NavUploader.tsx` | 236 | No importado en ningun archivo |
| `CurrencyConfirmModal.tsx` | 238 | No importado en ningun archivo |
| `AdvisorTopBar.tsx` | 162 | Legacy — reemplazado por AdvisorSidebar |
| `ProviderCard.tsx` | 155 | No importado en ningun archivo |
| `PortalTopbar.tsx` | ~100 | Portal usa PortalSidebar, no topbar |
| `EditSnapshotModal.tsx` | ~200 | No importado fuera de su propio archivo |
| `BondSyncButton.tsx` | ~100 | No importado fuera de su propio archivo |
| `XrayTaxSummary.tsx` | 558 | No importado fuera de su propio archivo |

### Archivos lib muertos

| Archivo | Lineas | Razon |
|---|---|---|
| `lib/funds/international_fund_catalog.ts` | 527 | Catalogo hardcoded nunca importado |
| `lib/portfolio/fund_classifier.ts` | 154 | Supersedido por classify.ts + comite-categories.ts |
| `lib/env.ts` | 43 | Nunca importado — todo usa process.env directamente |
| `lib/risk/benchmark_weights.ts` | 148 | Solo importado internamente por benchmark_map.ts |

### Dependencias sin uso

| Dependencia | Problema | Accion |
|---|---|---|
| `yahoo-finance2` | Nunca importada — se usa raw v8 API via lib/prices/yahoo.ts | Remover de dependencies |
| `dotenv` | Solo usada en scripts/ | Mover a devDependencies |
| `@testing-library/react` | Cero imports en el codebase | Remover de devDependencies |
| `md-to-pdf` | Cero imports en el codebase | Remover de devDependencies |
| `ts-node` | Cero imports en el codebase | Remover de devDependencies |

### Dead exports en archivos vivos

| Archivo | Export muerto |
|---|---|
| `lib/ETF_DATABASE.ts` | `getETFData`, `getETFsByCategory`, `AVAILABLE_ETFS`, `ETF_CATEGORIES` (4 de 5 exports) |
| `lib/prices/alphavantage.ts` | `fetchDailyPrices` (supersedido por fetchDailyPricesRange) |
| `lib/prices/price-service.ts` | `fetchLatestPrice` (solo uso interno) |
| `lib/api-response.ts` | `getErrorMessage` (solo en tests) |
| `lib/fund-utils.ts` | `SERIE_KEYWORDS` (solo uso interno) |

---

## ALTO — ARCHIVOS SOBREDIMENSIONADOS

### Componentes monoliticos (>700 lineas)

| Archivo | Lineas | Problema |
|---|---|---|
| `ComparisonModeV2.tsx` | **2,369** | State, fetch, busqueda, mapeo, AI, chart, export — todo en 1 componente |
| `ModelMode.tsx` | **2,167** | Similar a ComparisonModeV2 — sin sub-componentes |
| `FondoDetalleModal.tsx` | 1,183 | Multiples tabs inline |
| `PortfolioEvolution.tsx` | 1,071 | Fetch + grafico + estado en uno |
| `EducacionFinanciera.tsx` | 939 | Contenido estatico hardcoded |
| `usePerformanceCalculations.ts` | 913 | Hook gigante con 4+ responsabilidades |
| `FundSelector.tsx` | 886 | Filtros + tabla + modal inline |
| `ReviewSnapshotModal.tsx` | 742 | Complejo pero justificado |
| `ClientInfoCard.tsx` | 725 | Muchas secciones inline |
| `RiskProfileWizard.tsx` | 717 | 7 pasos en un componente |
| `ClientDetail.tsx` | 709 | 4 modals inline |
| `ComiteReportsPanel.tsx` | 695 | Upload + tabla + vista expandible |

### API routes sobredimensionadas (>500 lineas)

| Archivo | Lineas | Problema |
|---|---|---|
| `fill-prices/route.ts` | **1,331** | Urgente — logica de precios multi-fuente inline |
| `radiografia/route.ts` | 847 | Clasificacion inline |
| `xray/route.ts` | 829 | Calculos inline |
| `historical-prices/route.ts` | 829 | 5 interfaces + matching + normalizacion |
| `parse-portfolio-excel/route.ts` | 799 | Parsers por institucion inline |
| `current-prices/route.ts` | 795 | fetchDolarObservado inline + name matching |

### Pages sobredimensionadas

| Archivo | Lineas |
|---|---|
| `calculadora-apv/page.tsx` | 1,141 |
| `admin/data-sync/page.tsx` | 809 |
| `analisis-cartola/page.tsx` | 790 |

---

## ALTO — DUPLICACION

### D1. Fund name-matching duplicado en 6 rutas (~500 lineas repetidas)

La misma logica (tokenizar con stripAccents, filtrar stop words, busqueda progresiva 3-2-1 terms, scoring por overlap + serie bonus) se repite en:

1. `prices-at-date/route.ts` (lines 112-210)
2. `historical-prices/route.ts` (lines 219-293)
3. `current-prices/route.ts` (lines 107-293)
4. `fill-prices/route.ts`
5. `match-holdings/route.ts`
6. `xray/route.ts` (lines 446-494)

**Accion:** Extraer a `lib/fund-matching.ts`

### D2. SERIE_ALIASES duplicado

Constante identica de mapeo BCI (BANCA->BPRIV, ALTO->ALPAT, etc.) definida en:
- `prices-at-date/route.ts:156`
- `historical-prices/route.ts:242`

**Accion:** Mover a `lib/fund-utils.ts`

### D3. fetchYahooQuote inline en 3 rutas

`fondos/search-price/route.ts`, `securities/quote/[ticker]/route.ts`, `fondos/match-holdings/route.ts` — wrapper local de Yahoo v8 API aunque existe `lib/prices/yahoo.ts`.

### D4. detectCurrency duplicado

`parse-portfolio-excel/route.ts` y `parse-portfolio-statement/route.ts` implementan deteccion de moneda con heuristics distintas.

### D5. CHILEAN_SOURCES/AGFS/AGF_NAME_MAP — 3 mapeos que se solapan

En `parse-portfolio-excel`, `parse-portfolio-statement`, y `fondos/match-holdings`.

### D6. Modal overlay inline — 18+ archivos

Patron `<div className="fixed inset-0 bg-black/50 z-50">` repetido sin componente `<Modal>` compartido.

### D7. Loading spinner — 153 instancias en 81 archivos

Sin componente `<Spinner>` o `<LoadingState>` compartido.

### D8. Dual Supabase browser client

- `lib/supabase/supabaseClient.ts` (legacy, `createClient`)
- `lib/supabase/client.ts` (moderno, `createBrowserClient` de @supabase/ssr)

ComparisonModeV2 y ProposedFundFormV2 usan el legacy.

### D9. formatCurrency/formatDate duplicados

- `lib/format.ts` (canonico)
- `lib/direct-portfolio/types.ts` (duplicado incompatible)
- `lib/uf.ts` `formatCLP` (otra variante)
- 3 funciones privadas `formatDate` en cmf-import, cmf-cartola, bonds/price-projection

### D10. calculateYTM/calculateDuration duplicados

- `lib/direct-portfolio/types.ts` (simplificado)
- `lib/bonds/yield.ts` + `lib/bonds/duration.ts` (propio, testeado)

---

## MEDIO — HIGIENE DE CODIGO

### console.log en produccion: 52 instancias en 21 archivos

Principales: aafm-sync.ts, cmf-auto.ts, cmf-cartola.ts, ficha-extract.ts, match-holdings/route.ts, historical-prices/route.ts, ReviewSnapshotModal.tsx

### Bare catch blocks: 107 instancias (37 API/lib, 70 componentes)

Los peores:
- `historical-prices/route.ts` — 5 bare catches
- `match-holdings/route.ts` — 3 bare catches
- `admin/advisors/route.ts` — 4x `.catch(() => {})`

### ~123 rutas API no usan successResponse/errorResponse

Solo 28 rutas usan los helpers estandar de `lib/api-response.ts`. La mayoria usa `NextResponse.json()` directo.

### 15 componentes usan toLocaleString('es-CL') inline

En vez de `formatCurrency`/`formatNumber` de `lib/format.ts`.

### Bundle: sin dynamic imports para librerias pesadas

- `xlsx` (~1MB) importado estaticamente en `ComparisonModeV2.tsx`
- `@react-pdf/renderer` (~500KB) importado client-side en `CarteraRecomendada.tsx`
- Zero usos de `next/dynamic` en todo el proyecto

### Type safety

- 9 usos de `as any` (4 en aafm-sync.ts, 1 en price-service.ts)
- 18 usos de `: any`
- `null as unknown as ExtractedFichaData` en ficha-extract.ts:85 — peligroso
- `user!.email` en api-auth.ts:116 — email puede ser undefined en Supabase Auth

---

## MEDIO — ESTRUCTURA

### scripts/ — 120 archivos, ~80+ son one-off

Clusters eliminables:
- `check-eodhd*.mjs` (4), `check-intl-yahoo*.mjs` (6), `finra-historical*.mjs` (5)
- `check-concha-*.mjs` (5), `debug-toledo*.mjs` (2), `debug-bonds*.mjs` (2)
- `debug-usa-fund*.mjs` (3), `check-price-providers*.mjs` (3)
- SQL migrations sueltas que deberian estar en `supabase/migrations/`

### Naming inconsistente en lib/

- `lib/risk/` usa snake_case: `benchmark_weights.ts`, `risk_scoring.ts`
- `lib/bonds/` usa kebab-case: `cash-flows.ts`, `accrued-interest.ts`
- `lib/ETF_DATABASE.ts` usa SCREAMING_SNAKE

### CLAUDE.md tiene TODO stale

El TODO dice actualizar BRAND constant, pero `lib/seguimiento-email.ts` ya usa la paleta canonica (#05162C, #D0834C, #5AA0E6). Remover el TODO.

### tsconfig.json tiene exclude stale

Lista `lib/risk/test_scoring.ts` que ya no existe.

### Env vars sin documentar

GEMINI_API_KEY, EODHD_API_KEY, FINRA_USER/PASSWORD/SECURITY_ANSWERS, GOOGLE_CLIENT_ID/SECRET/REDIRECT_URI, DAILY_REPORT_API_KEY no estan en .env.example.

---

## BAJO

- `lib/aafm-sync.ts` (798 lineas) — sobredimensionado, mezcla parsing + sync + merge
- `analisis-cartola/page.tsx` — useEffect de 73 lineas con 3 fetches inline
- Auth pages (5 archivos) comparten layout casi identico sin componente compartido
- data-sync/page.tsx — 6 handlers de sync con el mismo patron boilerplate
- File naming inconsistente entre carpetas de lib/

---

## RESUMEN POR ESFUERZO

### Quick wins (< 30 min, alto impacto)

| # | Accion | Lineas eliminadas |
|---|---|---|
| 1 | Eliminar 3 .env.local anidados + rotar claves | 0 (seguridad) |
| 2 | Remover yahoo-finance2 de package.json | - |
| 3 | Eliminar componentes muertos (10 archivos) | ~3,500 |
| 4 | Eliminar lib files muertos (4 archivos) | ~870 |
| 5 | Mover dotenv a devDependencies | - |
| 6 | Remover devDeps sin uso (3 paquetes) | - |
| 7 | Limpiar console.log (52 instancias) | ~52 |
| 8 | Remover TODO stale de CLAUDE.md | ~3 |
| 9 | Agregar `tmp/` y `**/.env.local` a .gitignore | ~2 |

### Refactors medianos (1-3 hrs cada uno)

| # | Accion | Impacto |
|---|---|---|
| 10 | Extraer fund name-matching a lib/fund-matching.ts | -500 lineas duplicadas |
| 11 | Extraer SERIE_ALIASES a lib/fund-utils.ts | Consistencia |
| 12 | Fix snapshots/route.ts: usar createAdminClient | Correccion RLS |
| 13 | Fix current-prices: usar lib/bcch.ts, eliminar return 950 | Correccion datos |
| 14 | Eliminar supabaseClient.ts legacy, migrar 2 consumidores | Consistencia |
| 15 | Dynamic import xlsx y @react-pdf/renderer | Bundle size |
| 16 | Crear componente <Modal> compartido | -300+ lineas |

### Refactors grandes (4+ hrs)

| # | Accion | Impacto |
|---|---|---|
| 17 | Descomponer ComparisonModeV2.tsx (2,369 lineas) | Mantenibilidad |
| 18 | Descomponer ModelMode.tsx (2,167 lineas) | Mantenibilidad |
| 19 | Descomponer fill-prices/route.ts (1,331 lineas) | Mantenibilidad |
| 20 | Descomponer FondoDetalleModal (1,183 lineas) | Mantenibilidad |
| 21 | Limpiar scripts/ (~80 archivos one-off) | Organizacion |
