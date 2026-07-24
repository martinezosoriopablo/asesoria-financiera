# Comparación triple: línea "Recomendado" — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Agregar una 4ª serie "Recomendado" (estrategia recomendada revalorizada a mercado, en CLP re-basado al toggle) a `RetornosComparados`, junto a Portafolio · Portfolio Inicial · UF+2%.

**Architecture:** Endpoint nuevo `recommended-evolution` lee `cartera_recomendada` (nivel-clase), la expande a un blend de índices proxy por clase (ACWI/AGG/GLD+RWO/UF), fetchea precios reales, calcula retornos mensuales ponderados **en CLP** (ETFs USD convertidos con el dólar observado) y devuelve un `Record<"YYYY-MM", number>`. El front lo consume igual que las otras series de comparación y lo re-basa a la moneda del toggle con `fxRateAt`. La matemática pura vive en `lib/prices/recommended-proxies.ts` (testeable sin red); el IO de red en `lib/prices/market-series.ts`.

**Tech Stack:** Next.js 16 (App Router) API routes, TypeScript, Vitest, Supabase (service_role vía `createAdminClient`), price-service (`lib/prices`), recharts (RetornosComparados).

## Global Constraints

- Path alias `@/` mapea a la raíz del proyecto. Usar `@/lib/...`, `@/components/...`.
- Utilidades de texto compartidas en `lib/text.ts` (`stripAccents`); NO redefinirlas localmente.
- Tipos de Supabase no incluyen `international_prices` → usar `as any` en esas queries si aplica.
- Auth de API routes: `requireClientAccess(clientId)` para rutas por-cliente (devuelve `{ error }`, chequear `if (error) return error`). Luego `createAdminClient()`.
- Respuestas API: `successResponse()` / `errorResponse()` de `@/lib/api-response`, handler envuelto en `handleApiError("route-name", async () => {...})`.
- Rate limit: `applyRateLimit(request, "route-name", { limit: N })`.
- Moneda canónica interna = **CLP**; el front re-basa CLP→R (toggle) con `fxRateAt`. El endpoint SIEMPRE devuelve CLP nominal.
- Marca cobre para la serie Recomendado: `#EB7838`.
- Correr tests: `npx vitest run <archivo>`. Build/lint: `npm run build`, `npm run lint`.

---

### Task 1: Módulo puro `recommended-proxies.ts` (mapa + matemática)

**Files:**
- Create: `lib/prices/recommended-proxies.ts`
- Test: `lib/prices/recommended-proxies.test.ts`

**Interfaces:**
- Consumes: `DailyPrice` de `@/lib/prices/types` (`{ date: string; price: number }`), `stripAccents` de `@/lib/text`.
- Produces:
  - `interface FlatProxy { ticker: string; weight: number; currency: "USD" | "CLP"; spread?: number }`
  - `RECOMMENDED_PROXIES: Record<string, Array<{ ticker: string; weight: number; currency: "USD" | "CLP"; spread?: number }>>`
  - `expandRecommendation(classWeights: Record<string, number>): FlatProxy[]` — pesos globales suman 1 (re-normalizado sobre clases reconocidas).
  - `buildMonthEnds(fromDate: string, toDate: string): string[]` — cierres de mes "YYYY-MM-DD" en `[fromDate, toDate]`.
  - `computeRecommendedMonthlyReturnsCLP(components: FlatProxy[], pricesByTicker: Record<string, DailyPrice[]>, usdSeries: DailyPrice[], ufSeries: DailyPrice[], monthEnds: string[]): { returns: Record<string, number>; accumulated: number }` — retornos mensuales en CLP.

- [ ] **Step 1: Write the failing test**

Create `lib/prices/recommended-proxies.test.ts`:

