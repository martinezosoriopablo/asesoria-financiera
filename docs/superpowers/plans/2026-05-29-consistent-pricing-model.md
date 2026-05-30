# Consistent Pricing Model Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Unificar todas las fuentes de precios en Seguimiento para que usen el price service centralizado, implementar costo base persistente desde cartola, y agregar evolucion del portfolio inicial revalorizado a mercado.

**Architecture:** Nuevo modulo `lib/cost-basis.ts` calcula y persiste costo base en el JSONB de holdings al guardar snapshots. HoldingReturnsPanel se refactoriza para usar `prices-at-date` API en vez de calls directos. Nuevo endpoint `baseline-evolution` revaloriza el portfolio inicial. EvolucionChart y RetornosComparados reciben series adicionales (baseline + benchmark).

**Tech Stack:** Next.js 16 App Router, React 19, Supabase (Postgres JSONB), Vitest, lib/prices/ (AlphaVantage/Yahoo/CMF)

**Spec:** `docs/superpowers/specs/2026-05-29-consistent-pricing-model-design.md`

---

## File Structure

### New files
- `lib/cost-basis.ts` — Pure function: calcula costBasis por holding comparando con snapshot anterior
- `lib/cost-basis.test.ts` — Tests para logica de costo base
- `app/api/portfolio/baseline-evolution/route.ts` — Endpoint que revaloriza baseline a precios de mercado

### Modified files
- `app/api/portfolio/snapshots/route.ts` — Integrar cost basis calculation al guardar
- `components/seguimiento/HoldingReturnsPanel.tsx` — Refactorizar para usar prices-at-date API
- `components/seguimiento/EvolucionChart.tsx` — Agregar baselineSeries y benchmarkSeries props
- `components/seguimiento/RetornosComparados.tsx` — Conectar comparisonReturns al baseline
- `components/seguimiento/SeguimientoPage.tsx` — Orquestar fetch de baseline evolution

---

## Task 1: Cost Basis Library

**Files:**
- Create: `lib/cost-basis.ts`
- Create: `lib/cost-basis.test.ts`

- [ ] **Step 1: Write failing tests for cost basis calculation**

```typescript
// lib/cost-basis.test.ts
import { describe, it, expect } from 'vitest';
import { calculateCostBasis, matchHolding } from './cost-basis';

describe('matchHolding', () => {
  it('matches by securityId (RUN)', () => {
    const current = { fundName: 'Fondo A', securityId: '9876', quantity: 100, marketPrice: 15000, marketValue: 1500000 };
    const previous = [
      { fundName: 'Fondo A Renamed', securityId: '9876', quantity: 100, marketPrice: 14000, marketValue: 1400000, costBasis: 13000, costBasisDate: '2026-01-15' },
    ];
    const match = matchHolding(current, previous);
    expect(match).not.toBeNull();
    expect(match!.securityId).toBe('9876');
  });

  it('matches by fundName when no securityId', () => {
    const current = { fundName: 'Fondo Mutuo BCI', quantity: 50, marketPrice: 2000, marketValue: 100000 };
    const previous = [
      { fundName: 'Fondo Mutuo BCI', quantity: 50, marketPrice: 1900, marketValue: 95000, costBasis: 1800, costBasisDate: '2026-02-01' },
    ];
    const match = matchHolding(current, previous);
    expect(match).not.toBeNull();
    expect(match!.fundName).toBe('Fondo Mutuo BCI');
  });

  it('returns null when no match found', () => {
    const current = { fundName: 'Fondo Nuevo', securityId: 'XYZ', quantity: 10, marketPrice: 500, marketValue: 5000 };
    const previous = [
      { fundName: 'Fondo Viejo', securityId: 'ABC', quantity: 20, marketPrice: 300, marketValue: 6000 },
    ];
    const match = matchHolding(current, previous);
    expect(match).toBeNull();
  });
});

describe('calculateCostBasis', () => {
  it('new position (no previous) — uses cartola price', () => {
    const result = calculateCostBasis(
      { fundName: 'SPY', quantity: 10, marketPrice: 450, marketValue: 4500 },
      null,
      '2026-03-15'
    );
    expect(result.costBasis).toBe(450);
    expect(result.costBasisDate).toBe('2026-03-15');
  });

  it('same quantity — inherits previous cost basis', () => {
    const result = calculateCostBasis(
      { fundName: 'SPY', quantity: 10, marketPrice: 480, marketValue: 4800 },
      { fundName: 'SPY', quantity: 10, marketPrice: 450, marketValue: 4500, costBasis: 420, costBasisDate: '2026-01-10' },
      '2026-03-15'
    );
    expect(result.costBasis).toBe(420);
    expect(result.costBasisDate).toBe('2026-01-10');
  });

  it('quantity changed — new cost basis from cartola', () => {
    const result = calculateCostBasis(
      { fundName: 'SPY', quantity: 15, marketPrice: 480, marketValue: 7200 },
      { fundName: 'SPY', quantity: 10, marketPrice: 450, marketValue: 4500, costBasis: 420, costBasisDate: '2026-01-10' },
      '2026-03-15'
    );
    expect(result.costBasis).toBe(480);
    expect(result.costBasisDate).toBe('2026-03-15');
  });

  it('no marketPrice — calculates from marketValue/quantity', () => {
    const result = calculateCostBasis(
      { fundName: 'Fondo X', quantity: 200, marketValue: 1000000 },
      null,
      '2026-03-15'
    );
    expect(result.costBasis).toBe(5000);
    expect(result.costBasisDate).toBe('2026-03-15');
  });

  it('previous has no costBasis (legacy) — treats as new position', () => {
    const result = calculateCostBasis(
      { fundName: 'SPY', quantity: 10, marketPrice: 480, marketValue: 4800 },
      { fundName: 'SPY', quantity: 10, marketPrice: 450, marketValue: 4500 },
      '2026-03-15'
    );
    // Previous has no costBasis field — cannot inherit, use current cartola price
    expect(result.costBasis).toBe(480);
    expect(result.costBasisDate).toBe('2026-03-15');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run lib/cost-basis.test.ts`
