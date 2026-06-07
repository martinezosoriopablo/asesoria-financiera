# Quick Wins — Auditoría Junio 2026

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementar 10 quick wins identificados en la auditoría del sistema para mejorar seguridad, confiabilidad y mantenibilidad.

**Architecture:** Cambios quirúrgicos en archivos existentes — sin refactors mayores. Extraer utilidades compartidas a `lib/`, agregar logging a cadenas de fallback, circuit breaker en EODHD, fix de auth en snapshots, y ErrorBoundary.

**Tech Stack:** Next.js 16, React 19, Supabase, Vitest

**IMPORTANTE:** No modificar lógica de cálculos financieros (retornos, precios, conversiones) sin consultar primero al usuario. Los cálculos actuales son correctos — el objetivo es extraer a utilidades compartidas sin cambiar comportamiento.

---

## File Structure

### New files:
- `lib/portfolio/classify.ts` — funciones de clasificación de activos y detección de moneda (extraídas de ReviewSnapshotModal)
- `lib/portfolio/classify.test.ts` — tests para clasificación
- `lib/portfolio/currency.ts` — conversión toCLP/fromCLP (pura, sin hooks)
- `lib/portfolio/currency.test.ts` — tests para conversión
- `lib/prices/circuit-breaker.ts` — circuit breaker genérico para APIs con rate limit
- `lib/prices/circuit-breaker.test.ts` — tests
- `components/shared/ErrorBoundary.tsx` — Error boundary React

### Modified files:
- `components/seguimiento/ReviewSnapshotModal.tsx` — importar desde `lib/portfolio/` en vez de definir localmente
- `lib/prices/eodhd.ts` — agregar circuit breaker
- `lib/prices/price-service.ts` — agregar logging a fallbacks
- `app/api/portfolio/snapshots/route.ts` — usar `requireAuth()`
- `app/api/cron/send-reports/route.ts` — env var para email
- `app/api/exchange-rates/route.ts` — agregar staleness warning
- `lib/bcch.ts` — validar credenciales al cargar módulo
- `app/api/portfolio/historical-prices/route.ts` — batch queries con `.in()`
- `app/(advisor-shell)/layout.tsx` — wrap con ErrorBoundary
- `CLAUDE.md` — documentar nuevos módulos
- `docs/GREYBARK-ARCHITECTURE.md` — actualizar

---

### Task 1: Extraer funciones de clasificación a `lib/portfolio/classify.ts`

**Files:**
- Create: `lib/portfolio/classify.ts`
- Create: `lib/portfolio/classify.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// lib/portfolio/classify.test.ts
import { describe, it, expect } from "vitest";
import { detectCurrencyFromName, assetTypeToClass, classifyFund } from "./classify";

describe("detectCurrencyFromName", () => {
  it("detects USD from fund name", () => {
    expect(detectCurrencyFromName("Fondo USD Global")).toBe("USD");
    expect(detectCurrencyFromName("EEUU Large Cap")).toBe("USD");
  });
  it("detects EUR", () => {
    expect(detectCurrencyFromName("Europa Bond Fund")).toBe("EUR");
  });
  it("detects UF", () => {
    expect(detectCurrencyFromName("Renta Fija UF Corto Plazo")).toBe("UF");
  });
  it("detects CLP", () => {
    expect(detectCurrencyFromName("Chile Local Equity")).toBe("CLP");
  });
  it("defaults to USD", () => {
    expect(detectCurrencyFromName("Unknown Fund XYZ")).toBe("USD");
  });
});

describe("assetTypeToClass", () => {
  it("maps bond to fixedIncome", () => expect(assetTypeToClass("bond")).toBe("fixedIncome"));
  it("maps cash to cash", () => expect(assetTypeToClass("cash")).toBe("cash"));
  it("maps etf to equity", () => expect(assetTypeToClass("etf")).toBe("equity"));
  it("maps stock to equity", () => expect(assetTypeToClass("stock")).toBe("equity"));
  it("returns null for fund", () => expect(assetTypeToClass("fund")).toBeNull());
  it("returns null for undefined", () => expect(assetTypeToClass()).toBeNull());
});

describe("classifyFund", () => {
  it("classifies money market as cash", () => {
    expect(classifyFund("BCI Money Market")).toBe("cash");
    expect(classifyFund("Liquidez Diaria")).toBe("cash");
  });
  it("classifies bonds as fixedIncome", () => {
    expect(classifyFund("Renta Fija Corporate")).toBe("fixedIncome");
    expect(classifyFund("High Yield Bond Fund")).toBe("fixedIncome");
  });
  it("classifies balanced", () => {
    expect(classifyFund("Balanceado Moderado")).toBe("balanced");
  });
  it("classifies alternatives", () => {
    expect(classifyFund("Real Estate Fund")).toBe("alternatives");
  });
  it("defaults to equity", () => {
    expect(classifyFund("Emerging Markets Growth")).toBe("equity");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run lib/portfolio/classify.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Create the module — exact copy of functions from ReviewSnapshotModal**

```typescript
// lib/portfolio/classify.ts