```typescript
// lib/prices/recommended-proxies.test.ts
import { describe, it, expect } from "vitest";
import {
  expandRecommendation,
  buildMonthEnds,
  computeRecommendedMonthlyReturnsCLP,
  type FlatProxy,
} from "./recommended-proxies";

describe("expandRecommendation", () => {
  it("mapea RV/RF a ACWI/AGG con pesos que suman 1", () => {
    const flat = expandRecommendation({ "Renta Variable": 60, "Renta Fija": 40 });
    const byTicker = Object.fromEntries(flat.map((f) => [f.ticker, f.weight]));
    expect(byTicker["ACWI"]).toBeCloseTo(0.6, 5);
    expect(byTicker["AGG"]).toBeCloseTo(0.4, 5);
    expect(flat.reduce((s, f) => s + f.weight, 0)).toBeCloseTo(1, 5);
  });

  it("expande Alternativos a blend oro+REIT y Caja a UF", () => {
    const flat = expandRecommendation({ "Renta Variable": 50, Alternativos: 10, Caja: 40 });
    const byTicker = Object.fromEntries(flat.map((f) => [f.ticker, f.weight]));
    expect(byTicker["ACWI"]).toBeCloseTo(0.5, 5);
    expect(byTicker["GLD"]).toBeCloseTo(0.05, 5);
    expect(byTicker["RWO"]).toBeCloseTo(0.05, 5);
    expect(byTicker["UF"]).toBeCloseTo(0.4, 5);
    expect(flat.find((f) => f.ticker === "UF")?.currency).toBe("CLP");
  });

  it("ignora clases no reconocidas y re-normaliza a suma 1", () => {
    const flat = expandRecommendation({ "Renta Variable": 50, Cripto: 50 });
    expect(flat).toHaveLength(1);
    expect(flat[0].ticker).toBe("ACWI");
    expect(flat[0].weight).toBeCloseTo(1, 5);
  });

  it("normaliza acentos/mayúsculas y variantes de caja", () => {
    const flat = expandRecommendation({ "renta variable": 100 });
    expect(flat[0].ticker).toBe("ACWI");
    const cash = expandRecommendation({ Liquidez: 100 });
    expect(cash[0].ticker).toBe("UF");
  });
});

describe("buildMonthEnds", () => {
  it("devuelve cierres de mes dentro del rango, sin saltarse febrero", () => {
    expect(buildMonthEnds("2026-01-15", "2026-03-10")).toEqual(["2026-01-31", "2026-02-28"]);
  });

  it("incluye el mes de fin si el rango llega al cierre", () => {
    expect(buildMonthEnds("2026-01-31", "2026-03-31")).toEqual([
      "2026-01-31",
      "2026-02-28",
      "2026-03-31",
    ]);
  });
});

describe("computeRecommendedMonthlyReturnsCLP", () => {
  const components: FlatProxy[] = [
    { ticker: "ACWI", weight: 0.6, currency: "USD" },
    { ticker: "UF", weight: 0.4, currency: "CLP", spread: 0 },
  ];
  const monthEnds = ["2026-01-31", "2026-02-28"];
  const pricesByTicker = {
    ACWI: [
      { date: "2026-01-31", price: 100 },
      { date: "2026-02-28", price: 110 },
    ],
  };
  const usdSeries = [
    { date: "2026-01-31", price: 900 },
    { date: "2026-02-28", price: 945 },
  ];
  const ufSeries = [
    { date: "2026-01-31", price: 37000 },
    { date: "2026-02-28", price: 37370 },
  ];

  it("pondera retornos CLP (ETF USD ajustado por dólar + UF por inflación)", () => {
    // ACWI: (1.10 × 945/900 − 1) = 15.5% ; UF: (37370/37000 − 1) = 1.0%
    // ponderado = 0.6×15.5 + 0.4×1.0 = 9.7%
    const { returns, accumulated } = computeRecommendedMonthlyReturnsCLP(
      components,
      pricesByTicker,
      usdSeries,
      ufSeries,
      monthEnds
    );
    expect(returns["2026-02"]).toBeCloseTo(9.7, 4);
    expect(accumulated).toBeCloseTo(9.7, 4);
  });

  it("re-normaliza por peso cubierto cuando falta el precio de un ticker", () => {
    // Sin serie de ACWI → solo UF (peso 0.4) cubre → retorno = 1.0% (re-normalizado)
    const { returns } = computeRecommendedMonthlyReturnsCLP(
      components,
      {},
      usdSeries,
      ufSeries,
      monthEnds
    );
    expect(returns["2026-02"]).toBeCloseTo(1.0, 4);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/prices/recommended-proxies.test.ts`
Expected: FAIL — "Failed to resolve import './recommended-proxies'" / funciones no definidas.

- [ ] **Step 3: Write the module**

Create `lib/prices/recommended-proxies.ts`:

```typescript
// lib/prices/recommended-proxies.ts
// Índices de mercado representativos por clase de activo. Sirven para
// revalorizar la cartera recomendada (nivel-clase RV/RF/Alt/Caja) como una
// estrategia de mercado real, y compararla contra el portafolio del cliente,
// el portafolio inicial y el benchmark. Ver spec 2026-07-23-comparacion-triple.
import { stripAccents } from "@/lib/text";
import type { DailyPrice } from "@/lib/prices/types";

export interface FlatProxy {
  ticker: string;
  weight: number; // peso global consolidado (clase × blend); el conjunto suma 1
  currency: "USD" | "CLP";
  spread?: number; // solo UF: spread anual %, retorno = inflación UF + spread/12
}

type ProxyBlend = Array<{ ticker: string; weight: number; currency: "USD" | "CLP"; spread?: number }>;

// clase normalizada (minúsculas, sin acentos) → blend de proxies (pesos suman 1 por clase)
export const RECOMMENDED_PROXIES: Record<string, ProxyBlend> = {
  "renta variable": [{ ticker: "ACWI", weight: 1, currency: "USD" }],
  "renta fija": [{ ticker: "AGG", weight: 1, currency: "USD" }],
  alternativos: [
    { ticker: "GLD", weight: 0.5, currency: "USD" },
    { ticker: "RWO", weight: 0.5, currency: "USD" },
  ],
  caja: [{ ticker: "UF", weight: 1, currency: "CLP", spread: 0 }],
};

function normalizeClass(clase: string): string | null {
  const c = stripAccents(clase).trim().toLowerCase();
  if (c === "renta variable") return "renta variable";
  if (c === "renta fija") return "renta fija";
  if (c === "alternativos" || c === "alternativas" || c === "instrumentos alternativos")
    return "alternativos";
  if (c === "caja" || c === "liquidez" || c === "efectivo") return "caja";
  return null;
}

/**
 * Expande pesos por clase (porcentajes, ej. { "Renta Variable": 60 }) a una
 * lista plana de proxies con pesos globales que suman 1. Clases no reconocidas
 * se ignoran y los pesos restantes se re-normalizan.
 */
export function expandRecommendation(classWeights: Record<string, number>): FlatProxy[] {
  const flat: FlatProxy[] = [];
  let totalMapped = 0;
  for (const [clase, pct] of Object.entries(classWeights)) {
    if (!pct || pct <= 0) continue;
    const key = normalizeClass(clase);
    if (!key) continue;
    totalMapped += pct;
    for (const p of RECOMMENDED_PROXIES[key]) {
      flat.push({
        ticker: p.ticker,
        weight: (pct / 100) * p.weight,
        currency: p.currency,
        spread: p.spread,
      });
    }
  }
  if (totalMapped <= 0) return [];
  const scale = 100 / totalMapped;
  return flat.map((f) => ({ ...f, weight: f.weight * scale }));
}

/** Cierres de mes ("YYYY-MM-DD") dentro de [fromDate, toDate], en UTC. */
export function buildMonthEnds(fromDate: string, toDate: string): string[] {
  const start = new Date(fromDate + "T00:00:00Z");
  const end = new Date(toDate + "T00:00:00Z");
  const ends: string[] = [];
  let y = start.getUTCFullYear();
  let m = start.getUTCMonth();
  while (true) {
    const monthEnd = new Date(Date.UTC(y, m + 1, 0)); // último día del mes (y, m)
    if (monthEnd > end) break;
    ends.push(monthEnd.toISOString().split("T")[0]);
    m++;
    if (m > 11) {
      m = 0;
      y++;
    }
  }
  return ends;
}

function closest(prices: DailyPrice[], target: string): number | null {
  let best: DailyPrice | null = null;
  for (const p of prices) {
    if (p.date <= target) best = p;
    else break;
  }
  if (!best) return null;
  const diff = (new Date(target).getTime() - new Date(best.date).getTime()) / 86400000;
  return diff <= 7 ? best.price : null;
}

/**
 * Retornos mensuales en CLP de la estrategia recomendada. Cada componente:
 * - USD: retorno CLP = (1 + retorno_nativo) × (usd_fin / usd_ini) − 1
 * - UF:  retorno CLP = inflación_UF_del_mes + spread/12
 * Se ponderan por `weight`. Si un componente no tiene precio en un mes, se
 * re-normaliza por el peso efectivamente cubierto (no subvalora el mes).
 * Requiere que `prices` esté ordenado ascendente por fecha.
 */
export function computeRecommendedMonthlyReturnsCLP(
  components: FlatProxy[],
  pricesByTicker: Record<string, DailyPrice[]>,
  usdSeries: DailyPrice[],
  ufSeries: DailyPrice[],
  monthEnds: string[]
): { returns: Record<string, number>; accumulated: number } {
  const returns: Record<string, number> = {};
  for (let i = 1; i < monthEnds.length; i++) {
    const prevEnd = monthEnds[i - 1];
    const currEnd = monthEnds[i];
    const key = currEnd.substring(0, 7);
    let weighted = 0;
    let weightCovered = 0;
    for (const c of components) {
      let clpRet: number | null = null;
      if (c.ticker === "UF") {
        const prevUf = closest(ufSeries, prevEnd);
        const currUf = closest(ufSeries, currEnd);
        if (prevUf && currUf && prevUf > 0) {
          clpRet = (currUf / prevUf - 1) * 100 + (c.spread ?? 0) / 12;
        }
      } else {
        const prices = pricesByTicker[c.ticker] || [];
        const prevP = closest(prices, prevEnd);
        const currP = closest(prices, currEnd);
        if (prevP && currP && prevP > 0) {
          const nativeRet = currP / prevP - 1;
          if (c.currency === "USD") {
            const usdStart = closest(usdSeries, prevEnd);
            const usdEnd = closest(usdSeries, currEnd);
            if (usdStart && usdEnd && usdStart > 0) {
              clpRet = ((1 + nativeRet) * (usdEnd / usdStart) - 1) * 100;
            }
          } else {
            clpRet = nativeRet * 100;
          }
        }
      }
      if (clpRet != null) {
        weighted += c.weight * clpRet;
        weightCovered += c.weight;
      }
    }
    if (weightCovered > 0) returns[key] = weighted / weightCovered;
  }
  let compound = 1;
  for (const v of Object.values(returns)) compound *= 1 + v / 100;
  return { returns, accumulated: (compound - 1) * 100 };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/prices/recommended-proxies.test.ts`