Expected: FAIL — `Cannot find module './cost-basis'`

- [ ] **Step 3: Implement cost basis library**

```typescript
// lib/cost-basis.ts

export interface HoldingWithCostBasis {
  fundName: string;
  securityId?: string | null;
  quantity?: number;
  marketPrice?: number;
  marketValue: number;
  costBasis?: number;
  costBasisDate?: string;
  [key: string]: unknown;
}

/**
 * Match a holding in the current snapshot to one in the previous snapshot.
 * Match priority: securityId (RUN/ticker/CUSIP) > fundName exact match.
 */
export function matchHolding(
  current: { fundName: string; securityId?: string | null; [key: string]: unknown },
  previousHoldings: HoldingWithCostBasis[]
): HoldingWithCostBasis | null {
  if (!previousHoldings || previousHoldings.length === 0) return null;

  // Match by securityId first (most reliable: RUN, ticker, CUSIP)
  if (current.securityId) {
    const match = previousHoldings.find(
      (p) => p.securityId && p.securityId === current.securityId
    );
    if (match) return match;
  }

  // Fallback: exact fundName match
  const nameMatch = previousHoldings.find(
    (p) => p.fundName === current.fundName
  );
  return nameMatch || null;
}

/**
 * Calculate cost basis for a single holding.
 *
 * Rules:
 * - New position (no previous match): costBasis = cartola price
 * - Same quantity as previous: inherit previous costBasis
 * - Quantity changed: costBasis = cartola price (new acquisition cost)
 *
 * Cartola price = marketPrice if available, else marketValue / quantity.
 */
export function calculateCostBasis(
  current: { fundName: string; quantity?: number; marketPrice?: number; marketValue: number; [key: string]: unknown },
  previous: HoldingWithCostBasis | null,
  snapshotDate: string
): { costBasis: number; costBasisDate: string } {
  const cartolaPrice = current.marketPrice || (current.quantity ? current.marketValue / current.quantity : current.marketValue);

  // New position or previous has no costBasis (legacy data)
  if (!previous || previous.costBasis == null || previous.costBasisDate == null) {
    return { costBasis: cartolaPrice, costBasisDate: snapshotDate };
  }

  // Same quantity — inherit cost basis
  const currentQty = current.quantity ?? 0;
  const previousQty = previous.quantity ?? 0;
  if (currentQty === previousQty) {
    return { costBasis: previous.costBasis, costBasisDate: previous.costBasisDate };
  }

  // Quantity changed — new cost basis
  return { costBasis: cartolaPrice, costBasisDate: snapshotDate };
}

/**
 * Enrich all holdings in a snapshot with cost basis data.
 * Compares against the previous snapshot's holdings.
 */
export function enrichHoldingsWithCostBasis(
  holdings: HoldingWithCostBasis[],
  previousHoldings: HoldingWithCostBasis[],
  snapshotDate: string
): HoldingWithCostBasis[] {
  return holdings.map((holding) => {
    const match = matchHolding(holding, previousHoldings);
    const { costBasis, costBasisDate } = calculateCostBasis(holding, match, snapshotDate);
    return { ...holding, costBasis, costBasisDate };
  });
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run lib/cost-basis.test.ts`
Expected: All 6 tests PASS

- [ ] **Step 5: Add test for enrichHoldingsWithCostBasis**

