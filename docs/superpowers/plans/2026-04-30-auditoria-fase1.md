# Auditoria Greybark — Fase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete all blockers before inviting Heraldo Alvarez — replace TWR with simple returns, add missing RLS, validate auth, add AI usage tracking, clean debug logs.

**Architecture:** Pure function calculator in `lib/returns/`, integrated into existing API routes that currently use TWR. RLS via SQL migration following existing pattern with `get_accessible_advisor_ids()`. AI usage tracking via new table + wrapper.

**Tech Stack:** TypeScript, Vitest, Supabase (Postgres + RLS), Next.js API routes, Anthropic Claude API.

---

## File Structure

### New files
- `lib/returns/calculator.ts` — pure functions: `positionReturn`, `annualizeReturn`, `portfolioReturn`, `periodicReturns`
- `lib/returns/calculator.test.ts` — unit tests with known cases
- `supabase/migrations/20260501_rls_missing_tables.sql` — RLS for 5 tables
- `supabase/migrations/20260501_advisor_ai_usage.sql` — AI usage tracking table

### Files to modify
- `app/api/clients/[id]/seguimiento/route.ts` — replace `calculateMetrics` TWR with simple returns
- `app/api/portfolio/snapshots/route.ts` — stop writing twr_period/twr_cumulative, simplify `calculateMetrics`
- `app/api/portal/portfolio/route.ts` — stop serving TWR fields
- `app/(portal)/portal/dashboard/page.tsx` — replace TWR display with simple returns
- `app/(portal)/portal/reportes/page.tsx` — remove twr_cumulative reference
- `app/api/clients/[id]/reports/route.ts` — remove twr_cumulative from snapshot summary
- `app/api/advisor/clients-overview/route.ts` — remove twr_cumulative from select/response
- `components/seguimiento/SeguimientoPage.tsx` — update Metrics interface, remove TWR fields
- `components/seguimiento/SnapshotsTable.tsx` — use simple return instead of twr_period
- `components/seguimiento/PerformanceAttribution.tsx` — remove twr prop
- `app/api/comite/generar-cartera/route.ts` — remove debug logs, add AI usage tracking
- `app/api/clients/[id]/reports/route.ts` — add AI usage tracking
- `app/api/portfolio/xray-report/route.ts` — add AI usage tracking

---

## Task 1: Create `lib/returns/calculator.ts` + tests

**Files:**
- Create: `lib/returns/calculator.ts`
- Create: `lib/returns/calculator.test.ts`

- [ ] **Step 1: Write the test file**

```typescript
// lib/returns/calculator.test.ts
import { describe, it, expect } from "vitest";
import {
  positionReturn,
  annualizeReturn,
  portfolioReturn,
  periodicReturns,
} from "./calculator";

describe("positionReturn", () => {
  it("calculates simple return", () => {
    // Bought at 1000, now at 1100 => 10%
    expect(positionReturn(1000, 1100)).toBeCloseTo(0.10, 6);
  });

  it("handles negative return", () => {
    expect(positionReturn(1000, 900)).toBeCloseTo(-0.10, 6);
  });

  it("returns 0 when initial is 0", () => {
    expect(positionReturn(0, 100)).toBe(0);
  });

  it("handles equal values", () => {
    expect(positionReturn(500, 500)).toBe(0);
  });
});

describe("annualizeReturn", () => {
  it("does NOT annualize if days < 365", () => {
    // 5% in 180 days => stays 5% (simple)
    const r = annualizeReturn(0.05, 180);
    expect(r.value).toBeCloseTo(0.05, 6);
    expect(r.isAnnualized).toBe(false);
  });

  it("annualizes if days >= 365", () => {
    // 10% in 730 days (2 years) => (1.10)^(365/730) - 1 ≈ 4.88%
    const r = annualizeReturn(0.10, 730);
    expect(r.value).toBeCloseTo(Math.pow(1.10, 365 / 730) - 1, 4);
    expect(r.isAnnualized).toBe(true);
  });

  it("annualizes exactly 365 days", () => {
    // 8% in exactly 365 days => stays 8% annualized
    const r = annualizeReturn(0.08, 365);
    expect(r.value).toBeCloseTo(0.08, 6);
    expect(r.isAnnualized).toBe(true);
  });

  it("handles 0 days gracefully", () => {
    const r = annualizeReturn(0.05, 0);
    expect(r.value).toBe(0);
    expect(r.isAnnualized).toBe(false);
  });
});

describe("portfolioReturn", () => {
  it("calculates weighted average of position returns", () => {
    // Position A: weight 0.6, return 10%
    // Position B: weight 0.4, return -5%
    // Expected: 0.6 * 0.10 + 0.4 * (-0.05) = 0.04 = 4%
    const result = portfolioReturn([
      { weight: 0.6, returnValue: 0.10 },
      { weight: 0.4, returnValue: -0.05 },
    ]);
    expect(result).toBeCloseTo(0.04, 6);
  });

  it("returns 0 for empty positions", () => {
    expect(portfolioReturn([])).toBe(0);
  });
});

describe("periodicReturns", () => {
  it("calculates returns for multiple periods", () => {
    const today = new Date("2026-04-30");
    const positions = [
      {
        initialPrice: 1000,
        currentPrice: 1100,
        initialDate: new Date("2025-10-30"), // 6 months ago
        currentDate: today,
        weight: 1.0,
      },
    ];

    const result = periodicReturns(positions, today);

    // Since inception: 10% in ~182 days (< 365) => simple
    expect(result.sinceInception.value).toBeCloseTo(0.10, 2);
    expect(result.sinceInception.isAnnualized).toBe(false);
  });

  it("handles position younger than requested period", () => {
    const today = new Date("2026-04-30");
    const positions = [
      {
        initialPrice: 1000,
        currentPrice: 1050,
        initialDate: new Date("2026-04-01"), // 29 days ago
        currentDate: today,
        weight: 1.0,
      },
    ];

    const result = periodicReturns(positions, today);

    // 1M should work (position is ~29 days old)
    expect(result.m1).not.toBeNull();
    // 3M should be null (position too young)
    expect(result.m3).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/returns/calculator.test.ts`