Expected: PASS (10 assertions across 4+3 describe blocks).

- [ ] **Step 5: Verify `stripAccents` export exists**

Run: `grep -n "export.*stripAccents" lib/text.ts`
Expected: una línea que exporta `stripAccents`. Si el nombre difiere (ej. `export function stripAccents`), confirmar que el import en Step 3 calza. Si NO existe, usar `.normalize("NFD").replace(/[̀-ͯ]/g, "")` inline en `normalizeClass` en su lugar y quitar el import.

- [ ] **Step 6: Commit**

```bash
git add lib/prices/recommended-proxies.ts lib/prices/recommended-proxies.test.ts
git commit -m "feat(precios): mapa de proxies + cálculo CLP de la estrategia recomendada

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Endpoint `recommended-evolution` + helpers de red

**Files:**
- Create: `lib/prices/market-series.ts`
- Create: `app/api/portfolio/recommended-evolution/route.ts`

**Interfaces:**
- Consumes: `expandRecommendation`, `buildMonthEnds`, `computeRecommendedMonthlyReturnsCLP`, `FlatProxy` de `@/lib/prices/recommended-proxies`; `resolveSource`, `getStoredPrices`, `fetchPriceRange`, `storeInternationalPrices` de `@/lib/prices/price-service`; `DailyPrice` de `@/lib/prices/types`; `requireClientAccess`, `createAdminClient` de `@/lib/auth/api-auth`.
- Produces:
  - `fetchBcchSeries(seriesId: string, fromDate: string, toDate: string): Promise<DailyPrice[]>` (en `market-series.ts`)
  - `getMarketTickerPrices(ticker: string, fromDate: string, toDate: string): Promise<DailyPrice[]>` (en `market-series.ts`)
  - `POST /api/portfolio/recommended-evolution` body `{ clientId }` → `{ success: true, data: { series: { returns: Record<string, number>; accumulated: number; label: string } | null } }`

- [ ] **Step 1: Write the network helpers**

Create `lib/prices/market-series.ts`:

```typescript
// lib/prices/market-series.ts
// Helpers de red para series de mercado usados por endpoints de comparación
// (recommended-evolution). Series BCCH (USD/UF) y precios de tickers vía
// price-service. IO puro; la matemática vive en recommended-proxies.ts.
import {
  resolveSource,
  getStoredPrices,
  fetchPriceRange,
  storeInternationalPrices,
} from "@/lib/prices/price-service";
import type { DailyPrice } from "@/lib/prices/types";

/**
 * Serie diaria de una serie BCCH (SI3). Ej: dólar observado
 * "F073.TCO.PRE.Z.D" (CLP/USD), UF "F073.UFF.PRE.Z.D" (CLP). Devuelve [] si
 * faltan credenciales o falla la red.
 */
export async function fetchBcchSeries(
  seriesId: string,
  fromDate: string,
  toDate: string
): Promise<DailyPrice[]> {
  const user = process.env.BCCH_API_USER;
  const pass = process.env.BCCH_API_PASSWORD;
  if (!user || !pass) return [];
  try {
    const url = `https://si3.bcentral.cl/SieteRestWS/SieteRestWS.ashx?user=${user}&pass=${pass}&firstdate=${fromDate}&lastdate=${toDate}&timeseries=${seriesId}&function=GetSeries`;
    const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
    if (!res.ok) return [];
    const data = await res.json();
    const obs = data?.Series?.Obs;
    if (!Array.isArray(obs)) return [];
    const out: DailyPrice[] = [];
    for (const o of obs) {
      const v = parseFloat(String(o.value).replace(",", "."));
      const ds = String(o.indexDateString || ""); // "DD-MM-YYYY"
      const parts = ds.split("-");
      if (parts.length !== 3 || !isFinite(v) || v <= 0) continue;
      out.push({ date: `${parts[2]}-${parts[1]}-${parts[0]}`, price: v });
    }
    out.sort((a, b) => a.date.localeCompare(b.date));
    return out;
  } catch {
    return [];
  }
}

