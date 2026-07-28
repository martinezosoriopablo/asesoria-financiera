# Serie "Recomendado" con instrumentos reales + toggle de benchmark — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que la serie "Recomendado" del Seguimiento revalorice los **instrumentos reales** de la recomendación guardada (no proxies de clase), que el proxy genérico se ofrezca como **benchmark de mercado**, y agregar un **toggle** UF+2% ↔ proxy en `RetornosComparados` persistido por cliente.

**Architecture:** Lógica pura y testeable en `lib/prices/recommended-real.ts` (resolución de instrumentos reales a componentes cotizables con fallback a proxy de clase). `recommended-evolution` devuelve **dos series** (`recommended` real + `benchmarkProxy`) en una sola llamada compartiendo el fetch de precios. El modo del toggle se persiste en una **columna nueva** `clients.benchmark_mode`. La UI reusa `RetornosComparados` + `useBenchmarkConfig`.

**Tech Stack:** Next.js 16 (App Router) + React 19 + Supabase (admin client) + TypeScript + Vitest. Sin librerías nuevas.

## Global Constraints

- Path alias `@/` → raíz del repo. Usar `@/lib/...`, `@/components/...`.
- Auth de rutas API: verificar acceso con `requireClientAccess(clientId)` de `@/lib/auth/api-auth`; tras el check usar `createAdminClient()`.
- Respuestas API: `successResponse()` / `errorResponse()` de `@/lib/api-response`, dentro de `handleApiError("route-name", async () => {...})`.
- Rate limit existente en `recommended-evolution`: `applyRateLimit(request, "recommended-evolution", { limit: 10 })`. No cambiar.
- Reusar SIEMPRE `computeRecommendedMonthlyReturnsCLP`, `buildMonthEnds`, `expandRecommendation`, `RECOMMENDED_PROXIES` de `@/lib/prices/recommended-proxies`; `getMarketTickerPrices`, `fetchBcchDailyPrices` de `@/lib/prices/market-series`; `resolveSource` de `@/lib/prices/price-service`. No redefinir.
- Compliance: el fallback de Caja usa **UF** (CLP real). NUNCA fabricar un rendimiento nominal.
- Tests: Vitest. Correr uno con `npx vitest run <archivo>`. Typecheck: `npx tsc --noEmit` → exit 0.
- Commits frecuentes, mensajes en español, terminar con `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.
- Rama de trabajo: `subproyecto-b-benchmark` (ya creada, worktree activo).

---

## File Structure

- Create `supabase/migrations/20260727_benchmark_mode.sql` — columna `clients.benchmark_mode`.
- Create `lib/prices/recommended-real.ts` — `expandRealInstruments`, `classProxyFor`, tipos `RealPosition`/`RealComponent`.
- Create `lib/prices/recommended-real.test.ts` — tests unitarios.
- Modify `lib/prices/recommended-proxies.ts` — exportar `normalizeClass` (hoy es privada).
- Modify `app/api/portfolio/recommended-evolution/route.ts` — devolver `{ series, benchmarkProxy }` con un solo fetch de precios + swap por serie vacía.
- Modify `app/api/clients/[id]/benchmark/route.ts` — GET/PUT incluyen `benchmark_mode`.
- Modify `components/seguimiento/hooks/useBenchmarkConfig.ts` — parsear `benchmarkProxy`, exponer `benchmarkProxyReturns`, `benchmarkMode`, `setBenchmarkMode`.
- Modify `components/seguimiento/RetornosComparados.tsx` — props del toggle + selección de línea benchmark + UI del toggle.
- Modify `components/seguimiento/SeguimientoPage.tsx` — cablear props nuevas.

---

## Contratos compartidos (definidos en Task 2)

```ts
// lib/prices/recommended-real.ts
import type { FlatProxy } from "@/lib/prices/recommended-proxies";

export interface RealPosition {
  clase: string;          // "Renta Variable" | "Renta Fija" | "Alternativos" | "Cash" | "Caja" | ...
  ticker: string | null;  // ETF (VOO), RUN de fondo chileno ("9226"), o null (Caja sin fondo)
  porcentaje: number;     // 0..100
}

export interface RealComponent extends FlatProxy {
  clase: string;          // clase normalizada ("renta variable" | "renta fija" | "alternativos" | "caja")
  substituted: boolean;   // true = se usó el proxy de clase en vez del instrumento real
}

// `market` usa el mismo literal que HoldingForPricing para que `resolveSource`
// sea asignable a `ResolveFn` bajo strictFunctionTypes.
export type ResolveFn = (h: {
  fundName: string; securityId: string; marketValue: number; market?: "CL" | "INT" | "US";
}) => { symbol: string; currency: string; source: string };