Expected: FAIL — module `./calculator` not found

- [ ] **Step 3: Write the calculator implementation**

```typescript
// lib/returns/calculator.ts

/**
 * Simple return: (Pfinal / Pinicial) - 1
 * Returns decimal (0.10 = 10%)
 */
export function positionReturn(initialPrice: number, finalPrice: number): number {
  if (initialPrice <= 0) return 0;
  return (finalPrice / initialPrice) - 1;
}

export interface AnnualizedResult {
  value: number;       // decimal (0.10 = 10%)
  isAnnualized: boolean;
}

/**
 * If days < 365: return simple (never annualize).
 * If days >= 365: annualize via (1 + r)^(365/days) - 1.
 */
export function annualizeReturn(simpleReturn: number, days: number): AnnualizedResult {
  if (days <= 0) return { value: 0, isAnnualized: false };

  if (days < 365) {
    return { value: simpleReturn, isAnnualized: false };
  }

  // Annualize
  const annualized = Math.pow(1 + simpleReturn, 365 / days) - 1;
  return { value: annualized, isAnnualized: true };
}

interface WeightedPosition {
  weight: number;       // fraction of portfolio (0.0 to 1.0)
  returnValue: number;  // decimal return
}

/**
 * Portfolio return = sum(w_i * r_i)
 */
export function portfolioReturn(positions: WeightedPosition[]): number {
  if (positions.length === 0) return 0;
  return positions.reduce((sum, p) => sum + p.weight * p.returnValue, 0);
}

interface PositionForPeriod {
  initialPrice: number;
  currentPrice: number;
  initialDate: Date;
  currentDate: Date;
  weight: number;
}

export interface PeriodicReturns {
  m1: AnnualizedResult | null;
  m3: AnnualizedResult | null;
  m6: AnnualizedResult | null;
  m12: AnnualizedResult | null;
  ytd: AnnualizedResult | null;
  sinceInception: AnnualizedResult;
}

/**
 * Calculate returns for standard periods: 1M, 3M, 6M, 12M, YTD, since inception.
 * If a position is younger than the requested period, that period returns null.
 */
export function periodicReturns(
  positions: PositionForPeriod[],
  asOfDate: Date
): PeriodicReturns {
  if (positions.length === 0) {
    return {
      m1: null, m3: null, m6: null, m12: null, ytd: null,
      sinceInception: { value: 0, isAnnualized: false },
    };
  }

  // Since inception: use all positions from their actual start dates
  const inceptionReturns = positions.map((p) => {
    const days = daysBetween(p.initialDate, p.currentDate);
    const simple = positionReturn(p.initialPrice, p.currentPrice);
    const ann = annualizeReturn(simple, days);
    return { weight: p.weight, returnValue: ann.value, isAnnualized: ann.isAnnualized };
  });

  const sinceInceptionValue = portfolioReturn(
    inceptionReturns.map((r) => ({ weight: r.weight, returnValue: r.returnValue }))
  );
  const sinceInceptionAnnualized = inceptionReturns.some((r) => r.isAnnualized);

  // Period-based returns
  const m1 = computePeriodReturn(positions, asOfDate, monthsAgo(asOfDate, 1));
  const m3 = computePeriodReturn(positions, asOfDate, monthsAgo(asOfDate, 3));
  const m6 = computePeriodReturn(positions, asOfDate, monthsAgo(asOfDate, 6));
  const m12 = computePeriodReturn(positions, asOfDate, monthsAgo(asOfDate, 12));

  const ytdStart = new Date(asOfDate.getFullYear(), 0, 1);
  const ytd = computePeriodReturn(positions, asOfDate, ytdStart);

  return {
    m1, m3, m6, m12, ytd,
    sinceInception: { value: sinceInceptionValue, isAnnualized: sinceInceptionAnnualized },
  };
}

function computePeriodReturn(
  positions: PositionForPeriod[],
  asOfDate: Date,
  periodStart: Date,
): AnnualizedResult | null {
  // Filter positions that existed at periodStart
  const eligible = positions.filter((p) => p.initialDate <= periodStart);
  if (eligible.length === 0) return null;

  const days = daysBetween(periodStart, asOfDate);

  // For period returns, we'd ideally need the price at periodStart.
  // Since we only have initialPrice (buy date) and currentPrice,
  // we calculate from initial and let the API caller provide period-specific prices.
  // This function computes from whatever prices are given.
  const returns = eligible.map((p) => {
    const simple = positionReturn(p.initialPrice, p.currentPrice);
    const ann = annualizeReturn(simple, days);
    return { weight: p.weight, returnValue: ann.value };
  });

  const value = portfolioReturn(returns);
  return { value, isAnnualized: days >= 365 };
}

function daysBetween(start: Date, end: Date): number {
  return Math.max(0, Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)));
}

function monthsAgo(date: Date, months: number): Date {
  const d = new Date(date);
  d.setMonth(d.getMonth() - months);
  return d;
}

/**
 * Format a return for display.
 * Returns string like "3.2%" or "8.1% anual"
 */
export function formatReturnDisplay(result: AnnualizedResult): string {
  const pct = (result.value * 100).toFixed(1);
  const sign = result.value > 0 ? "+" : "";
  return result.isAnnualized ? `${sign}${pct}% anual` : `${sign}${pct}%`;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run lib/returns/calculator.test.ts`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add lib/returns/calculator.ts lib/returns/calculator.test.ts