/** Serie de precios de un ticker de mercado (US) vía price-service, con caché. */
export async function getMarketTickerPrices(
  ticker: string,
  fromDate: string,
  toDate: string
): Promise<DailyPrice[]> {
  const resolution = resolveSource({
    fundName: ticker,
    securityId: ticker,
    marketValue: 0,
    market: "US",
  });
  let prices = await getStoredPrices(ticker, fromDate, toDate);
  if (prices.length === 0) {
    const fetched = await fetchPriceRange(resolution, fromDate, toDate);
    if (fetched.length > 0) {
      await storeInternationalPrices(ticker, fetched, resolution.currency, resolution.source);
      prices = fetched;
    }
  }
  return prices;
}
```

- [ ] **Step 2: Write the endpoint**

Create `app/api/portfolio/recommended-evolution/route.ts`:

```typescript
// app/api/portfolio/recommended-evolution/route.ts
// Revaloriza la cartera recomendada (nivel-clase) como estrategia de mercado
// real y devuelve sus retornos mensuales en CLP. Paralelo a baseline-evolution
// (que hace lo análogo para el portafolio inicial). Ver spec 2026-07-23.
import { NextRequest } from "next/server";
import { requireClientAccess, createAdminClient } from "@/lib/auth/api-auth";
import { successResponse, errorResponse, handleApiError } from "@/lib/api-response";
import { applyRateLimit } from "@/lib/rate-limit";
import { fetchBcchSeries, getMarketTickerPrices } from "@/lib/prices/market-series";
import {
  expandRecommendation,
  buildMonthEnds,
  computeRecommendedMonthlyReturnsCLP,
} from "@/lib/prices/recommended-proxies";
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

    // 1. Recomendación (nivel-clase)
    const { data: client } = await supabase
      .from("clients")
      .select("cartera_recomendada")
      .eq("id", clientId)
      .single();
    const rec = client?.cartera_recomendada as Record<string, unknown> | null;
    if (!rec) return successResponse({ series: null });

    // 2. Pesos por clase (mismo patrón que check-drift)
    const cartera = (rec.cartera || []) as Array<{ clase: string; porcentaje: number }>;
    const classWeights: Record<string, number> = {};
    for (const p of cartera) {
      if (p.clase && p.porcentaje) classWeights[p.clase] = (classWeights[p.clase] || 0) + p.porcentaje;
    }
    if (Object.keys(classWeights).length === 0) {
      const eq = rec.equity_percent as number | undefined;
      const fi = rec.fixed_income_percent as number | undefined;
      if (eq) classWeights["Renta Variable"] = eq;
      if (fi) classWeights["Renta Fija"] = fi;
    }
    const components = expandRecommendation(classWeights);
    if (components.length === 0) return successResponse({ series: null });

    // 3. Rango: primera cartola real → hoy
    const { data: firstSnap } = await supabase
      .from("portfolio_snapshots")
      .select("snapshot_date")
      .eq("client_id", clientId)
      .in("source", ["manual", "statement", "excel"])
      .order("snapshot_date", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (!firstSnap) return successResponse({ series: null });
    const fromDate = firstSnap.snapshot_date as string;
    const toDate = new Date().toISOString().split("T")[0];

    // 4. Cierres de mes
    const monthEnds = buildMonthEnds(fromDate, toDate);
    if (monthEnds.length < 2) return successResponse({ series: null });

    // 5. Precios + FX
    const usdSeries = await fetchBcchSeries("F073.TCO.PRE.Z.D", fromDate, toDate);
    const needUf = components.some((c) => c.ticker === "UF");
    const ufSeries = needUf ? await fetchBcchSeries("F073.UFF.PRE.Z.D", fromDate, toDate) : [];

    const pricesByTicker: Record<string, DailyPrice[]> = {};
    for (const c of components) {
      if (c.ticker === "UF") continue;
      if (!pricesByTicker[c.ticker]) {
        pricesByTicker[c.ticker] = await getMarketTickerPrices(c.ticker, fromDate, toDate);
      }
    }

    // 6. Cálculo en CLP
    const { returns, accumulated } = computeRecommendedMonthlyReturnsCLP(
      components,
      pricesByTicker,
      usdSeries,
      ufSeries,
      monthEnds
    );

    return successResponse({ series: { returns, accumulated, label: "Recomendado" } });
  });
}
```

- [ ] **Step 3: Verify the build compiles**

Run: `npm run build`
Expected: build OK (sin errores de tipos en las rutas nuevas). Si `firstSnap`/`.maybeSingle()` marca tipo, castear `as { snapshot_date: string } | null`.

- [ ] **Step 4: Manual smoke test on localhost**

Con `npm run dev` corriendo y sesión iniciada (el usuario entra), en el navegador (o con la cookie de sesión) hacer POST a `/api/portfolio/recommended-evolution` con `{ "clientId": "<cliente con cartera_recomendada y ≥2 cartolas>" }` (ej. Felipe Fortt o B&B).
Expected: `{ success: true, data: { series: { returns: {"YYYY-MM": <número>, ...}, accumulated: <número>, label: "Recomendado" } } }`. Si el cliente no tiene recomendación → `series: null`.

> Nota entorno OneDrive: si el cambio no se refleja, reiniciar `npm run dev` (el file-watcher a veces no detecta ediciones a disco).

- [ ] **Step 5: Commit**

```bash
git add lib/prices/market-series.ts app/api/portfolio/recommended-evolution/route.ts
git commit -m "feat(precios): endpoint recommended-evolution (retornos CLP de la estrategia recomendada)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: 4ª serie "Recomendado" en `RetornosComparados`