export function classProxyFor(clase: string, weight: number): RealComponent[];
export function expandRealInstruments(cartera: RealPosition[], resolveFn: ResolveFn): RealComponent[];
```

---

### Task 1: Migración — columna `clients.benchmark_mode`

**Files:**
- Create: `supabase/migrations/20260727_benchmark_mode.sql`

**Interfaces:**
- Produces: columna `clients.benchmark_mode text NOT NULL DEFAULT 'uf_spread'` con CHECK `IN ('uf_spread','market_proxy')`.

- [ ] **Step 1: Escribir la migración**

```sql
-- 20260727_benchmark_mode.sql
-- Modo del toggle de benchmark en RetornosComparados (sub-proyecto B).
-- 'uf_spread' = benchmark UF+2% (config actual); 'market_proxy' = índices por clase.
ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS benchmark_mode text NOT NULL DEFAULT 'uf_spread';

ALTER TABLE clients
  DROP CONSTRAINT IF EXISTS clients_benchmark_mode_check;
ALTER TABLE clients
  ADD CONSTRAINT clients_benchmark_mode_check
  CHECK (benchmark_mode IN ('uf_spread', 'market_proxy'));
```

- [ ] **Step 2: Aplicar en Supabase.** Ejecutar el SQL en el proyecto `zysotxkelepvotzujhxe` (dashboard SQL editor o `supabase db push`). Verificar:

Run (en el SQL editor): `SELECT column_name, data_type, column_default FROM information_schema.columns WHERE table_name='clients' AND column_name='benchmark_mode';`
Expected: una fila `benchmark_mode | text | 'uf_spread'::text`.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260727_benchmark_mode.sql
git commit -m "feat(seguimiento): columna clients.benchmark_mode para el toggle de benchmark"
```

---

### Task 2: `lib/prices/recommended-real.ts` — `expandRealInstruments` + `classProxyFor`

**Files:**
- Modify: `lib/prices/recommended-proxies.ts` (exportar `normalizeClass`)
- Create: `lib/prices/recommended-real.ts`
- Test: `lib/prices/recommended-real.test.ts`

**Interfaces:**
- Consumes: `FlatProxy`, `RECOMMENDED_PROXIES`, `normalizeClass` de `@/lib/prices/recommended-proxies`.
- Produces: `classProxyFor`, `expandRealInstruments`, tipos `RealPosition`/`RealComponent`/`ResolveFn` (ver "Contratos compartidos").

- [ ] **Step 1: Exportar `normalizeClass`.** En `lib/prices/recommended-proxies.ts`, cambiar la firma privada a exportada:

Buscar `function normalizeClass(clase: string): string | null {` y reemplazar por:

```ts
export function normalizeClass(clase: string): string | null {
```

(El cuerpo NO cambia. También agrega `caja` para "cash": dentro del cuerpo, la línea `if (c === "caja" || c === "liquidez" || c === "efectivo")` cámbiala a incluir "cash": `if (c === "caja" || c === "liquidez" || c === "efectivo" || c === "cash")`.)

- [ ] **Step 2: Escribir el test que falla** en `lib/prices/recommended-real.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { expandRealInstruments, classProxyFor, type ResolveFn } from "./recommended-real";

// Mock de resolveSource: RUN numérico → CLP/cmf; cualquier otro (ETF) → USD/alphavantage.
const resolveFn: ResolveFn = ({ securityId }) => {
  if (/^\d+$/.test(securityId)) return { symbol: securityId, currency: "CLP", source: "cmf" };
  return { symbol: securityId, currency: "USD", source: "alphavantage" };
};

describe("classProxyFor", () => {
  it("expande una clase a su proxy con substituted=true y pesos escalados", () => {
    expect(classProxyFor("Renta Variable", 0.4)).toEqual([
      { ticker: "ACWI", weight: 0.4, currency: "USD", spread: undefined, clase: "renta variable", substituted: true },
    ]);
    // Alternativos = blend GLD 0.5 + RWO 0.5 → cada uno 0.5*weight
    const alt = classProxyFor("Alternativos", 0.2);
    expect(alt.map(c => [c.ticker, c.weight])).toEqual([["GLD", 0.1], ["RWO", 0.1]]);
    expect(alt.every(c => c.substituted)).toBe(true);
  });

  it("clase no reconocida → vacío", () => {
    expect(classProxyFor("Cripto", 0.5)).toEqual([]);
  });
});

describe("expandRealInstruments", () => {
  it("mezcla ETF USD + fondo CLP + Caja nula; pesos suman 1; Caja→proxy UF substituted", () => {
    const cartera = [
      { clase: "Renta Variable", ticker: "VOO", porcentaje: 50 },
      { clase: "Renta Fija", ticker: "9226", porcentaje: 30 },
      { clase: "Caja", ticker: null, porcentaje: 20 },
    ];
    const res = expandRealInstruments(cartera, resolveFn);
    // VOO (USD, real), 9226 (CLP, real), UF (proxy de Caja, substituted)
    expect(res.map(c => [c.ticker, c.currency, c.substituted])).toEqual([
      ["VOO", "USD", false],
      ["9226", "CLP", false],
      ["UF", "CLP", true],
    ]);
    const sum = res.reduce((s, c) => s + c.weight, 0);
    expect(Math.abs(sum - 1)).toBeLessThan(1e-9);
  });

  it("clase no reconocida se ignora y el resto re-normaliza a 1", () => {
    const cartera = [
      { clase: "Renta Variable", ticker: "VOO", porcentaje: 50 },
      { clase: "Cripto", ticker: "BTC", porcentaje: 50 }, // ignorada
    ];
    const res = expandRealInstruments(cartera, resolveFn);
    expect(res.length).toBe(1);
    expect(res[0].ticker).toBe("VOO");
    expect(res[0].weight).toBeCloseTo(1, 9);
  });

  it("posición con porcentaje 0 o negativo se ignora", () => {
    const cartera = [
      { clase: "Renta Variable", ticker: "VOO", porcentaje: 100 },
      { clase: "Renta Fija", ticker: "IEF", porcentaje: 0 },
    ];
    const res = expandRealInstruments(cartera, resolveFn);
    expect(res.map(c => c.ticker)).toEqual(["VOO"]);
  });
});
```