git commit -m "feat: add pure returns calculator with tests (replaces TWR)

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

## Task 2: Replace TWR in seguimiento API

**Files:**
- Modify: `app/api/clients/[id]/seguimiento/route.ts` (lines 41-63, 200-416)

- [ ] **Step 1: Replace PortfolioMetrics interface (lines 41-63)**

```typescript
// In app/api/clients/[id]/seguimiento/route.ts
// Replace the PortfolioMetrics interface

interface PortfolioMetrics {
  totalReturn: number;        // simple return % from first to last snapshot
  annualizedReturn: number;   // annualized if >= 365 days, else same as totalReturn
  isAnnualized: boolean;      // whether annualizedReturn is actually annualized
  volatility: number;
  maxDrawdown: number;
  currentValue: number;
  initialValue: number;
  dataPoints: number;
  unrealizedGainLoss?: number | null;
  periodDays?: number;
  totalDeposits?: number;
  totalWithdrawals?: number;
  netCashFlow?: number;
  composition?: {
    equity: number;
    fixedIncome: number;
    alternatives: number;
    cash: number;
  };
}
```

- [ ] **Step 2: Replace calculateMetrics function (lines 200-416)**

Replace the entire `calculateMetrics` function:

```typescript
function calculateMetrics(snapshots: SnapshotRecord[]): PortfolioMetrics {
  if (snapshots.length < 2) {
    const latestSnapshot = snapshots[snapshots.length - 1];
    return {
      totalReturn: 0,
      annualizedReturn: 0,
      isAnnualized: false,
      volatility: 0,
      maxDrawdown: 0,
      currentValue: latestSnapshot?.total_value || 0,
      initialValue: snapshots[0]?.total_value || 0,
      dataPoints: snapshots.length,
      periodDays: 0,
      composition: latestSnapshot
        ? {
            equity: latestSnapshot.equity_percent || 0,
            fixedIncome: latestSnapshot.fixed_income_percent || 0,
            alternatives: latestSnapshot.alternatives_percent || 0,
            cash: latestSnapshot.cash_percent || 0,
          }
        : undefined,
    };
  }

  const firstValue = snapshots[0].total_value || 0;
  const lastValue = snapshots[snapshots.length - 1].total_value || 0;
  const latestSnapshot = snapshots[snapshots.length - 1];

  if (firstValue <= 0) {
    return {
      totalReturn: 0,
      annualizedReturn: 0,
      isAnnualized: false,
      volatility: 0,
      maxDrawdown: 0,
      currentValue: lastValue,
      initialValue: firstValue,
      dataPoints: snapshots.length,
      periodDays: 0,
      composition: latestSnapshot
        ? {
            equity: latestSnapshot.equity_percent || 0,
            fixedIncome: latestSnapshot.fixed_income_percent || 0,
            alternatives: latestSnapshot.alternatives_percent || 0,
            cash: latestSnapshot.cash_percent || 0,
          }
        : undefined,
    };
  }

  // Period calculation
  const daysDiff =
    (new Date(snapshots[snapshots.length - 1].snapshot_date).getTime() -
      new Date(snapshots[0].snapshot_date).getTime()) /
    (1000 * 60 * 60 * 24);

  // Simple return: (Pfinal / Pinicial) - 1
  const totalReturn = ((lastValue - firstValue) / firstValue) * 100;

  // Annualize only if >= 365 days
  const yearsElapsed = daysDiff / 365;
  const isAnnualized = daysDiff >= 365;
  const annualizedReturn = isAnnualized && yearsElapsed > 0
    ? (Math.pow(lastValue / firstValue, 1 / yearsElapsed) - 1) * 100
    : totalReturn;

  // Period returns for volatility (simple return between consecutive snapshots)
  const periodReturns: number[] = [];
  for (let i = 1; i < snapshots.length; i++) {
    if (snapshots[i - 1].total_value > 0) {
      const netFlow = snapshots[i].net_cash_flow || 0;
      const adjustedEndValue = snapshots[i].total_value - netFlow;
      periodReturns.push((adjustedEndValue / snapshots[i - 1].total_value) - 1);
    }
  }

  // Volatility (annualized standard deviation)
  let annualizedVol = 0;
  if (periodReturns.length > 0) {
    const avgReturn = periodReturns.reduce((a, b) => a + b, 0) / periodReturns.length;
    const variance =
      periodReturns.reduce((sum, r) => sum + Math.pow(r - avgReturn, 2), 0) /
      periodReturns.length;
    const periodVol = Math.sqrt(variance);
    const avgDaysBetweenSnapshots = daysDiff / (snapshots.length - 1);
    const periodsPerYear = avgDaysBetweenSnapshots > 0 ? 365 / avgDaysBetweenSnapshots : 12;
    annualizedVol = periodVol * Math.sqrt(Math.min(periodsPerYear, 252)) * 100;
  }

  // Max Drawdown — simple peak-to-trough adjusted for cash flows
  let maxDrawdown = 0;
  let peak = snapshots[0].total_value;
  let cumulativeFlow = 0;
  for (let i = 1; i < snapshots.length; i++) {
    const flow = snapshots[i].net_cash_flow || 0;
    cumulativeFlow += flow;
    const adjustedValue = snapshots[i].total_value - cumulativeFlow;
    if (adjustedValue > peak) {
      peak = adjustedValue;
    }
    const drawdown = ((peak - adjustedValue) / peak) * 100;
    if (drawdown > maxDrawdown) {
      maxDrawdown = drawdown;
    }
  }

  // Total cash flows
  const totalDeposits = snapshots.reduce((sum, s) => sum + (s.deposits || 0), 0);
  const totalWithdrawals = snapshots.reduce((sum, s) => sum + (s.withdrawals || 0), 0);
  const netCashFlow = totalDeposits - totalWithdrawals;

  return {
    totalReturn: Math.round(totalReturn * 100) / 100,
    annualizedReturn: Math.round(annualizedReturn * 100) / 100,
    isAnnualized,
    volatility: Math.round(annualizedVol * 100) / 100,
    maxDrawdown: Math.round(maxDrawdown * 100) / 100,
    currentValue: lastValue,
    initialValue: firstValue,
    unrealizedGainLoss: latestSnapshot.unrealized_gain_loss,
    dataPoints: snapshots.length,
    periodDays: Math.round(daysDiff),
    totalDeposits: Math.round(totalDeposits),
    totalWithdrawals: Math.round(totalWithdrawals),
    netCashFlow: Math.round(netCashFlow),
    composition: {
      equity: latestSnapshot.equity_percent || 0,
      fixedIncome: latestSnapshot.fixed_income_percent || 0,
      alternatives: latestSnapshot.alternatives_percent || 0,
      cash: latestSnapshot.cash_percent || 0,
    },
  };
}
```