**Files:**
- Modify: `components/seguimiento/RetornosComparados.tsx`

**Interfaces:**
- Consumes: `recommendedReturns?: Record<string, number>` (retornos CLP por "YYYY-MM", del endpoint Task 2).
- Produces: componente que renderiza hasta 4 series; nada que consuman otras tareas salvo la nueva prop.

- [ ] **Step 1: Add the prop to the interface**

En `components/seguimiento/RetornosComparados.tsx`, en `interface Props` (después de `comparisonReturns?: Record<string, number>;`, línea ~34), añadir:

```typescript
  /** Retornos CLP de la estrategia recomendada por "YYYY-MM" (revalorizada a mercado) */
  recommendedReturns?: Record<string, number>;
  recommendedLabel?: string;
```

- [ ] **Step 2: Destructure the prop**

En la firma del componente (después de `comparisonReturns,`, línea ~55), añadir:

```typescript
  recommendedReturns,
  recommendedLabel = "Recomendado",
```

- [ ] **Step 3: Add `recommended` to MonthData**

En `interface MonthData` (línea ~40-46), añadir el campo:

```typescript
  recommended: number | null;
```

- [ ] **Step 4: Compute `recommended` in both branches + accumulated**

En el `useMemo` de `chartData`. Hay TRES lugares que construyen `MonthData` y uno que arma el acumulado; en cada uno replicar el patrón de `comparison`.

**(a) Rama snapshots-fallback** (dentro de `if (!useHistorical)`, donde se hace `months.push({... comparison ...})`, línea ~163-173). Antes del `months.push`, añadir:

```typescript
          let recReturn: number | null = null;
          if (recommendedReturns && recommendedReturns[monthKeys[i]] != null) recReturn = recommendedReturns[monthKeys[i]];
          if (recReturn != null) recReturn = rebaseCLP(recReturn, prev.snapshot_date, curr.snapshot_date);
```

Y en ese `months.push({...})` añadir la propiedad:

```typescript
            recommended: recReturn != null ? parseFloat(recReturn.toFixed(2)) : null,
```

**(b) Acumulado de la rama snapshots-fallback** (donde se calcula `accumComp`, línea ~188-193). Después del bloque de `accumComp`, añadir:

```typescript
        let accumRec: number | null = null;
        if (recommendedReturns) {
          let compound = 1;
          for (const m of months) { if (m.recommended != null) compound *= 1 + m.recommended / 100; }
          accumRec = (compound - 1) * 100;
        }
```

Y en el `months.push({ monthKey: "_acum", ... })` de esa rama (línea ~194-199) añadir:

```typescript
          recommended: accumRec != null ? parseFloat(accumRec.toFixed(2)) : null,
```

**(c) Rama historical** (donde se hace `months.push({... comparison ...})`, línea ~223-233). Antes del `months.push`, añadir:

```typescript
      let recReturn: number | null = null;
      if (recommendedReturns && recommendedReturns[key] != null) recReturn = recommendedReturns[key];
      if (recReturn != null && dates) recReturn = rebaseCLP(recReturn, dates.start, dates.end);
```

Y en ese `months.push({...})` añadir:

```typescript
        recommended: recReturn != null ? parseFloat(recReturn.toFixed(2)) : null,
```

**(d) Acumulado de la rama historical** (donde se calcula `accumComp`, línea ~244-249). Después del bloque `accumComp`, añadir:

```typescript
      let accumRec: number | null = null;
      if (recommendedReturns) {
        let compound = 1;
        for (const m of months) { if (m.recommended != null) compound *= 1 + m.recommended / 100; }
        accumRec = (compound - 1) * 100;
      }
```

Y en el `months.push({ monthKey: "_acum", ... })` de esa rama (línea ~251-257) añadir:

```typescript
        recommended: accumRec != null ? parseFloat(accumRec.toFixed(2)) : null,
```

- [ ] **Step 5: Add `recommendedReturns` to the useMemo deps**

En el array de dependencias del `useMemo` (línea ~261), añadir `recommendedReturns`:

```typescript
  }, [snapshots, historicalSeries, benchmarkMonthlyReturn, benchmarkReturns, comparisonReturns, recommendedReturns, R, fxRateAt, benchmarkSpread]);
```

- [ ] **Step 6: Add `hasRecommended` flag**

Después de `const hasComparison = chartData.some((d) => d.comparison != null);` (línea ~270), añadir:

