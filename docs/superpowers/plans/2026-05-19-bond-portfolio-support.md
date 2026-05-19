# Bond Portfolio Support Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Support bond portfolios (StoneX-style) in seguimiento with duration, cash flows, coupon calendar, and specialized renta fija view.

**Architecture:** Holdings are stored as JSONB in `portfolio_snapshots.holdings`. We add an `asset_class` field to each holding object and a new `bond_overrides` table for editable per-client bond data (purchase_date, coupon_frequency). The bond math engine is pure functions in `lib/bonds/`. The UI adds dynamic tabs to SeguimientoPage.

**Tech Stack:** Next.js 16, React 19, Supabase Postgres, Recharts, Vitest, Tailwind v4

---

## File Map

### New files
- `lib/bonds/types.ts` — TypeScript types for bond params, cash flows, metrics
- `lib/bonds/cash-flows.ts` — Generate coupon + principal schedule
- `lib/bonds/cash-flows.test.ts` — Tests for cash flow generation
- `lib/bonds/yield.ts` — YTM via Newton-Raphson
- `lib/bonds/yield.test.ts` — Tests for YTM calculation
- `lib/bonds/duration.ts` — Macaulay and Modified duration
- `lib/bonds/duration.test.ts` — Tests for duration
- `lib/bonds/accrued-interest.ts` — Accrued interest (30/360)
- `lib/bonds/accrued-interest.test.ts` — Tests for accrued interest
- `lib/bonds/portfolio.ts` — Weighted portfolio metrics, rating scale
- `lib/bonds/portfolio.test.ts` — Tests for portfolio aggregation
- `supabase/migrations/20260519_bond_support.sql` — bond_overrides table
- `components/seguimiento/BondPortfolioView.tsx` — Main renta fija tab container
- `components/seguimiento/BondTable.tsx` — Bond positions table
- `components/seguimiento/BondDevelopmentModal.tsx` — Individual bond amortization schedule
- `components/seguimiento/CouponCalendar.tsx` — Next 12 months coupon timeline
- `components/seguimiento/CashFlowChart.tsx` — Stacked bar chart of projected flows
- `components/seguimiento/BondDistributionCharts.tsx` — Rating + maturity bucket charts
- `components/seguimiento/ConsolidatedCashFlows.tsx` — All-bonds timeline view

### Modified files
- `app/api/parse-portfolio-statement/route.ts` — Add assetClass + bond fields to parser prompt
- `components/seguimiento/SeguimientoPage.tsx` — Add dynamic tabs (Resumen/Fondos/Renta Fija)
- `components/seguimiento/ReviewSnapshotModal.tsx` — Save bond_overrides on snapshot confirm

---

### Task 1: Bond types and cash flow engine

**Files:**
- Create: `lib/bonds/types.ts`
- Create: `lib/bonds/cash-flows.ts`
- Create: `lib/bonds/cash-flows.test.ts`

- [ ] **Step 1: Create types**

```typescript
// lib/bonds/types.ts

export interface BondParams {
  faceValue: number;        // e.g., 70000
  couponRate: number;       // annual, decimal, e.g., 0.06
  couponFrequency: number;  // payments per year: 1, 2, 4, 12
  maturityDate: string;     // ISO date "2034-06-17"
  purchaseDate: string;     // ISO date "2024-01-15"
  purchasePrice: number;    // % of par, e.g., 102.65
  currentPrice: number;     // % of par, e.g., 105.34
}

export interface CashFlow {
  date: string;             // ISO date
  type: "coupon" | "principal" | "coupon+principal";
  amount: number;           // USD
  cumulativeAmount: number; // running total
  status: "collected" | "pending";
}

export interface BondMetrics {
  macaulayDuration: number;
  modifiedDuration: number;
  yieldToMaturity: number;     // annual, decimal
  accruedInterest: number;     // USD
  totalCouponCollected: number;
  totalCouponPending: number;
  totalCashFlows: number;
}

export interface BondHolding {
  // From parsed cartola
  fundName: string;
  cusip: string;
  couponRate: number;          // annual %, e.g., 6.0
  maturityDate: string;        // ISO date
  creditRating: string;        // e.g., "BBB"
  bondType: string;            // "corporate" | "sovereign" | "agency" | "municipal"
  faceValue: number;           // par/nominal
  unitCost: number;            // purchase price as % of par
  costBasis: number;           // total cost USD
  currentPrice: number;        // current price as % of par
  marketValue: number;         // current market value USD
  unrealizedGainLoss: number;
  estIncomeYield: number;      // %
  estAnnualIncome: number;     // USD
  currency: string;
  // From bond_overrides (editable)
  purchaseDate?: string;       // ISO date, editable by advisor
  couponFrequency?: number;    // payments per year, default 2
  issuer?: string;             // short issuer name
}

export interface PortfolioMetrics {
  totalMarketValue: number;
  weightedDuration: number;
  weightedYield: number;
  totalAnnualIncome: number;
  weightedRating: string;
  weightedRatingNumeric: number;
}

// S&P rating scale: lower number = better rating
export const RATING_SCALE: Record<string, number> = {
  "AAA": 1, "AA+": 2, "AA": 3, "AA-": 4,
  "A+": 5, "A": 6, "A-": 7,
  "BBB+": 8, "BBB": 9, "BBB-": 10,
  "BB+": 11, "BB": 12, "BB-": 13,
  "B+": 14, "B": 15, "B-": 16,
  "CCC+": 17, "CCC": 18, "CCC-": 19,
  "CC": 20, "C": 21, "D": 22,
};

export const RATING_FROM_NUMBER: Record<number, string> = Object.fromEntries(
  Object.entries(RATING_SCALE).map(([k, v]) => [v, k])
);
```

- [ ] **Step 2: Write failing tests for cash flow generation**

```typescript
// lib/bonds/cash-flows.test.ts
import { describe, it, expect } from "vitest";
import { generateCashFlows } from "./cash-flows";
import type { BondParams } from "./types";

const arcelormittal: BondParams = {
  faceValue: 70000,
  couponRate: 0.06,
  couponFrequency: 2,
  maturityDate: "2034-06-17",
  purchaseDate: "2024-01-15",
  purchasePrice: 102.6525,
  currentPrice: 105.3431,
};

describe("generateCashFlows", () => {
  it("generates correct number of flows for a semiannual bond", () => {
    const flows = generateCashFlows(arcelormittal);
    // From purchase 2024-01-15 to maturity 2034-06-17:
    // First coupon after purchase: 2024-06-17
    // Last coupon: 2034-06-17 (with principal)
    // ~21 semiannual periods (Jun and Dec from 2024-06 to 2034-06)
    expect(flows.length).toBe(21);
  });

  it("marks last flow as coupon+principal", () => {
    const flows = generateCashFlows(arcelormittal);
    const last = flows[flows.length - 1];
    expect(last.type).toBe("coupon+principal");
    expect(last.amount).toBe(70000 + 2100); // principal + semiannual coupon
    expect(last.date).toBe("2034-06-17");
  });

  it("calculates correct semiannual coupon amount", () => {
    const flows = generateCashFlows(arcelormittal);
    const couponOnly = flows.filter(f => f.type === "coupon");
    // Each semiannual coupon = 70000 * 0.06 / 2 = 2100
    expect(couponOnly[0].amount).toBe(2100);
  });

  it("marks past coupons as collected", () => {
    const flows = generateCashFlows(arcelormittal);
    const collected = flows.filter(f => f.status === "collected");
    // All flows with date <= today should be collected
    const today = new Date().toISOString().split("T")[0];
    collected.forEach(f => {
      expect(f.date <= today).toBe(true);
    });
  });

  it("cumulative amount increases monotonically", () => {
    const flows = generateCashFlows(arcelormittal);
    for (let i = 1; i < flows.length; i++) {
      expect(flows[i].cumulativeAmount).toBeGreaterThan(flows[i - 1].cumulativeAmount);
    }
  });

  it("handles annual coupon frequency", () => {
    const annual: BondParams = {
      ...arcelormittal,
      couponFrequency: 1,
    };
    const flows = generateCashFlows(annual);
    // Annual from 2024-06-17 to 2034-06-17 = 11 flows
    expect(flows.length).toBe(11);
    expect(flows[0].amount).toBe(4200); // annual coupon = 70000 * 0.06
  });

  it("handles quarterly coupon frequency", () => {
    const quarterly: BondParams = {
      ...arcelormittal,
      couponFrequency: 4,
    };
    const flows = generateCashFlows(quarterly);
    // Quarterly = ~42 flows
    const couponAmount = 70000 * 0.06 / 4; // 1050
    expect(flows[0].amount).toBe(couponAmount);
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx vitest run lib/bonds/cash-flows.test.ts`
Expected: FAIL — module `./cash-flows` not found

- [ ] **Step 4: Implement cash flow generation**

```typescript
// lib/bonds/cash-flows.ts
import type { BondParams, CashFlow } from "./types";

/**
 * Generate all cash flows for a bond from first coupon after purchase to maturity.
 * Coupon dates are generated by stepping backward from maturity date by coupon period.
 */
export function generateCashFlows(bond: BondParams): CashFlow[] {
  const { faceValue, couponRate, couponFrequency, maturityDate, purchaseDate } = bond;
  const couponAmount = faceValue * couponRate / couponFrequency;
  const monthsPerPeriod = 12 / couponFrequency;

  // Generate coupon dates by stepping backward from maturity
  const maturity = new Date(maturityDate + "T00:00:00");
  const purchase = new Date(purchaseDate + "T00:00:00");
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const couponDates: Date[] = [];
  let d = new Date(maturity);
  while (d > purchase) {
    couponDates.unshift(new Date(d));
    d = new Date(d);
    d.setMonth(d.getMonth() - monthsPerPeriod);
  }

  // Build cash flows
  let cumulative = 0;
  const flows: CashFlow[] = couponDates.map((date, i) => {
    const isLast = i === couponDates.length - 1;
    const amount = isLast ? couponAmount + faceValue : couponAmount;
    cumulative += amount;
    const dateStr = date.toISOString().split("T")[0];

    return {
      date: dateStr,
      type: isLast ? "coupon+principal" : "coupon",
      amount,
      cumulativeAmount: cumulative,
      status: date <= today ? "collected" : "pending",
    };
  });

  return flows;
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run lib/bonds/cash-flows.test.ts`
Expected: All tests PASS