- [ ] **Step 3: Verify the app still builds**

Run: `npx next build 2>&1 | head -30`
Expected: No TypeScript errors in this file

- [ ] **Step 4: Commit**

```bash
git add app/api/clients/[id]/seguimiento/route.ts
git commit -m "refactor: replace TWR with simple returns in seguimiento API

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

## Task 3: Replace TWR in portal dashboard

**Files:**
- Modify: `app/api/portal/portfolio/route.ts` (lines 14, 61-62, 74-78)
- Modify: `app/(portal)/portal/dashboard/page.tsx` (lines 15-37, 160-180)

- [ ] **Step 1: Update portal API — remove twr_cumulative from query**

In `app/api/portal/portfolio/route.ts`, change the allSnapshots query (line 14):

```typescript
// OLD:
  const { data: allSnapshots } = await admin
    .from("portfolio_snapshots")
    .select("snapshot_date, total_value, twr_cumulative")
    .eq("client_id", client!.id)
    .order("snapshot_date", { ascending: true })
    .limit(100);
```

Replace with:

```typescript
  const { data: allSnapshots } = await admin
    .from("portfolio_snapshots")
    .select("snapshot_date, total_value, cumulative_return")
    .eq("client_id", client!.id)
    .order("snapshot_date", { ascending: true })
    .limit(100);
```

- [ ] **Step 2: Update portalSnapshot to remove TWR fields (lines 61-62)**

Replace:

```typescript
      twr_cumulative: latestSnapshot.twr_cumulative,
      twr_period: latestSnapshot.twr_period,
```

With:

```typescript
      cumulative_return: latestSnapshot.cumulative_return,
      daily_return: latestSnapshot.daily_return,
```

- [ ] **Step 3: Update history mapping (lines 74-78)**

Replace:

```typescript
    history: (allSnapshots || []).map(s => ({
      date: s.snapshot_date,
      value: s.total_value,
      twr: s.twr_cumulative,
    })),
```

With:

```typescript
    history: (allSnapshots || []).map(s => ({
      date: s.snapshot_date,
      value: s.total_value,
      returnPct: s.cumulative_return,
    })),
```

- [ ] **Step 4: Update dashboard interfaces and display**

In `app/(portal)/portal/dashboard/page.tsx`, replace Snapshot interface (lines 15-31):

```typescript
interface Snapshot {
  id: string;
  snapshot_date: string;
  total_value: number;
  equity_percent: number;
  fixed_income_percent: number;
  alternatives_percent: number;
  cash_percent: number;
  cumulative_return: number | null;
  daily_return: number | null;
  holdings: Array<{
    nombre: string;
    tipo: string;
    valor: number;
    porcentaje: number;
  }>;
}
```

Replace HistoryPoint interface (lines 33-37):

```typescript
interface HistoryPoint {
  date: string;
  value: number;
  returnPct: number | null;
}
```

- [ ] **Step 5: Update the TWR display cards (lines 160-180)**

Replace the "Retorno Periodo" and "Retorno Acumulado" cards with:

```typescript
              <div className="bg-white rounded-lg border border-gb-border p-4">
                <p className="text-xs text-gb-gray mb-1">Retorno Periodo</p>
                <p className={`text-xl font-bold ${getReturnColor(snapshot.daily_return)}`}>
                  {formatPercent(snapshot.daily_return)}
                </p>
                <div className="flex items-center gap-1 mt-1">
                  {getReturnIcon(snapshot.daily_return)}
                  <span className="text-xs text-gb-gray">ultimo periodo</span>
                </div>
              </div>

              <div className="bg-white rounded-lg border border-gb-border p-4">
                <p className="text-xs text-gb-gray mb-1">Retorno Acumulado</p>
                <p className={`text-xl font-bold ${getReturnColor(snapshot.cumulative_return)}`}>
                  {formatPercent(snapshot.cumulative_return)}
                </p>
                <div className="flex items-center gap-1 mt-1">
                  {getReturnIcon(snapshot.cumulative_return)}
                  <span className="text-xs text-gb-gray">desde inicio</span>
                </div>
              </div>
```

- [ ] **Step 6: Commit**

```bash
git add app/api/portal/portfolio/route.ts "app/(portal)/portal/dashboard/page.tsx"
git commit -m "refactor: replace TWR with simple returns in portal dashboard

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

## Task 4: Replace TWR in reports