```typescript
  const hasRecommended = chartData.some((d) => d.recommended != null);
```

- [ ] **Step 7: Add the accumulated card**

En el grid de tarjetas de acumulado, después de la tarjeta de `hasComparison` (línea ~306-313), añadir:

```tsx
          {hasRecommended && accumData.recommended != null && (
            <div className="bg-gray-50 rounded-lg px-3 py-2">
              <div className="text-[11px] text-gb-gray">{recommendedLabel}</div>
              <div className="text-lg font-semibold" style={{ color: "#EB7838" }}>
                {accumData.recommended >= 0 ? "+" : ""}{formatNumber(accumData.recommended, 2)}%
              </div>
            </div>
          )}
```

- [ ] **Step 8: Add the chart bar**

En el `BarChart`, después del `<Bar dataKey="comparison" .../>` (línea ~352-360), añadir:

```tsx
            {hasRecommended && (
              <Bar
                dataKey="recommended"
                name={recommendedLabel}
                fill="#EB7838"
                radius={[4, 4, 0, 0]}
                maxBarSize={40}
              />
            )}
```

- [ ] **Step 9: Add the table column (header + cell)**

Header — después del `<th>` de `hasComparison` (línea ~377-379), antes del `<th>` de Diferencia, añadir:

```tsx
                {hasRecommended && (
                  <th className="text-right py-1.5 px-2 text-gb-gray font-medium">{recommendedLabel}</th>
                )}
```

Celda — dentro del `map`, después de la celda de `hasComparison` (línea ~402-406), añadir:

```tsx
                    {hasRecommended && (
                      <td className="py-1.5 px-2 text-right text-gb-gray">
                        {d.recommended != null ? `${formatNumber(d.recommended, 2)}%` : "—"}
                      </td>
                    )}
```

- [ ] **Step 10: Verify build + lint**

Run: `npm run build && npm run lint`
Expected: sin errores. (Si TS reclama que `recommended` falta en algún `MonthData` literal, revisar que los 3 `months.push` de datos y los 2 de `_acum` incluyan el campo.)

- [ ] **Step 11: Commit**

```bash
git add components/seguimiento/RetornosComparados.tsx
git commit -m "feat(seguimiento): 4ª serie Recomendado (cobre) en RetornosComparados

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Wiring — hook `useBenchmarkConfig` + `SeguimientoPage`

**Files:**
- Modify: `components/seguimiento/hooks/useBenchmarkConfig.ts`
- Modify: `components/seguimiento/SeguimientoPage.tsx`

**Interfaces:**
- Consumes: `POST /api/portfolio/recommended-evolution` (Task 2); prop `recommendedReturns` de `RetornosComparados` (Task 3).
- Produces: el hook expone `recommendedReturns: Record<string, number> | undefined` y `recommendedAccReturn: number | null`.

- [ ] **Step 1: Add state for recommended series**

En `components/seguimiento/hooks/useBenchmarkConfig.ts`, junto a los `useState` existentes (cerca de `const [baselineSeries, setBaselineSeries] = ...`, línea ~39), añadir:

```typescript
  const [recommendedReturns, setRecommendedReturns] = useState<Record<string, number> | undefined>(undefined);
  const [recommendedAccReturn, setRecommendedAccReturn] = useState<number | null>(null);
```

- [ ] **Step 2: Add fetch effect (mirror of baseline-evolution)**

Después del `useEffect` de baseline-evolution (después de la línea ~106, el que hace `fetch('/api/portfolio/baseline-evolution', ...)`), añadir:

```typescript
  // Fetch recommended evolution (estrategia recomendada revalorizada a mercado)
  useEffect(() => {
    if (!clientId || !snapshots || snapshots.length === 0) {
      setRecommendedReturns(undefined);
      setRecommendedAccReturn(null);
      return;
    }
    fetch('/api/portfolio/recommended-evolution', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clientId }),
    })
      .then((res) => res.json())
      .then((result) => {
        const series = result?.data?.series ?? result?.series;
        if (result?.success && series && series.returns && Object.keys(series.returns).length > 0) {
          setRecommendedReturns(series.returns);
          setRecommendedAccReturn(typeof series.accumulated === 'number' ? series.accumulated : null);
        } else {
          setRecommendedReturns(undefined);
          setRecommendedAccReturn(null);
        }
      })
      .catch((err) => console.warn('[useBenchmarkConfig] Error fetching recommended evolution:', err));
  }, [snapshots, clientId]);
```

> Nota: `successResponse` envuelve en `{ success, data }`; el `series` queda en `result.data.series`. El código soporta ambas formas por robustez.

- [ ] **Step 3: Expose in the hook return**

En el `return { ... }` del hook (cerca de la línea ~145-152, donde se retornan `baselineMonthlyReturns`, `baselineAccReturn`), añadir:

```typescript
    recommendedReturns,
    recommendedAccReturn,