- [ ] **Step 3: Correr y ver que falla**

Run: `npx vitest run lib/prices/recommended-real.test.ts`
Expected: FAIL (no existe `./recommended-real`).

- [ ] **Step 4: Implementar `lib/prices/recommended-real.ts`**

```ts
// lib/prices/recommended-real.ts
// Revaloriza los INSTRUMENTOS REALES de la recomendación guardada (cartera[])
// como estrategia de mercado. Cada posición se resuelve a un ticker cotizable
// vía resolveSource; la Caja sin fondo (o cualquier instrumento sin serie de
// precios) cae al proxy de mercado de su clase. Ver spec 2026-07-27.
import {
  RECOMMENDED_PROXIES,
  normalizeClass,
  type FlatProxy,
} from "@/lib/prices/recommended-proxies";

export interface RealPosition {
  clase: string;
  ticker: string | null;
  porcentaje: number;
}

export interface RealComponent extends FlatProxy {
  clase: string;
  substituted: boolean;
}

export type ResolveFn = (h: {
  fundName: string; securityId: string; marketValue: number; market?: "CL" | "INT" | "US";
}) => { symbol: string; currency: string; source: string };

/** Proxies de mercado de una clase, escalados a `weight` (peso global ya normalizado). */
export function classProxyFor(clase: string, weight: number): RealComponent[] {
  const key = normalizeClass(clase);
  if (!key) return [];
  return RECOMMENDED_PROXIES[key].map((p) => ({
    ticker: p.ticker,
    weight: weight * p.weight,
    currency: p.currency,
    spread: p.spread,
    clase: key,
    substituted: true,
  }));
}

/**
 * Convierte cartera[] (posiciones reales) en componentes listos para
 * computeRecommendedMonthlyReturnsCLP. Pesos globales que suman 1. Clases no
 * reconocidas se ignoran y el resto se re-normaliza. Caja con ticker nulo →
 * proxy de su clase (UF). La sustitución por serie de precios vacía se hace en
 * la ruta (tras el fetch), no aquí.
 */
export function expandRealInstruments(
  cartera: RealPosition[],
  resolveFn: ResolveFn
): RealComponent[] {
  const flat: RealComponent[] = [];
  let totalMapped = 0;

  for (const pos of cartera) {
    const pct = Number(pos.porcentaje) || 0;
    if (pct <= 0) continue;
    const key = normalizeClass(pos.clase);
    if (!key) continue; // clase no reconocida → ignora, renormaliza resto
    totalMapped += pct;
    const w = pct / 100;

    if (pos.ticker) {
      const r = resolveFn({
        fundName: pos.ticker, securityId: pos.ticker, marketValue: 0, market: "US",
      });
      const currency: "USD" | "CLP" = r.currency === "CLP" ? "CLP" : "USD";
      flat.push({ ticker: r.symbol, weight: w, currency, clase: key, substituted: false });
    } else {
      // Sin instrumento (Caja) → proxy de clase, escalado por w
      for (const c of classProxyFor(key, w)) flat.push(c);
    }
  }

  if (totalMapped <= 0) return [];
  const scale = 100 / totalMapped;
  return flat.map((f) => ({ ...f, weight: f.weight * scale }));
}
```