```typescript
// Append to lib/cost-basis.test.ts

describe('enrichHoldingsWithCostBasis', () => {
  it('enriches a full holdings array with mixed scenarios', () => {
    const current = [
      { fundName: 'Fondo A', securityId: '1234', quantity: 100, marketPrice: 5000, marketValue: 500000 },
      { fundName: 'Fondo B', securityId: '5678', quantity: 200, marketPrice: 3000, marketValue: 600000 },
      { fundName: 'Fondo C', securityId: '9999', quantity: 50, marketPrice: 10000, marketValue: 500000 },
    ];
    const previous = [
      { fundName: 'Fondo A', securityId: '1234', quantity: 100, marketPrice: 4500, marketValue: 450000, costBasis: 4000, costBasisDate: '2026-01-01' },
      { fundName: 'Fondo B', securityId: '5678', quantity: 150, marketPrice: 2800, marketValue: 420000, costBasis: 2500, costBasisDate: '2026-01-01' },
      // Fondo C is new — no previous match
    ];

    const enriched = enrichHoldingsWithCostBasis(current, previous, '2026-03-15');

    // Fondo A: same quantity (100) → inherits costBasis 4000
    expect(enriched[0].costBasis).toBe(4000);
    expect(enriched[0].costBasisDate).toBe('2026-01-01');

    // Fondo B: quantity changed (150 → 200) → new costBasis from cartola
    expect(enriched[1].costBasis).toBe(3000);
    expect(enriched[1].costBasisDate).toBe('2026-03-15');

    // Fondo C: new position → costBasis from cartola
    expect(enriched[2].costBasis).toBe(10000);
    expect(enriched[2].costBasisDate).toBe('2026-03-15');
  });
});
```

- [ ] **Step 6: Run all cost basis tests**

Run: `npx vitest run lib/cost-basis.test.ts`
Expected: All 7 tests PASS

- [ ] **Step 7: Commit**

```bash
git add lib/cost-basis.ts lib/cost-basis.test.ts
git commit -m "feat: add cost basis library with holding-level persistence rules"
```

---

## Task 2: Integrate Cost Basis into Snapshot Save

**Files:**
- Modify: `app/api/portfolio/snapshots/route.ts`
- Read: `lib/cost-basis.ts` (from Task 1)

- [ ] **Step 1: Read the current snapshots route**

Read `app/api/portfolio/snapshots/route.ts` to understand the POST handler structure. Key areas:
- Lines 159-166: where previous snapshot is fetched
- Lines 277-283: where snapshot is upserted
- The `holdings` field in the upsert payload

- [ ] **Step 2: Add cost basis enrichment before upsert**

In `app/api/portfolio/snapshots/route.ts`, add the import and enrichment logic:

```typescript
// Add import at top of file
import { enrichHoldingsWithCostBasis } from '@/lib/cost-basis';
```

Find the section where `holdings` are prepared for upsert (before the `.upsert()` call). Add cost basis enrichment using the previous snapshot that's already fetched:

```typescript
// After fetching prevSnapshot (already exists around line 159-166):
// Enrich holdings with cost basis before saving
let enrichedHoldings = holdings;
if (holdings && holdings.length > 0) {
  const previousHoldings = (prevSnapshot?.holdings as HoldingWithCostBasis[]) || [];
  enrichedHoldings = enrichHoldingsWithCostBasis(
    holdings as HoldingWithCostBasis[],
    previousHoldings,
    snapshotDate
  );
}
```

Replace `holdings` with `enrichedHoldings` in the upsert payload.

- [ ] **Step 3: Verify the build compiles**

Run: `npx next build --no-lint 2>&1 | head -20`
Expected: No TypeScript errors related to the snapshots route.

- [ ] **Step 4: Commit**

```bash
git add app/api/portfolio/snapshots/route.ts
git commit -m "feat: enrich holdings with cost basis on snapshot save"
```

---

## Task 3: Refactor HoldingReturnsPanel to Use Price Service

**Files:**
- Modify: `components/seguimiento/HoldingReturnsPanel.tsx`

This is the largest change. HoldingReturnsPanel currently makes direct calls to Yahoo/Fintual/FINRA. It needs to use `POST /api/portfolio/prices-at-date` instead.

- [ ] **Step 1: Read the current HoldingReturnsPanel**

Read `components/seguimiento/HoldingReturnsPanel.tsx` in full. Identify:
- Lines 335-484: the three parallel API calls (funds, stocks, bonds)
- Lines 501-564: where prices are merged into holdings
- The `HoldingReturnsData` interface (exported, consumed by PerformanceAttribution and RentabilidadPorActivo)
- The `basePrices` calculation (lines 200-232)

- [ ] **Step 2: Replace direct price fetching with prices-at-date API**

Replace the three parallel fetch blocks (funds/stocks/bonds) with a single call to `prices-at-date`. The key change:

**Before** (3 separate fetch calls):
```typescript
// Fetch fund prices from Fintual
// Fetch stock quotes from Yahoo
// Fetch bond prices from FINRA
```

**After** (single unified call):
```typescript
// Build holdings array for prices-at-date API
const holdingsForPricing = latestHoldings
  .filter((h: HoldingData) => h.assetClass !== 'cash' && h.assetClass !== 'efectivo')
  .map((h: HoldingData) => ({
    fundName: h.fundName,
    securityId: h.securityId || null,
    serie: h.serie || null,
    quantity: h.quantity,
    assetClass: h.assetClass,
  }));

// Use costBasisDate as start date (from cartola), today as end date
const firstCostBasisDate = latestHoldings
  .filter((h: HoldingData) => h.costBasisDate)
  .map((h: HoldingData) => h.costBasisDate!)
  .sort()[0] || snapshotDate;

const today = new Date().toISOString().split('T')[0];

const priceResponse = await fetch('/api/portfolio/prices-at-date', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    holdings: holdingsForPricing,
    startDate: firstCostBasisDate,
    endDate: today,
  }),
});

const priceData = await priceResponse.json();
```

- [ ] **Step 3: Update return calculation to use costBasis**

Replace the existing return calculation logic. Instead of using `basePrices` from the first snapshot:

```typescript
// For each holding, calculate return from costBasis
const enrichedHoldings = latestHoldings.map((holding: HoldingData) => {
  if (holding.assetClass === 'cash' || holding.assetClass === 'efectivo') {
    return { ...holding, returnFromBase: 0, contribution: 0 };
  }

  const costBasis = holding.costBasis;
  const priceResult = priceData.results?.find(
    (r: { fundName: string }) => r.fundName === holding.fundName
  );
  const currentPrice = priceResult?.endPrice;

  let returnFromBase = 0;
  if (costBasis && currentPrice && costBasis > 0) {
    returnFromBase = ((currentPrice - costBasis) / costBasis) * 100;
  }

  const weight = holding.marketValue / totalPortfolioValue;
  const contribution = weight * returnFromBase;

  return { ...holding, returnFromBase, currentPrice, weight, contribution };
});
```

- [ ] **Step 4: Remove direct Yahoo/Fintual/FINRA imports and calls**

Remove or comment out:
- `yahoo-finance2` imports and direct calls
- Fintual API calls (`/api/advisor/preferred-funds` for prices)
- FINRA/bond lookup calls (`/api/bonds/lookup`, `/api/bonds/latest-prices`)
- The `fetchFintualPrices`, `fetchStockQuotes`, `fetchBondPrices` helper functions (or equivalent blocks)

Keep bond-specific calculations (YTM, accrued interest) if they use local pure functions — those don't need price service.

- [ ] **Step 5: Verify HoldingReturnsData interface is preserved**

The exported `HoldingReturnsData` interface must remain identical so PerformanceAttribution and RentabilidadPorActivo continue working:

```typescript
// This interface must NOT change:
export interface HoldingReturnsData {
  equityHoldings: EquityHolding[];
  fixedIncomeFundHoldings: EquityHolding[];
  bondHoldings: BondHoldingRow[];
  cashValue: number;
  totalValue: number;
  portfolioReturn: number;
}
```

Ensure the `onHoldingReturnsReady(data)` callback still emits data in this shape.

- [ ] **Step 6: Test manually in dev**

Run: `npm run dev`
1. Navigate to a client's Seguimiento page
2. Verify HoldingReturnsPanel loads and shows returns
3. Verify PerformanceAttribution shows consistent numbers
4. Check browser Network tab: should see `prices-at-date` call instead of multiple Yahoo/Fintual calls

- [ ] **Step 7: Commit**

```bash
git add components/seguimiento/HoldingReturnsPanel.tsx
git commit -m "refactor: HoldingReturnsPanel uses prices-at-date API instead of direct Yahoo/Fintual/FINRA"
```

---

## Task 4: Baseline Evolution API Endpoint

**Files:**
- Create: `app/api/portfolio/baseline-evolution/route.ts`

- [ ] **Step 1: Create the baseline evolution endpoint**