- [ ] **Step 6: Commit**

```bash
git add lib/bonds/types.ts lib/bonds/cash-flows.ts lib/bonds/cash-flows.test.ts
git commit -m "feat(bonds): add types and cash flow generation engine"
```

---

### Task 2: Yield to maturity calculator

**Files:**
- Create: `lib/bonds/yield.ts`
- Create: `lib/bonds/yield.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// lib/bonds/yield.test.ts
import { describe, it, expect } from "vitest";
import { calcYieldToMaturity } from "./yield";
import type { BondParams } from "./types";

describe("calcYieldToMaturity", () => {
  it("YTM for par bond equals coupon rate", () => {
    const parBond: BondParams = {
      faceValue: 100000,
      couponRate: 0.06,
      couponFrequency: 2,
      maturityDate: "2034-06-17",
      purchaseDate: "2024-06-17",
      purchasePrice: 100,    // at par
      currentPrice: 100,
    };
    const ytm = calcYieldToMaturity(parBond);
    expect(ytm).toBeCloseTo(0.06, 3);
  });

  it("YTM for premium bond is less than coupon rate", () => {
    const premiumBond: BondParams = {
      faceValue: 70000,
      couponRate: 0.06,
      couponFrequency: 2,
      maturityDate: "2034-06-17",
      purchaseDate: "2024-01-15",
      purchasePrice: 102.6525,
      currentPrice: 105.3431,
    };
    const ytm = calcYieldToMaturity(premiumBond);
    expect(ytm).toBeLessThan(0.06);
    expect(ytm).toBeGreaterThan(0.04);
  });

  it("YTM for discount bond is greater than coupon rate", () => {
    const discountBond: BondParams = {
      faceValue: 40000,
      couponRate: 0.0775,
      couponFrequency: 2,
      maturityDate: "2032-02-01",
      purchaseDate: "2024-01-15",
      purchasePrice: 98.825,
      currentPrice: 102.55,
    };
    const ytm = calcYieldToMaturity(discountBond);
    expect(ytm).toBeGreaterThan(0.0775);
  });

  it("returns NaN for degenerate inputs", () => {
    const bad: BondParams = {
      faceValue: 0,
      couponRate: 0,
      couponFrequency: 2,
      maturityDate: "2024-01-01",
      purchaseDate: "2024-01-01",
      purchasePrice: 100,
      currentPrice: 100,
    };
    const ytm = calcYieldToMaturity(bad);
    expect(Number.isNaN(ytm)).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run lib/bonds/yield.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement YTM**

```typescript
// lib/bonds/yield.ts
import type { BondParams } from "./types";

/**
 * Calculate Yield to Maturity using Newton-Raphson.
 * Uses currentPrice to solve: price = sum(CF_i / (1 + y/freq)^i)
 * Returns annual yield as decimal (e.g., 0.057 = 5.7%).
 */