- [ ] **Step 5: Correr y ver que pasa**

Run: `npx vitest run lib/prices/recommended-real.test.ts`
Expected: PASS (8 asserts en 4 tests).

- [ ] **Step 6: Typecheck + commit**

Run: `npx tsc --noEmit` → exit 0.

```bash
git add lib/prices/recommended-real.ts lib/prices/recommended-real.test.ts lib/prices/recommended-proxies.ts
git commit -m "feat(seguimiento): expandRealInstruments + classProxyFor (instrumentos reales de la recomendación)"
```

---

### Task 3: `recommended-evolution` devuelve dos series (real + proxy)

**Files:**
- Modify: `app/api/portfolio/recommended-evolution/route.ts`

**Interfaces:**
- Consumes: `expandRealInstruments`, `classProxyFor` de `@/lib/prices/recommended-real`; `expandRecommendation`, `computeRecommendedMonthlyReturnsCLP`, `buildMonthEnds` de `@/lib/prices/recommended-proxies`; `resolveSource` de `@/lib/prices/price-service`; `getMarketTickerPrices`, `fetchBcchDailyPrices` de `@/lib/prices/market-series`.
- Produces: respuesta `{ series: {returns, accumulated, label} | null, benchmarkProxy: {returns, accumulated, label} | null }`.

- [ ] **Step 1: Reemplazar el cuerpo de `POST`** en `app/api/portfolio/recommended-evolution/route.ts` (desde el `import` hasta el final). Nuevo contenido completo:

```ts
// app/api/portfolio/recommended-evolution/route.ts
// Devuelve DOS series en CLP: `series` = instrumentos REALES de la recomendación
// revalorizados a mercado; `benchmarkProxy` = índices por clase (proxy). Comparten
// el fetch de precios. Ver spec 2026-07-27.
import { NextRequest } from "next/server";
import { requireClientAccess, createAdminClient } from "@/lib/auth/api-auth";
import { successResponse, errorResponse, handleApiError } from "@/lib/api-response";
import { applyRateLimit } from "@/lib/rate-limit";
import { fetchBcchDailyPrices, getMarketTickerPrices } from "@/lib/prices/market-series";
import {
  expandRecommendation,
  buildMonthEnds,
  computeRecommendedMonthlyReturnsCLP,
} from "@/lib/prices/recommended-proxies";
import {
  expandRealInstruments,
  classProxyFor,
  type RealComponent,
} from "@/lib/prices/recommended-real";
import { resolveSource } from "@/lib/prices/price-service";
import type { DailyPrice } from "@/lib/prices/types";

export async function POST(request: NextRequest) {
  const rl = await applyRateLimit(request, "recommended-evolution", { limit: 10 });
  if (rl) return rl;

  return handleApiError("recommended-evolution", async () => {
    const { clientId } = await request.json();
    if (!clientId) return errorResponse("clientId es requerido", 400);

    const { error: accessError } = await requireClientAccess(clientId);
    if (accessError) return accessError;

    const supabase = createAdminClient();

    // 1. Recomendación guardada
    const { data: client } = await supabase
      .from("clients")
      .select("cartera_recomendada")
      .eq("id", clientId)
      .single();
    const rec = client?.cartera_recomendada as Record<string, unknown> | null;
    if (!rec) return successResponse({ series: null, benchmarkProxy: null });

    const cartera = (rec.cartera || []) as Array<{ clase: string; ticker: string | null; porcentaje: number }>;

    // 2a. Componentes REALES (instrumentos de la Decisión)
    const realComponents = expandRealInstruments(
      cartera.map((p) => ({ clase: p.clase, ticker: p.ticker ?? null, porcentaje: p.porcentaje })),
      resolveSource
    );

    // 2b. Componentes PROXY (índices por clase) — igual que antes
    const classWeights: Record<string, number> = {};
    for (const p of cartera) {
      if (p.clase && p.porcentaje > 0) classWeights[p.clase] = (classWeights[p.clase] || 0) + p.porcentaje;
    }
    if (Object.keys(classWeights).length === 0) {
      const eq = rec.equity_percent as number | undefined;
      const fi = rec.fixed_income_percent as number | undefined;
      if (eq) classWeights["Renta Variable"] = eq;
      if (fi) classWeights["Renta Fija"] = fi;
    }
    const proxyComponents = expandRecommendation(classWeights);

    if (realComponents.length === 0 && proxyComponents.length === 0) {
      return successResponse({ series: null, benchmarkProxy: null });
    }

    // 3. Rango: primera cartola real → hoy
    const { data: firstSnap } = await supabase
      .from("portfolio_snapshots")
      .select("snapshot_date")
      .eq("client_id", clientId)
      .in("source", ["manual", "statement", "excel"])
      .order("snapshot_date", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (!firstSnap) return successResponse({ series: null, benchmarkProxy: null });
    const fromDate = (firstSnap as { snapshot_date: string }).snapshot_date;
    const toDate = new Date().toISOString().split("T")[0];

    const monthEnds = buildMonthEnds(fromDate, toDate);
    if (monthEnds.length < 2) return successResponse({ series: null, benchmarkProxy: null });

    // 4. Precios: unión de tickers de AMBAS listas (un solo fetch). UF y USD aparte.
    const allComponents = [...realComponents, ...proxyComponents];
    const usdSeries = await fetchBcchDailyPrices("dolar", fromDate, toDate);
    const needUf = allComponents.some((c) => c.ticker === "UF");
    const ufSeries = needUf ? await fetchBcchDailyPrices("uf", fromDate, toDate) : [];

    const uniqueTickers = [...new Set(allComponents.map((c) => c.ticker).filter((t) => t !== "UF"))];
    const pricesByTicker: Record<string, DailyPrice[]> = {};
    for (const ticker of uniqueTickers) {
      pricesByTicker[ticker] = await getMarketTickerPrices(ticker, fromDate, toDate);
    }

    // 5. Swap por serie vacía: un instrumento real sin precios → proxy de su clase.
    const hasPrices = (c: RealComponent): boolean =>
      c.ticker === "UF" ? ufSeries.length > 0 : (pricesByTicker[c.ticker]?.length ?? 0) > 0;
    const resolvedReal: RealComponent[] = realComponents.flatMap((c) =>
      hasPrices(c) ? [c] : classProxyFor(c.clase, c.weight)
    );
    // Los proxies de sustitución (ACWI/AGG/GLD/RWO/UF) ya están en pricesByTicker
    // porque su clase está presente en proxyComponents (misma recomendación).

    // 6. Cálculo en CLP de ambas series
    const real = computeRecommendedMonthlyReturnsCLP(resolvedReal, pricesByTicker, usdSeries, ufSeries, monthEnds);
    const proxy = computeRecommendedMonthlyReturnsCLP(proxyComponents, pricesByTicker, usdSeries, ufSeries, monthEnds);

    return successResponse({
      series: Object.keys(real.returns).length > 0
        ? { returns: real.returns, accumulated: real.accumulated, label: "Recomendado" }
        : null,
      benchmarkProxy: Object.keys(proxy.returns).length > 0
        ? { returns: proxy.returns, accumulated: proxy.accumulated, label: "Proxy de mercado" }
        : null,
    });
  });
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add app/api/portfolio/recommended-evolution/route.ts
git commit -m "feat(seguimiento): recommended-evolution devuelve serie real + benchmarkProxy en una llamada"
```