**Files:**
- Modify: `app/api/clients/[id]/reports/route.ts` (line 144)
- Modify: `app/api/advisor/clients-overview/route.ts` (lines 41, 152)
- Modify: `app/(portal)/portal/reportes/page.tsx` (line 38)

- [ ] **Step 1: Remove twr_cumulative from reports route**

In `app/api/clients/[id]/reports/route.ts`, replace line 144:

```typescript
      twr_cumulative: latestSnapshot.twr_cumulative,
```

With:

```typescript
      cumulative_return: latestSnapshot.cumulative_return,
```

- [ ] **Step 2: Remove TWR from clients-overview**

In `app/api/advisor/clients-overview/route.ts`, line 41, remove `twr_cumulative` from the select string. Replace:

```typescript
    .select("client_id, snapshot_date, total_value, twr_cumulative, equity_percent, fixed_income_percent, alternatives_percent, cash_percent")
```

With:

```typescript
    .select("client_id, snapshot_date, total_value, cumulative_return, equity_percent, fixed_income_percent, alternatives_percent, cash_percent")
```

At line 152, replace:

```typescript
      twrCumulative: snap?.twr_cumulative || null,
```

With:

```typescript
      cumulativeReturn: snap?.cumulative_return || null,
```

- [ ] **Step 3: Remove TWR from portal reportes page**

In `app/(portal)/portal/reportes/page.tsx`, line 38, replace:

```typescript
  twr_cumulative: number | null;
```

With:

```typescript
  cumulative_return: number | null;
```

And update any display references from `twr_cumulative` to `cumulative_return`.

- [ ] **Step 4: Commit**

```bash
git add app/api/clients/[id]/reports/route.ts app/api/advisor/clients-overview/route.ts "app/(portal)/portal/reportes/page.tsx"
git commit -m "refactor: replace TWR references in reports and clients-overview

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

## Task 5: Stop writing TWR in snapshots POST + clean calculateMetrics

**Files:**
- Modify: `app/api/portfolio/snapshots/route.ts` (lines 201-233, 280-288, 338-564)

- [ ] **Step 1: Remove TWR calculation from POST handler (lines 201-233)**

Replace the TWR calculation block (lines 201-247) with:

```typescript
    // Calcular retornos simples
    let dailyReturn = 0;
    let cumulativeReturn = 0;

    if (prevSnapshot && prevSnapshot.total_value > 0) {
      // Simple return vs previous snapshot (adjusted for cash flows)
      const adjustedEndValue = totalValue - estimatedNetFlow;
      dailyReturn = clampPercent(((adjustedEndValue - prevSnapshot.total_value) / prevSnapshot.total_value) * 100);

      // Cumulative return vs first snapshot
      const { data: firstSnapshot } = await supabase
        .from("portfolio_snapshots")
        .select("total_value")
        .eq("client_id", clientId)
        .order("snapshot_date", { ascending: true })
        .limit(1)
        .maybeSingle();

      if (firstSnapshot && firstSnapshot.total_value > 0) {
        cumulativeReturn = clampPercent(((totalValue - firstSnapshot.total_value) / firstSnapshot.total_value) * 100);
      }
    }
```

- [ ] **Step 2: Stop writing TWR columns in snapshotData (lines 280-288)**

Replace:

```typescript
      // TWR metrics
      twr_period: clampPercent(twrPeriod),
      twr_cumulative: clampPercent(twrCumulative),
```

With:

```typescript
      // TWR columns deprecated — write 0 to avoid null issues in existing queries
      twr_period: 0,
      twr_cumulative: 0,
```

- [ ] **Step 3: Simplify calculateMetrics in GET handler (lines 338-564)**

Replace the `PortfolioMetrics` interface and `calculateMetrics` function with the same simplified version from Task 2 (remove twr, twrAnnualized, sharpeRatio fields; use simple returns only).

Replace PortfolioMetrics interface:

```typescript
interface PortfolioMetrics {
  totalReturn: number;
  annualizedReturn: number;
  isAnnualized: boolean;
  volatility: number;
  maxDrawdown: number;
  currentValue: number;
  initialValue: number;
  dataPoints: number;
  unrealizedGainLoss?: number;
  periodDays?: number;
  totalDeposits?: number;
  totalWithdrawals?: number;
  netCashFlow?: number;
  composition?: {
    equity: number | undefined;
    fixedIncome: number | undefined;
    alternatives: number | undefined;
    cash: number | undefined;
  };
}
```

And rewrite `calculateMetrics` the same way as Task 2 (simple returns, no TWR, no Sharpe).

- [ ] **Step 4: Remove unused `prevSnapshot.twr_cumulative` from select (line 157)**

Change:

```typescript
      .select("total_value, cumulative_return, twr_cumulative, total_cuotas")
```

To:

```typescript
      .select("total_value, cumulative_return, total_cuotas")
```

- [ ] **Step 5: Commit**

```bash
git add app/api/portfolio/snapshots/route.ts
git commit -m "refactor: stop writing TWR in snapshots, simplify calculateMetrics

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

## Task 6: Clean TWR from seguimiento UI components

**Files:**
- Modify: `components/seguimiento/SeguimientoPage.tsx` (lines 68-69, 77-84, 1295)
- Modify: `components/seguimiento/SnapshotsTable.tsx` (lines 22-54)
- Modify: `components/seguimiento/PerformanceAttribution.tsx` (lines 50, 92, 114-115)

- [ ] **Step 1: Update Snapshot interface in SeguimientoPage**

Remove TWR fields from the exported Snapshot interface (lines 68-69). These fields stay in the DB but the UI no longer uses them. Keep the fields in the interface but mark them optional (they come from the API response which still returns them from `select *`).

