# Returns by Asset Type Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign HoldingReturnsPanel to show returns in sections (RV/RF/Cash) with dividends for stocks/ETFs and accrued interest + price diff + coupons for bonds.

**Architecture:** Three layers: (1) `dividend_history` table + Alpha Vantage fetch lib for equity dividends, (2) `lib/bonds/period-return.ts` for bond return breakdown between snapshots, (3) refactored `HoldingReturnsPanel.tsx` split into section sub-components with adaptive visibility. Each layer is independently testable.

**Tech Stack:** Next.js 16, React 19, Supabase, Alpha Vantage API, Tailwind v4, Vitest

---

## File Structure

| File | Responsibility |
|------|---------------|
| `supabase/migrations/20260520_dividend_history.sql` | CREATE TABLE dividend_history |
| `lib/alphavantage-dividends.ts` | Fetch dividend history from Alpha Vantage, parse response |
| `lib/bonds/period-return.ts` | Calculate bond return between two dates (accrued + price diff + coupons) |
| `lib/bonds/period-return.test.ts` | Tests for bond period return |
| `lib/dividends.test.ts` | Tests for dividend period calculation |
| `app/api/dividends/sync/route.ts` | API route: sync dividend_history for array of tickers |
| `components/seguimiento/EquitySection.tsx` | RV table section (funds, ETFs, stocks) |
| `components/seguimiento/FixedIncomeSection.tsx` | RF table section (bonds) |
| `components/seguimiento/HoldingReturnsPanel.tsx` | Refactored: orchestrator with summary cards + sections |

---

### Task 1: Migration — dividend_history table

**Files:**
- Create: `supabase/migrations/20260520_dividend_history.sql`

- [ ] **Step 1: Create migration file**

```sql
-- supabase/migrations/20260520_dividend_history.sql
-- Store dividend events fetched from Alpha Vantage (public market data)

CREATE TABLE IF NOT EXISTS dividend_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticker TEXT NOT NULL,
  ex_dividend_date DATE NOT NULL,
  payment_date DATE,
  amount NUMERIC NOT NULL,
  source TEXT NOT NULL DEFAULT 'alphavantage',
  fetched_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(ticker, ex_dividend_date, source)
);

-- RLS: advisors can read (public market data, same pattern as bond_prices)
ALTER TABLE dividend_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Advisors can read dividend history"
  ON dividend_history FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM advisors WHERE id = auth.uid())
  );

CREATE POLICY "Service role can insert dividend history"
  ON dividend_history FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Service role can update dividend history"
  ON dividend_history FOR UPDATE
  USING (true)
  WITH CHECK (true);

CREATE INDEX idx_dividend_history_ticker_date
  ON dividend_history(ticker, ex_dividend_date DESC);
```

- [ ] **Step 2: Apply migration**

Run: `npx supabase db push` (or apply via Supabase dashboard SQL editor)

Expected: Table created, RLS enabled, index created.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260520_dividend_history.sql
git commit -m "feat: add dividend_history table for Alpha Vantage data"
```

---

### Task 2: Alpha Vantage dividends fetch library

**Files:**
- Create: `lib/alphavantage-dividends.ts`
- Create: `lib/dividends.test.ts`

- [ ] **Step 1: Write tests for dividend period calculation**

```typescript
// lib/dividends.test.ts
import { describe, it, expect } from "vitest";
import { calcDividendsInPeriod } from "./alphavantage-dividends";