---

### Task 4: `GET/PUT /api/clients/[id]/benchmark` — soportar `benchmark_mode`

**Files:**
- Modify: `app/api/clients/[id]/benchmark/route.ts`

**Interfaces:**
- Produces: GET responde `{ benchmark, benchmark_mode }`; PUT acepta `{ benchmark?, benchmark_mode? }` y persiste lo que venga.

- [ ] **Step 1: GET incluye `benchmark_mode`.** En `app/api/clients/[id]/benchmark/route.ts`, en el handler GET, cambiar el `.select(...)` y la respuesta:

Buscar:

```ts
    const { data, error: dbError } = await supabase
      .from("clients")
      .select("benchmark_config")
      .eq("id", clientId)
      .single();

    if (dbError) return errorResponse("Cliente no encontrado", 404);

    return successResponse({
      benchmark: (data.benchmark_config as BenchmarkComponent[] | null) || DEFAULT_BENCHMARK,
    });
```

Reemplazar por:

```ts
    const { data, error: dbError } = await supabase
      .from("clients")
      .select("benchmark_config, benchmark_mode")
      .eq("id", clientId)
      .single();

    if (dbError) return errorResponse("Cliente no encontrado", 404);

    return successResponse({
      benchmark: (data.benchmark_config as BenchmarkComponent[] | null) || DEFAULT_BENCHMARK,
      benchmark_mode: (data.benchmark_mode as string | null) || "uf_spread",
    });
```

- [ ] **Step 2: PUT acepta `benchmark_mode`.** Reemplazar el cuerpo del handler PUT (desde `const body = await request.json();` hasta el `return successResponse(...)`) por:

```ts
    const body = await request.json();
    const { benchmark, benchmark_mode } = body as {
      benchmark?: BenchmarkComponent[];
      benchmark_mode?: "uf_spread" | "market_proxy";
    };

    const update: Record<string, unknown> = {};

    if (benchmark !== undefined) {
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
      update.benchmark_config = benchmark;
    }

    if (benchmark_mode !== undefined) {
      if (benchmark_mode !== "uf_spread" && benchmark_mode !== "market_proxy") {
        return errorResponse("benchmark_mode inválido", 400);
      }
      update.benchmark_mode = benchmark_mode;
    }

    if (Object.keys(update).length === 0) {
      return errorResponse("Nada que actualizar", 400);
    }

    const supabase = createAdminClient();
    const { error: dbError } = await supabase
      .from("clients")
      .update(update)
      .eq("id", clientId);

    if (dbError) return errorResponse("Error al guardar benchmark", 500);

    return successResponse({ benchmark, benchmark_mode });
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: exit 0. (Si los types generados de Supabase no incluyen `benchmark_mode`, el `.update(update)` con `Record<string, unknown>` y el `.select` con string evitan el error; si `tsc` se queja del select, castear `data as { benchmark_config: unknown; benchmark_mode: string | null }`.)

- [ ] **Step 4: Commit**

```bash
git add "app/api/clients/[id]/benchmark/route.ts"
git commit -m "feat(seguimiento): benchmark route GET/PUT soporta benchmark_mode"
```

---

### Task 5: `useBenchmarkConfig` — proxy series + modo del toggle

**Files:**
- Modify: `components/seguimiento/hooks/useBenchmarkConfig.ts`

**Interfaces:**
- Consumes: `GET/PUT /api/clients/[id]/benchmark`; `POST /api/portfolio/recommended-evolution` (respuesta `{ series, benchmarkProxy }`).
- Produces: en el objeto de retorno agrega `benchmarkProxyReturns: Record<string, number> | undefined`, `benchmarkMode: "uf_spread" | "market_proxy"`, `setBenchmarkMode: (m) => void`.

- [ ] **Step 1: Estado nuevo.** En `components/seguimiento/hooks/useBenchmarkConfig.ts`, añadir estados junto a los existentes (después de `const [recommendedReturns, setRecommendedReturns] = ...`):

```ts
  const [benchmarkProxyReturns, setBenchmarkProxyReturns] = useState<Record<string, number> | undefined>(undefined);
  const [benchmarkMode, setBenchmarkModeState] = useState<"uf_spread" | "market_proxy">("uf_spread");
```

Y añadir los tipos al `interface UseBenchmarkConfigReturn`:

```ts
  benchmarkProxyReturns: Record<string, number> | undefined;
  benchmarkMode: "uf_spread" | "market_proxy";
  setBenchmarkMode: (m: "uf_spread" | "market_proxy") => void;
```

- [ ] **Step 2: Sembrar `benchmarkMode` desde el GET de config.** Añadir un `useEffect` nuevo (tras el effect que sincroniza `initialBenchmarkConfig`):

```ts
  // Modo del toggle de benchmark (persistido por cliente)
  useEffect(() => {
    if (!clientId) return;
    fetch(`/api/clients/${clientId}/benchmark`)
      .then((r) => r.json())
      .then((d) => {
        const mode = d?.data?.benchmark_mode ?? d?.benchmark_mode;
        if (mode === "market_proxy" || mode === "uf_spread") setBenchmarkModeState(mode);
      })
      .catch(() => { /* mantiene uf_spread */ });
  }, [clientId]);
```

- [ ] **Step 3: Parsear `benchmarkProxy` de recommended-evolution.** En el effect que hace `fetch('/api/portfolio/recommended-evolution', ...)`, dentro del `.then((result) => { ... })`, DESPUÉS de setear `recommendedReturns`, agregar el parseo del proxy. Reemplazar el bloque:

```ts
        const series = result?.data?.series ?? result?.series;
        if (result?.success && series && series.returns && Object.keys(series.returns).length > 0) {
          setRecommendedReturns(series.returns);
        } else {
          setRecommendedReturns(undefined);
        }
```

por:

```ts
        const payload = result?.data ?? result;
        const series = payload?.series;
        if (result?.success && series && series.returns && Object.keys(series.returns).length > 0) {
          setRecommendedReturns(series.returns);
        } else {
          setRecommendedReturns(undefined);
        }
        const proxy = payload?.benchmarkProxy;
        if (proxy && proxy.returns && Object.keys(proxy.returns).length > 0) {
          setBenchmarkProxyReturns(proxy.returns);
        } else {
          setBenchmarkProxyReturns(undefined);
        }
```

- [ ] **Step 4: `setBenchmarkMode` con persistencia.** Añadir antes del `return` del hook:

```ts
  const setBenchmarkMode = useCallback((m: "uf_spread" | "market_proxy") => {
    setBenchmarkModeState(m);
    if (!clientId) return;
    fetch(`/api/clients/${clientId}/benchmark`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ benchmark_mode: m }),
    }).catch((err) => console.warn("[useBenchmarkConfig] Error guardando benchmark_mode:", err));
  }, [clientId]);