```typescript
// app/api/portfolio/baseline-evolution/route.ts
import { NextRequest } from 'next/server';
import { requireAdvisor } from '@/lib/auth/api-auth';
import { createAdminClient } from '@/lib/auth/api-auth';
import { successResponse, errorResponse } from '@/lib/api-response';
import { handleApiError } from '@/lib/api-response';
import { applyRateLimit } from '@/lib/rate-limit';

export async function POST(request: NextRequest) {
  return handleApiError('baseline-evolution', async () => {
    const rateLimitResult = await applyRateLimit(request, 'baseline-evolution', { limit: 10 });
    if (rateLimitResult) return rateLimitResult;

    const { error } = await requireAdvisor(request);
    if (error) return error;

    const { clientId } = await request.json();
    if (!clientId) return errorResponse('clientId es requerido', 400);

    const supabase = createAdminClient();

    // 1. Get baseline snapshot
    const { data: baseline, error: baselineError } = await supabase
      .from('portfolio_snapshots')
      .select('id, snapshot_date, total_value, holdings')
      .eq('client_id', clientId)
      .eq('is_baseline', true)
      .single();

    if (baselineError || !baseline) {
      return errorResponse('No se encontro portfolio inicial (baseline)', 404);
    }

    const holdings = baseline.holdings as Array<{
      fundName: string;
      securityId?: string;
      serie?: string;
      quantity?: number;
      marketPrice?: number;
      marketValue: number;
      assetClass?: string;
    }>;

    if (!holdings || holdings.length === 0) {
      return errorResponse('El portfolio inicial no tiene posiciones', 400);
    }

    // 2. Build holdings payload for historical-prices API
    // Separate Chilean (by RUN) and international holdings
    const holdingsByRun: Array<{ run: string; serie: string; quantity: number; marketValue: number }> = [];
    const internationalHoldings: Array<{ symbol: string; quantity: number; marketValue: number; currency: string }> = [];
    const holdingsByName: Array<{ name: string; quantity: number; marketValue: number }> = [];

    for (const h of holdings) {
      if (h.assetClass === 'cash' || h.assetClass === 'efectivo') continue;

      const secId = h.securityId || '';
      const isRun = /^\d{3,6}$/.test(secId);
      const isCFI = secId.startsWith('CFI');
      const isInternational = !isRun && !isCFI && secId.length > 0;

      if (isRun) {
        holdingsByRun.push({
          run: secId,
          serie: h.serie || 'A',
          quantity: h.quantity || 0,
          marketValue: h.marketValue,
        });
      } else if (isInternational || isCFI) {
        const symbol = isCFI ? `${secId}.SN` : secId;
        internationalHoldings.push({
          symbol,
          quantity: h.quantity || 0,
          marketValue: h.marketValue,
          currency: isCFI ? 'CLP' : 'USD',
        });
      } else {
        holdingsByName.push({
          name: h.fundName,
          quantity: h.quantity || 0,
          marketValue: h.marketValue,
        });
      }
    }

    // 3. Call historical-prices internally (same logic as the existing API)
    const baseUrl = request.nextUrl.origin;
    const histResponse = await fetch(`${baseUrl}/api/portfolio/historical-prices`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        cookie: request.headers.get('cookie') || '',
      },
      body: JSON.stringify({
        clientId,
        startDate: baseline.snapshot_date,
        holdings: holdingsByRun,
        holdingsByName,
        internationalHoldings,
      }),
    });

    if (!histResponse.ok) {
      const errBody = await histResponse.text();
      return errorResponse(`Error calculando evolucion: ${errBody}`, 500);
    }

    const histData = await histResponse.json();

    return successResponse({
      series: histData.series || [],
      baselineDate: baseline.snapshot_date,
      baselineValue: baseline.total_value,
      holdingsCount: holdings.length,
    });
  });
}
```

- [ ] **Step 2: Test the endpoint manually**

Run: `npm run dev`

Test with a client that has a baseline snapshot:
```bash
curl -X POST http://localhost:3000/api/portfolio/baseline-evolution \
  -H "Content-Type: application/json" \
  -d '{"clientId": "<client-id-with-baseline>"}' \
  --cookie "<session-cookie>"
```

Expected: JSON response with `series` array of `{fecha, total}` points from baseline date to today.

- [ ] **Step 3: Commit**

```bash
git add app/api/portfolio/baseline-evolution/route.ts
git commit -m "feat: add baseline-evolution API endpoint for initial portfolio revaluation"
```

---

## Task 5: EvolucionChart — Add Baseline and Benchmark Series

**Files:**
- Modify: `components/seguimiento/EvolucionChart.tsx`

- [ ] **Step 1: Read current EvolucionChart**

Read `components/seguimiento/EvolucionChart.tsx` to understand the current props and Recharts setup.

- [ ] **Step 2: Add baselineSeries and benchmarkSeries props**

Extend the Props interface and add two new `<Line>` components to the chart:

```typescript
interface Props {
  snapshots: Snapshot[];
  historicalSeries?: HistoricalPoint[];
  baselineSeries?: HistoricalPoint[];    // NEW: portfolio inicial
  benchmarkSeries?: HistoricalPoint[];   // NEW: benchmark
  loadingHistorical?: boolean;
  period?: string;
}
```