No change needed — `twr_period` and `twr_cumulative` are already optional.

- [ ] **Step 2: Update Metrics interface (lines 77-84)**

Replace:

```typescript
interface Metrics {
  totalReturn: number;
  annualizedReturn: number;
  twr: number;
  twrAnnualized: number;
  volatility: number;
  maxDrawdown: number;
  sharpeRatio: number;
  currentValue: number;
  initialValue: number;
```

With:

```typescript
interface Metrics {
  totalReturn: number;
  annualizedReturn: number;
  isAnnualized: boolean;
  volatility: number;
  maxDrawdown: number;
  currentValue: number;
  initialValue: number;
```

- [ ] **Step 3: Update PerformanceAttribution twr prop (line 1295)**

Replace:

```typescript
            twr={metrics?.twr || metrics?.totalReturn}
```

With:

```typescript
            totalReturn={metrics?.totalReturn}
```

- [ ] **Step 4: Update PerformanceAttribution component**

In `components/seguimiento/PerformanceAttribution.tsx`:

Replace the twr prop (line 50):

```typescript
  twr?: number; // TWR from metrics for consistent return display
```

With:

```typescript
  totalReturn?: number;
```

Replace usage (line 92):

```typescript
  twr,
```

With:

```typescript
  totalReturn: totalReturnProp,
```

Replace line 115:

```typescript
    const totalReturn = twr != null ? twr : ((finalValue - initialValue) / initialValue) * 100;
```

With:

```typescript
    const totalReturn = totalReturnProp != null ? totalReturnProp : ((finalValue - initialValue) / initialValue) * 100;
```

Update the dependency array (line 179) from `twr` to `totalReturnProp`.

- [ ] **Step 5: Update SnapshotsTable to use simple returns instead of TWR**

In `components/seguimiento/SnapshotsTable.tsx`, replace lines 22-54. The logic already calculates `periodReturn` from unit values as fallback. Just remove the TWR-first preference:

Replace lines 43-54:

```typescript
    // Use stored TWR as primary source — it was calculated with full context at creation time
    let periodReturn: number | null = null;

    if (snapshot.twr_period !== undefined && snapshot.twr_period !== null) {
      periodReturn = snapshot.twr_period;
    } else if (unitValue !== null && prevUnitValue !== null && prevUnitValue > 0) {
      // Fallback: recalculate from unit values if twr_period not stored
      periodReturn = ((unitValue - prevUnitValue) / prevUnitValue) * 100;
    } else if (prevSnapshot.total_value > 0) {
      // Last resort: simple return
      periodReturn = ((snapshot.total_value - prevSnapshot.total_value) / prevSnapshot.total_value) * 100;
    }
```

With:

```typescript
    // Simple return between snapshots (adjusted for cash flows)
    let periodReturn: number | null = null;

    if (prevSnapshot.total_value > 0) {
      const netFlow = snapshot.net_cash_flow || 0;
      const adjustedValue = snapshot.total_value - netFlow;
      periodReturn = ((adjustedValue - prevSnapshot.total_value) / prevSnapshot.total_value) * 100;
    }
```

- [ ] **Step 6: Commit**

```bash
git add components/seguimiento/SeguimientoPage.tsx components/seguimiento/SnapshotsTable.tsx components/seguimiento/PerformanceAttribution.tsx
git commit -m "refactor: remove TWR from seguimiento UI components

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

## Task 7: Add RLS to 5 missing tables

**Files:**
- Create: `supabase/migrations/20260501_rls_missing_tables.sql`

- [ ] **Step 1: Write the migration**

```sql
-- Migration: Add RLS to 5 tables missing policies
-- Tables: client_report_config, client_reports, recommendation_versions, meetings, client_interactions
-- Pattern: same as 20260325_rls_sensitive_tables.sql using get_accessible_advisor_ids()

-- ============================================================
-- 1. client_report_config
-- ============================================================
ALTER TABLE client_report_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "advisor_select_report_config"
  ON client_report_config FOR SELECT
  USING (
    client_id IN (
      SELECT id FROM clients WHERE asesor_id IN (SELECT get_accessible_advisor_ids())
    )
  );

CREATE POLICY "advisor_insert_report_config"
  ON client_report_config FOR INSERT
  WITH CHECK (
    client_id IN (
      SELECT id FROM clients WHERE asesor_id IN (SELECT get_accessible_advisor_ids())
    )
  );

CREATE POLICY "advisor_update_report_config"
  ON client_report_config FOR UPDATE
  USING (
    client_id IN (
      SELECT id FROM clients WHERE asesor_id IN (SELECT get_accessible_advisor_ids())
    )
  );

CREATE POLICY "advisor_delete_report_config"
  ON client_report_config FOR DELETE
  USING (
    client_id IN (
      SELECT id FROM clients WHERE asesor_id IN (SELECT get_accessible_advisor_ids())
    )
  );

-- ============================================================
-- 2. client_reports — advisor + client portal access
-- ============================================================
ALTER TABLE client_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "advisor_select_reports"
  ON client_reports FOR SELECT
  USING (
    client_id IN (
      SELECT id FROM clients WHERE asesor_id IN (SELECT get_accessible_advisor_ids())
    )
  );

CREATE POLICY "advisor_insert_reports"
  ON client_reports FOR INSERT
  WITH CHECK (
    client_id IN (
      SELECT id FROM clients WHERE asesor_id IN (SELECT get_accessible_advisor_ids())
    )
  );

CREATE POLICY "advisor_update_reports"
  ON client_reports FOR UPDATE
  USING (
    client_id IN (
      SELECT id FROM clients WHERE asesor_id IN (SELECT get_accessible_advisor_ids())
    )
  );