/**
 * Detect currency from fund name heuristics.
 * Extracted from ReviewSnapshotModal — DO NOT modify logic.
 */
export function detectCurrencyFromName(fundName: string): string {
  const name = fundName.toLowerCase();
  if (name.includes("usd") || name.includes("dollar") || name.includes("dolar") ||
      name.includes("us ") || name.includes("(us)") || name.includes("eeuu") ||
      name.includes("usa") || name.includes("global") || name.includes("international")) {
    return "USD";
  }
  if (name.includes("eur") || name.includes("euro") || name.includes("europa") ||
      name.includes("european")) {
    return "EUR";
  }
  if (name.includes(" uf") || name.includes("(uf)") || name.includes("uf ")) {
    return "UF";
  }
  if (name.includes("clp") || name.includes("peso") || name.includes("chile") ||
      name.includes("local") || name.includes("nacional")) {
    return "CLP";
  }
  return "USD";
}

/**
 * Map instrument assetType to portfolio class.
 * Extracted from ReviewSnapshotModal — DO NOT modify logic.
 */
export function assetTypeToClass(assetType?: string): string | null {
  if (!assetType) return null;
  switch (assetType) {
    case "bond": return "fixedIncome";
    case "cash": return "cash";
    case "etf":
    case "stock": return "equity";
    default: return null;
  }
}

/**
 * Classify a fund by name into asset class.
 * Extracted from ReviewSnapshotModal — DO NOT modify logic.
 */