```

Y añadir `useCallback` al import de React (línea 3): `import { useState, useEffect, useMemo, useCallback } from "react";`.

- [ ] **Step 5: Exponer en el `return`.** Agregar al objeto retornado: `benchmarkProxyReturns, benchmarkMode, setBenchmarkMode,`.

- [ ] **Step 6: Typecheck + commit**

Run: `npx tsc --noEmit` → exit 0.

```bash
git add components/seguimiento/hooks/useBenchmarkConfig.ts
git commit -m "feat(seguimiento): useBenchmarkConfig expone benchmarkProxyReturns + toggle de modo"
```

---

### Task 6: `RetornosComparados` — toggle UF+2% ↔ Proxy + cableado

**Files:**
- Modify: `components/seguimiento/RetornosComparados.tsx`
- Modify: `components/seguimiento/SeguimientoPage.tsx`

**Interfaces:**
- Consumes: `benchmarkProxyReturns`, `benchmarkMode`, `setBenchmarkMode` de `useBenchmarkConfig`.
- Produces: props nuevas en `RetornosComparados`: `benchmarkProxyReturns?`, `benchmarkMode?`, `onBenchmarkModeChange?`.

- [ ] **Step 1: Añadir props.** En `components/seguimiento/RetornosComparados.tsx`, en `interface Props`, añadir tras `benchmarkReturns?`:

```ts
  /** Retornos del benchmark "proxy de mercado" (índices por clase). Opcional. */
  benchmarkProxyReturns?: Record<string, number>;
  benchmarkMode?: "uf_spread" | "market_proxy";
  onBenchmarkModeChange?: (m: "uf_spread" | "market_proxy") => void;
```

Y en la destructuración de props del componente (donde se listan `benchmarkReturns`, etc.), añadir:

```ts
  benchmarkProxyReturns,
  benchmarkMode = "uf_spread",
  onBenchmarkModeChange,
```

- [ ] **Step 2: Calcular benchmark efectivo.** Inmediatamente después de la destructuración de props (antes del primer `useMemo`), añadir:

```ts
  const proxyAvailable = !!benchmarkProxyReturns && Object.keys(benchmarkProxyReturns).length > 0;
  const useProxy = benchmarkMode === "market_proxy" && proxyAvailable;
  const effBenchReturns = useProxy ? benchmarkProxyReturns : benchmarkReturns;
  const effBenchLabel = useProxy ? "Proxy de mercado" : benchmarkLabel;