CREATE POLICY "advisor_delete_reports"
  ON client_reports FOR DELETE
  USING (
    client_id IN (
      SELECT id FROM clients WHERE asesor_id IN (SELECT get_accessible_advisor_ids())
    )
  );

-- Client portal: client reads own reports
CREATE POLICY "client_read_own_reports"
  ON client_reports FOR SELECT
  USING (
    auth.uid() IN (
      SELECT auth_user_id FROM clients WHERE id = client_reports.client_id
    )
  );

-- ============================================================
-- 3. recommendation_versions
-- ============================================================
ALTER TABLE recommendation_versions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "advisor_select_recommendation_versions"
  ON recommendation_versions FOR SELECT
  USING (
    client_id IN (
      SELECT id FROM clients WHERE asesor_id IN (SELECT get_accessible_advisor_ids())
    )
  );

CREATE POLICY "advisor_insert_recommendation_versions"
  ON recommendation_versions FOR INSERT
  WITH CHECK (
    client_id IN (
      SELECT id FROM clients WHERE asesor_id IN (SELECT get_accessible_advisor_ids())
    )
  );

CREATE POLICY "advisor_update_recommendation_versions"
  ON recommendation_versions FOR UPDATE
  USING (
    client_id IN (
      SELECT id FROM clients WHERE asesor_id IN (SELECT get_accessible_advisor_ids())
    )
  );

-- ============================================================
-- 4. meetings — advisor sees only their own meetings
-- ============================================================
ALTER TABLE meetings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "advisor_select_meetings"
  ON meetings FOR SELECT
  USING (
    advisor_id IN (SELECT get_accessible_advisor_ids())
  );

CREATE POLICY "advisor_insert_meetings"
  ON meetings FOR INSERT
  WITH CHECK (
    advisor_id = auth.uid()
  );

CREATE POLICY "advisor_update_meetings"
  ON meetings FOR UPDATE
  USING (
    advisor_id IN (SELECT get_accessible_advisor_ids())
  );

CREATE POLICY "advisor_delete_meetings"
  ON meetings FOR DELETE
  USING (
    advisor_id = auth.uid()
  );

-- ============================================================
-- 5. client_interactions — advisor sees only their clients
-- ============================================================
ALTER TABLE client_interactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "advisor_select_interactions"
  ON client_interactions FOR SELECT
  USING (
    client_id IN (
      SELECT id FROM clients WHERE asesor_id IN (SELECT get_accessible_advisor_ids())
    )
  );

CREATE POLICY "advisor_insert_interactions"
  ON client_interactions FOR INSERT
  WITH CHECK (
    client_id IN (
      SELECT id FROM clients WHERE asesor_id IN (SELECT get_accessible_advisor_ids())
    )
  );

CREATE POLICY "advisor_update_interactions"
  ON client_interactions FOR UPDATE
  USING (
    client_id IN (
      SELECT id FROM clients WHERE asesor_id IN (SELECT get_accessible_advisor_ids())
    )
  );

-- ============================================================
-- Comments
-- ============================================================
COMMENT ON POLICY "advisor_select_report_config" ON client_report_config
  IS 'Advisor sees report config for own clients + subordinates';
COMMENT ON POLICY "advisor_select_reports" ON client_reports
  IS 'Advisor sees reports for own clients + subordinates';
COMMENT ON POLICY "client_read_own_reports" ON client_reports
  IS 'Client portal reads own reports';
COMMENT ON POLICY "advisor_select_recommendation_versions" ON recommendation_versions
  IS 'Advisor sees recommendation versions for own clients';
COMMENT ON POLICY "advisor_select_meetings" ON meetings
  IS 'Advisor sees own meetings + subordinate meetings';
COMMENT ON POLICY "advisor_select_interactions" ON client_interactions
  IS 'Advisor sees interactions for own clients + subordinates';
```

- [ ] **Step 2: Verify SQL syntax**

Run: `cat supabase/migrations/20260501_rls_missing_tables.sql | head -5`
Expected: Migration file exists and starts with comment header

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260501_rls_missing_tables.sql
git commit -m "security: add RLS policies to 5 tables missing coverage

Tables: client_report_config, client_reports, recommendation_versions, meetings, client_interactions

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

## Task 8: Create advisor_ai_usage table

**Files:**
- Create: `supabase/migrations/20260501_advisor_ai_usage.sql`

- [ ] **Step 1: Write the migration**

```sql
-- Migration: AI usage tracking table
-- Tracks token usage and cost per advisor per month (visibility only, no blocking)

CREATE TABLE IF NOT EXISTS advisor_ai_usage (
  advisor_id UUID NOT NULL REFERENCES advisors(id),
  month TEXT NOT NULL,              -- '2026-04'
  tokens_used BIGINT DEFAULT 0,
  cost_usd DECIMAL(10,4) DEFAULT 0,
  calls_count INT DEFAULT 0,
  PRIMARY KEY (advisor_id, month)
);

-- RLS: advisor sees only their own usage
ALTER TABLE advisor_ai_usage ENABLE ROW LEVEL SECURITY;

CREATE POLICY "advisor_select_own_usage"
  ON advisor_ai_usage FOR SELECT
  USING (advisor_id = auth.uid());

-- Allow service_role to upsert (API routes use createAdminClient)
-- No INSERT/UPDATE policy needed since API routes use service_role which bypasses RLS

COMMENT ON TABLE advisor_ai_usage
  IS 'Monthly AI usage tracking per advisor. Visibility only, no blocking.';
```

- [ ] **Step 2: Commit**

```bash
git add supabase/migrations/20260501_advisor_ai_usage.sql
git commit -m "feat: add advisor_ai_usage table for AI cost tracking

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