export function calcYieldToMaturity(bond: BondParams): number {
  const { faceValue, couponRate, couponFrequency, maturityDate, purchaseDate, currentPrice } = bond;

  if (faceValue <= 0 || couponFrequency <= 0) return NaN;

  const coupon = faceValue * couponRate / couponFrequency;
  const monthsPerPeriod = 12 / couponFrequency;

  // Count periods from now to maturity
  const maturity = new Date(maturityDate + "T00:00:00");
  const now = new Date();
  now.setHours(0, 0, 0, 0);

  if (maturity <= now) return NaN;

  // Count remaining coupon dates
  const periods: number[] = [];
  let d = new Date(maturity);
  let n = 0;
  while (d > now) {
    n++;
    periods.unshift(n);
    d.setMonth(d.getMonth() - monthsPerPeriod);
  }
  // periods is now [1, 2, ..., N] where N is the number of remaining coupons

  if (periods.length === 0) return NaN;

  const marketPrice = currentPrice / 100 * faceValue;

  // Price as function of periodic yield y:
  // P(y) = sum(coupon/(1+y)^i) + faceValue/(1+y)^N
  // We solve P(y) = marketPrice

  const N = periods.length;

  function price(y: number): number {
    let pv = 0;
    for (let i = 1; i <= N; i++) {
      pv += coupon / Math.pow(1 + y, i);
    }
    pv += faceValue / Math.pow(1 + y, N);
    return pv;
  }

  function dPrice(y: number): number {
    let dpv = 0;
    for (let i = 1; i <= N; i++) {
      dpv -= i * coupon / Math.pow(1 + y, i + 1);
    }
    dpv -= N * faceValue / Math.pow(1 + y, N + 1);
    return dpv;
  }

  // Newton-Raphson
  let y = couponRate / couponFrequency; // initial guess: coupon rate per period
  for (let iter = 0; iter < 100; iter++) {
    const p = price(y);
    const dp = dPrice(y);
    if (Math.abs(dp) < 1e-12) break;
    const diff = p - marketPrice;
    if (Math.abs(diff) < 0.0001) break;
    y = y - diff / dp;
    if (y <= -1) y = 0.001; // guard against divergence
  }

  // Convert periodic yield to annual
  return y * couponFrequency;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run lib/bonds/yield.test.ts`
Expected: All PASS

- [ ] **Step 5: Commit**

```bash
git add lib/bonds/yield.ts lib/bonds/yield.test.ts
git commit -m "feat(bonds): add yield-to-maturity calculator (Newton-Raphson)"
```

---

### Task 3: Duration and accrued interest calculators

**Files:**
- Create: `lib/bonds/duration.ts`
- Create: `lib/bonds/duration.test.ts`
- Create: `lib/bonds/accrued-interest.ts`
- Create: `lib/bonds/accrued-interest.test.ts`

- [ ] **Step 1: Write failing tests for duration**

```typescript
// lib/bonds/duration.test.ts
import { describe, it, expect } from "vitest";
import { calcMacaulayDuration, calcModifiedDuration } from "./duration";
import type { BondParams } from "./types";

const bond: BondParams = {
  faceValue: 100000,
  couponRate: 0.06,
  couponFrequency: 2,
  maturityDate: "2034-06-17",
  purchaseDate: "2024-01-15",
  purchasePrice: 100,
  currentPrice: 100,
};

describe("calcMacaulayDuration", () => {
  it("returns positive duration less than maturity in years", () => {
    const dur = calcMacaulayDuration(bond);
    expect(dur).toBeGreaterThan(0);
    // Duration must be less than time to maturity
    const yearsToMaturity = (new Date("2034-06-17").getTime() - Date.now()) / (365.25 * 24 * 3600 * 1000);
    expect(dur).toBeLessThan(yearsToMaturity);
  });

  it("higher coupon rate produces lower duration", () => {
    const highCoupon = { ...bond, couponRate: 0.10 };
    const durLow = calcMacaulayDuration(bond);
    const durHigh = calcMacaulayDuration(highCoupon);
    expect(durHigh).toBeLessThan(durLow);
  });

  it("zero coupon bond has duration equal to time to maturity", () => {
    const zeroCoupon: BondParams = {
      faceValue: 100000,
      couponRate: 0,
      couponFrequency: 2,
      maturityDate: "2034-06-17",
      purchaseDate: "2024-01-15",
      purchasePrice: 60,
      currentPrice: 65,
    };
    const dur = calcMacaulayDuration(zeroCoupon);
    const yearsToMaturity = (new Date("2034-06-17").getTime() - Date.now()) / (365.25 * 24 * 3600 * 1000);
    expect(dur).toBeCloseTo(yearsToMaturity, 0);
  });
});

describe("calcModifiedDuration", () => {
  it("modified < macaulay", () => {
    const mac = calcMacaulayDuration(bond);
    const mod = calcModifiedDuration(bond);
    expect(mod).toBeLessThan(mac);
    expect(mod).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Write failing tests for accrued interest**

```typescript
// lib/bonds/accrued-interest.test.ts
import { describe, it, expect } from "vitest";
import { calcAccruedInterest } from "./accrued-interest";
import type { BondParams } from "./types";

const bond: BondParams = {
  faceValue: 70000,
  couponRate: 0.06,
  couponFrequency: 2,
  maturityDate: "2034-06-17",
  purchaseDate: "2024-01-15",
  purchasePrice: 102.65,
  currentPrice: 105.34,
};

describe("calcAccruedInterest", () => {
  it("returns 0 on coupon date", () => {
    const ai = calcAccruedInterest(bond, "2024-06-17");
    expect(ai).toBeCloseTo(0, 0);
  });

  it("returns half coupon at mid-period", () => {
    // Midpoint between 2024-06-17 and 2024-12-17 is roughly 2024-09-17
    const ai = calcAccruedInterest(bond, "2024-09-17");
    const semiCoupon = 70000 * 0.06 / 2; // 2100
    // ~91/180 days = ~half
    expect(ai).toBeGreaterThan(semiCoupon * 0.4);
    expect(ai).toBeLessThan(semiCoupon * 0.6);
  });

  it("returns full coupon just before next coupon date", () => {
    const ai = calcAccruedInterest(bond, "2024-12-16");
    const semiCoupon = 70000 * 0.06 / 2;
    expect(ai).toBeCloseTo(semiCoupon, -1); // within ~10
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx vitest run lib/bonds/duration.test.ts lib/bonds/accrued-interest.test.ts`
Expected: FAIL

- [ ] **Step 4: Implement duration**

```typescript
// lib/bonds/duration.ts
import type { BondParams } from "./types";
import { calcYieldToMaturity } from "./yield";

/**
 * Macaulay Duration: weighted average time of cash flows.
 * Returns duration in years.
 */
export function calcMacaulayDuration(bond: BondParams): number {
  const { faceValue, couponRate, couponFrequency, maturityDate } = bond;
  const coupon = faceValue * couponRate / couponFrequency;
  const monthsPerPeriod = 12 / couponFrequency;

  const ytm = calcYieldToMaturity(bond);
  if (Number.isNaN(ytm)) return 0;
  const y = ytm / couponFrequency; // periodic yield

  const maturity = new Date(maturityDate + "T00:00:00");
  const now = new Date();
  now.setHours(0, 0, 0, 0);

  // Count remaining periods
  const couponDates: Date[] = [];
  let d = new Date(maturity);
  while (d > now) {
    couponDates.unshift(new Date(d));
    d = new Date(d);
    d.setMonth(d.getMonth() - monthsPerPeriod);
  }

  if (couponDates.length === 0) return 0;

  let pvTotal = 0;
  let weightedTime = 0;

  couponDates.forEach((date, idx) => {
    const i = idx + 1;
    const isLast = idx === couponDates.length - 1;
    const cf = isLast ? coupon + faceValue : coupon;
    const pv = cf / Math.pow(1 + y, i);
    const timeInYears = i / couponFrequency;

    pvTotal += pv;
    weightedTime += timeInYears * pv;
  });

  return pvTotal > 0 ? weightedTime / pvTotal : 0;
}

/**
 * Modified Duration = Macaulay / (1 + YTM/freq)
 */
export function calcModifiedDuration(bond: BondParams): number {
  const mac = calcMacaulayDuration(bond);
  const ytm = calcYieldToMaturity(bond);
  if (Number.isNaN(ytm)) return 0;
  return mac / (1 + ytm / bond.couponFrequency);
}
```

- [ ] **Step 5: Implement accrued interest**

```typescript
// lib/bonds/accrued-interest.ts
import type { BondParams } from "./types";

/**
 * Calculate accrued interest using 30/360 day count convention.
 * Standard for US corporate bonds.
 */
export function calcAccruedInterest(bond: BondParams, settleDateStr: string): number {
  const { faceValue, couponRate, couponFrequency, maturityDate } = bond;
  const couponAmount = faceValue * couponRate / couponFrequency;
  const monthsPerPeriod = 12 / couponFrequency;

  const settle = new Date(settleDateStr + "T00:00:00");
  const maturity = new Date(maturityDate + "T00:00:00");

  // Find the last coupon date on or before settle
  let prevCoupon = new Date(maturity);
  while (prevCoupon > settle) {
    prevCoupon.setMonth(prevCoupon.getMonth() - monthsPerPeriod);
  }

  // Next coupon date
  const nextCoupon = new Date(prevCoupon);
  nextCoupon.setMonth(nextCoupon.getMonth() + monthsPerPeriod);

  // 30/360 day count
  const days30_360 = (d1: Date, d2: Date): number => {
    let y1 = d1.getFullYear(), m1 = d1.getMonth() + 1, dd1 = Math.min(d1.getDate(), 30);
    let y2 = d2.getFullYear(), m2 = d2.getMonth() + 1, dd2 = Math.min(d2.getDate(), 30);
    if (dd1 === 31) dd1 = 30;
    if (dd2 === 31 && dd1 >= 30) dd2 = 30;
    return (y2 - y1) * 360 + (m2 - m1) * 30 + (dd2 - dd1);
  };

  const daysSinceCoupon = days30_360(prevCoupon, settle);
  const totalDays = days30_360(prevCoupon, nextCoupon);

  if (totalDays <= 0) return 0;

  return couponAmount * (daysSinceCoupon / totalDays);
}
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx vitest run lib/bonds/duration.test.ts lib/bonds/accrued-interest.test.ts`
Expected: All PASS

- [ ] **Step 7: Commit**

```bash
git add lib/bonds/duration.ts lib/bonds/duration.test.ts lib/bonds/accrued-interest.ts lib/bonds/accrued-interest.test.ts
git commit -m "feat(bonds): add duration and accrued interest calculators"
```

---

### Task 4: Portfolio-level metrics

**Files:**
- Create: `lib/bonds/portfolio.ts`
- Create: `lib/bonds/portfolio.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// lib/bonds/portfolio.test.ts
import { describe, it, expect } from "vitest";
import { calcWeightedMetrics, ratingToNumber, numberToRating } from "./portfolio";

describe("ratingToNumber / numberToRating", () => {
  it("converts BBB to 9", () => {
    expect(ratingToNumber("BBB")).toBe(9);
  });

  it("converts BB+ to 11", () => {
    expect(ratingToNumber("BB+")).toBe(11);
  });

  it("converts 9 back to BBB", () => {
    expect(numberToRating(9)).toBe("BBB");
  });

  it("rounds to nearest rating", () => {
    expect(numberToRating(8.7)).toBe("BBB");
    expect(numberToRating(9.4)).toBe("BBB");
    expect(numberToRating(9.6)).toBe("BBB-");
  });

  it("returns 'NR' for unknown rating", () => {
    expect(ratingToNumber("XYZ")).toBe(0);
  });
});

describe("calcWeightedMetrics", () => {
  it("calculates weighted average duration", () => {
    const bonds = [
      { marketValue: 100000, duration: 5.0, ytm: 0.055, annualIncome: 5000, ratingNumeric: 9 },
      { marketValue: 50000, duration: 3.0, ytm: 0.065, annualIncome: 3000, ratingNumeric: 12 },
    ];
    const metrics = calcWeightedMetrics(bonds);
    // Weighted duration: (100k*5 + 50k*3) / 150k = 650k/150k = 4.33
    expect(metrics.weightedDuration).toBeCloseTo(4.333, 2);
  });

  it("calculates weighted average yield", () => {
    const bonds = [
      { marketValue: 100000, duration: 5.0, ytm: 0.055, annualIncome: 5000, ratingNumeric: 9 },
      { marketValue: 50000, duration: 3.0, ytm: 0.065, annualIncome: 3000, ratingNumeric: 12 },
    ];
    const metrics = calcWeightedMetrics(bonds);
    // (100k*0.055 + 50k*0.065) / 150k = 8750/150k = 0.05833
    expect(metrics.weightedYield).toBeCloseTo(0.05833, 4);
  });

  it("sums total annual income", () => {
    const bonds = [
      { marketValue: 100000, duration: 5.0, ytm: 0.055, annualIncome: 5000, ratingNumeric: 9 },
      { marketValue: 50000, duration: 3.0, ytm: 0.065, annualIncome: 3000, ratingNumeric: 12 },
    ];
    const metrics = calcWeightedMetrics(bonds);
    expect(metrics.totalAnnualIncome).toBe(8000);
  });

  it("calculates weighted rating and converts to letter", () => {
    const bonds = [
      { marketValue: 100000, duration: 5.0, ytm: 0.055, annualIncome: 5000, ratingNumeric: 9 },  // BBB
      { marketValue: 50000, duration: 3.0, ytm: 0.065, annualIncome: 3000, ratingNumeric: 12 },  // BB
    ];
    const metrics = calcWeightedMetrics(bonds);
    // (100k*9 + 50k*12) / 150k = 1500k/150k = 10 => BBB-
    expect(metrics.weightedRating).toBe("BBB-");
  });

  it("handles empty array", () => {
    const metrics = calcWeightedMetrics([]);
    expect(metrics.totalMarketValue).toBe(0);
    expect(metrics.weightedDuration).toBe(0);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run lib/bonds/portfolio.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement portfolio metrics**

```typescript
// lib/bonds/portfolio.ts
import { RATING_SCALE, RATING_FROM_NUMBER } from "./types";
import type { PortfolioMetrics } from "./types";

export function ratingToNumber(rating: string): number {
  return RATING_SCALE[rating.toUpperCase()] ?? 0;
}

export function numberToRating(n: number): string {
  const rounded = Math.round(n);
  return RATING_FROM_NUMBER[rounded] ?? "NR";
}

interface BondForMetrics {
  marketValue: number;
  duration: number;
  ytm: number;
  annualIncome: number;
  ratingNumeric: number;
}

export function calcWeightedMetrics(bonds: BondForMetrics[]): PortfolioMetrics {
  if (bonds.length === 0) {
    return {
      totalMarketValue: 0,
      weightedDuration: 0,
      weightedYield: 0,
      totalAnnualIncome: 0,
      weightedRating: "NR",
      weightedRatingNumeric: 0,
    };
  }

  const totalMV = bonds.reduce((s, b) => s + b.marketValue, 0);
  if (totalMV === 0) {
    return {
      totalMarketValue: 0,
      weightedDuration: 0,
      weightedYield: 0,
      totalAnnualIncome: bonds.reduce((s, b) => s + b.annualIncome, 0),
      weightedRating: "NR",
      weightedRatingNumeric: 0,
    };
  }

  const weightedDuration = bonds.reduce((s, b) => s + b.marketValue * b.duration, 0) / totalMV;
  const weightedYield = bonds.reduce((s, b) => s + b.marketValue * b.ytm, 0) / totalMV;
  const totalAnnualIncome = bonds.reduce((s, b) => s + b.annualIncome, 0);

  const ratedBonds = bonds.filter(b => b.ratingNumeric > 0);
  const ratedMV = ratedBonds.reduce((s, b) => s + b.marketValue, 0);
  const weightedRatingNum = ratedMV > 0
    ? ratedBonds.reduce((s, b) => s + b.marketValue * b.ratingNumeric, 0) / ratedMV
    : 0;

  return {
    totalMarketValue: totalMV,
    weightedDuration,
    weightedYield,
    totalAnnualIncome,
    weightedRating: numberToRating(weightedRatingNum),
    weightedRatingNumeric: weightedRatingNum,
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run lib/bonds/portfolio.test.ts`
Expected: All PASS

- [ ] **Step 5: Commit**

```bash
git add lib/bonds/portfolio.ts lib/bonds/portfolio.test.ts
git commit -m "feat(bonds): add portfolio-level weighted metrics"
```

---

### Task 5: Database migration

**Files:**
- Create: `supabase/migrations/20260519_bond_support.sql`

- [ ] **Step 1: Create migration**

```sql
-- supabase/migrations/20260519_bond_support.sql
-- Bond portfolio support: per-client bond overrides for editable fields

-- Table for advisor-editable bond data, keyed by client + CUSIP.
-- Bond metadata from the cartola (coupon, maturity, rating) lives in
-- snapshot_holdings JSONB. This table stores only the fields the advisor
-- can override: purchase_date, coupon_frequency, issuer.
CREATE TABLE IF NOT EXISTS bond_overrides (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  cusip TEXT NOT NULL,
  purchase_date DATE,
  coupon_frequency TEXT NOT NULL DEFAULT 'semiannual'
    CHECK (coupon_frequency IN ('monthly', 'quarterly', 'semiannual', 'annual')),
  issuer TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(client_id, cusip)
);

-- RLS: same as clients table — advisor can access own clients
ALTER TABLE bond_overrides ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Advisors can manage bond_overrides for their clients"
  ON bond_overrides
  FOR ALL
  USING (
    client_id IN (SELECT get_accessible_client_ids())
  )
  WITH CHECK (
    client_id IN (SELECT get_accessible_client_ids())
  );

-- Index for lookups
CREATE INDEX idx_bond_overrides_client ON bond_overrides(client_id);
```

- [ ] **Step 2: Apply migration**

Run: `npx supabase db push` (or apply via Supabase dashboard)

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260519_bond_support.sql
git commit -m "feat(bonds): add bond_overrides table migration"
```

---

### Task 6: Extend cartola parser for bonds

**Files:**
- Modify: `app/api/parse-portfolio-statement/route.ts`

- [ ] **Step 1: Read the existing parser prompt**

Read: `app/api/parse-portfolio-statement/route.ts` lines 188-289

- [ ] **Step 2: Add `assetClass` and `bond` fields to the JSON schema in the prompt**

In the prompt text (inside the template literal), after the existing `isPrevisional` field in the JSON schema, add:

Find the JSON schema block that shows the holdings structure and replace it:

```typescript
// In the prompt template, replace the holdings JSON structure with:
      "holdings": [
        {
          "fundName": "string (nombre completo del fondo o instrumento)",
          "securityId": "string (Security Identifier / CUSIP / ISIN / ticker)",
          "market": "CL | INT | US",
          "quantity": number,
          "unitCost": number,
          "costBasis": number,
          "marketPrice": number,
          "marketValue": number,
          "unrealizedGainLoss": number,
          "isPrevisional": boolean,
          "assetClass": "fund | bond | stock_us | stock_cl | etf | cash",
          "bond": {
            "cusip": "string (solo si assetClass=bond)",
            "couponRate": "number (cupon anual %, ej: 6.0, solo si bond)",
            "maturityDate": "string ISO date (ej: 2034-06-17, solo si bond)",
            "creditRating": "string (S&P rating ej: BBB, BBB+, BB, solo si bond)",
            "bondType": "corporate | sovereign | agency | municipal (solo si bond)",
            "estIncomeYield": "number (% yield estimado, solo si bond)",
            "estAnnualIncome": "number (ingreso anual estimado USD, solo si bond)"
          }
        }
      ],
      "cartolaMix": "funds_only | bonds_only | mixed"
```

- [ ] **Step 3: Add asset class classification rules to the prompt**

After the existing `REGLAS PARA "isPrevisional"` section, add:

```
REGLAS PARA "assetClass" (CLASIFICACION DE TIPO DE ACTIVO):
- "bond" = Bonos corporativos, soberanos, agency notes. Indicadores: "CPN", "DUE", "NOTE", "BOND", cupon y fecha de vencimiento en la descripcion, CUSIP, ratings S&P/Moody's, cantidad en multiplos de 1000 (face value).
- "fund" = Fondos mutuos y fondos de inversion (default para fondos chilenos con RUN)
- "etf" = ETFs listados en bolsa (VOO, VTI, SPY, IEFA, etc.)
- "stock_us" = Acciones individuales US (AAPL, MSFT, etc.)
- "stock_cl" = Acciones chilenas (BSANTANDER, SQM-B, etc.)
- "cash" = Cash, money market, sweep programs, FDIC deposits

REGLAS PARA "bond" (CAMPOS DE BONOS):
Solo incluir el objeto "bond" si assetClass = "bond".
- cusip: extraer del parentesis en Description, ej: "(03938LBG8)" → "03938LBG8"
- couponRate: extraer del "CPN X.XXX%", ej: "CPN 6.000%" → 6.0
- maturityDate: extraer del "DUE MM/DD/YY", convertir a formato ISO YYYY-MM-DD
- creditRating: extraer de "Ratings Information: S&P:XXX" → "BBB", "BB+", etc.
- bondType: inferir de la descripcion:
  - "corporate" para bonos de empresas
  - "sovereign" para bonos de gobierno (Treasury, soberanos)
  - "agency" para agencias (FHLB, FNMA, etc.)
- estIncomeYield: del campo "Est. Income Yield" si existe
- estAnnualIncome: del campo "Est. Annual Income" si existe

REGLAS PARA "cartolaMix":
- "funds_only" si TODOS los holdings son fund o etf
- "bonds_only" si TODOS los holdings son bond o cash
- "mixed" si hay mezcla de bonds con funds/etfs/stocks
```

- [ ] **Step 4: Verify build**

Run: `npx next build 2>&1 | tail -5`
Expected: exit 0

- [ ] **Step 5: Commit**

```bash
git add app/api/parse-portfolio-statement/route.ts
git commit -m "feat(bonds): extend cartola parser to classify asset types and extract bond fields"
```

---

### Task 7: Bond positions table component

**Files:**
- Create: `components/seguimiento/BondTable.tsx`

- [ ] **Step 1: Create BondTable**

```tsx
// components/seguimiento/BondTable.tsx
"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp, FileText } from "lucide-react";
import type { BondHolding } from "@/lib/bonds/types";

interface Props {
  bonds: BondHolding[];
  onSelectBond: (bond: BondHolding) => void;
}

function fmtUSD(v: number): string {
  return v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtPct(v: number, decimals = 3): string {
  return v.toFixed(decimals) + "%";
}

type SortKey = "issuer" | "maturityDate" | "couponRate" | "creditRating" | "marketValue" | "unrealizedGainLoss" | "estIncomeYield";

export default function BondTable({ bonds, onSelectBond }: Props) {
  const [sortKey, setSortKey] = useState<SortKey>("maturityDate");
  const [sortAsc, setSortAsc] = useState(true);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortAsc(!sortAsc);
    } else {
      setSortKey(key);
      setSortAsc(true);
    }
  };

  const sorted = [...bonds].sort((a, b) => {
    let cmp = 0;
    switch (sortKey) {
      case "issuer":
        cmp = (a.issuer || a.fundName).localeCompare(b.issuer || b.fundName);
        break;
      case "maturityDate":
        cmp = a.maturityDate.localeCompare(b.maturityDate);
        break;
      case "couponRate":
        cmp = a.couponRate - b.couponRate;
        break;
      case "creditRating":
        cmp = (a.creditRating || "ZZZ").localeCompare(b.creditRating || "ZZZ");
        break;
      case "marketValue":
        cmp = a.marketValue - b.marketValue;
        break;
      case "unrealizedGainLoss":
        cmp = a.unrealizedGainLoss - b.unrealizedGainLoss;
        break;
      case "estIncomeYield":
        cmp = a.estIncomeYield - b.estIncomeYield;
        break;
    }
    return sortAsc ? cmp : -cmp;
  });

  const SortIcon = ({ col }: { col: SortKey }) => {
    if (sortKey !== col) return null;
    return sortAsc ? <ChevronUp className="w-3 h-3 inline" /> : <ChevronDown className="w-3 h-3 inline" />;
  };

  const th = (label: string, col: SortKey, align = "text-left") => (
    <th
      className={`px-3 py-2 font-medium text-gb-gray cursor-pointer hover:text-gb-black ${align}`}
      onClick={() => handleSort(col)}
    >
      {label} <SortIcon col={col} />
    </th>
  );

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-gb-border bg-gray-50">
            {th("Emisor", "issuer")}
            <th className="px-3 py-2 font-medium text-gb-gray text-left">CUSIP</th>
            {th("Cupon", "couponRate", "text-right")}
            {th("Maturity", "maturityDate", "text-right")}
            {th("Rating", "creditRating", "text-center")}
            <th className="px-3 py-2 font-medium text-gb-gray text-right">Face Value</th>
            <th className="px-3 py-2 font-medium text-gb-gray text-right">Precio</th>
            {th("Mkt Value", "marketValue", "text-right")}
            {th("G/L", "unrealizedGainLoss", "text-right")}
            {th("Yield", "estIncomeYield", "text-right")}
            <th className="px-3 py-2 font-medium text-gb-gray text-center">Detalle</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((b, i) => {
            const glColor = b.unrealizedGainLoss >= 0 ? "text-green-600" : "text-red-600";
            const glPct = b.costBasis > 0 ? (b.unrealizedGainLoss / b.costBasis) * 100 : 0;
            return (
              <tr key={b.cusip || i} className="border-b border-gb-border hover:bg-gray-50">
                <td className="px-3 py-2 font-medium text-gb-black max-w-[180px] truncate" title={b.fundName}>
                  {b.issuer || b.fundName.split(" ")[0]}
                </td>
                <td className="px-3 py-2 text-gb-gray font-mono">{b.cusip}</td>
                <td className="px-3 py-2 text-right tabular-nums">{fmtPct(b.couponRate, 2)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{b.maturityDate.substring(0, 10)}</td>
                <td className="px-3 py-2 text-center">
                  <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                    b.creditRating.startsWith("A") ? "bg-green-100 text-green-800" :
                    b.creditRating.startsWith("BBB") ? "bg-blue-100 text-blue-800" :
                    b.creditRating.startsWith("BB") ? "bg-yellow-100 text-yellow-800" :
                    "bg-red-100 text-red-800"
                  }`}>
                    {b.creditRating}
                  </span>
                </td>
                <td className="px-3 py-2 text-right tabular-nums">{fmtUSD(b.faceValue)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{fmtPct(b.currentPrice, 2)}</td>
                <td className="px-3 py-2 text-right tabular-nums font-medium">{fmtUSD(b.marketValue)}</td>
                <td className={`px-3 py-2 text-right tabular-nums ${glColor}`}>
                  {b.unrealizedGainLoss >= 0 ? "+" : ""}{fmtUSD(b.unrealizedGainLoss)}
                  <span className="text-[10px] ml-1">({glPct >= 0 ? "+" : ""}{glPct.toFixed(1)}%)</span>
                </td>
                <td className="px-3 py-2 text-right tabular-nums">{fmtPct(b.estIncomeYield, 2)}</td>
                <td className="px-3 py-2 text-center">
                  <button
                    onClick={() => onSelectBond(b)}
                    className="p-1 text-gb-gray hover:text-gb-primary rounded hover:bg-gray-100"
                    title="Ver tabla de desarrollo"
                  >
                    <FileText className="w-4 h-4" />
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-gb-border bg-gray-50 font-semibold text-xs">
            <td className="px-3 py-2" colSpan={5}>Total ({bonds.length} bonos)</td>
            <td className="px-3 py-2 text-right tabular-nums">{fmtUSD(bonds.reduce((s, b) => s + b.faceValue, 0))}</td>
            <td className="px-3 py-2"></td>
            <td className="px-3 py-2 text-right tabular-nums">{fmtUSD(bonds.reduce((s, b) => s + b.marketValue, 0))}</td>
            <td className={`px-3 py-2 text-right tabular-nums ${bonds.reduce((s, b) => s + b.unrealizedGainLoss, 0) >= 0 ? "text-green-600" : "text-red-600"}`}>
              {fmtUSD(bonds.reduce((s, b) => s + b.unrealizedGainLoss, 0))}
            </td>
            <td className="px-3 py-2"></td>
            <td className="px-3 py-2"></td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
```

- [ ] **Step 2: Verify build**

Run: `npx next build 2>&1 | tail -5`
Expected: exit 0

- [ ] **Step 3: Commit**

```bash
git add components/seguimiento/BondTable.tsx
git commit -m "feat(bonds): add BondTable component with sortable columns"
```

---

### Task 8: Bond development modal (amortization schedule)

**Files:**
- Create: `components/seguimiento/BondDevelopmentModal.tsx`

- [ ] **Step 1: Create modal**

```tsx
// components/seguimiento/BondDevelopmentModal.tsx
"use client";

import { useMemo, useState } from "react";
import { X, CheckCircle2, Clock } from "lucide-react";
import type { BondHolding } from "@/lib/bonds/types";
import { generateCashFlows } from "@/lib/bonds/cash-flows";
import { calcYieldToMaturity } from "@/lib/bonds/yield";
import { calcModifiedDuration } from "@/lib/bonds/duration";

interface Props {
  bond: BondHolding;
  onClose: () => void;
  onUpdateOverrides?: (cusip: string, overrides: { purchaseDate?: string; couponFrequency?: number }) => void;
}

function fmtUSD(v: number): string {
  return v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function BondDevelopmentModal({ bond, onClose, onUpdateOverrides }: Props) {
  const [purchaseDate, setPurchaseDate] = useState(bond.purchaseDate || "2024-01-15");
  const [couponFreq, setCouponFreq] = useState(bond.couponFrequency || 2);

  const bondParams = useMemo(() => ({
    faceValue: bond.faceValue,
    couponRate: bond.couponRate / 100,
    couponFrequency: couponFreq,
    maturityDate: bond.maturityDate,
    purchaseDate,
    purchasePrice: bond.unitCost,
    currentPrice: bond.currentPrice,
  }), [bond, purchaseDate, couponFreq]);

  const flows = useMemo(() => generateCashFlows(bondParams), [bondParams]);
  const ytm = useMemo(() => calcYieldToMaturity(bondParams), [bondParams]);
  const duration = useMemo(() => calcModifiedDuration(bondParams), [bondParams]);

  const collected = flows.filter(f => f.status === "collected");
  const pending = flows.filter(f => f.status === "pending");
  const totalCollected = collected.reduce((s, f) => s + f.amount, 0);
  const totalPending = pending.reduce((s, f) => s + f.amount, 0);
  const couponOnlyPending = pending.filter(f => f.type === "coupon").reduce((s, f) => s + f.amount, 0);

  const handleSaveOverrides = () => {
    onUpdateOverrides?.(bond.cusip, { purchaseDate, couponFrequency: couponFreq });
  };

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-3xl w-full max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gb-border flex items-center justify-between">
          <div>
            <h3 className="font-semibold text-gb-black">{bond.issuer || bond.fundName.split(" ")[0]}</h3>
            <p className="text-xs text-gb-gray">{bond.cusip} · Cupon {bond.couponRate}% · Vence {bond.maturityDate} · {bond.creditRating}</p>
          </div>
          <button onClick={onClose} className="p-1 text-gb-gray hover:text-gb-black rounded-lg hover:bg-gray-100">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Editable params */}
        <div className="px-6 py-3 bg-gray-50 border-b border-gb-border flex gap-4 items-end text-xs">
          <div>
            <label className="block text-gb-gray font-medium mb-1">Fecha de compra</label>
            <input
              type="date"
              value={purchaseDate}
              onChange={(e) => setPurchaseDate(e.target.value)}
              className="border border-gb-border rounded px-2 py-1 text-sm"
            />
          </div>
          <div>
            <label className="block text-gb-gray font-medium mb-1">Frecuencia cupon</label>
            <select
              value={couponFreq}
              onChange={(e) => setCouponFreq(Number(e.target.value))}
              className="border border-gb-border rounded px-2 py-1 text-sm"
            >
              <option value={1}>Anual</option>
              <option value={2}>Semestral</option>
              <option value={4}>Trimestral</option>
              <option value={12}>Mensual</option>
            </select>
          </div>
          {onUpdateOverrides && (
            <button
              onClick={handleSaveOverrides}
              className="px-3 py-1.5 bg-gb-primary text-white text-xs rounded hover:bg-gb-primary/90"
            >
              Guardar
            </button>
          )}
          <div className="ml-auto flex gap-4 text-xs">
            <span className="text-gb-gray">YTM: <span className="font-semibold text-gb-black">{(ytm * 100).toFixed(2)}%</span></span>
            <span className="text-gb-gray">Duration mod: <span className="font-semibold text-gb-black">{duration.toFixed(2)} anos</span></span>
          </div>
        </div>

        {/* Cash flows table */}
        <div className="flex-1 overflow-y-auto px-6 py-3">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-white">
              <tr className="border-b border-gb-border">
                <th className="text-left py-1.5 font-medium text-gb-gray">#</th>
                <th className="text-left py-1.5 font-medium text-gb-gray">Fecha</th>
                <th className="text-left py-1.5 font-medium text-gb-gray">Tipo</th>
                <th className="text-right py-1.5 font-medium text-gb-gray">Monto USD</th>
                <th className="text-right py-1.5 font-medium text-gb-gray">Devengo acum.</th>
                <th className="text-center py-1.5 font-medium text-gb-gray">Status</th>
              </tr>
            </thead>
            <tbody>
              {flows.map((f, i) => (
                <tr key={i} className={`border-b border-gray-100 ${f.status === "collected" ? "bg-green-50/50" : ""}`}>
                  <td className="py-1.5 text-gb-gray">{i + 1}</td>
                  <td className="py-1.5 tabular-nums">{f.date}</td>
                  <td className="py-1.5">
                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                      f.type === "coupon+principal" ? "bg-blue-100 text-blue-800" : "bg-gray-100 text-gray-700"
                    }`}>
                      {f.type === "coupon" ? "Cupon" : f.type === "principal" ? "Principal" : "Cupon + Principal"}
                    </span>
                  </td>
                  <td className="py-1.5 text-right tabular-nums font-medium">{fmtUSD(f.amount)}</td>
                  <td className="py-1.5 text-right tabular-nums text-gb-gray">{fmtUSD(f.cumulativeAmount)}</td>
                  <td className="py-1.5 text-center">
                    {f.status === "collected" ? (
                      <CheckCircle2 className="w-3.5 h-3.5 text-green-600 inline" />
                    ) : (
                      <Clock className="w-3.5 h-3.5 text-gb-gray inline" />
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Summary footer */}
        <div className="px-6 py-3 border-t border-gb-border bg-gray-50 grid grid-cols-4 gap-4 text-xs">
          <div>
            <p className="text-gb-gray">Cupones cobrados</p>
            <p className="font-semibold text-green-700">${fmtUSD(totalCollected)}</p>
          </div>
          <div>
            <p className="text-gb-gray">Cupones pendientes</p>
            <p className="font-semibold text-gb-black">${fmtUSD(couponOnlyPending)}</p>
          </div>
          <div>
            <p className="text-gb-gray">Principal al vencimiento</p>
            <p className="font-semibold text-gb-black">${fmtUSD(bond.faceValue)}</p>
          </div>
          <div>
            <p className="text-gb-gray">Total cash flows</p>
            <p className="font-semibold text-gb-black">${fmtUSD(totalCollected + totalPending)}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify build**

Run: `npx next build 2>&1 | tail -5`
Expected: exit 0

- [ ] **Step 3: Commit**

```bash
git add components/seguimiento/BondDevelopmentModal.tsx
git commit -m "feat(bonds): add bond development modal with amortization schedule"
```

---

### Task 9: Coupon calendar and cash flow chart

**Files:**
- Create: `components/seguimiento/CouponCalendar.tsx`
- Create: `components/seguimiento/CashFlowChart.tsx`

- [ ] **Step 1: Create CouponCalendar**

```tsx
// components/seguimiento/CouponCalendar.tsx
"use client";

import { useMemo } from "react";
import type { BondHolding, BondParams, CashFlow } from "@/lib/bonds/types";
import { generateCashFlows } from "@/lib/bonds/cash-flows";

interface Props {
  bonds: BondHolding[];
}

interface CalendarEntry {
  date: string;
  month: string;       // "Jun 2026"
  issuer: string;
  couponRate: number;
  amount: number;
  status: "collected" | "pending";
}

function fmtUSD(v: number): string {
  return v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function CouponCalendar({ bonds }: Props) {
  const entries = useMemo(() => {
    const today = new Date();
    const twelveMonths = new Date(today);
    twelveMonths.setMonth(twelveMonths.getMonth() + 12);

    const all: CalendarEntry[] = [];

    for (const b of bonds) {
      const params: BondParams = {
        faceValue: b.faceValue,
        couponRate: b.couponRate / 100,
        couponFrequency: b.couponFrequency || 2,
        maturityDate: b.maturityDate,
        purchaseDate: b.purchaseDate || "2024-01-01",
        purchasePrice: b.unitCost,
        currentPrice: b.currentPrice,
      };
      const flows = generateCashFlows(params);

      for (const f of flows) {
        if (f.type === "principal") continue;
        const d = new Date(f.date + "T00:00:00");
        if (d > twelveMonths) continue;
        // Only show last 3 months of collected + all pending
        const threeMonthsAgo = new Date(today);
        threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
        if (d < threeMonthsAgo) continue;

        const couponAmount = b.faceValue * (b.couponRate / 100) / (b.couponFrequency || 2);

        all.push({
          date: f.date,
          month: d.toLocaleDateString("es-CL", { month: "short", year: "numeric" }),
          issuer: b.issuer || b.fundName.split(" ")[0],
          couponRate: b.couponRate,
          amount: couponAmount,
          status: f.status,
        });
      }
    }

    return all.sort((a, b) => a.date.localeCompare(b.date));
  }, [bonds]);

  // Group by month
  const byMonth = useMemo(() => {
    const map = new Map<string, CalendarEntry[]>();
    for (const e of entries) {
      const existing = map.get(e.month) || [];
      existing.push(e);
      map.set(e.month, existing);
    }
    return Array.from(map.entries());
  }, [entries]);

  return (
    <div className="bg-white rounded-lg border border-gb-border overflow-hidden">
      <div className="px-4 py-3 border-b border-gb-border">
        <h3 className="font-semibold text-sm text-gb-black">Calendario de cupones</h3>
        <p className="text-[10px] text-gb-gray">Proximos 12 meses + ultimos 3 meses cobrados</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-gray-50 border-b border-gb-border">
              <th className="text-left px-3 py-2 font-medium text-gb-gray">Mes</th>
              <th className="text-left px-3 py-2 font-medium text-gb-gray">Bono</th>
              <th className="text-right px-3 py-2 font-medium text-gb-gray">Monto USD</th>
              <th className="text-center px-3 py-2 font-medium text-gb-gray">Status</th>
            </tr>
          </thead>
          <tbody>
            {byMonth.map(([month, items]) => {
              const monthTotal = items.reduce((s, e) => s + e.amount, 0);
              return items.map((e, i) => (
                <tr key={`${month}-${i}`} className="border-b border-gray-100">
                  {i === 0 && (
                    <td className="px-3 py-1.5 font-medium text-gb-black align-top" rowSpan={items.length + 1}>
                      {month}
                    </td>
                  )}
                  <td className="px-3 py-1.5">{e.issuer} {e.couponRate}%</td>
                  <td className="px-3 py-1.5 text-right tabular-nums">{fmtUSD(e.amount)}</td>
                  <td className="px-3 py-1.5 text-center">
                    <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                      e.status === "collected" ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-600"
                    }`}>
                      {e.status === "collected" ? "Cobrado" : "Pendiente"}
                    </span>
                  </td>
                </tr>
              )).concat(
                <tr key={`${month}-total`} className="border-b border-gb-border bg-gray-50">
                  <td className="px-3 py-1 font-semibold text-gb-black text-right" colSpan={2}>Total {month}</td>
                  <td className="px-3 py-1 text-right tabular-nums font-semibold">{fmtUSD(monthTotal)}</td>
                  <td />
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create CashFlowChart**

```tsx
// components/seguimiento/CashFlowChart.tsx
"use client";

import { useMemo } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from "recharts";
import type { BondHolding, BondParams } from "@/lib/bonds/types";
import { generateCashFlows } from "@/lib/bonds/cash-flows";

interface Props {
  bonds: BondHolding[];
}

interface ChartData {
  period: string;
  coupons: number;
  principal: number;
}

export default function CashFlowChart({ bonds }: Props) {
  const data = useMemo(() => {
    const byQuarter = new Map<string, { coupons: number; principal: number }>();

    for (const b of bonds) {
      const params: BondParams = {
        faceValue: b.faceValue,
        couponRate: b.couponRate / 100,
        couponFrequency: b.couponFrequency || 2,
        maturityDate: b.maturityDate,
        purchaseDate: b.purchaseDate || "2024-01-01",
        purchasePrice: b.unitCost,
        currentPrice: b.currentPrice,
      };
      const flows = generateCashFlows(params).filter(f => f.status === "pending");

      for (const f of flows) {
        const d = new Date(f.date + "T00:00:00");
        const q = Math.ceil((d.getMonth() + 1) / 3);
        const key = `${d.getFullYear()}-Q${q}`;
        const existing = byQuarter.get(key) || { coupons: 0, principal: 0 };

        if (f.type === "coupon") {
          existing.coupons += f.amount;
        } else if (f.type === "coupon+principal") {
          const couponAmt = b.faceValue * (b.couponRate / 100) / (b.couponFrequency || 2);
          existing.coupons += couponAmt;
          existing.principal += b.faceValue;
        } else {
          existing.principal += f.amount;
        }

        byQuarter.set(key, existing);
      }
    }

    return Array.from(byQuarter.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([period, vals]): ChartData => ({
        period,
        coupons: Math.round(vals.coupons),
        principal: Math.round(vals.principal),
      }));
  }, [bonds]);

  if (data.length === 0) return null;

  return (
    <div className="bg-white rounded-lg border border-gb-border p-4">
      <h3 className="font-semibold text-sm text-gb-black mb-3">Proyeccion de flujos de caja</h3>
      <ResponsiveContainer width="100%" height={300}>
        <BarChart data={data} margin={{ top: 5, right: 5, bottom: 5, left: 5 }}>
          <XAxis dataKey="period" tick={{ fontSize: 10 }} interval={1} />
          <YAxis tick={{ fontSize: 10 }} tickFormatter={(v: number) => `$${(v / 1000).toFixed(0)}k`} />
          <Tooltip
            formatter={(value: number, name: string) => [`$${value.toLocaleString()}`, name === "coupons" ? "Cupones" : "Principal"]}
            labelFormatter={(label: string) => `Periodo: ${label}`}
          />
          <Legend formatter={(value: string) => value === "coupons" ? "Cupones" : "Principal"} />
          <Bar dataKey="coupons" stackId="a" fill="#22c55e" radius={[0, 0, 0, 0]} />
          <Bar dataKey="principal" stackId="a" fill="#3b82f6" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
```

- [ ] **Step 3: Verify build**

Run: `npx next build 2>&1 | tail -5`
Expected: exit 0

- [ ] **Step 4: Commit**

```bash
git add components/seguimiento/CouponCalendar.tsx components/seguimiento/CashFlowChart.tsx
git commit -m "feat(bonds): add coupon calendar and cash flow projection chart"
```

---

### Task 10: Distribution charts and consolidated cash flows

**Files:**
- Create: `components/seguimiento/BondDistributionCharts.tsx`
- Create: `components/seguimiento/ConsolidatedCashFlows.tsx`

- [ ] **Step 1: Create BondDistributionCharts**

```tsx
// components/seguimiento/BondDistributionCharts.tsx
"use client";

import { useMemo } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";
import type { BondHolding } from "@/lib/bonds/types";

interface Props {
  bonds: BondHolding[];
}

const RATING_COLORS: Record<string, string> = {
  "AAA": "#15803d", "AA+": "#16a34a", "AA": "#22c55e", "AA-": "#4ade80",
  "A+": "#3b82f6", "A": "#60a5fa", "A-": "#93c5fd",
  "BBB+": "#8b5cf6", "BBB": "#a78bfa", "BBB-": "#c4b5fd",
  "BB+": "#f59e0b", "BB": "#fbbf24", "BB-": "#fcd34d",
  "B+": "#ef4444", "B": "#f87171", "B-": "#fca5a5",
};

const MATURITY_BUCKETS = ["0-2Y", "2-5Y", "5-10Y", "10Y+"];
const BUCKET_COLORS = ["#3b82f6", "#8b5cf6", "#f59e0b", "#ef4444"];

export default function BondDistributionCharts({ bonds }: Props) {
  const ratingData = useMemo(() => {
    const map = new Map<string, number>();
    const totalMV = bonds.reduce((s, b) => s + b.marketValue, 0);
    for (const b of bonds) {
      const r = b.creditRating || "NR";
      map.set(r, (map.get(r) || 0) + b.marketValue);
    }
    return Array.from(map.entries())
      .map(([rating, value]) => ({
        rating,
        value: Math.round(value),
        pct: totalMV > 0 ? (value / totalMV) * 100 : 0,
      }))
      .sort((a, b) => a.rating.localeCompare(b.rating));
  }, [bonds]);

  const maturityData = useMemo(() => {
    const now = new Date();
    const totalMV = bonds.reduce((s, b) => s + b.marketValue, 0);
    const buckets = [0, 0, 0, 0]; // 0-2, 2-5, 5-10, 10+

    for (const b of bonds) {
      const years = (new Date(b.maturityDate).getTime() - now.getTime()) / (365.25 * 24 * 3600 * 1000);
      if (years <= 2) buckets[0] += b.marketValue;
      else if (years <= 5) buckets[1] += b.marketValue;
      else if (years <= 10) buckets[2] += b.marketValue;
      else buckets[3] += b.marketValue;
    }

    return MATURITY_BUCKETS.map((label, i) => ({
      bucket: label,
      value: Math.round(buckets[i]),
      pct: totalMV > 0 ? (buckets[i] / totalMV) * 100 : 0,
    }));
  }, [bonds]);

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {/* Rating distribution */}
      <div className="bg-white rounded-lg border border-gb-border p-4">
        <h3 className="font-semibold text-sm text-gb-black mb-3">Distribucion por rating</h3>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={ratingData} layout="vertical" margin={{ left: 40 }}>
            <XAxis type="number" tick={{ fontSize: 10 }} tickFormatter={(v: number) => `${v.toFixed(0)}%`} />
            <YAxis type="category" dataKey="rating" tick={{ fontSize: 10 }} width={40} />
            <Tooltip formatter={(v: number) => [`${v.toFixed(1)}%`, "% portafolio"]} />
            <Bar dataKey="pct">
              {ratingData.map((entry, i) => (
                <Cell key={i} fill={RATING_COLORS[entry.rating] || "#94a3b8"} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Maturity distribution */}
      <div className="bg-white rounded-lg border border-gb-border p-4">
        <h3 className="font-semibold text-sm text-gb-black mb-3">Distribucion por vencimiento</h3>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={maturityData} margin={{ left: 5 }}>
            <XAxis dataKey="bucket" tick={{ fontSize: 10 }} />
            <YAxis tick={{ fontSize: 10 }} tickFormatter={(v: number) => `${v.toFixed(0)}%`} />
            <Tooltip formatter={(v: number) => [`${v.toFixed(1)}%`, "% portafolio"]} />
            <Bar dataKey="pct">
              {maturityData.map((_, i) => (
                <Cell key={i} fill={BUCKET_COLORS[i]} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create ConsolidatedCashFlows**

```tsx
// components/seguimiento/ConsolidatedCashFlows.tsx
"use client";

import { useMemo } from "react";
import { CheckCircle2, Clock } from "lucide-react";
import type { BondHolding, BondParams } from "@/lib/bonds/types";
import { generateCashFlows } from "@/lib/bonds/cash-flows";

interface Props {
  bonds: BondHolding[];
}

interface ConsolidatedFlow {
  date: string;
  issuer: string;
  type: string;
  amount: number;
  status: "collected" | "pending";
}

function fmtUSD(v: number): string {
  return v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function ConsolidatedCashFlows({ bonds }: Props) {
  const flows = useMemo(() => {
    const all: ConsolidatedFlow[] = [];

    for (const b of bonds) {
      const params: BondParams = {
        faceValue: b.faceValue,
        couponRate: b.couponRate / 100,
        couponFrequency: b.couponFrequency || 2,
        maturityDate: b.maturityDate,
        purchaseDate: b.purchaseDate || "2024-01-01",
        purchasePrice: b.unitCost,
        currentPrice: b.currentPrice,
      };
      const cashFlows = generateCashFlows(params);
      for (const f of cashFlows) {
        all.push({
          date: f.date,
          issuer: b.issuer || b.fundName.split(" ")[0],
          type: f.type === "coupon" ? "Cupon" : f.type === "coupon+principal" ? "Cupon + Principal" : "Principal",
          amount: f.type === "coupon+principal"
            ? b.faceValue * (b.couponRate / 100) / (b.couponFrequency || 2)
            : f.amount,
          status: f.status,
        });
        // Add principal as separate line for coupon+principal
        if (f.type === "coupon+principal") {
          all.push({
            date: f.date,
            issuer: b.issuer || b.fundName.split(" ")[0],
            type: "Principal",
            amount: b.faceValue,
            status: f.status,
          });
        }
      }
    }

    return all.sort((a, b) => a.date.localeCompare(b.date));
  }, [bonds]);

  // Group by quarter for display
  const byQuarter = useMemo(() => {
    const map = new Map<string, ConsolidatedFlow[]>();
    for (const f of flows) {
      const d = new Date(f.date + "T00:00:00");
      const q = Math.ceil((d.getMonth() + 1) / 3);
      const key = `${d.getFullYear()} Q${q}`;
      const arr = map.get(key) || [];
      arr.push(f);
      map.set(key, arr);
    }
    return Array.from(map.entries());
  }, [flows]);

  return (
    <div className="bg-white rounded-lg border border-gb-border overflow-hidden">
      <div className="px-4 py-3 border-b border-gb-border">
        <h3 className="font-semibold text-sm text-gb-black">Flujos consolidados</h3>
        <p className="text-[10px] text-gb-gray">Todos los bonos, ordenados por fecha</p>
      </div>
      <div className="overflow-y-auto max-h-[500px]">
        <table className="w-full text-xs">
          <thead className="sticky top-0 bg-white">
            <tr className="border-b border-gb-border">
              <th className="text-left px-3 py-2 font-medium text-gb-gray">Periodo</th>
              <th className="text-left px-3 py-2 font-medium text-gb-gray">Fecha</th>
              <th className="text-left px-3 py-2 font-medium text-gb-gray">Emisor</th>
              <th className="text-left px-3 py-2 font-medium text-gb-gray">Tipo</th>
              <th className="text-right px-3 py-2 font-medium text-gb-gray">Monto USD</th>
              <th className="text-center px-3 py-2 font-medium text-gb-gray">Status</th>
            </tr>
          </thead>
          <tbody>
            {byQuarter.map(([quarter, items]) => {
              const qTotal = items.reduce((s, f) => s + f.amount, 0);
              return [
                ...items.map((f, i) => (
                  <tr key={`${quarter}-${i}`} className="border-b border-gray-100">
                    {i === 0 && (
                      <td className="px-3 py-1.5 font-medium text-gb-black align-top" rowSpan={items.length}>
                        {quarter}
                      </td>
                    )}
                    <td className="px-3 py-1.5 tabular-nums">{f.date}</td>
                    <td className="px-3 py-1.5">{f.issuer}</td>
                    <td className="px-3 py-1.5">{f.type}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums font-medium">{fmtUSD(f.amount)}</td>
                    <td className="px-3 py-1.5 text-center">
                      {f.status === "collected" ? (
                        <CheckCircle2 className="w-3.5 h-3.5 text-green-600 inline" />
                      ) : (
                        <Clock className="w-3.5 h-3.5 text-gb-gray inline" />
                      )}
                    </td>
                  </tr>
                )),
                <tr key={`${quarter}-total`} className="border-b border-gb-border bg-gray-50">
                  <td className="px-3 py-1 font-semibold" colSpan={4}>{quarter} — Total</td>
                  <td className="px-3 py-1 text-right tabular-nums font-semibold">{fmtUSD(qTotal)}</td>
                  <td />
                </tr>,
              ];
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Verify build**

Run: `npx next build 2>&1 | tail -5`
Expected: exit 0

- [ ] **Step 4: Commit**

```bash
git add components/seguimiento/BondDistributionCharts.tsx components/seguimiento/ConsolidatedCashFlows.tsx
git commit -m "feat(bonds): add distribution charts and consolidated cash flows view"
```

---

### Task 11: BondPortfolioView container

**Files:**
- Create: `components/seguimiento/BondPortfolioView.tsx`

- [ ] **Step 1: Create the main view container**

This component assembles all bond sub-components: metric cards, BondTable, CouponCalendar, CashFlowChart, BondDistributionCharts. It also opens BondDevelopmentModal on bond click.

```tsx
// components/seguimiento/BondPortfolioView.tsx
"use client";

import { useState, useMemo } from "react";
import { DollarSign, Clock, TrendingUp, BarChart3, Shield } from "lucide-react";
import type { BondHolding, BondParams } from "@/lib/bonds/types";
import { calcModifiedDuration } from "@/lib/bonds/duration";
import { calcYieldToMaturity } from "@/lib/bonds/yield";
import { calcWeightedMetrics, ratingToNumber } from "@/lib/bonds/portfolio";
import BondTable from "./BondTable";
import BondDevelopmentModal from "./BondDevelopmentModal";
import CouponCalendar from "./CouponCalendar";
import CashFlowChart from "./CashFlowChart";
import BondDistributionCharts from "./BondDistributionCharts";
import ConsolidatedCashFlows from "./ConsolidatedCashFlows";

interface Props {
  bonds: BondHolding[];
  clientId: string;
  onUpdateOverrides?: (cusip: string, overrides: { purchaseDate?: string; couponFrequency?: number }) => void;
}

function fmtUSD(v: number): string {
  return v.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

export default function BondPortfolioView({ bonds, clientId, onUpdateOverrides }: Props) {
  const [selectedBond, setSelectedBond] = useState<BondHolding | null>(null);
  const [subTab, setSubTab] = useState<"positions" | "consolidated">("positions");

  const portfolioMetrics = useMemo(() => {
    const bondsForMetrics = bonds.map(b => {
      const params: BondParams = {
        faceValue: b.faceValue,
        couponRate: b.couponRate / 100,
        couponFrequency: b.couponFrequency || 2,
        maturityDate: b.maturityDate,
        purchaseDate: b.purchaseDate || "2024-01-01",
        purchasePrice: b.unitCost,
        currentPrice: b.currentPrice,
      };
      return {
        marketValue: b.marketValue,
        duration: calcModifiedDuration(params),
        ytm: calcYieldToMaturity(params),
        annualIncome: b.estAnnualIncome || b.faceValue * (b.couponRate / 100),
        ratingNumeric: ratingToNumber(b.creditRating),
      };
    });
    return calcWeightedMetrics(bondsForMetrics);
  }, [bonds]);

  const cards = [
    { label: "Valor de mercado", value: `$${fmtUSD(portfolioMetrics.totalMarketValue)}`, icon: DollarSign, color: "text-blue-600" },
    { label: "Duration modificada", value: `${portfolioMetrics.weightedDuration.toFixed(2)} anos`, icon: Clock, color: "text-purple-600" },
    { label: "Yield promedio", value: `${(portfolioMetrics.weightedYield * 100).toFixed(2)}%`, icon: TrendingUp, color: "text-green-600" },
    { label: "Ingreso anual", value: `$${fmtUSD(portfolioMetrics.totalAnnualIncome)}`, icon: BarChart3, color: "text-amber-600" },
    { label: "Rating promedio", value: portfolioMetrics.weightedRating, icon: Shield, color: "text-indigo-600" },
  ];

  return (
    <div className="space-y-4">
      {/* Metric cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {cards.map(c => (
          <div key={c.label} className="bg-white rounded-lg border border-gb-border p-4 shadow-sm">
            <div className="flex items-center gap-2 mb-1">
              <c.icon className={`w-4 h-4 ${c.color}`} />
              <p className="text-[10px] text-gb-gray font-medium uppercase">{c.label}</p>
            </div>
            <p className="text-lg font-bold text-gb-black">{c.value}</p>
          </div>
        ))}
      </div>

      {/* Sub-tabs */}
      <div className="flex gap-1 border-b border-gb-border">
        <button
          onClick={() => setSubTab("positions")}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            subTab === "positions" ? "border-gb-primary text-gb-primary" : "border-transparent text-gb-gray hover:text-gb-black"
          }`}
        >
          Posiciones
        </button>
        <button
          onClick={() => setSubTab("consolidated")}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            subTab === "consolidated" ? "border-gb-primary text-gb-primary" : "border-transparent text-gb-gray hover:text-gb-black"
          }`}
        >
          Flujos consolidados
        </button>
      </div>

      {subTab === "positions" ? (
        <>
          {/* Bond table */}
          <div className="bg-white rounded-lg border border-gb-border overflow-hidden">
            <BondTable bonds={bonds} onSelectBond={setSelectedBond} />
          </div>

          {/* Coupon calendar + Cash flow chart */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <CouponCalendar bonds={bonds} />
            <CashFlowChart bonds={bonds} />
          </div>

          {/* Distribution charts */}
          <BondDistributionCharts bonds={bonds} />
        </>
      ) : (
        <ConsolidatedCashFlows bonds={bonds} />
      )}

      {/* Development modal */}
      {selectedBond && (
        <BondDevelopmentModal
          bond={selectedBond}
          onClose={() => setSelectedBond(null)}
          onUpdateOverrides={onUpdateOverrides}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify build**

Run: `npx next build 2>&1 | tail -5`
Expected: exit 0

- [ ] **Step 3: Commit**

```bash
git add components/seguimiento/BondPortfolioView.tsx
git commit -m "feat(bonds): add BondPortfolioView container with metrics cards and sub-tabs"
```

---

### Task 12: Integrate dynamic tabs in SeguimientoPage

**Files:**
- Modify: `components/seguimiento/SeguimientoPage.tsx`

- [ ] **Step 1: Read the current render section**

Read: `components/seguimiento/SeguimientoPage.tsx` lines 1-50 (imports) and lines 720-970 (render)

- [ ] **Step 2: Add import for BondPortfolioView**

At the top of the file, add after the existing imports:

```typescript
import BondPortfolioView from "./BondPortfolioView";
import type { BondHolding } from "@/lib/bonds/types";
```

- [ ] **Step 3: Add tab state and bond extraction logic**

Inside the component, after the existing state declarations (around line 143), add:

```typescript
const [activeTab, setActiveTab] = useState<"resumen" | "fondos" | "renta_fija">("resumen");
```

After the existing `metrics` derivation (around line 718), add a `useMemo` to extract bond holdings:

```typescript
// Extract bond holdings from latest snapshot
const bondHoldings = useMemo((): BondHolding[] => {
  if (!data || !data.snapshots.length) return [];
  const latest = data.snapshots[data.snapshots.length - 1];
  const holdings = latest.holdings as Array<Record<string, unknown>> | null;
  if (!holdings) return [];

  return holdings
    .filter(h => (h.assetClass as string) === "bond" && h.bond)
    .map(h => {
      const bond = h.bond as Record<string, unknown>;
      return {
        fundName: (h.fundName as string) || "",
        cusip: (bond.cusip as string) || (h.securityId as string) || "",
        couponRate: (bond.couponRate as number) || 0,
        maturityDate: (bond.maturityDate as string) || "",
        creditRating: (bond.creditRating as string) || "",
        bondType: (bond.bondType as string) || "corporate",
        faceValue: (h.quantity as number) || 0,
        unitCost: (h.unitCost as number) || 0,
        costBasis: (h.costBasis as number) || 0,
        currentPrice: (h.marketPrice as number) || 0,
        marketValue: (h.marketValue as number) || 0,
        unrealizedGainLoss: (h.unrealizedGainLoss as number) || 0,
        estIncomeYield: (bond.estIncomeYield as number) || 0,
        estAnnualIncome: (bond.estAnnualIncome as number) || 0,
        currency: (h.currency as string) || "USD",
        purchaseDate: undefined, // loaded from bond_overrides
        couponFrequency: 2,     // default semiannual
      };
    });
}, [data]);

const hasFunds = useMemo(() => {
  if (!data || !data.snapshots.length) return true; // default to funds view
  const latest = data.snapshots[data.snapshots.length - 1];
  const holdings = latest.holdings as Array<Record<string, unknown>> | null;
  if (!holdings) return true;
  return holdings.some(h => !h.assetClass || h.assetClass === "fund" || h.assetClass === "etf");
}, [data]);

const hasBonds = bondHoldings.length > 0;

// Auto-select first available tab
useMemo(() => {
  if (hasBonds && !hasFunds) setActiveTab("renta_fija");
  else if (hasFunds && !hasBonds) setActiveTab("fondos");
  else setActiveTab("resumen");
}, [hasFunds, hasBonds]);
```

- [ ] **Step 4: Add tab bar in the render, after the header section**

After the fill prices section and before the summary cards (around line 835), add tabs:

```tsx
{/* Tab navigation */}
{snapshots.length > 0 && (hasFunds || hasBonds) && (
  <div className="flex gap-1 mb-4 border-b border-gb-border">
    {hasFunds && hasBonds && (
      <button
        onClick={() => setActiveTab("resumen")}
        className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
          activeTab === "resumen" ? "border-blue-600 text-blue-600" : "border-transparent text-gb-gray hover:text-gb-black"
        }`}
      >
        Resumen
      </button>
    )}
    {hasFunds && (
      <button
        onClick={() => setActiveTab("fondos")}
        className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
          activeTab === "fondos" ? "border-blue-600 text-blue-600" : "border-transparent text-gb-gray hover:text-gb-black"
        }`}
      >
        Fondos
      </button>
    )}
    {hasBonds && (
      <button
        onClick={() => setActiveTab("renta_fija")}
        className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
          activeTab === "renta_fija" ? "border-blue-600 text-blue-600" : "border-transparent text-gb-gray hover:text-gb-black"
        }`}
      >
        Renta Fija
      </button>
    )}
  </div>
)}
```

- [ ] **Step 5: Wrap existing content in a "fondos" tab conditional, and add renta fija tab**

The existing summary cards, HoldingReturnsPanel, EvolucionChart, RadiografiaCartola, etc. should only show when `activeTab === "fondos"` or `activeTab === "resumen"`.

After the tab bar, add the renta fija view:

```tsx
{/* Renta Fija tab */}
{activeTab === "renta_fija" && hasBonds && (
  <BondPortfolioView
    bonds={bondHoldings}
    clientId={clientId}
  />
)}
```

Wrap the existing fund-related content (summary cards through RadiografiaCartola) with:

```tsx
{(activeTab === "fondos" || activeTab === "resumen") && (
  <>
    {/* ...existing summary cards, charts, radiografia... */}
  </>
)}
```

- [ ] **Step 6: Verify build**

Run: `npx next build 2>&1 | tail -5`
Expected: exit 0

- [ ] **Step 7: Commit**

```bash
git add components/seguimiento/SeguimientoPage.tsx
git commit -m "feat(bonds): add dynamic tabs (Resumen/Fondos/Renta Fija) to SeguimientoPage"
```

---

### Task 13: Run all tests and verify build

**Files:** None (verification only)

- [ ] **Step 1: Run full test suite**

Run: `npx vitest run`
Expected: All tests pass including new bond tests

- [ ] **Step 2: Run production build**

Run: `npx next build 2>&1 | tail -10`
Expected: exit 0, no compilation errors

- [ ] **Step 3: Manual smoke test**

Start dev server: `npm run dev`
1. Navigate to seguimiento for a client with only fondos mutuos — should show existing view unchanged (no tabs or just "Fondos" tab)
2. Upload the StoneX LMAbr26.pdf via "Agregar Cartola" — parser should detect `cartolaMix: "bonds_only"` and extract 17 bonds with bond metadata
3. After saving, seguimiento should show "Renta Fija" tab
4. In Renta Fija: verify metric cards, bond table with 17 rows, coupon calendar, cash flow chart, distribution charts
5. Click a bond row — BondDevelopmentModal opens with amortization schedule
6. Change purchase date — cash flows recalculate

- [ ] **Step 4: Final commit if any fixes needed**

```bash
git add -A
git commit -m "fix: bond integration smoke test fixes"
```