- [ ] **Step 3: Merge series data for chart rendering**

The chart needs a single `data` array with all series aligned by date. Add merge logic:

```typescript
// Merge all series by date
const mergedData = useMemo(() => {
  const dateMap = new Map<string, { fecha: string; total?: number; baseline?: number; benchmark?: number }>();

  // Portfolio actual
  for (const point of filteredData) {
    const key = point.fecha;
    const entry = dateMap.get(key) || { fecha: key };
    entry.total = point.total;
    dateMap.set(key, entry);
  }

  // Baseline (portfolio inicial)
  if (baselineSeries) {
    for (const point of baselineSeries) {
      const key = point.fecha;
      const entry = dateMap.get(key) || { fecha: key };
      entry.baseline = point.total;
      dateMap.set(key, entry);
    }
  }

  // Benchmark
  if (benchmarkSeries) {
    for (const point of benchmarkSeries) {
      const key = point.fecha;
      const entry = dateMap.get(key) || { fecha: key };
      entry.benchmark = point.total;
      dateMap.set(key, entry);
    }
  }

  return Array.from(dateMap.values()).sort((a, b) => a.fecha.localeCompare(b.fecha));
}, [filteredData, baselineSeries, benchmarkSeries]);
```

- [ ] **Step 4: Add Line components for baseline and benchmark**

Inside the `<LineChart>` component, add two new lines after the existing portfolio line:

```tsx
{/* Portfolio Actual — existing green line */}
<Line type="monotone" dataKey="total" stroke="#16a34a" strokeWidth={2} dot={false} name="Portfolio Actual" />

{/* Portfolio Inicial — orange line */}
{baselineSeries && baselineSeries.length > 0 && (
  <Line type="monotone" dataKey="baseline" stroke="#f97316" strokeWidth={1.5} dot={false} name="Portfolio Inicial" strokeDasharray="4 2" />
)}

{/* Benchmark — yellow dashed line */}
{benchmarkSeries && benchmarkSeries.length > 0 && (
  <Line type="monotone" dataKey="benchmark" stroke="#eab308" strokeWidth={1.5} dot={false} name="Benchmark" strokeDasharray="6 3" />
)}
```

Also add a `<Legend>` component if not present:
```tsx
<Legend verticalAlign="top" height={30} />
```

- [ ] **Step 5: Update Y-axis domain to include all series**

The Y-axis domain calculation must consider baseline and benchmark values too:

```typescript
const allValues = mergedData.flatMap((d) =>
  [d.total, d.baseline, d.benchmark].filter((v): v is number => v != null)
);
const minVal = Math.min(...allValues);
const maxVal = Math.max(...allValues);
const padding = (maxVal - minVal) * 0.05;
const domain = [minVal - padding, maxVal + padding];
```

- [ ] **Step 6: Test manually in dev**

Run: `npm run dev`
Navigate to a client Seguimiento page. At this point the baseline series won't show yet (SeguimientoPage doesn't fetch it yet — that's Task 7). Verify the chart still renders correctly with just the portfolio line.

- [ ] **Step 7: Commit**

```bash
git add components/seguimiento/EvolucionChart.tsx
git commit -m "feat: EvolucionChart supports baseline and benchmark series"
```

---

## Task 6: RetornosComparados — Connect Baseline as Comparison

**Files:**
- Modify: `components/seguimiento/RetornosComparados.tsx`

- [ ] **Step 1: Read current RetornosComparados**

Read `components/seguimiento/RetornosComparados.tsx`. Focus on how `comparisonReturns` prop is used (it exists but may not be connected to anything).

- [ ] **Step 2: Set default comparison label to "Portfolio Inicial"**

Find where `comparisonLabel` is used and update the default:

```typescript
// Change the default label
const compLabel = comparisonLabel || 'Portfolio Inicial';
```

Ensure the comparison bar color is orange (`#f97316`) to match EvolucionChart.

- [ ] **Step 3: Verify comparison bars render correctly**

The `comparisonReturns` prop should already be wired into the bar chart rendering. Verify:
- The `MonthData` type includes `comparison: number | null`
- The bar chart renders a third bar when `comparison` is not null
- The legend includes the comparison label
- The accumulated row includes the comparison accumulated return

If the bar for comparison is not rendering, add it to the chart:

```tsx
{/* Add comparison bar next to portfolio and benchmark */}
{monthData.some((m) => m.comparison !== null) && (
  <Bar dataKey="comparison" fill="#f97316" name={compLabel} radius={[2, 2, 0, 0]} />
)}
```

- [ ] **Step 4: Commit**

```bash
git add components/seguimiento/RetornosComparados.tsx
git commit -m "feat: RetornosComparados uses 'Portfolio Inicial' as default comparison label"
```

---