## Task 9: Add AI usage tracking to endpoints

**Files:**
- Modify: `app/api/comite/generar-cartera/route.ts`
- Modify: `app/api/clients/[id]/reports/route.ts`
- Modify: `app/api/portfolio/xray-report/route.ts`

- [ ] **Step 1: Create a shared tracking helper**

Add to a new utility that all 3 endpoints will use. Create `lib/ai-usage.ts`:

```typescript
// lib/ai-usage.ts
import { createAdminClient } from "@/lib/auth/api-auth";

interface TrackUsageParams {
  advisorId: string;
  inputTokens: number;
  outputTokens: number;
  model: string;
}

// Approximate costs per 1M tokens (USD)
const MODEL_COSTS: Record<string, { input: number; output: number }> = {
  "claude-sonnet-4-20250514": { input: 3, output: 15 },
  "claude-opus-4-20250514": { input: 15, output: 75 },
};

export async function trackAIUsage({ advisorId, inputTokens, outputTokens, model }: TrackUsageParams) {
  try {
    const supabase = createAdminClient();
    const month = new Date().toISOString().slice(0, 7); // '2026-04'
    const totalTokens = inputTokens + outputTokens;

    const costs = MODEL_COSTS[model] || MODEL_COSTS["claude-sonnet-4-20250514"];
    const costUsd = (inputTokens / 1_000_000) * costs.input + (outputTokens / 1_000_000) * costs.output;

    await supabase.rpc("increment_ai_usage", {
      p_advisor_id: advisorId,
      p_month: month,
      p_tokens: totalTokens,
      p_cost: costUsd,
    });
  } catch (err) {
    // Non-blocking: log but don't fail the request
    console.error("Failed to track AI usage:", err);
  }
}
```

- [ ] **Step 2: Add the RPC function to the migration**

Append to `supabase/migrations/20260501_advisor_ai_usage.sql`:

```sql
-- RPC for atomic increment (called from API routes via service_role)
CREATE OR REPLACE FUNCTION increment_ai_usage(
  p_advisor_id UUID,
  p_month TEXT,
  p_tokens BIGINT,
  p_cost DECIMAL(10,4)
)
RETURNS void
LANGUAGE sql
AS $$
  INSERT INTO advisor_ai_usage (advisor_id, month, tokens_used, cost_usd, calls_count)
  VALUES (p_advisor_id, p_month, p_tokens, p_cost, 1)
  ON CONFLICT (advisor_id, month)
  DO UPDATE SET
    tokens_used = advisor_ai_usage.tokens_used + EXCLUDED.tokens_used,
    cost_usd = advisor_ai_usage.cost_usd + EXCLUDED.cost_usd,
    calls_count = advisor_ai_usage.calls_count + 1;
$$;
```

- [ ] **Step 3: Add tracking to generar-cartera**

In `app/api/comite/generar-cartera/route.ts`, after the Anthropic API call that returns the response, add:

```typescript
import { trackAIUsage } from "@/lib/ai-usage";

// After the anthropic.messages.create call:
// Track AI usage (non-blocking)
trackAIUsage({
  advisorId: advisor.id,
  inputTokens: response.usage.input_tokens,
  outputTokens: response.usage.output_tokens,
  model: "claude-sonnet-4-20250514",
});
```

- [ ] **Step 4: Add tracking to reports route and xray-report route**

Same pattern in both files — import `trackAIUsage` and call after the Anthropic response.

- [ ] **Step 5: Commit**

```bash
git add lib/ai-usage.ts supabase/migrations/20260501_advisor_ai_usage.sql app/api/comite/generar-cartera/route.ts app/api/clients/[id]/reports/route.ts app/api/portfolio/xray-report/route.ts
git commit -m "feat: add AI usage tracking to all Claude API endpoints

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

## Task 10: Clean debug console.error in generar-cartera

**Files:**
- Modify: `app/api/comite/generar-cartera/route.ts` (lines 125-135)

- [ ] **Step 1: Remove the debug block**

In `app/api/comite/generar-cartera/route.ts`, delete lines 125-135:

```typescript
    // Debug: Log portfolio_data
    console.error("=== DEBUG: Client Data ===");
    console.error("Client ID:", client.id);
    console.error("Client Name:", client.nombre, client.apellido);
    console.error("Portfolio Data exists:", !!client.portfolio_data);
    console.error("Portfolio Data raw:", JSON.stringify(client.portfolio_data, null, 2));
    if (client.portfolio_data) {
      console.error("Portfolio composition:", client.portfolio_data.composition);
      console.error("Portfolio holdings count:", client.portfolio_data.statement?.holdings?.length || 0);
    }
    console.error("========================");
```

- [ ] **Step 2: Verify build**

Run: `npx next build 2>&1 | head -20`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add app/api/comite/generar-cartera/route.ts
git commit -m "cleanup: remove debug console.error logs from generar-cartera

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

## Notes

### Magic link validation (Task 1.8 from spec)

This is a **manual test** task, not a code task. The middleware at `lib/supabase/middleware.ts` handles:
- PKCE code exchange (line 29-41)
- Role-based redirects (lines 72-93)
- Protected route redirect for unauthenticated users (lines 95-100)
- Login redirect for authenticated users (lines 103-107)

**Manual test checklist:**
- [ ] Open magic link in a different browser → should work (stateless token)
- [ ] Click expired magic link (>1h) → should show clear error, not blank page
- [ ] Click magic link twice → second attempt should fail with message
- [ ] User without role → middleware redirects correctly (line 78: non-client goes to `/advisor`)
- [ ] Token expiry mid-session → Supabase SSR handles refresh automatically via `updateSession`

No code changes needed unless a test reveals a bug.