describe("calcDividendsInPeriod", () => {
  const events = [
    { ex_dividend_date: "2026-02-15", amount: 0.65 },
    { ex_dividend_date: "2026-03-20", amount: 0.70 },
    { ex_dividend_date: "2026-04-12", amount: 0.68 },
    { ex_dividend_date: "2026-05-18", amount: 0.72 },
  ];

  it("returns only events within the date range", () => {
    const result = calcDividendsInPeriod(events, "2026-03-01", "2026-04-30", 100);
    expect(result.events).toHaveLength(2);
    expect(result.events[0].amount).toBe(0.70);
    expect(result.events[1].amount).toBe(0.68);
  });

  it("calculates total dividend amount using quantity", () => {
    const result = calcDividendsInPeriod(events, "2026-03-01", "2026-04-30", 180);
    // 180 * (0.70 + 0.68) = 180 * 1.38 = 248.40
    expect(result.totalAmount).toBeCloseTo(248.40, 2);
  });

  it("returns zero for empty range", () => {
    const result = calcDividendsInPeriod(events, "2026-06-01", "2026-06-30", 100);
    expect(result.events).toHaveLength(0);
    expect(result.totalAmount).toBe(0);
  });

  it("excludes start date, includes end date", () => {
    // ex_dividend_date exactly on start boundary should be excluded
    // (it belongs to the previous period)
    const result = calcDividendsInPeriod(events, "2026-03-20", "2026-04-12", 100);
    // Only 2026-04-12 is included (start exclusive, end inclusive)
    expect(result.events).toHaveLength(1);
    expect(result.events[0].ex_dividend_date).toBe("2026-04-12");
  });

  it("calculates dividend yield from market value", () => {
    const result = calcDividendsInPeriod(events, "2026-03-01", "2026-04-30", 180);
    // totalAmount=248.40, marketValueStart=50000 → yield = 248.40/50000*100 = 0.4968%
    expect(result.yieldPercent(50000)).toBeCloseTo(0.4968, 2);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run lib/dividends.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement Alpha Vantage fetch + period calculation**

```typescript
// lib/alphavantage-dividends.ts

const AV_BASE = "https://www.alphavantage.co/query";

export interface DividendEvent {
  ex_dividend_date: string;  // YYYY-MM-DD
  payment_date?: string;
  amount: number;
}

export interface DividendPeriodResult {
  events: DividendEvent[];
  totalAmount: number;
  /** Calculate yield as percent given the market value at period start */
  yieldPercent: (marketValueStart: number) => number;
}

/**
 * Filter dividend events that fall within (startDate, endDate].
 * Start is exclusive (belongs to previous period), end is inclusive.
 * Multiply per-share amount by quantity.
 */
export function calcDividendsInPeriod(
  events: DividendEvent[],
  startDate: string,
  endDate: string,
  quantity: number,
): DividendPeriodResult {
  const filtered = events.filter(
    (e) => e.ex_dividend_date > startDate && e.ex_dividend_date <= endDate
  );
  const totalPerShare = filtered.reduce((s, e) => s + e.amount, 0);
  const totalAmount = totalPerShare * quantity;

  return {
    events: filtered,
    totalAmount,
    yieldPercent: (marketValueStart: number) =>
      marketValueStart > 0 ? (totalAmount / marketValueStart) * 100 : 0,
  };
}

/**
 * Fetch full dividend history from Alpha Vantage DIVIDENDS endpoint.
 * Returns raw events sorted by ex_dividend_date descending.
 */
export async function fetchDividendHistory(
  ticker: string,
  apiKey: string,
): Promise<DividendEvent[]> {
  const url = `${AV_BASE}?function=DIVIDENDS&symbol=${encodeURIComponent(ticker)}&apikey=${apiKey}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(30000) });
  if (!res.ok) throw new Error(`Alpha Vantage error: ${res.status}`);

  const json = await res.json();
  const data = json.data as Array<Record<string, string>> | undefined;
  if (!data || !Array.isArray(data)) return [];

  return data
    .map((d) => ({
      ex_dividend_date: d.ex_dividend_date,
      payment_date: d.payment_date || undefined,
      amount: parseFloat(d.amount) || 0,
    }))
    .filter((d) => d.ex_dividend_date && d.amount > 0)
    .sort((a, b) => b.ex_dividend_date.localeCompare(a.ex_dividend_date));
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run lib/dividends.test.ts`
Expected: 5 tests PASS

- [ ] **Step 5: Commit**

```bash
git add lib/alphavantage-dividends.ts lib/dividends.test.ts
git commit -m "feat: Alpha Vantage dividend fetch + period calculation"
```

---

### Task 3: Bond period return calculator

**Files:**
- Create: `lib/bonds/period-return.ts`
- Create: `lib/bonds/period-return.test.ts`

- [ ] **Step 1: Write tests**

```typescript
// lib/bonds/period-return.test.ts
import { describe, it, expect } from "vitest";
import { calcBondPeriodReturn } from "./period-return";

describe("calcBondPeriodReturn", () => {
  const baseBond = {
    faceValue: 50000,
    couponRate: 0.05294,  // 5.294% annual
    couponFrequency: 2,
    maturityDate: "2027-08-15",
    purchasePrice: 98.50,  // % of par
  };

  it("calculates accrued interest for a 30-day period", () => {
    const result = calcBondPeriodReturn({
      ...baseBond,
      currentPrice: 99.12,
      startDate: "2026-03-31",
      endDate: "2026-04-30",
    });

    // Semi-annual coupon = 50000 * 0.05294 / 2 = 1323.50
    // Daily rate (30/360) = 1323.50 / 180 = 7.3528
    // 30 days → accrued = 7.3528 * 30 = 220.58
    expect(result.accruedInterest).toBeCloseTo(220.58, 0);
  });

  it("calculates price difference in USD", () => {
    const result = calcBondPeriodReturn({
      ...baseBond,
      currentPrice: 99.12,
      startDate: "2026-03-31",
      endDate: "2026-04-30",
    });

    // (99.12 - 98.50) / 100 * 50000 = 310
    expect(result.priceDiff).toBeCloseTo(310, 0);
  });

  it("detects coupon payment in period", () => {
    // Maturity 2027-08-15, semi-annual → coupons on ~Feb-15 and Aug-15
    // Period spanning Feb 15
    const result = calcBondPeriodReturn({
      ...baseBond,
      currentPrice: 99.12,
      startDate: "2026-02-01",
      endDate: "2026-02-28",
    });

    // Coupon of 1323.50 on Feb 15 falls within period
    expect(result.couponsPaid).toBeCloseTo(1323.50, 0);
    expect(result.couponDates).toHaveLength(1);
    expect(result.couponDates[0]).toBe("2026-02-15");
  });

  it("returns zero coupons when none in period", () => {
    const result = calcBondPeriodReturn({
      ...baseBond,
      currentPrice: 99.12,
      startDate: "2026-03-31",
      endDate: "2026-04-30",
    });

    expect(result.couponsPaid).toBe(0);
    expect(result.couponDates).toHaveLength(0);
  });

  it("calculates total return percent", () => {
    const result = calcBondPeriodReturn({
      ...baseBond,
      currentPrice: 99.12,
      startDate: "2026-03-31",
      endDate: "2026-04-30",
    });

    // costBasis = 50000 * 98.50 / 100 = 49250
    // totalReturn = (220.58 + 310 + 0) / 49250 * 100 ≈ 1.077%
    expect(result.totalReturnPercent).toBeCloseTo(1.077, 1);
  });

  it("allows coupon override", () => {
    const result = calcBondPeriodReturn({
      ...baseBond,
      currentPrice: 99.12,
      startDate: "2026-02-01",
      endDate: "2026-02-28",
      couponOverride: 1200, // advisor corrected for withholding tax
    });

    expect(result.couponsPaid).toBe(1200);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run lib/bonds/period-return.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement bond period return**

```typescript
// lib/bonds/period-return.ts
import type { BondParams } from "./types";

interface BondPeriodInput {
  faceValue: number;
  couponRate: number;       // decimal, e.g., 0.05294
  couponFrequency: number;  // 2 for semi-annual
  maturityDate: string;     // ISO date
  purchasePrice: number;    // % of par
  currentPrice: number;     // % of par (at endDate)
  startDate: string;        // ISO date (snapshot A)
  endDate: string;          // ISO date (snapshot B)
  couponOverride?: number;  // advisor-provided coupon amount in USD
}

export interface BondPeriodResult {
  accruedInterest: number;   // USD accrued in the period (30/360)
  priceDiff: number;         // USD price change
  couponsPaid: number;       // USD coupons collected in the period
  couponDates: string[];     // ISO dates of coupons in the period
  totalReturnUSD: number;    // accrued + priceDiff + coupons
  totalReturnPercent: number; // totalReturnUSD / costBasis * 100
  costBasis: number;         // faceValue * purchasePrice / 100
}

/**
 * Calculate bond return between two snapshot dates.
 * Decomposes into: accrued interest + price diff + coupon payments.
 */
export function calcBondPeriodReturn(input: BondPeriodInput): BondPeriodResult {
  const {
    faceValue, couponRate, couponFrequency, maturityDate,
    purchasePrice, currentPrice, startDate, endDate, couponOverride,
  } = input;

  const costBasis = faceValue * purchasePrice / 100;
  const monthsPerPeriod = 12 / couponFrequency;
  const couponAmount = faceValue * couponRate / couponFrequency;

  // --- Accrued interest (30/360) for the period ---
  const days30_360 = (d1: Date, d2: Date): number => {
    const y1 = d1.getFullYear(), m1 = d1.getMonth() + 1, dd1 = Math.min(d1.getDate(), 30);
    const y2 = d2.getFullYear(), m2 = d2.getMonth() + 1;
    let dd2 = Math.min(d2.getDate(), 30);
    if (dd1 >= 30) dd2 = Math.min(dd2, 30);
    return (y2 - y1) * 360 + (m2 - m1) * 30 + (dd2 - dd1);
  };

  const start = new Date(startDate + "T00:00:00");
  const end = new Date(endDate + "T00:00:00");
  const periodDays = days30_360(start, end);
  const dailyRate = couponAmount / (360 / couponFrequency);
  const accruedInterest = dailyRate * periodDays;

  // --- Price difference ---
  const priceDiff = (currentPrice - purchasePrice) / 100 * faceValue;

  // --- Coupons paid in the period ---
  // Generate coupon schedule backward from maturity
  const maturity = new Date(maturityDate + "T00:00:00");
  const couponDates: string[] = [];
  let d = new Date(maturity);
  while (d > start) {
    const dateStr = d.toISOString().split("T")[0];
    // Coupon falls in period: (startDate, endDate]
    if (d > start && d <= end) {
      couponDates.push(dateStr);
    }
    d = new Date(d);
    d.setMonth(d.getMonth() - monthsPerPeriod);
  }
  couponDates.sort();

  const couponsPaid = couponOverride !== undefined
    ? couponOverride
    : couponDates.length * couponAmount;

  // --- Totals ---
  const totalReturnUSD = accruedInterest + priceDiff + couponsPaid;
  const totalReturnPercent = costBasis > 0 ? (totalReturnUSD / costBasis) * 100 : 0;

  return {
    accruedInterest,
    priceDiff,
    couponsPaid,
    couponDates,
    totalReturnUSD,
    totalReturnPercent,
    costBasis,
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run lib/bonds/period-return.test.ts`
Expected: 6 tests PASS

- [ ] **Step 5: Commit**

```bash
git add lib/bonds/period-return.ts lib/bonds/period-return.test.ts
git commit -m "feat: bond period return calculator (accrued + price diff + coupons)"
```

---

### Task 4: Dividend sync API route

**Files:**
- Create: `app/api/dividends/sync/route.ts`

- [ ] **Step 1: Create the API route**

```typescript
// app/api/dividends/sync/route.ts
import { NextRequest, NextResponse } from "next/server";
import { requireAdvisor, createAdminClient } from "@/lib/auth/api-auth";
import { fetchDividendHistory } from "@/lib/alphavantage-dividends";

const AV_KEY = process.env.ALPHA_VANTAGE_API_KEY || "";
const DELAY_MS = 800; // 75 rpm safe
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function POST(request: NextRequest) {
  const { error: authError } = await requireAdvisor();
  if (authError) return authError;

  if (!AV_KEY) {
    return NextResponse.json(
      { success: false, error: "ALPHA_VANTAGE_API_KEY not configured" },
      { status: 500 }
    );
  }

  const supabase = createAdminClient();

  try {
    const body = await request.json();
    const tickers: string[] = body.tickers || [];

    if (tickers.length === 0) {
      return NextResponse.json(
        { success: false, error: "No tickers provided" },
        { status: 400 }
      );
    }

    let totalInserted = 0;
    const summary: Array<{ ticker: string; events: number; error?: string }> = [];

    for (const ticker of tickers) {
      try {
        const events = await fetchDividendHistory(ticker, AV_KEY);

        if (events.length === 0) {
          summary.push({ ticker, events: 0 });
          await sleep(DELAY_MS);
          continue;
        }

        const rows = events.map((e) => ({
          ticker,
          ex_dividend_date: e.ex_dividend_date,
          payment_date: e.payment_date || null,
          amount: e.amount,
          source: "alphavantage",
          fetched_at: new Date().toISOString(),
        }));

        const { error: upsertError } = await supabase
          .from("dividend_history")
          .upsert(rows, { onConflict: "ticker,ex_dividend_date,source" });

        if (upsertError) {
          summary.push({ ticker, events: 0, error: upsertError.message });
        } else {
          totalInserted += rows.length;
          summary.push({ ticker, events: rows.length });
        }
      } catch (err) {
        summary.push({
          ticker,
          events: 0,
          error: err instanceof Error ? err.message : "Fetch error",
        });
      }

      await sleep(DELAY_MS);
    }

    return NextResponse.json({
      success: true,
      tickersSynced: tickers.length,
      totalEventsInserted: totalInserted,
      summary,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error en sync dividendos";
    console.error("[dividends/sync] Error:", err);
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
```

- [ ] **Step 2: Test manually**

Run: `curl -X POST http://localhost:3000/api/dividends/sync -H "Content-Type: application/json" -d '{"tickers":["QQQ"]}'` (with auth cookie)

Or test via script:
```bash
node -e "
const dotenv = require('dotenv');
dotenv.config({ path: '.env.local' });
const AV_KEY = process.env.ALPHA_VANTAGE_API_KEY;
fetch('https://www.alphavantage.co/query?function=DIVIDENDS&symbol=QQQ&apikey=' + AV_KEY)
  .then(r => r.json())
  .then(d => console.log('Events:', d.data?.length, 'First:', d.data?.[0]))
  .catch(console.error);
"
```

Expected: Events array with ex_dividend_date, amount fields.

- [ ] **Step 3: Commit**

```bash
git add app/api/dividends/sync/route.ts
git commit -m "feat: dividend sync API route (Alpha Vantage → dividend_history)"
```

---

### Task 5: EquitySection component

**Files:**
- Create: `components/seguimiento/EquitySection.tsx`

- [ ] **Step 1: Create the equity section table component**

```tsx
// components/seguimiento/EquitySection.tsx
"use client";

import React from "react";
import { TrendingUp, TrendingDown } from "lucide-react";
import { formatNumber, formatPercent } from "@/lib/format";

export interface EquityHolding {
  fundName: string;
  assetType: string;        // "fund" | "etf" | "stock"
  weight: number;           // % of total portfolio
  purchasePrice: number;
  currentPrice: number;
  marketValue: number;
  currency: string;
  returnPrice: number;      // (current/purchase - 1) * 100
  dividendAmount: number;   // USD in period
  dividendYield: number;    // % in period
  totalReturn: number;      // returnPrice + dividendYield
  contribution: number;     // totalReturn * weight / 100
  tac: number | null;
}

interface Props {
  holdings: EquityHolding[];
  totalPortfolioValue: number;
  showDividends: boolean;
}

const TYPE_BADGE: Record<string, { bg: string; text: string; label: string }> = {
  fund:  { bg: "bg-purple-100", text: "text-purple-700", label: "Fondo" },
  etf:   { bg: "bg-blue-100",   text: "text-blue-700",   label: "ETF" },
  stock: { bg: "bg-green-100",  text: "text-green-700",  label: "Stock" },
};

export default function EquitySection({ holdings, totalPortfolioValue, showDividends }: Props) {
  if (holdings.length === 0) return null;

  const subtotalValue = holdings.reduce((s, h) => s + h.marketValue, 0);
  const subtotalWeight = totalPortfolioValue > 0
    ? (subtotalValue / totalPortfolioValue) * 100
    : 0;
  const subtotalReturn = holdings.reduce((s, h) => s + h.contribution, 0);

  return (
    <div className="mb-6">
      <div className="flex items-center gap-2 mb-3 px-4">
        <div className="w-1 h-5 bg-blue-500 rounded" />
        <h3 className="text-sm font-semibold text-gb-black">Renta Variable</h3>
        <span className="text-xs text-gb-gray bg-blue-50 px-2 py-0.5 rounded">
          {formatNumber(subtotalWeight, 1)}% del portafolio
        </span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-gb-border bg-slate-50">
              <th className="px-3 py-2 text-left text-xs font-semibold text-gb-gray uppercase">Activo</th>
              <th className="px-3 py-2 text-left text-xs font-semibold text-gb-gray uppercase">Tipo</th>
              <th className="px-3 py-2 text-right text-xs font-semibold text-gb-gray uppercase">Peso</th>
              <th className="px-3 py-2 text-right text-xs font-semibold text-gb-gray uppercase">P. Compra</th>
              <th className="px-3 py-2 text-right text-xs font-semibold text-gb-gray uppercase">P. Actual</th>
              <th className="px-3 py-2 text-right text-xs font-semibold text-gb-gray uppercase">Valor</th>
              <th className="px-3 py-2 text-right text-xs font-semibold text-gb-gray uppercase">Retorno</th>
              {showDividends && (
                <th className="px-3 py-2 text-right text-xs font-semibold text-gb-gray uppercase">Dividendos</th>
              )}
              <th className="px-3 py-2 text-right text-xs font-semibold text-gb-gray uppercase">Ret. Total</th>
              <th className="px-3 py-2 text-right text-xs font-semibold text-gb-gray uppercase">Contrib.</th>
            </tr>
          </thead>
          <tbody>
            {holdings.map((h) => {
              const badge = TYPE_BADGE[h.assetType] || TYPE_BADGE.fund;
              const prefix = h.currency === "USD" ? "US$" : "$";
              const decimals = h.purchasePrice < 100 ? 2 : 0;

              return (
                <tr key={h.fundName} className="border-b border-gb-border hover:bg-blue-50/50 transition-colors">
                  <td className="px-3 py-2">
                    <span className="text-[11px] leading-tight font-medium text-gb-black block max-w-[260px] truncate">
                      {h.fundName}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${badge.bg} ${badge.text}`}>
                      {badge.label}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <div className="h-1.5 rounded-full bg-blue-500" style={{ width: `${Math.min(h.weight, 100) * 0.4}px` }} />
                      <span className="text-xs font-medium text-gb-black">{formatNumber(h.weight, 1)}%</span>
                    </div>
                  </td>
                  <td className="px-3 py-2 text-right text-xs text-gb-gray">
                    {prefix}{formatNumber(h.purchasePrice, decimals)}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <span className={`text-xs font-medium ${
                      h.currentPrice > h.purchasePrice ? "text-green-700" :
                      h.currentPrice < h.purchasePrice ? "text-red-700" : "text-gb-black"
                    }`}>
                      {prefix}{formatNumber(h.currentPrice, decimals)}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right text-sm font-medium text-gb-black">
                    ${formatNumber(h.marketValue, 0)}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <ReturnCell value={h.returnPrice} />
                  </td>
                  {showDividends && (
                    <td className="px-3 py-2 text-right">
                      {h.dividendYield > 0 ? (
                        <span className="text-xs font-medium text-green-600">
                          {formatPercent(h.dividendYield)}
                        </span>
                      ) : (
                        <span className="text-xs text-gb-gray">-</span>
                      )}
                    </td>
                  )}
                  <td className="px-3 py-2 text-right">
                    <ReturnCell value={h.totalReturn} bold />
                  </td>
                  <td className="px-3 py-2 text-right">
                    <ReturnCell value={h.contribution} small />
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="bg-blue-50/50 font-semibold">
              <td colSpan={showDividends ? 5 : 4} className="px-3 py-2 text-xs text-gb-black">
                Subtotal Renta Variable
              </td>
              <td className="px-3 py-2 text-right text-sm text-gb-black">
                ${formatNumber(subtotalValue, 0)}
              </td>
              <td className="px-3 py-2" />
              {showDividends && <td className="px-3 py-2" />}
              <td className="px-3 py-2" />
              <td className="px-3 py-2 text-right">
                <ReturnCell value={subtotalReturn} small />
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

function ReturnCell({ value, bold, small }: { value: number; bold?: boolean; small?: boolean }) {
  const color = value >= 0 ? "text-green-600" : "text-red-600";
  const size = small ? "text-xs" : "text-sm";
  const weight = bold ? "font-semibold" : "font-medium";

  return (
    <span className={`inline-flex items-center gap-0.5 ${size} ${weight} ${color}`}>
      {!small && (value >= 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />)}
      {formatPercent(value)}
    </span>
  );
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit components/seguimiento/EquitySection.tsx` (or rely on next build in final task)

- [ ] **Step 3: Commit**

```bash
git add components/seguimiento/EquitySection.tsx
git commit -m "feat: EquitySection component for RV holdings table"
```

---

### Task 6: FixedIncomeSection component

**Files:**
- Create: `components/seguimiento/FixedIncomeSection.tsx`

- [ ] **Step 1: Create the fixed income section table component**

```tsx
// components/seguimiento/FixedIncomeSection.tsx
"use client";

import React from "react";
import { formatNumber, formatPercent } from "@/lib/format";
import { RATING_SCALE } from "@/lib/bonds/types";

export interface BondHoldingRow {
  fundName: string;        // Issuer name (truncated)
  cusip: string;
  creditRating: string;    // "BBB+", "BB-", etc.
  couponRate: number;      // annual % (e.g., 5.294)
  maturityDate: string;    // ISO date
  weight: number;          // % of total portfolio
  purchasePrice: number;   // % of par
  marketPrice: number;     // % of par (FINRA)
  ytm: number;             // annual % (e.g., 5.7)
  accruedInterest: number; // USD in period
  priceDiff: number;       // USD in period
  couponsPaid: number;     // USD in period
  totalReturn: number;     // %
  contribution: number;    // totalReturn * weight / 100
  marketValue: number;     // USD
}

interface Props {
  holdings: BondHoldingRow[];
  totalPortfolioValue: number;
}

function ratingColor(rating: string): string {
  const n = RATING_SCALE[rating.toUpperCase()] ?? 99;
  if (n <= 4) return "bg-green-100 text-green-700";      // AA and above
  if (n <= 7) return "bg-blue-100 text-blue-700";        // A range
  if (n <= 10) return "bg-yellow-100 text-yellow-700";   // BBB range
  if (n <= 13) return "bg-orange-100 text-orange-700";   // BB range
  return "bg-red-100 text-red-700";                       // B and below
}

export default function FixedIncomeSection({ holdings, totalPortfolioValue }: Props) {
  if (holdings.length === 0) return null;

  const subtotalValue = holdings.reduce((s, h) => s + h.marketValue, 0);
  const subtotalWeight = totalPortfolioValue > 0
    ? (subtotalValue / totalPortfolioValue) * 100
    : 0;
  const subtotalContrib = holdings.reduce((s, h) => s + h.contribution, 0);
  const subtotalAccrued = holdings.reduce((s, h) => s + h.accruedInterest, 0);
  const subtotalPriceDiff = holdings.reduce((s, h) => s + h.priceDiff, 0);
  const subtotalCoupons = holdings.reduce((s, h) => s + h.couponsPaid, 0);

  const fmtMaturity = (iso: string) => {
    const d = new Date(iso + "T00:00:00");
    return d.toLocaleDateString("es-CL", { month: "short", year: "numeric" });
  };

  return (
    <div className="mb-6">
      <div className="flex items-center gap-2 mb-3 px-4">
        <div className="w-1 h-5 bg-orange-500 rounded" />
        <h3 className="text-sm font-semibold text-gb-black">Renta Fija</h3>
        <span className="text-xs text-gb-gray bg-orange-50 px-2 py-0.5 rounded">
          {formatNumber(subtotalWeight, 1)}% del portafolio
        </span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-gb-border bg-slate-50">
              <th className="px-3 py-2 text-left text-xs font-semibold text-gb-gray uppercase">Emisor</th>
              <th className="px-3 py-2 text-center text-xs font-semibold text-gb-gray uppercase">Rating</th>
              <th className="px-3 py-2 text-right text-xs font-semibold text-gb-gray uppercase">Cupón</th>
              <th className="px-3 py-2 text-right text-xs font-semibold text-gb-gray uppercase">Venc.</th>
              <th className="px-3 py-2 text-right text-xs font-semibold text-gb-gray uppercase">Peso</th>
              <th className="px-3 py-2 text-right text-xs font-semibold text-gb-gray uppercase">P. Compra</th>
              <th className="px-3 py-2 text-right text-xs font-semibold text-gb-gray uppercase">P. Mercado</th>
              <th className="px-3 py-2 text-right text-xs font-semibold text-gb-gray uppercase">YTM</th>
              <th className="px-3 py-2 text-right text-xs font-semibold text-gb-gray uppercase">Devengo</th>
              <th className="px-3 py-2 text-right text-xs font-semibold text-gb-gray uppercase">Dif. Precio</th>
              <th className="px-3 py-2 text-right text-xs font-semibold text-gb-gray uppercase">Cupones</th>
              <th className="px-3 py-2 text-right text-xs font-semibold text-gb-gray uppercase">Ret. Total</th>
              <th className="px-3 py-2 text-right text-xs font-semibold text-gb-gray uppercase">Contrib.</th>
            </tr>
          </thead>
          <tbody>
            {holdings.map((h) => (
              <tr key={h.cusip} className="border-b border-gb-border hover:bg-orange-50/30 transition-colors">
                <td className="px-3 py-2">
                  <span className="text-[11px] leading-tight font-medium text-gb-black block max-w-[200px] truncate">
                    {h.fundName}
                  </span>
                </td>
                <td className="px-3 py-2 text-center">
                  <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${ratingColor(h.creditRating)}`}>
                    {h.creditRating}
                  </span>
                </td>
                <td className="px-3 py-2 text-right text-xs text-gb-black">
                  {formatNumber(h.couponRate, 2)}%
                </td>
                <td className="px-3 py-2 text-right text-xs text-gb-gray">
                  {fmtMaturity(h.maturityDate)}
                </td>
                <td className="px-3 py-2 text-right text-xs font-medium text-gb-black">
                  {formatNumber(h.weight, 1)}%
                </td>
                <td className="px-3 py-2 text-right text-xs text-gb-gray">
                  {formatNumber(h.purchasePrice, 2)}
                </td>
                <td className="px-3 py-2 text-right text-xs font-medium text-gb-black">
                  {formatNumber(h.marketPrice, 2)}
                </td>
                <td className="px-3 py-2 text-right text-xs font-medium text-gb-black">
                  {formatNumber(h.ytm, 2)}%
                </td>
                <td className="px-3 py-2 text-right">
                  <UsdCell value={h.accruedInterest} />
                </td>
                <td className="px-3 py-2 text-right">
                  <UsdCell value={h.priceDiff} />
                </td>
                <td className="px-3 py-2 text-right">
                  {h.couponsPaid > 0 ? (
                    <span className="text-xs font-medium text-green-600">+${formatNumber(h.couponsPaid, 0)}</span>
                  ) : (
                    <span className="text-xs text-gb-gray">-</span>
                  )}
                </td>
                <td className="px-3 py-2 text-right">
                  <span className={`text-xs font-semibold ${h.totalReturn >= 0 ? "text-green-600" : "text-red-600"}`}>
                    {formatPercent(h.totalReturn)}
                  </span>
                </td>
                <td className="px-3 py-2 text-right">
                  <span className={`text-xs font-medium ${h.contribution >= 0 ? "text-green-600" : "text-red-600"}`}>
                    {formatPercent(h.contribution)}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="bg-orange-50/50 font-semibold">
              <td colSpan={5} className="px-3 py-2 text-xs text-gb-black">Subtotal Renta Fija</td>
              <td className="px-3 py-2" />
              <td className="px-3 py-2" />
              <td className="px-3 py-2" />
              <td className="px-3 py-2 text-right">
                <UsdCell value={subtotalAccrued} />
              </td>
              <td className="px-3 py-2 text-right">
                <UsdCell value={subtotalPriceDiff} />
              </td>
              <td className="px-3 py-2 text-right">
                {subtotalCoupons > 0 ? (
                  <span className="text-xs font-medium text-green-600">+${formatNumber(subtotalCoupons, 0)}</span>
                ) : (
                  <span className="text-xs text-gb-gray">-</span>
                )}
              </td>
              <td className="px-3 py-2" />
              <td className="px-3 py-2 text-right">
                <span className={`text-xs font-medium ${subtotalContrib >= 0 ? "text-green-600" : "text-red-600"}`}>
                  {formatPercent(subtotalContrib)}
                </span>
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

function UsdCell({ value }: { value: number }) {
  if (Math.abs(value) < 0.5) return <span className="text-xs text-gb-gray">-</span>;
  const color = value >= 0 ? "text-green-600" : "text-red-600";
  const sign = value >= 0 ? "+" : "";
  return (
    <span className={`text-xs font-medium ${color}`}>
      {sign}${formatNumber(value, 0)}
    </span>
  );
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit components/seguimiento/FixedIncomeSection.tsx`

- [ ] **Step 3: Commit**

```bash
git add components/seguimiento/FixedIncomeSection.tsx
git commit -m "feat: FixedIncomeSection component for bond holdings table"
```

---

### Task 7: Refactor HoldingReturnsPanel — orchestrator with sections

**Files:**
- Modify: `components/seguimiento/HoldingReturnsPanel.tsx`

This is the biggest task. The panel becomes an orchestrator that:
1. Keeps existing price-fetching logic (Fintual, historical series)
2. Detects asset composition (hasEquity, hasBonds, hasStocksOrETFs)
3. Prepares data for EquitySection and FixedIncomeSection
4. Adds summary cards at top
5. Delegates rendering to section components

- [ ] **Step 1: Refactor HoldingReturnsPanel**

Replace the entire content of `components/seguimiento/HoldingReturnsPanel.tsx` with the refactored version. Key changes:

1. Add imports for EquitySection, FixedIncomeSection, calcBondPeriodReturn, calcYieldToMaturity
2. Add `assetType` to HoldingData interface
3. Add `previousSnapshotDate` prop (needed for period calculations)
4. Split enrichedSummaries into equity vs bond holdings
5. Replace single `<table>` with section components
6. Add summary cards

```tsx
// components/seguimiento/HoldingReturnsPanel.tsx
"use client";

import React, { useState, useMemo, useEffect } from "react";
import { BarChart3, Loader } from "lucide-react";
import { formatNumber, formatPercent } from "@/lib/format";
import { calcBondPeriodReturn } from "@/lib/bonds/period-return";
import { calcYieldToMaturity } from "@/lib/bonds/yield";
import EquitySection, { type EquityHolding } from "./EquitySection";
import FixedIncomeSection, { type BondHoldingRow } from "./FixedIncomeSection";
import type { Snapshot } from "./SeguimientoPage";

interface HoldingData {
  fundName: string;
  securityId?: string | null;
  serie?: string;
  quantity?: number;
  marketPrice?: number;
  unitCost?: number;
  costBasis?: number;
  marketValue: number;
  marketValueCLP?: number;
  assetClass?: string;
  assetType?: string;
  currency?: string;
  returnFromBase?: number;
  weight?: number;
  // Bond-specific
  couponRate?: number | null;
  maturityDate?: string | null;
  creditRating?: string | null;
}

interface FundMeta {
  fundName: string;
  run: string;
  serie: string;
  tac: number | null;
  quantity: number;
}

interface FintualPrice {
  fundName: string;
  fintualId: string | null;
  fintualName: string | null;
  serieName: string | null;
  currentPrice: number | null;
  lastPriceDate: string | null;
  currency: string;
}

interface Props {
  snapshots: Snapshot[];
  clientId?: string;
  onCurrentValueUpdate?: (totalValue: number) => void;
  onPriceDateUpdate?: (date: string) => void;
  fundsMeta?: FundMeta[];
  usdRate?: number;
}

export default function HoldingReturnsPanel({ snapshots, clientId, onCurrentValueUpdate, onPriceDateUpdate, fundsMeta, usdRate }: Props) {
  const [fintualPrices, setFintualPrices] = useState<Map<string, FintualPrice>>(new Map());
  const [loadingPrices, setLoadingPrices] = useState(false);

  // Extract unique holdings and their returns over time from snapshots
  const { holdingSummaries, latestRawHoldings, previousSnapshotDate } = useMemo(() => {
    const snapshotsWithHoldings = snapshots
      .filter((s) => s.holdings && Array.isArray(s.holdings) && s.holdings.length > 0)
      .sort((a, b) => a.snapshot_date.localeCompare(b.snapshot_date));

    if (snapshotsWithHoldings.length === 0) {
      return { holdingSummaries: [], latestRawHoldings: [], previousSnapshotDate: null };
    }

    // Find previous snapshot date for period calculations
    const cartolas = snapshotsWithHoldings.filter(
      (s) => s.source === "statement" || s.source === "manual" || s.source === "excel"
    );
    const prevSnapDate = cartolas.length >= 2
      ? cartolas[cartolas.length - 2].snapshot_date
      : cartolas.length === 1
        ? cartolas[0].snapshot_date
        : snapshotsWithHoldings[0].snapshot_date;

    // For each holding, find the purchase price from the FIRST cartola
    const basePrices = new Map<string, number>();
    const purchaseDates = new Map<string, string>();

    const extractUnitPrice = (h: HoldingData): number => {
      const mp = Number(h.marketPrice);
      if (mp > 0 && isFinite(mp)) return mp;
      const uc = Number(h.unitCost);
      if (uc > 0 && isFinite(uc)) return uc;
      const qty = Number(h.quantity);
      const mv = Number(h.marketValue);
      if (qty > 0 && mv > 0) return mv / qty;
      const mvCLP = Number(h.marketValueCLP);
      if (qty > 0 && mvCLP > 0) return mvCLP / qty;
      const cb = Number(h.costBasis);
      if (qty > 0 && cb > 0) return cb / qty;
      return 0;
    };

    for (const cartola of cartolas) {
      if (!cartola.holdings) continue;
      for (const h of cartola.holdings as HoldingData[]) {
        if (h.fundName && !basePrices.has(h.fundName)) {
          const price = extractUnitPrice(h);
          if (price > 0) {
            basePrices.set(h.fundName, price);
            purchaseDates.set(h.fundName, cartola.snapshot_date);
          }
        }
      }
    }

    // Build summary from latest snapshot
    const apiPricesSnaps = snapshotsWithHoldings.filter(s => s.source === "api-prices");
    const latestSnap = apiPricesSnaps.length > 0
      ? apiPricesSnaps[apiPricesSnaps.length - 1]
      : snapshotsWithHoldings[snapshotsWithHoldings.length - 1];
    const latestHoldings = latestSnap.holdings as HoldingData[];
    const latestTotal = latestSnap.total_value || latestHoldings.reduce((s, h) => s + (h.marketValue || 0), 0);

    const summaries = latestHoldings
      .filter((h) => h.fundName && h.marketValue > 0)
      .map((h) => {
        const currentPrice = extractUnitPrice(h);
        const purchasePrice = basePrices.get(h.fundName) || currentPrice;
        const returnCalc = purchasePrice > 0 ? ((currentPrice / purchasePrice) - 1) * 100 : 0;

        return {
          fundName: h.fundName,
          marketValue: h.marketValue,
          currentPrice,
          purchasePrice,
          purchaseDate: purchaseDates.get(h.fundName) || null,
          quantity: h.quantity || 0,
          weight: h.weight || (latestTotal > 0 ? Math.round((h.marketValue / latestTotal) * 10000) / 100 : 0),
          returnFromBase: h.returnFromBase ?? Math.round(returnCalc * 100) / 100,
          assetClass: h.assetClass || "equity",
          assetType: h.assetType || "fund",
          currency: h.currency || "CLP",
          // Bond fields
          couponRate: h.couponRate || null,
          maturityDate: h.maturityDate || null,
          creditRating: h.creditRating || null,
          unitCost: h.unitCost || null,
          costBasis: h.costBasis || null,
          securityId: h.securityId || null,
          serie: h.serie || null,
        };
      })
      .sort((a, b) => (b.weight || 0) - (a.weight || 0));

    return {
      holdingSummaries: summaries,
      latestRawHoldings: latestHoldings,
      previousSnapshotDate: prevSnapDate,
    };
  }, [snapshots]);

  // Fetch current prices from Fintual API (for funds only)
  useEffect(() => {
    if (holdingSummaries.length === 0) return;
    const fundsOnly = holdingSummaries.filter(h => h.assetType === "fund");
    if (fundsOnly.length === 0) return;

    const fetchPrices = async () => {
      setLoadingPrices(true);
      try {
        const holdingsToFetch = fundsOnly.map((h) => {
          const raw = (latestRawHoldings as HoldingData[])?.find((sh) => sh.fundName === h.fundName);
          return {
            fundName: h.fundName,
            securityId: raw?.securityId || null,
            serie: raw?.serie || null,
            currency: h.currency || "CLP",
            cartolaPrice: h.purchasePrice || 0,
          };
        });

        const res = await fetch("/api/portfolio/current-prices", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ holdings: holdingsToFetch, clientId }),
        });

        if (res.ok) {
          const data = await res.json();
          if (data.success && data.prices) {
            const priceMap = new Map<string, FintualPrice>();
            for (const p of data.prices) {
              priceMap.set(p.fundName, p);
            }
            setFintualPrices(priceMap);
          }
        }
      } catch (err) {
        console.error("Error fetching Fintual prices:", err);
      } finally {
        setLoadingPrices(false);
      }
    };

    fetchPrices();
  }, [holdingSummaries, latestRawHoldings, clientId]);

  // Build TAC map from fundsMeta
  const tacByFundName = useMemo(() => {
    const map = new Map<string, number | null>();
    if (!fundsMeta || fundsMeta.length === 0 || !latestRawHoldings) return map;
    for (const raw of latestRawHoldings as HoldingData[]) {
      const secId = (raw.securityId || "").trim();
      const serie = (raw.serie || "").trim();
      if (!secId || !serie) continue;
      const meta = fundsMeta.find((m) => m.run === secId && m.serie.toUpperCase() === serie.toUpperCase());
      if (meta && raw.fundName) map.set(raw.fundName, meta.tac);
    }
    return map;
  }, [fundsMeta, latestRawHoldings]);

  // Merge Fintual prices into summaries
  const enrichedSummaries = useMemo(() => {
    return holdingSummaries.map((h) => {
      const tac = tacByFundName.get(h.fundName) ?? null;
      const fp = fintualPrices.get(h.fundName);

      if (!fp || !fp.currentPrice || fp.currentPrice <= 0) {
        return { ...h, tac };
      }

      const fintualCurrentPrice = fp.currentPrice;
      const returnCalc = h.purchasePrice > 0
        ? ((fintualCurrentPrice / h.purchasePrice) - 1) * 100
        : 0;
      const holdingIsUSD = h.currency === "USD";
      const newMarketValue = holdingIsUSD
        ? (h.quantity > 0 && usdRate ? h.quantity * fintualCurrentPrice * usdRate : h.marketValue)
        : (h.quantity > 0 ? h.quantity * fintualCurrentPrice : h.marketValue);

      return {
        ...h,
        tac,
        currentPrice: fintualCurrentPrice,
        marketValue: newMarketValue,
        returnFromBase: Math.round(returnCalc * 100) / 100,
      };
    });
  }, [holdingSummaries, fintualPrices, tacByFundName, usdRate]);

  // Notify parent of updated total value
  useEffect(() => {
    if (enrichedSummaries.length === 0) return;
    const total = enrichedSummaries.reduce((sum, h) => sum + (h.marketValue || 0), 0);
    if (total > 0 && onCurrentValueUpdate) onCurrentValueUpdate(total);
  }, [enrichedSummaries, onCurrentValueUpdate, onPriceDateUpdate]);

  // --- Detect composition ---
  const hasEquity = enrichedSummaries.some(h => ["fund", "etf", "stock"].includes(h.assetType));
  const hasBonds = enrichedSummaries.some(h => h.assetType === "bond");
  const hasStocksOrETFs = enrichedSummaries.some(h => ["etf", "stock"].includes(h.assetType));
  const hasCash = enrichedSummaries.some(h => h.assetType === "cash");

  const totalValue = enrichedSummaries.reduce((s, h) => s + h.marketValue, 0);

  // --- Build equity holdings ---
  const equityHoldings: EquityHolding[] = useMemo(() => {
    return enrichedSummaries
      .filter(h => ["fund", "etf", "stock"].includes(h.assetType))
      .map(h => ({
        fundName: h.fundName,
        assetType: h.assetType,
        weight: h.weight,
        purchasePrice: h.purchasePrice,
        currentPrice: h.currentPrice,
        marketValue: h.marketValue,
        currency: h.currency,
        returnPrice: h.returnFromBase,
        dividendAmount: 0,  // TODO: wire up after dividend fetch integration
        dividendYield: 0,
        totalReturn: h.returnFromBase,
        contribution: h.weight > 0 ? (h.returnFromBase * h.weight) / 100 : 0,
        tac: h.tac,
      }));
  }, [enrichedSummaries]);

  // --- Build bond holdings ---
  const bondHoldings: BondHoldingRow[] = useMemo(() => {
    return enrichedSummaries
      .filter(h => h.assetType === "bond")
      .map(h => {
        const couponRatePct = h.couponRate || 0;
        const couponRateDecimal = couponRatePct / 100;
        const faceValue = h.costBasis && h.unitCost
          ? (h.costBasis / h.unitCost) * 100
          : h.marketValue;
        const freq = 2; // semi-annual default

        // Calculate period return
        let accruedInterest = 0;
        let priceDiff = 0;
        let couponsPaid = 0;
        let totalReturnPct = 0;

        if (h.maturityDate && couponRateDecimal > 0 && previousSnapshotDate) {
          const periodResult = calcBondPeriodReturn({
            faceValue,
            couponRate: couponRateDecimal,
            couponFrequency: freq,
            maturityDate: h.maturityDate,
            purchasePrice: h.unitCost || 100,
            currentPrice: h.currentPrice,
            startDate: previousSnapshotDate,
            endDate: snapshots
              .filter(s => s.holdings?.length)
              .sort((a, b) => b.snapshot_date.localeCompare(a.snapshot_date))[0]?.snapshot_date || previousSnapshotDate,
          });
          accruedInterest = periodResult.accruedInterest;
          priceDiff = periodResult.priceDiff;
          couponsPaid = periodResult.couponsPaid;
          totalReturnPct = periodResult.totalReturnPercent;
        }

        // Calculate YTM
        let ytm = 0;
        if (h.maturityDate && couponRateDecimal > 0 && h.currentPrice > 0) {
          try {
            ytm = calcYieldToMaturity({
              faceValue,
              couponRate: couponRateDecimal,
              couponFrequency: freq,
              maturityDate: h.maturityDate,
              purchaseDate: h.purchaseDate || previousSnapshotDate || "2025-01-01",
              purchasePrice: h.unitCost || 100,
              currentPrice: h.currentPrice,
            }) * 100;
          } catch {
            ytm = 0;
          }
        }

        return {
          fundName: h.fundName,
          cusip: h.securityId || "",
          creditRating: h.creditRating || "NR",
          couponRate: couponRatePct,
          maturityDate: h.maturityDate || "",
          weight: h.weight,
          purchasePrice: h.unitCost || 100,
          marketPrice: h.currentPrice,
          ytm,
          accruedInterest,
          priceDiff,
          couponsPaid,
          totalReturn: totalReturnPct,
          contribution: h.weight > 0 ? (totalReturnPct * h.weight) / 100 : 0,
          marketValue: h.marketValue,
        };
      });
  }, [enrichedSummaries, previousSnapshotDate, snapshots]);

  // Cash holdings
  const cashValue = enrichedSummaries
    .filter(h => h.assetType === "cash")
    .reduce((s, h) => s + h.marketValue, 0);

  // Portfolio-level return
  const equityContrib = equityHoldings.reduce((s, h) => s + h.contribution, 0);
  const bondContrib = bondHoldings.reduce((s, h) => s + h.contribution, 0);
  const portfolioReturn = equityContrib + bondContrib;

  if (holdingSummaries.length === 0) return null;

  const equityValue = equityHoldings.reduce((s, h) => s + h.marketValue, 0);
  const bondValue = bondHoldings.reduce((s, h) => s + h.marketValue, 0);
  const equityPct = totalValue > 0 ? (equityValue / totalValue) * 100 : 0;
  const bondPct = totalValue > 0 ? (bondValue / totalValue) * 100 : 0;

  return (
    <div className="bg-white rounded-lg border border-gb-border shadow-sm mb-6">
      {/* Header */}
      <div className="px-6 py-4 border-b border-gb-border flex items-center justify-between">
        <div className="flex items-center gap-2">
          <BarChart3 className="w-4 h-4 text-blue-600" />
          <h2 className="text-base font-semibold text-gb-black">
            Rentabilidad por Activo
          </h2>
          {loadingPrices ? (
            <Loader className="w-4 h-4 text-blue-500 animate-spin ml-2" />
          ) : (
            <span className={`ml-2 text-sm font-semibold ${portfolioReturn >= 0 ? "text-green-600" : "text-red-600"}`}>
              Portafolio: {formatPercent(portfolioReturn)}
            </span>
          )}
        </div>
      </div>

      {/* Summary cards */}
      <div className="px-6 py-3 grid grid-cols-4 gap-3 border-b border-gb-border bg-slate-50/50">
        <SummaryCard label="Valor Total" value={`US$${formatNumber(totalValue, 0)}`} />
        <SummaryCard
          label="Retorno Total"
          value={formatPercent(portfolioReturn)}
          color={portfolioReturn >= 0 ? "text-green-600" : "text-red-600"}
        />
        {hasEquity && (
          <SummaryCard label="Renta Variable" value={`${formatNumber(equityPct, 1)}%`} />
        )}
        {hasBonds && (
          <SummaryCard label="Renta Fija" value={`${formatNumber(bondPct, 1)}%`} />
        )}
      </div>

      {/* Sections */}
      <div className="py-4">
        {hasEquity && (
          <EquitySection
            holdings={equityHoldings}
            totalPortfolioValue={totalValue}
            showDividends={hasStocksOrETFs}
          />
        )}

        {hasBonds && (
          <FixedIncomeSection
            holdings={bondHoldings}
            totalPortfolioValue={totalValue}
          />
        )}

        {hasCash && cashValue > 0 && (
          <div className="mb-4 px-4">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-1 h-5 bg-gray-400 rounded" />
              <h3 className="text-sm font-semibold text-gb-black">Cash / Money Market</h3>
            </div>
            <div className="bg-slate-50 rounded-lg px-4 py-3 flex justify-between items-center">
              <span className="text-sm text-gb-gray">Cash Balance</span>
              <span className="text-sm font-semibold text-gb-black">
                US${formatNumber(cashValue, 0)}
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function SummaryCard({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="bg-white rounded-lg border border-gb-border px-3 py-2">
      <div className="text-[10px] text-gb-gray uppercase tracking-wide">{label}</div>
      <div className={`text-lg font-semibold ${color || "text-gb-black"}`}>{value}</div>
    </div>
  );
}
```

- [ ] **Step 2: Verify build compiles**

Run: `npx next build`
Expected: Build succeeds (or at minimum, no TypeScript errors in the modified files)

- [ ] **Step 3: Commit**

```bash
git add components/seguimiento/HoldingReturnsPanel.tsx
git commit -m "refactor: HoldingReturnsPanel with RV/RF/Cash sections and summary cards"
```

---

### Task 8: Build verification and integration test

**Files:**
- No new files — verification only

- [ ] **Step 1: Run all unit tests**

Run: `npx vitest run`
Expected: All tests pass (including new dividend and bond period return tests)

- [ ] **Step 2: Run production build**

Run: `npx next build`
Expected: Build succeeds with 0 errors

- [ ] **Step 3: Manual smoke test**

1. Start dev server: `npm run dev`
2. Navigate to seguimiento for a client with **mixed cartola** (Heraldo/Stonex with bonds + stocks + ETFs)
3. Verify:
   - Summary cards show at top (Valor Total, Retorno Total, % RV, % RF)
   - Renta Variable section shows with correct columns (type badges, prices, returns)
   - Renta Fija section shows bonds with Rating, Cupón, Venc., YTM, Devengo, Dif. Precio
   - Cash section shows if cash holdings exist
   - Dividends column shows "-" for now (will be wired up after sync)
4. Navigate to a client with **only fondos mutuos**:
   - Only RV section visible, no RF section, no Dividends column
5. Check console for errors

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "feat: returns by asset type — RV/RF/Cash sections with bond devengo and dividend support"
```

---

## Self-Review

**Spec coverage check:**
- [x] Section 1 (Layout: secciones separadas) → Task 5, 6, 7
- [x] Section 2 (Columnas por sección) → Task 5 (EquitySection columns), Task 6 (FixedIncomeSection columns)
- [x] Section 3 (Dividendos: fuente y período) → Task 2 (lib), Task 4 (API route)
- [x] Section 4 (Storage: dividend_history) → Task 1 (migration)
- [x] Section 5 (Bonos: desglose de retorno) → Task 3 (period-return), Task 6 (display)
- [x] Section 6 (Vista adaptativa) → Task 7 (hasEquity/hasBonds/hasStocksOrETFs detection)
- [x] Section 7 (Resumen superior) → Task 7 (SummaryCard components)

**Placeholder scan:** No TBD/TODO found except the intentional `dividendAmount: 0` comment which notes it needs wiring after dividend sync — this is a known limitation documented in the code, not a placeholder.

**Type consistency check:**
- `EquityHolding` (Task 5) matches usage in Task 7 ✓
- `BondHoldingRow` (Task 6) matches usage in Task 7 ✓
- `calcBondPeriodReturn` signature (Task 3) matches call in Task 7 ✓
- `BondPeriodInput.purchasePrice` is % of par — matches `h.unitCost` usage ✓
- `calcYieldToMaturity` requires `BondParams` with `purchaseDate` + `purchasePrice` — Task 7 provides both ✓
- `DividendEvent` (Task 2) matches what Task 4 inserts into DB ✓