## Task 7: SeguimientoPage — Orchestrate Baseline Evolution

**Files:**
- Modify: `components/seguimiento/SeguimientoPage.tsx`

- [ ] **Step 1: Read current SeguimientoPage orchestration**

Read `components/seguimiento/SeguimientoPage.tsx`. Focus on:
- State variables for data (historicalSeries, snapshots, etc.)
- Where EvolucionChart and RetornosComparados are rendered
- How baseline is currently retrieved (`snapshots.find(s => s.is_baseline)`)
- Summary cards section

- [ ] **Step 2: Add state and fetch for baseline evolution**

Add state for baseline series and fetch it alongside existing data:

```typescript
const [baselineSeries, setBaselineSeries] = useState<HistoricalPoint[] | null>(null);
const [loadingBaseline, setLoadingBaseline] = useState(false);
```

Add a fetch effect triggered when snapshots load and a baseline exists:

```typescript
// Fetch baseline evolution
useEffect(() => {
  const baseline = snapshots.find((s) => s.is_baseline);
  const latest = snapshots[snapshots.length - 1];
  // Only fetch if baseline exists and is different from latest snapshot
  if (!baseline || !latest || baseline.id === latest.id) {
    setBaselineSeries(null);
    return;
  }

  setLoadingBaseline(true);
  fetch('/api/portfolio/baseline-evolution', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ clientId }),
  })
    .then((res) => res.json())
    .then((data) => {
      if (data.success && data.series) {
        setBaselineSeries(data.series);
      }
    })
    .catch((err) => console.error('Error fetching baseline evolution:', err))
    .finally(() => setLoadingBaseline(false));
}, [snapshots, clientId]);
```

- [ ] **Step 3: Pass baselineSeries to EvolucionChart**

Find where `<EvolucionChart>` is rendered and add the prop:

```tsx
<EvolucionChart
  snapshots={snapshots}
  historicalSeries={historicalSeries}
  baselineSeries={baselineSeries || undefined}
  loadingHistorical={loadingHistorical}
  period={selectedPeriod}
/>
```

- [ ] **Step 4: Calculate comparison returns from baseline series and pass to RetornosComparados**

Derive monthly returns from the baseline series (same logic RetornosComparados uses for portfolio):

```typescript
const baselineMonthlyReturns = useMemo(() => {
  if (!baselineSeries || baselineSeries.length < 2) return undefined;

  const returns: Record<string, number> = {};
  // Group by month
  const byMonth = new Map<string, { first: number; last: number }>();
  for (const point of baselineSeries) {
    const monthKey = point.fecha.substring(0, 7); // "YYYY-MM"
    const entry = byMonth.get(monthKey);
    if (!entry) {
      byMonth.set(monthKey, { first: point.total, last: point.total });
    } else {
      entry.last = point.total;
    }
  }

  // Calculate month-over-month returns
  let prevLast: number | null = null;
  for (const [monthKey, { first, last }] of byMonth) {
    const startVal = prevLast ?? first;
    if (startVal > 0) {
      returns[monthKey] = ((last / startVal) - 1) * 100;
    }
    prevLast = last;
  }

  return returns;
}, [baselineSeries]);
```

Pass to RetornosComparados:

```tsx
<RetornosComparados
  snapshots={snapshots}
  historicalSeries={historicalSeries}
  benchmarkLabel={benchmarkLabel}
  benchmarkReturns={benchmarkReturns}
  comparisonLabel="Portfolio Inicial"
  comparisonReturns={baselineMonthlyReturns}
/>
```

- [ ] **Step 5: Add baseline comparison to Summary Cards**

Find the summary cards section. Add a comparison line showing baseline return:

```typescript
// Calculate baseline accumulated return
const baselineAccReturn = useMemo(() => {
  if (!baselineSeries || baselineSeries.length < 2) return null;
  const first = baselineSeries[0].total;
  const last = baselineSeries[baselineSeries.length - 1].total;
  if (first <= 0) return null;
  return ((last / first) - 1) * 100;
}, [baselineSeries]);
```

In the JSX where summary cards render, add a subtitle line:

```tsx
{baselineAccReturn !== null && (
  <span className="text-xs text-gb-gray">
    Sin cambios: {baselineAccReturn >= 0 ? '+' : ''}{baselineAccReturn.toFixed(1)}%
  </span>
)}
```

- [ ] **Step 6: Test manually in dev**

Run: `npm run dev`
1. Navigate to a client with multiple snapshots and a baseline
2. Verify EvolucionChart shows 2 lines (green + orange)
3. Verify RetornosComparados shows 3 bars per month
4. Verify Summary Cards show the "Sin cambios" comparison

- [ ] **Step 7: Commit**