```

- [ ] **Step 4: Destructure in SeguimientoPage**

En `components/seguimiento/SeguimientoPage.tsx`, donde se destructura el hook (junto a `baselineMonthlyReturns, baselineAccReturn,`, línea ~54), añadir:

```typescript
    recommendedReturns,
```

(Si `baselineMonthlyReturns` se obtiene de un objeto nombrado en vez de destructuring directo, seguir ese mismo patrón para `recommendedReturns`.)

- [ ] **Step 5: Pass the prop to RetornosComparados**

En el JSX de `<RetornosComparados ... />` (línea ~491-501), después de `comparisonReturns={baselineMonthlyReturns}`, añadir:

```tsx
              recommendedReturns={recommendedReturns}
```

- [ ] **Step 6: Verify build + lint**

Run: `npm run build && npm run lint`
Expected: sin errores.

- [ ] **Step 7: Manual E2E on localhost (CLP y USD)**

Con `npm run dev` corriendo y el usuario logueado, abrir Seguimiento de un cliente con `cartera_recomendada` y ≥2 cartolas (B&B / Felipe Fortt):
- La sección **Retornos Comparados** muestra ahora 4 barras por mes (Portafolio verde · **Recomendado cobre** · Portfolio Inicial naranja · UF+2% amarillo) + 4ª tarjeta de acumulado + columna en la tabla.
- Cambiar el toggle **CLP → USD → UF**: la línea Recomendado se re-basa igual que las demás (en CLP tal cual; en USD/UF ajustada por el FX de cada mes).
- Cliente **sin recomendación**: la 4ª serie no aparece (las otras 3 siguen).

Expected: coherente en las 3 monedas; sin errores en consola.

- [ ] **Step 8: Commit**

```bash
git add components/seguimiento/hooks/useBenchmarkConfig.ts components/seguimiento/SeguimientoPage.tsx
git commit -m "feat(seguimiento): cablea serie Recomendado en Retornos Comparados

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Actualizar memoria y cerrar pendiente

**Files:**
- Modify: `C:\Users\marti\.claude\projects\C--Users-marti-onedrive-documentos-asesoria-financiera\memory\project_moneda_reporte_seguimiento.md`
- Modify: `CLAUDE.md` (sección Seguimiento / price API routes)

- [ ] **Step 1: Marcar el pendiente como resuelto en la memoria**

En `project_moneda_reporte_seguimiento.md`, en la sección "PENDIENTE aún", mover "Unificar la comparación triple" a resuelto, describiendo: 4ª serie "Recomendado" en RetornosComparados vía `recommended-evolution` (pesos de clase × proxies ACWI/AGG/GLD+RWO/UF, CLP re-basado al toggle).

- [ ] **Step 2: Documentar el endpoint en CLAUDE.md**

Añadir bullet en la lista de "Price API routes": `POST /api/portfolio/recommended-evolution` — retornos CLP de la cartera recomendada revalorizada a mercado (proxies por clase en `lib/prices/recommended-proxies.ts`).

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: documenta recommended-evolution y cierra pendiente de comparación triple

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Self-Review

**Spec coverage:**
- Método "estrategia en el mercado (real)" → Task 1 (`expandRecommendation` + cálculo CLP) + Task 2 (endpoint).
- Mapa clase→índice blend (ACWI/AGG/GLD+RWO/UF) → Task 1 (`RECOMMENDED_PROXIES`).
- Normalización de clases + re-normalización de pesos → Task 1 (`normalizeClass`, `expandRecommendation`), testeado.
- Endpoint `recommended-evolution` (lee recomendación, rango, precios+FX, CLP) → Task 2.
- Devuelve CLP; front re-basa → Task 2 (CLP) + Task 3 (`rebaseCLP`).
- Hook fetch + expose → Task 4.
- 4ª serie (barra cobre + tarjeta + columna) → Task 3.
- SeguimientoPage pasa la prop → Task 4.
- Consistencia de moneda (re-base a R) → Task 3 (rama historical y snapshots).
- Bordes: sin recomendación / ticker sin precio / sin cartola → Task 1 (re-normaliza), Task 2 (`series: null`), Task 3 (guard `hasRecommended`).
- Testing: unit del cálculo + mapa → Task 1; E2E manual → Task 2 Step 4, Task 4 Step 7.

**Placeholder scan:** sin TBD/TODO; todo el código está completo en cada step.

**Type consistency:** `FlatProxy`, `expandRecommendation`, `buildMonthEnds`, `computeRecommendedMonthlyReturnsCLP` definidas en Task 1 y consumidas con esas firmas en Task 2. `recommendedReturns: Record<string, number>` consistente entre endpoint (Task 2), hook (Task 4) y prop de RetornosComparados (Task 3). Shape de respuesta `{ data: { series: { returns, accumulated, label } } }` manejada en Task 4 Step 2.