export function classifyFund(fundName: string): string {
  const name = fundName.toLowerCase();
  if (name.includes("money market") || name.includes("mm ") || name.includes("liquidez") ||
      name.includes("efectivo") || name.includes("cash") || name.includes("disponible")) {
    return "cash";
  }
  if (name.includes("renta fija") || name.includes("fixed income") || name.includes("bond") ||
      name.includes("bono") || name.includes("deuda") || name.includes("corporate") ||
      name.includes("soberan") || name.includes("high yield") || name.includes("investment grade") ||
      name.includes("ig ") || name.includes("hy ") || name.includes("rf ") ||
      name.includes("deposito") || name.includes("depósito") || name.includes("pacto")) {
    return "fixedIncome";
  }
  if (name.includes("balanced") || name.includes("balanceado") || name.includes("mixto") ||
      name.includes("multi-asset") || name.includes("multiactivo") || name.includes("allocation") ||
      name.includes("moderate") || name.includes("moderado")) {
    return "balanced";
  }
  if (name.includes("alternativ") || name.includes("real estate") || name.includes("inmobiliario") ||
      name.includes("private equity") || name.includes("hedge") || name.includes("commodity") ||
      name.includes("infraestruct") || name.includes("real asset")) {
    return "alternatives";
  }
  return "equity";
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run lib/portfolio/classify.test.ts`
Expected: PASS (all 13 tests)

- [ ] **Step 5: Update ReviewSnapshotModal to import from lib**

In `components/seguimiento/ReviewSnapshotModal.tsx`, replace the local function definitions (lines 99-155) with:

```typescript
import { detectCurrencyFromName, assetTypeToClass, classifyFund } from "@/lib/portfolio/classify";
```

Delete the three local function definitions (`detectCurrencyFromName`, `assetTypeToClass`, `classifyFund`).

- [ ] **Step 6: Verify app compiles**

Run: `npx next build` (or `npm run build`)
Check no import errors.

- [ ] **Step 7: Commit**

```bash
git add lib/portfolio/classify.ts lib/portfolio/classify.test.ts components/seguimiento/ReviewSnapshotModal.tsx
git commit -m "refactor: extract classify/currency-detect to lib/portfolio/classify"
```

---

### Task 2: Extraer conversión de moneda a `lib/portfolio/currency.ts`

**Files:**
- Create: `lib/portfolio/currency.ts`
- Create: `lib/portfolio/currency.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// lib/portfolio/currency.test.ts
import { describe, it, expect } from "vitest";
import { toCLP, fromCLP } from "./currency";

const rates = { usd: 950, eur: 1020, uf: 38000 };

describe("toCLP", () => {
  it("converts USD to CLP", () => expect(toCLP(100, "USD", rates)).toBe(95000));
  it("converts EUR to CLP", () => expect(toCLP(100, "EUR", rates)).toBe(102000));
  it("converts UF to CLP", () => expect(toCLP(1, "UF", rates)).toBe(38000));
  it("returns CLP as-is", () => expect(toCLP(1000, "CLP", rates)).toBe(1000));
  it("returns value if unknown currency", () => expect(toCLP(100, "GBP", rates)).toBe(100));
});

describe("fromCLP", () => {
  it("converts CLP to USD", () => expect(fromCLP(95000, "USD", rates)).toBeCloseTo(100));
  it("converts CLP to EUR", () => expect(fromCLP(102000, "EUR", rates)).toBeCloseTo(100));
  it("converts CLP to UF", () => expect(fromCLP(38000, "UF", rates)).toBeCloseTo(1));
  it("returns CLP as-is", () => expect(fromCLP(1000, "CLP", rates)).toBe(1000));
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run lib/portfolio/currency.test.ts`
Expected: FAIL

- [ ] **Step 3: Create the module**

```typescript
// lib/portfolio/currency.ts

export interface ExchangeRates {
  usd: number;
  eur: number;
  uf: number;
}

/**
 * Convert a value in any currency to CLP.
 * Pure function — extracted from ReviewSnapshotModal.
 */
export function toCLP(value: number, currency: string, rates: ExchangeRates): number {
  switch (currency) {
    case "USD": return value * rates.usd;
    case "EUR": return value * rates.eur;
    case "UF": return value * rates.uf;
    case "CLP": return value;
    default: return value;
  }
}

/**
 * Convert a CLP value to target currency.
 * Pure function — extracted from ReviewSnapshotModal.
 */
export function fromCLP(clpValue: number, targetCurrency: string, rates: ExchangeRates): number {
  switch (targetCurrency) {
    case "USD": return clpValue / rates.usd;
    case "EUR": return clpValue / rates.eur;
    case "UF": return clpValue / rates.uf;
    case "CLP": return clpValue;
    default: return clpValue;
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run lib/portfolio/currency.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/portfolio/currency.ts lib/portfolio/currency.test.ts
git commit -m "refactor: extract toCLP/fromCLP to lib/portfolio/currency"
```

---

### Task 3: Agregar logging a cadena de fallback de precios

**Files:**
- Modify: `lib/prices/price-service.ts` (lines 246-301)

- [ ] **Step 1: Add console.warn to each fallback path**

In `lib/prices/price-service.ts`, modify `fetchPriceRange()`:

```typescript
export async function fetchPriceRange(
  resolution: SourceResolution,
  fromDate: string,
  toDate: string
): Promise<DailyPrice[]> {
  if (resolution.source === "alphavantage") {
    const avPrices = await fetchDailyPricesRange(
      resolution.symbol,
      fromDate,
      toDate
    );
    if (avPrices.length > 0) return avPrices;
    console.warn(`[price-service] AV returned no data for ${resolution.symbol}, falling back to Yahoo`);
    const yahooPrices = fetchYahooHistorical(resolution.symbol, fromDate, toDate);
    return yahooPrices;
  }

  if (resolution.source === "eodhd") {
    const prices = await fetchEodhdHistorical(resolution.symbol, fromDate, toDate);
    if (prices.length > 0) return prices;
    console.warn(`[price-service] EODHD returned no data for ${resolution.symbol}, trying Yahoo fallback`);
    const mapping = Object.values(INTL_FUND_MAP).find(m => m.eodhd === resolution.symbol);
    if (mapping?.yahoo) {
      return fetchYahooHistorical(mapping.yahoo, fromDate, toDate);
    }
    console.warn(`[price-service] No Yahoo fallback mapping for EODHD symbol ${resolution.symbol}`);
    return [];
  }

  if (resolution.source === "yahoo") {
    return fetchYahooHistorical(resolution.symbol, fromDate, toDate);
  }

  if (resolution.source === "bolsa-santiago") {
    try {
      const bsData = await getBolsaHistorical(resolution.symbol, fromDate, toDate);
      if (bsData.length > 0) {
        return bsData.map((d) => ({ date: d.date, price: d.close }));
      }
    } catch {
      console.warn(`[price-service] Bolsa Santiago unavailable for ${resolution.symbol}, falling back to Yahoo .SN`);
    }
    const yahooSymbol = resolution.symbol.toUpperCase().endsWith(".SN")
      ? resolution.symbol
      : `${resolution.symbol}.SN`;
    return fetchYahooHistorical(yahooSymbol, fromDate, toDate);
  }

  if (resolution.source === "cl-adr") {
    return fetchClAdrHistorical(resolution.symbol, fromDate, toDate);
  }

  console.warn(`[price-service] No handler for source "${resolution.source}", symbol "${resolution.symbol}"`);
  return [];
}
```

- [ ] **Step 2: Same pattern for `fetchLatestPrice()`**

Add `console.warn` in the same file to each fallback in `fetchLatestPrice()` (lines 307+). Same pattern: log when primary source returns null and fallback is attempted.

- [ ] **Step 3: Verify tests still pass**

Run: `npx vitest run lib/prices/`
Expected: All 34 tests pass (logging doesn't affect test behavior)

- [ ] **Step 4: Commit**

```bash
git add lib/prices/price-service.ts
git commit -m "fix: add logging to price fallback chains for observability"
```

---

### Task 4: Circuit breaker para EODHD

**Files:**
- Create: `lib/prices/circuit-breaker.ts`
- Create: `lib/prices/circuit-breaker.test.ts`
- Modify: `lib/prices/eodhd.ts`

- [ ] **Step 1: Write failing tests for circuit breaker**

```typescript
// lib/prices/circuit-breaker.test.ts
import { describe, it, expect, beforeEach, vi } from "vitest";
import { CircuitBreaker } from "./circuit-breaker";

describe("CircuitBreaker", () => {
  beforeEach(() => vi.useFakeTimers());

  it("allows calls when under limit", () => {
    const cb = new CircuitBreaker({ maxCalls: 3, windowMs: 60000 });
    expect(cb.canCall()).toBe(true);
    cb.recordCall();
    cb.recordCall();
    expect(cb.canCall()).toBe(true);
  });

  it("blocks calls when limit reached", () => {
    const cb = new CircuitBreaker({ maxCalls: 2, windowMs: 60000 });
    cb.recordCall();
    cb.recordCall();
    expect(cb.canCall()).toBe(false);
  });

  it("resets after window expires", () => {
    const cb = new CircuitBreaker({ maxCalls: 2, windowMs: 60000 });
    cb.recordCall();
    cb.recordCall();
    expect(cb.canCall()).toBe(false);
    vi.advanceTimersByTime(61000);
    expect(cb.canCall()).toBe(true);
  });

  it("remaining returns correct count", () => {
    const cb = new CircuitBreaker({ maxCalls: 5, windowMs: 60000 });
    cb.recordCall();
    cb.recordCall();
    expect(cb.remaining()).toBe(3);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run lib/prices/circuit-breaker.test.ts`

- [ ] **Step 3: Implement circuit breaker**

```typescript
// lib/prices/circuit-breaker.ts

interface CircuitBreakerConfig {
  maxCalls: number;
  windowMs: number;
}

export class CircuitBreaker {
  private calls: number[] = [];
  private config: CircuitBreakerConfig;

  constructor(config: CircuitBreakerConfig) {
    this.config = config;
  }

  private pruneOld(): void {
    const cutoff = Date.now() - this.config.windowMs;
    this.calls = this.calls.filter((t) => t > cutoff);
  }

  canCall(): boolean {
    this.pruneOld();
    return this.calls.length < this.config.maxCalls;
  }

  recordCall(): void {
    this.calls.push(Date.now());
  }

  remaining(): number {
    this.pruneOld();
    return Math.max(0, this.config.maxCalls - this.calls.length);
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run lib/prices/circuit-breaker.test.ts`

- [ ] **Step 5: Wire circuit breaker into EODHD**

Modify `lib/prices/eodhd.ts`:

```typescript
// lib/prices/eodhd.ts

import type { DailyPrice } from "./types";
import { CircuitBreaker } from "./circuit-breaker";

// EODHD free tier: 20 calls/day
const breaker = new CircuitBreaker({ maxCalls: 18, windowMs: 24 * 60 * 60 * 1000 });

function getApiKey(): string {
  return process.env.EODHD_API_KEY || "";
}

export async function fetchEodhdHistorical(
  ticker: string,
  fromDate: string,
  toDate: string
): Promise<DailyPrice[]> {
  const apiKey = getApiKey();
  if (!apiKey) return [];

  if (!breaker.canCall()) {
    console.warn(`[eodhd] Circuit breaker open — ${breaker.remaining()} calls remaining in window`);
    return [];
  }

  try {
    breaker.recordCall();
    const url = `https://eodhd.com/api/eod/${encodeURIComponent(ticker)}?api_token=${apiKey}&fmt=json&period=d&from=${fromDate}&to=${toDate}`;
    const response = await fetch(url, {
      signal: AbortSignal.timeout(15000),
    });

    if (!response.ok) {
      console.warn(`[eodhd] HTTP ${response.status} for ${ticker}`);
      return [];
    }
    const data = await response.json();
    if (!Array.isArray(data) || data.length === 0) return [];

    return data
      .filter((d: { date: string; close: number }) => d.close != null)
      .map((d: { date: string; close: number }) => ({
        date: d.date,
        price: d.close,
      }))
      .sort((a: DailyPrice, b: DailyPrice) => a.date.localeCompare(b.date));
  } catch (err) {
    console.warn(`[eodhd] Fetch error for ${ticker}:`, err instanceof Error ? err.message : err);
    return [];
  }
}

export async function fetchEodhdQuote(
  ticker: string
): Promise<{ price: number; date: string } | null> {
  const apiKey = getApiKey();
  if (!apiKey) return null;

  if (!breaker.canCall()) {
    console.warn(`[eodhd] Circuit breaker open for quote — ${breaker.remaining()} calls remaining`);
    return null;
  }

  try {
    breaker.recordCall();
    const to = new Date().toISOString().split("T")[0];
    const from = new Date(Date.now() - 7 * 86400000).toISOString().split("T")[0];

    const url = `https://eodhd.com/api/eod/${encodeURIComponent(ticker)}?api_token=${apiKey}&fmt=json&period=d&from=${from}&to=${to}`;
    const response = await fetch(url, {
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) return null;
    const data = await response.json();
    if (!Array.isArray(data) || data.length === 0) return null;

    const last = data[data.length - 1];
    if (last.close == null) return null;
    return { price: last.close, date: last.date };
  } catch {
    return null;
  }
}
```

- [ ] **Step 6: Run all price tests**

Run: `npx vitest run lib/prices/`
Expected: All pass (circuit breaker is additive, doesn't break existing tests)

- [ ] **Step 7: Commit**

```bash
git add lib/prices/circuit-breaker.ts lib/prices/circuit-breaker.test.ts lib/prices/eodhd.ts
git commit -m "feat: add circuit breaker to EODHD API client (18 calls/day limit)"
```

---

### Task 5: Fix auth en `/api/portfolio/snapshots`

**Files:**
- Modify: `app/api/portfolio/snapshots/route.ts` (lines 1-10, 45-51, 118-129)

- [ ] **Step 1: Add requireAuth import and replace auth pattern in GET**

Replace lines 5 and 45-51:

Old (line 5):
```typescript
import { createSupabaseServerClient } from "@/lib/supabase/server";
```

New:
```typescript
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireAuth, createAdminClient } from "@/lib/auth/api-auth";
```

Old GET auth (lines 45-51):
```typescript
    const supabase = await createSupabaseServerClient();

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ success: false, error: "No autorizado" }, { status: 401 });
    }
```

New:
```typescript
    const { user, error: authError } = await requireAuth();
    if (authError) return authError;

    const supabase = await createSupabaseServerClient();
```

NOTE: Keep `createSupabaseServerClient()` (not `createAdminClient()`) because this route uses RLS to scope results. We just add the auth gate first.

- [ ] **Step 2: Same pattern for POST handler**

Replace the POST auth block (lines ~120-128) with the same `requireAuth()` pattern.

- [ ] **Step 3: Verify build**

Run: `npm run build`

- [ ] **Step 4: Commit**

```bash
git add app/api/portfolio/snapshots/route.ts
git commit -m "security: add requireAuth() gate to portfolio snapshots route"
```

---

### Task 6: Email hardcodeado → env var

**Files:**
- Modify: `app/api/cron/send-reports/route.ts` (line 186)

- [ ] **Step 1: Replace hardcoded email**

Change line 186 from:
```typescript
from: `${advisor.company_name || "Asesoría Financiera"} <pmartinez@greybark.com>`,
```

To:
```typescript
from: `${advisor.company_name || "Asesoría Financiera"} <${process.env.RESEND_FROM_EMAIL || "noreply@greybark.com"}>`,
```

- [ ] **Step 2: Commit**

```bash
git add app/api/cron/send-reports/route.ts
git commit -m "fix: move hardcoded sender email to RESEND_FROM_EMAIL env var"
```

---

### Task 7: Staleness warning en exchange-rates fallback

**Files:**
- Modify: `app/api/exchange-rates/route.ts` (lines 98-107)

- [ ] **Step 1: Add staleness warning and log**

Change the fallback block (lines 98-107) from:
```typescript
        return NextResponse.json({
          success: true,
          usd: 950,
          eur: 1020,
          uf: 38000,
          timestamp: new Date().toISOString(),
          fallback: true,
          error: "Using static fallback values — both BCCH and mindicador.cl failed",
        });
```

To:
```typescript
        console.error("[exchange-rates] CRITICAL: Both BCCH and mindicador.cl failed, using static fallback");
        return NextResponse.json({
          success: true,
          usd: 950,
          eur: 1020,
          uf: 38000,
          timestamp: new Date().toISOString(),
          fallback: true,
          stale: true,
          warning: "Valores estáticos de emergencia — verificar manualmente",
          error: "Using static fallback values — both BCCH and mindicador.cl failed",
        });
```

- [ ] **Step 2: Commit**

```bash
git add app/api/exchange-rates/route.ts
git commit -m "fix: add staleness warning and logging to exchange-rate static fallback"
```

---

### Task 8: Validar credenciales BCCH al cargar módulo

**Files:**
- Modify: `lib/bcch.ts` (after line 40)

- [ ] **Step 1: Add startup validation**

After the `getCredentials()` function (after line 40), add:

```typescript
// Validate BCCH credentials at module load — fail fast in production
if (typeof window === "undefined") {
  const _creds = getCredentials();
  if (!_creds) {
    console.warn("[bcch] WARNING: BCCH_API_USER or BCCH_API_PASSWORD not configured — exchange rates will use fallback sources");
  }
}
```

NOTE: No `throw` — solo warn. El sistema tiene fallbacks (mindicador.cl, static values). Tirar un error rompería el build en dev sin credenciales.

- [ ] **Step 2: Commit**

```bash
git add lib/bcch.ts
git commit -m "fix: validate BCCH credentials at module load with warning"
```

---

### Task 9: Crear ErrorBoundary component

**Files:**
- Create: `components/shared/ErrorBoundary.tsx`
- Modify: `app/(advisor-shell)/layout.tsx`

- [ ] **Step 1: Create ErrorBoundary**

```typescript
// components/shared/ErrorBoundary.tsx
"use client";

import React from "react";

interface Props {
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export default class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("[ErrorBoundary]", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;
      return (
        <div className="flex items-center justify-center min-h-[200px] p-8">
          <div className="text-center">
            <h3 className="text-lg font-semibold text-red-600 mb-2">
              Error inesperado
            </h3>
            <p className="text-sm text-gray-600 mb-4">
              {this.state.error?.message || "Algo salió mal"}
            </p>
            <button
              onClick={() => this.setState({ hasError: false, error: null })}
              className="px-4 py-2 bg-gray-800 text-white rounded-lg text-sm hover:bg-gray-700"
            >
              Intentar de nuevo
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
```

- [ ] **Step 2: Wrap advisor shell layout with ErrorBoundary**

In `app/(advisor-shell)/layout.tsx`, import and wrap the `{children}`:

```typescript
import ErrorBoundary from "@/components/shared/ErrorBoundary";
```

Wrap `{children}` inside the layout's main content area with:
```tsx
<ErrorBoundary>{children}</ErrorBoundary>
```

- [ ] **Step 3: Verify build**

Run: `npm run build`

- [ ] **Step 4: Commit**

```bash
git add components/shared/ErrorBoundary.tsx app/\(advisor-shell\)/layout.tsx
git commit -m "feat: add ErrorBoundary component and wrap advisor shell layout"
```

---

### Task 10: Batch N+1 queries en historical-prices

**Files:**
- Modify: `app/api/portfolio/historical-prices/route.ts` (lines 73-146)

**NOTA:** Este es el cambio más delicado. La lógica de selección de serie (por precio, por nombre, fallback) debe preservarse exactamente. Solo cambiamos de N queries individuales a 1-2 queries batch + procesamiento local.

- [ ] **Step 1: Pre-fetch all fondos_mutuos for the RUNs in one query**

Replace lines 73-146 with a batched approach. First, collect all unique RUNs:

```typescript
  // 1a. Batch-resolve fund IDs for all holdings with RUN
  const allRuns = [...new Set(holdings.filter(h => h.run).map(h => h.run))];

  // Single query: get ALL series for ALL runs at once
  const { data: allFondos } = allRuns.length > 0
    ? await supabase
        .from("fondos_mutuos")
        .select("id, fo_run, fm_serie, moneda_funcional")
        .in("fo_run", allRuns)
    : { data: [] };

  const fondosByRun = new Map<string, typeof allFondos>();
  for (const f of (allFondos || [])) {
    const list = fondosByRun.get(f.fo_run) || [];
    list.push(f);
    fondosByRun.set(f.fo_run, list);
  }
```

- [ ] **Step 2: For serie matching by price, batch-fetch latest prices**

When multiple series exist and we need to match by `cartolaPrice`, instead of querying one-by-one, batch all fondo_ids:

```typescript
  // Pre-fetch latest prices for all fondos to avoid N+1 in serie matching
  const allFondoIds = (allFondos || []).map(f => f.id);
  const latestPricesMap = new Map<string, number>();

  if (allFondoIds.length > 0) {
    // Get latest valor_cuota for each fondo_id using a single query per batch
    for (let i = 0; i < allFondoIds.length; i += 500) {
      const batch = allFondoIds.slice(i, i + 500);
      const { data: latestRows } = await supabase
        .rpc("get_latest_valor_cuota", { fondo_ids: batch });
      // Fallback if RPC doesn't exist: use a different approach
      if (latestRows) {
        for (const row of latestRows) {
          latestPricesMap.set(row.fondo_id, row.valor_cuota);
        }
      }
    }
  }
```

**NOTA IMPORTANTE:** Si la función RPC `get_latest_valor_cuota` no existe, usar un approach alternativo con DISTINCT ON o query individual pero solo para holdings que realmente necesitan price-matching (los que tienen múltiples series Y cartolaPrice). Esto reduce de ~60 queries a ~5-10 como máximo.

**Approach alternativo sin RPC** (más seguro, no requiere migración):

```typescript
  // For holdings that need serie matching by price, do targeted queries
  for (const h of holdings) {
    if (!h.run) continue;
    const resolvedSerie = h.serie || detectSerieCode(h.fundName || "") || "";
    const key = `${h.run}-${resolvedSerie}`;
    const seriesForRun = fondosByRun.get(h.run) || [];

    if (seriesForRun.length === 0) continue;

    let fondo = null;

    // Try exact serie match first (no DB query needed — already fetched)
    if (resolvedSerie) {
      fondo = seriesForRun.find(s => s.fm_serie === resolvedSerie) || null;
    }

    if (!fondo) {
      if (seriesForRun.length === 1) {
        fondo = seriesForRun[0];
      } else if (h.cartolaPrice && h.cartolaPrice > 0) {
        // Only THIS case needs extra queries — match by price
        // But use pre-fetched latestPricesMap if available
        let best = seriesForRun[0];
        let bestDiff = Infinity;
        for (const s of seriesForRun) {
          let precio = latestPricesMap.get(s.id);
          if (precio === undefined) {
            // Fallback: individual query (should be rare)
            const { data: latest } = await supabase
              .from("fondos_rentabilidades_diarias")
              .select("valor_cuota")
              .eq("fondo_id", s.id)
              .order("fecha", { ascending: false })
              .limit(1)
              .single();
            precio = latest?.valor_cuota;
            if (precio !== undefined) latestPricesMap.set(s.id, precio);
          }
          if (precio !== undefined) {
            const diff = Math.abs(precio - h.cartolaPrice);
            if (diff < bestDiff) { bestDiff = diff; best = s; }
          }
        }
        fondo = best;
      } else {
        const nameDetected = detectSerieCode(h.fundName || "");
        const nameMatch = nameDetected
          ? seriesForRun.find(s => s.fm_serie === nameDetected)
          : null;
        fondo = nameMatch || seriesForRun[0];
      }
    }

    if (!fondo) continue;

    // TAC query — keep as individual (already fast, single row per holding)
    let tacQuery = supabase
      .from("vw_fondos_completo")
      .select("tac_sintetica")
      .eq("fo_run", h.run);
    if (resolvedSerie) tacQuery = tacQuery.eq("fm_serie", resolvedSerie);
    const { data: vw } = await tacQuery.limit(1).single();

    fundInfo.set(key, {
      id: fondo.id,
      fundName: h.fundName,
      quantity: h.quantity,
      tac: vw?.tac_sintetica ?? null,
      cartolaPrice: h.cartolaPrice || 0,
      moneda: fondo.moneda_funcional || "CLP",
    });
  }
```

- [ ] **Step 3: Verify build and test**

Run: `npm run build`
Run: `npx vitest run lib/prices/`

- [ ] **Step 4: Commit**

```bash
git add app/api/portfolio/historical-prices/route.ts
git commit -m "perf: batch fondos_mutuos queries in historical-prices to fix N+1"
```

---

### Task 11: Actualizar documentación

**Files:**
- Modify: `CLAUDE.md`
- Modify: `docs/GREYBARK-ARCHITECTURE.md`

- [ ] **Step 1: Update CLAUDE.md**

Add to the "Key patterns" section after "Shared text utilities":

```markdown
**Portfolio classification:** `lib/portfolio/classify.ts` (detectCurrencyFromName, assetTypeToClass, classifyFund) and `lib/portfolio/currency.ts` (toCLP, fromCLP). Do NOT define these locally in components.

**ErrorBoundary:** `components/shared/ErrorBoundary.tsx` wraps the advisor shell layout. Add to new route groups as needed.

**Price service logging:** All fallback chains in `lib/prices/price-service.ts` log warnings when primary source fails. EODHD uses a circuit breaker (18 calls/day window) via `lib/prices/circuit-breaker.ts`.
```

- [ ] **Step 2: Update GREYBARK-ARCHITECTURE.md**

Add to section 9 (Seguridad):
```markdown
- **ErrorBoundary**: React error boundaries en layout del asesor previenen crashes de página completa
- **Circuit breaker**: EODHD API limitado a 18 calls/día con fallback automático a Yahoo
```

- [ ] **Step 3: Commit all docs**

```bash
git add CLAUDE.md docs/GREYBARK-ARCHITECTURE.md
git commit -m "docs: document new shared utilities, ErrorBoundary, and circuit breaker"
```