```bash
git add components/seguimiento/SeguimientoPage.tsx
git commit -m "feat: SeguimientoPage orchestrates baseline evolution for 3-line comparison"
```

---

## Task 8: Backfill Script for Existing Snapshots

**Files:**
- Create: `scripts/backfill-cost-basis.mjs`

- [ ] **Step 1: Create the backfill script**

This script processes all existing snapshots chronologically per client and applies cost basis rules:

```javascript
// scripts/backfill-cost-basis.mjs
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function backfill() {
  // Get all clients
  const { data: clients, error } = await supabase
    .from('clients')
    .select('id, name');

  if (error) { console.error('Error fetching clients:', error); return; }

  console.log(`Processing ${clients.length} clients...`);

  for (const client of clients) {
    // Get all snapshots for this client, ordered chronologically
    const { data: snapshots, error: snapError } = await supabase
      .from('portfolio_snapshots')
      .select('id, snapshot_date, holdings, source')
      .eq('client_id', client.id)
      .neq('source', 'api-prices')
      .order('snapshot_date', { ascending: true });

    if (snapError || !snapshots || snapshots.length === 0) continue;

    console.log(`  ${client.name}: ${snapshots.length} snapshots`);

    let previousHoldings = [];

    for (const snapshot of snapshots) {
      const holdings = snapshot.holdings || [];
      if (holdings.length === 0) {
        previousHoldings = [];
        continue;
      }

      const enriched = holdings.map((holding) => {
        // Find match in previous snapshot
        const match = previousHoldings.find((prev) => {
          if (holding.securityId && prev.securityId) {
            return holding.securityId === prev.securityId;
          }
          return holding.fundName === prev.fundName;
        });

        const cartolaPrice = holding.marketPrice || (holding.quantity ? holding.marketValue / holding.quantity : holding.marketValue);

        if (!match || match.costBasis == null) {
          return { ...holding, costBasis: cartolaPrice, costBasisDate: snapshot.snapshot_date };
        }

        const currentQty = holding.quantity ?? 0;
        const previousQty = match.quantity ?? 0;

        if (currentQty === previousQty) {
          return { ...holding, costBasis: match.costBasis, costBasisDate: match.costBasisDate };
        }

        return { ...holding, costBasis: cartolaPrice, costBasisDate: snapshot.snapshot_date };
      });

      // Update snapshot with enriched holdings
      const { error: updateError } = await supabase
        .from('portfolio_snapshots')
        .update({ holdings: enriched })
        .eq('id', snapshot.id);

      if (updateError) {
        console.error(`    Error updating snapshot ${snapshot.id}:`, updateError.message);
      }

      previousHoldings = enriched;
    }
  }

  console.log('Backfill complete.');
}

backfill().catch(console.error);
```

- [ ] **Step 2: Test with a single client (dry run)**

Before running on all clients, test the logic by adding a `--client` flag or just limiting to one client in code. Verify:
- The script runs without errors
- The first snapshot gets `costBasis = marketPrice` for all holdings
- Subsequent snapshots inherit or update costBasis correctly

Run: `node scripts/backfill-cost-basis.mjs`

- [ ] **Step 3: Run full backfill**

Run: `node scripts/backfill-cost-basis.mjs`
Expected: All snapshots processed, each holding has `costBasis` and `costBasisDate`.

- [ ] **Step 4: Commit**

```bash
git add scripts/backfill-cost-basis.mjs
git commit -m "feat: backfill script for cost basis on existing snapshots"
```

---

## Task 9: End-to-End Verification

- [ ] **Step 1: Run the full test suite**

Run: `npm run test:run`
Expected: All existing tests pass + new cost-basis tests pass.

- [ ] **Step 2: Run the build**

Run: `npm run build`
Expected: Build succeeds with no TypeScript errors.

- [ ] **Step 3: Manual E2E verification**

Run: `npm run dev`

Test with a client that has:
- Multiple snapshots (at least 2)
- A baseline snapshot
- Mix of Chilean and international holdings

Verify:
1. **HoldingReturnsPanel**: Shows returns calculated from costBasis vs current market price
2. **PerformanceAttribution**: Numbers match HoldingReturnsPanel returns
3. **RentabilidadPorActivo**: Acumulado matches HoldingReturnsPanel, monthly returns use market-to-market
4. **EvolucionChart**: Shows 2 lines (portfolio actual + portfolio inicial)
5. **RetornosComparados**: Shows 3 bars (actual + inicial + benchmark)
6. **Summary Cards**: Shows "Sin cambios" comparison line
7. **Network tab**: No direct Yahoo/Fintual/FINRA calls from HoldingReturnsPanel — only `prices-at-date`

- [ ] **Step 4: Commit any fixes from verification**

```bash
git add -A
git commit -m "fix: adjustments from E2E verification of consistent pricing model"
```