```

- [ ] **Step 3: Usar el benchmark efectivo en el cálculo.** Dentro del `useMemo` que arma `chartData`, reemplazar TODAS las referencias internas a `benchmarkReturns` por `effBenchReturns` (hay usos en las líneas que hacen `benchmarkReturns[monthKeys[i]]` y `benchmarkReturns[key]`, y en la condición `if (benchmarkMonthlyReturn != null || benchmarkReturns)`). NO cambiar la prop en la interfaz ni la destructuración. Además, en el array de dependencias del `useMemo`, reemplazar `benchmarkReturns` por `effBenchReturns`.

Concretamente:
- `if (benchmarkReturns && benchmarkReturns[monthKeys[i]] != null) benchReturn = benchmarkReturns[monthKeys[i]];` → usar `effBenchReturns`.
- `if (benchmarkReturns && benchmarkReturns[key] != null) benchReturn = benchmarkReturns[key];` → usar `effBenchReturns`.
- `if (benchmarkMonthlyReturn != null || benchmarkReturns) {` → `if (benchmarkMonthlyReturn != null || effBenchReturns) {`.
- Dep array: `[snapshots, historicalSeries, benchmarkMonthlyReturn, effBenchReturns, comparisonReturns, recommendedReturns, R, fxRateAt, benchmarkSpread]`.

- [ ] **Step 4: Label del benchmark en la leyenda/JSX.** Reemplazar las apariciones de `{benchmarkLabel}` en el JSX (leyenda, tabla resumen) por `{effBenchLabel}`.

- [ ] **Step 5: UI del toggle.** En el header del componente (donde está el título del bloque "Retornos Comparados"), añadir un toggle pill a la derecha. Insertar este bloque junto al título (dentro del contenedor flex del header; si el título no está en un flex, envolverlo en `<div className="flex items-center justify-between gap-3 mb-...">`):

```tsx
{onBenchmarkModeChange && (
  <div className="inline-flex rounded-md border border-gb-border overflow-hidden text-xs" role="group" aria-label="Modo de benchmark">
    <button
      type="button"
      onClick={() => onBenchmarkModeChange("uf_spread")}
      className={`px-2.5 py-1 ${benchmarkMode === "uf_spread" ? "bg-gb-black text-white" : "bg-white text-gb-gray hover:bg-gb-light"}`}
    >
      {benchmarkLabel}
    </button>
    <button
      type="button"
      onClick={() => proxyAvailable && onBenchmarkModeChange("market_proxy")}
      disabled={!proxyAvailable}
      title={proxyAvailable ? undefined : "Requiere una recomendación guardada para el cliente"}
      className={`px-2.5 py-1 border-l border-gb-border ${benchmarkMode === "market_proxy" && proxyAvailable ? "bg-gb-black text-white" : "bg-white text-gb-gray hover:bg-gb-light"} ${!proxyAvailable ? "opacity-40 cursor-not-allowed" : ""}`}
    >
      Proxy de mercado
    </button>
  </div>
)}
```

- [ ] **Step 6: Cablear en `SeguimientoPage`.** En `components/seguimiento/SeguimientoPage.tsx`, en el bloque donde se desestructura `useBenchmarkConfig(...)` (alrededor de la línea 55), añadir `benchmarkProxyReturns, benchmarkMode, setBenchmarkMode` a las variables extraídas. Luego, en el `<RetornosComparados ... />` (alrededor de la línea 492), añadir las props:

```tsx
              benchmarkProxyReturns={benchmarkProxyReturns}
              benchmarkMode={benchmarkMode}
              onBenchmarkModeChange={setBenchmarkMode}
```

- [ ] **Step 7: Typecheck**

Run: `npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 8: Commit**

```bash
git add components/seguimiento/RetornosComparados.tsx components/seguimiento/SeguimientoPage.tsx
git commit -m "feat(seguimiento): toggle UF+2% ↔ Proxy de mercado en Retornos Comparados"
```

---

### Task 7: Verificación E2E en local/preview

**Files:** (ninguno — verificación)

- [ ] **Step 1: Typecheck global + tests**

Run: `npx tsc --noEmit` → exit 0.
Run: `npx vitest run lib/prices/recommended-real.test.ts lib/prices/recommended-proxies.test.ts` → PASS.

- [ ] **Step 2: Verificación funcional** con un cliente que tenga **cartola(s)** y **recomendación guardada** (`cartera_recomendada.source === "comite_3col"`, p. ej. el cliente de prueba del sub-proyecto A):
  - Abrir el Seguimiento del cliente → bloque "Retornos Comparados".
  - Confirmar que la serie **Recomendado** (cobre) aparece y que su acumulado difiere del proxy si la Decisión tiene ETFs reales distintos del índice de clase.
  - **Toggle:** clic en "Proxy de mercado" → la línea de Benchmark y su label cambian; clic en "UF +2%" → vuelve. Recargar la página → el modo elegido **persiste** (viene de `clients.benchmark_mode`).
  - Cliente **sin** recomendación guardada → el botón "Proxy de mercado" queda deshabilitado (tooltip), la serie Recomendado no aparece, el resto del bloque funciona igual.

- [ ] **Step 3: Push + PR draft**

```bash
git push -u origin subproyecto-b-benchmark
gh pr create --draft --base master --head subproyecto-b-benchmark \
  --title "feat(seguimiento): serie Recomendado con instrumentos reales + toggle de benchmark" \
  --body "Sub-proyecto B. Ver docs/superpowers/plans/2026-07-27-serie-recomendada-real-toggle-benchmark.md"
```

(Si `gh` no está disponible, abrir el PR desde la URL que devuelve `git push`.)

---

## Self-Review (cobertura del spec)

- §1/§3.1 serie honesta (instrumentos reales) → Task 2 (`expandRealInstruments`) + Task 3 (swap por serie vacía). ✓
- §3.2 dos series en una llamada → Task 3. ✓
- §2/§3.3 columna `benchmark_mode` + persistencia → Task 1 (migración) + Task 4 (GET/PUT). ✓
- §3.4 hook expone proxy + modo → Task 5. ✓
- §3.5 toggle UI + selección de línea + cableado → Task 6. ✓
- §2 fallback Caja→UF / proxy de clase → Task 2 (`classProxyFor`, null ticker) + Task 3 (swap). ✓
- §5 casos borde (sin recomendación, <2 cierres, instrumento sin precio, modo inválido) → Task 3 (nulls) + Task 4 (validación) + Task 6 (toggle deshabilitado). ✓
- §6 testing → Task 2 (tests unitarios) + Task 7 (E2E). ✓
- §7 reuso (compute/proxies/market-series/resolveSource/patrón config) → Tasks 2, 3, 4, 6. ✓

Fuera de alcance (spec C): Portfolio Designer → "Mi Benchmark".
