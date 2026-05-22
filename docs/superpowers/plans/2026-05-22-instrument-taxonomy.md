# Instrument Taxonomy & Return Engines — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix instrument classification so only direct bonds get the devengo engine, and refactor the bond return model to use devengo-only (no double-counting coupons).

**Architecture:** Replace `inferAssetType` with `inferInstrumentType` that uses bond-specific markers (CUSIP + couponRate + maturityDate) instead of `assetClass`. Refactor `calcBondPeriodReturn` to return devengo (YTM-based) + market deviation instead of accrued interest + coupons + price diff. Update UI sections accordingly.

**Tech Stack:** React 19, Next.js App Router, TypeScript, Vitest, Tailwind v4

---

### Task 1: Refactor `calcBondPeriodReturn` to devengo-only model

The current function sums `accruedInterest + priceDiff + couponsPaid`, which double-counts when using YTM-based accrual. Refactor to: `devengoUSD + marketDeviationUSD`.

**Files:**
- Modify: `lib/bonds/period-return.ts`
- Modify: `lib/bonds/period-return.test.ts`

- [ ] **Step 1: Write new tests for the devengo-only model**

Replace the entire contents of `lib/bonds/period-return.test.ts`:

```ts
// lib/bonds/period-return.test.ts
import { describe, it, expect } from "vitest";
import { calcBondPeriodReturn } from "./period-return";

describe("calcBondPeriodReturn — devengo model", () => {
  const baseBond = {
    faceValue: 50000,
    couponRate: 0.05294,  // 5.294% annual
    couponFrequency: 2,
    maturityDate: "2027-08-15",
    purchasePrice: 98.50,  // % of par
  };

  it("calculates devengoUSD using purchase YTM for 30-day period", () => {
    const result = calcBondPeriodReturn({
      ...baseBond,
      currentPrice: 99.12,
      startDate: "2026-03-31",
      endDate: "2026-04-30",
      purchaseDate: "2025-06-01",
    });
    // costBasis = 50000 * 98.50 / 100 = 49250
    // YTM at 98.50, 2+ years to maturity ≈ ~6.4% (higher than coupon due to discount)
    // devengoUSD = purchaseYTM * costBasis * days / 360
    // Should be positive and based on YTM, not coupon rate
    expect(result.devengoUSD).toBeGreaterThan(0);
    expect(result.devengoPct).toBeGreaterThan(0);
    expect(result.costBasis).toBeCloseTo(49250, 0);
  });

  it("devengoPct > coupon rate for discount bond (pull-to-par effect)", () => {
    const result = calcBondPeriodReturn({
      faceValue: 100000,
      couponRate: 0.10,
      couponFrequency: 2,
      maturityDate: "2028-06-15",
      purchasePrice: 50,     // deep discount
      currentPrice: 52,
      startDate: "2026-04-01",
      endDate: "2026-05-01",
    });
    // YTM >> coupon rate for deep discount → devengoPct >> simple coupon accrual
    const simpleCouponPct = 0.10 * 30 / 360 * 100;
    expect(result.devengoPct).toBeGreaterThan(simpleCouponPct);
  });

  it("devengoPct ≈ coupon rate when purchased at par", () => {
    const result = calcBondPeriodReturn({
      ...baseBond,
      purchasePrice: 100,
      currentPrice: 100,
      startDate: "2026-01-01",
      endDate: "2027-01-01",
    });
    // At par, YTM = coupon rate
    expect(result.devengoPct).toBeCloseTo(5.294, 1);
  });

  it("devengoPct < coupon rate for premium bond", () => {
    const result = calcBondPeriodReturn({
      ...baseBond,
      purchasePrice: 105,
      currentPrice: 104,
      startDate: "2026-03-31",
      endDate: "2026-04-30",
    });
    const simpleCouponPct = 0.05294 * 30 / 360 * 100;
    expect(result.devengoPct).toBeLessThan(simpleCouponPct);
  });

  it("calculates market deviation vs theoretical value", () => {
    const result = calcBondPeriodReturn({
      ...baseBond,
      currentPrice: 99.12,
      startDate: "2026-03-31",
      endDate: "2026-04-30",
      purchaseDate: "2026-03-01",
    });
    // theoreticalValue = costBasis + devengoUSD
    // marketValue = faceValue * currentPrice / 100 = 50000 * 99.12 / 100 = 49560
    // marketDeviation = marketValue - theoreticalValue
    const marketValue = 50000 * 99.12 / 100;
    expect(result.marketDeviationUSD).toBeCloseTo(
      marketValue - result.costBasis - result.devengoUSD, 0
    );
  });

  it("totalReturnUSD = devengoUSD + marketDeviationUSD", () => {
    const result = calcBondPeriodReturn({
      ...baseBond,
      currentPrice: 99.12,
      startDate: "2026-03-31",
      endDate: "2026-04-30",
    });
    expect(result.totalReturnUSD).toBeCloseTo(
      result.devengoUSD + result.marketDeviationUSD, 2
    );
  });

  it("totalReturnPct is relative to costBasis", () => {
    const result = calcBondPeriodReturn({
      ...baseBond,
      currentPrice: 99.12,
      startDate: "2026-03-31",
      endDate: "2026-04-30",
    });
    expect(result.totalReturnPct).toBeCloseTo(
      result.totalReturnUSD / result.costBasis * 100, 2
    );
  });

  it("uses purchaseDate for accrual range when provided", () => {
    const withDate = calcBondPeriodReturn({
      ...baseBond,
      currentPrice: 99.12,
      startDate: "2026-03-31",
      endDate: "2026-04-30",
      purchaseDate: "2025-06-01",
    });
    const withoutDate = calcBondPeriodReturn({
      ...baseBond,
      currentPrice: 99.12,
      startDate: "2026-03-31",
      endDate: "2026-04-30",
    });
    // With purchaseDate 10+ months earlier → much larger devengo
    expect(withDate.devengoUSD).toBeGreaterThan(withoutDate.devengoUSD * 5);
  });

  it("falls back to startDate when no purchaseDate", () => {
    const result = calcBondPeriodReturn({
      ...baseBond,
      currentPrice: 99.12,
      startDate: "2026-03-31",
      endDate: "2026-04-30",
    });
    // 30 days of accrual from startDate
    expect(result.devengoUSD).toBeGreaterThan(0);
    expect(result.devengoUSD).toBeLessThan(1000); // Not 10+ months worth
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run lib/bonds/period-return.test.ts`
Expected: FAIL — `devengoUSD` does not exist on the result type yet.

- [ ] **Step 3: Rewrite `calcBondPeriodReturn` with the devengo-only model**

Replace the entire contents of `lib/bonds/period-return.ts`:

```ts
// lib/bonds/period-return.ts
import { calcYieldToMaturity } from "./yield";

interface BondPeriodInput {
  faceValue: number;
  couponRate: number;       // decimal, e.g., 0.05294
  couponFrequency: number;  // 2 for semi-annual
  maturityDate: string;     // ISO date
  purchasePrice: number;    // % of par
  currentPrice: number;     // % of par (at endDate)
  startDate: string;        // ISO date (snapshot A — fallback accrual start)
  endDate: string;          // ISO date (snapshot B — accrual end)
  purchaseDate?: string;    // ISO date — actual purchase date (advisor-provided)
}

export interface BondPeriodResult {
  devengoUSD: number;          // YTM-based accrual in USD
  devengoPct: number;          // devengo as % of costBasis
  marketDeviationUSD: number;  // market value - theoretical value
  totalReturnUSD: number;      // devengoUSD + marketDeviationUSD
  totalReturnPct: number;      // totalReturnUSD / costBasis * 100
  costBasis: number;           // faceValue * purchasePrice / 100
  purchaseYTM: number;         // annual YTM at purchase (decimal)
}

/** 30/360 day count between two dates */
function days30_360(d1: Date, d2: Date): number {
  const y1 = d1.getFullYear(), m1 = d1.getMonth() + 1, dd1 = Math.min(d1.getDate(), 30);
  const y2 = d2.getFullYear(), m2 = d2.getMonth() + 1;
  let dd2 = Math.min(d2.getDate(), 30);
  if (dd1 >= 30) dd2 = Math.min(dd2, 30);
  return (y2 - y1) * 360 + (m2 - m1) * 30 + (dd2 - dd1);
}

/**
 * Calculate bond return using devengo-only model.
 *
 * Devengo = YTM at purchase * costBasis * days / 360
 * Market deviation = current market value - (costBasis + devengo)
 * Total return = devengo + market deviation
 *
 * No separate coupon tracking — the YTM-based devengo already captures
 * coupon income + pull-to-par. Adding coupons would double-count.
 */
export function calcBondPeriodReturn(input: BondPeriodInput): BondPeriodResult {
  const {
    faceValue, couponRate, couponFrequency, maturityDate,
    purchasePrice, currentPrice, startDate, endDate, purchaseDate,
  } = input;

  const costBasis = faceValue * purchasePrice / 100;

  const start = new Date(startDate + "T00:00:00");
  const end = new Date(endDate + "T00:00:00");

  // Accrual starts from purchaseDate if provided, else startDate
  const accrualStart = purchaseDate
    ? new Date(purchaseDate + "T00:00:00")
    : start;
  const periodDays = days30_360(accrualStart, end);

  // YTM at purchase — reference date is purchaseDate or startDate
  const ytmRefDate = purchaseDate
    ? new Date(purchaseDate + "T00:00:00")
    : start;

  let purchaseYTM = couponRate; // fallback: coupon rate
  try {
    const ytm = calcYieldToMaturity({
      faceValue,
      couponRate,
      couponFrequency,
      maturityDate,
      purchaseDate: purchaseDate || startDate,
      purchasePrice,
      currentPrice: purchasePrice, // solve YTM at purchase price
    }, ytmRefDate);
    if (!isNaN(ytm) && ytm > -1) purchaseYTM = ytm;
  } catch { /* keep fallback */ }

  // Devengo: YTM-based accrual from purchase/start to end
  const devengoUSD = purchaseYTM * costBasis * periodDays / 360;
  const devengoPct = costBasis > 0 ? (devengoUSD / costBasis) * 100 : 0;

  // Market deviation: how much better/worse than YTM prediction
  const marketValue = faceValue * currentPrice / 100;
  const theoreticalValue = costBasis + devengoUSD;
  const marketDeviationUSD = marketValue - theoreticalValue;

  // Totals
  const totalReturnUSD = devengoUSD + marketDeviationUSD;
  const totalReturnPct = costBasis > 0 ? (totalReturnUSD / costBasis) * 100 : 0;

  return {
    devengoUSD,
    devengoPct,
    marketDeviationUSD,
    totalReturnUSD,
    totalReturnPct,
    costBasis,
    purchaseYTM,
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run lib/bonds/period-return.test.ts`
Expected: All 9 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/bonds/period-return.ts lib/bonds/period-return.test.ts
git commit -m "refactor: bond return engine uses devengo-only model (no coupon double-count)"
```

---

### Task 2: Create `inferInstrumentType` with proper bond detection

The current `inferAssetType` (in `HoldingReturnsPanel.tsx`) classifies anything with `assetClass: "fixedIncome"` as a bond. Replace it with `inferInstrumentType` that only flags direct bonds.

**Files:**
- Create: `lib/instrument-type.ts`
- Create: `lib/instrument-type.test.ts`

- [ ] **Step 1: Write the tests**

Create `lib/instrument-type.test.ts`:

```ts
// lib/instrument-type.test.ts
import { describe, it, expect } from "vitest";
import { inferInstrumentType } from "./instrument-type";

describe("inferInstrumentType", () => {
  it("returns explicit instrumentType when present", () => {
    expect(inferInstrumentType({ instrumentType: "etf", fundName: "AGG" })).toBe("etf");
    expect(inferInstrumentType({ instrumentType: "bond", fundName: "Goldman" })).toBe("bond");
  });

  it("returns explicit assetType as fallback (backward compat)", () => {
    expect(inferInstrumentType({ assetType: "stock", fundName: "AAPL" })).toBe("stock");
    expect(inferInstrumentType({ assetType: "fund", fundName: "BTG RF" })).toBe("fund");
  });

  it("detects bond: CUSIP + couponRate + maturityDate", () => {
    expect(inferInstrumentType({
      fundName: "Goldman Sachs",
      securityId: "38141GXZ2",
      couponRate: 6.75,
      maturityDate: "2029-10-01",
    })).toBe("bond");
  });

  it("detects bond: couponRate + maturityDate without CUSIP", () => {
    expect(inferInstrumentType({
      fundName: "AT&T Inc 4.75% 05/2046",
      couponRate: 4.75,
      maturityDate: "2046-05-15",
    })).toBe("bond");
  });

  it("does NOT classify RF fund as bond despite fixedIncome assetClass", () => {
    expect(inferInstrumentType({
      fundName: "BTG Renta Fija Chile",
      assetClass: "fixedIncome",
      securityId: "9832",  // numeric RUN → fund
    })).toBe("fund");
  });

  it("does NOT classify RF ETF as bond despite fixedIncome assetClass", () => {
    expect(inferInstrumentType({
      fundName: "iShares Core US Aggregate Bond ETF",
      assetClass: "fixedIncome",
      securityId: "AGG",
    })).toBe("etf");
  });

  it("detects fund: numeric securityId (RUN)", () => {
    expect(inferInstrumentType({
      fundName: "Fintual Risky Norris",
      securityId: "10234",
    })).toBe("fund");
  });

  it("detects cash from assetClass", () => {
    expect(inferInstrumentType({
      fundName: "US Dollar Cash",
      assetClass: "cash",
    })).toBe("cash");
  });

  it("detects cash from fund name", () => {
    expect(inferInstrumentType({
      fundName: "Money Market Sweep",
    })).toBe("cash");
  });

  it("defaults non-numeric securityId without bond markers to stock", () => {
    expect(inferInstrumentType({
      fundName: "Apple Inc",
      securityId: "AAPL",
    })).toBe("stock");
  });

  it("defaults unknown to fund", () => {
    expect(inferInstrumentType({
      fundName: "Some Unknown Instrument",
    })).toBe("fund");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run lib/instrument-type.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `inferInstrumentType`**

Create `lib/instrument-type.ts`:

```ts
// lib/instrument-type.ts

export type InstrumentType = "bond" | "stock" | "etf" | "fund" | "cash";

interface HoldingLike {
  fundName: string;
  instrumentType?: string;
  assetType?: string;      // backward compat
  assetClass?: string;
  securityId?: string | null;
  couponRate?: number | null;
  maturityDate?: string | null;
}

const VALID_TYPES = new Set<string>(["bond", "stock", "etf", "fund", "cash"]);

const CASH_RE = /cash|efect|money\s*market|liquidez|sweep|deposito|depósito/i;
const CUSIP_RE = /^[A-Z0-9]{9}$/i;

/**
 * Infer instrument type from holding fields.
 * Priority: explicit field → bond markers → RUN → ticker → name → default.
 *
 * Key rule: assetClass ("fixedIncome") does NOT make something a bond.
 * Only direct bonds with couponRate + maturityDate (and optionally CUSIP) are bonds.
 */
export function inferInstrumentType(h: HoldingLike): InstrumentType {
  // 1. Explicit instrumentType or assetType (backward compat)
  const explicit = h.instrumentType || h.assetType;
  if (explicit && VALID_TYPES.has(explicit)) return explicit as InstrumentType;

  const secId = (h.securityId || "").trim();
  const name = (h.fundName || "").toLowerCase();

  // 2. Cash — check early (name or assetClass)
  if (h.assetClass === "cash" || CASH_RE.test(name)) return "cash";

  // 3. Bond: requires couponRate + maturityDate (actual bond-specific data)
  const hasCoupon = h.couponRate != null && h.couponRate > 0;
  const hasMaturity = h.maturityDate != null && h.maturityDate.length > 0;
  if (hasCoupon && hasMaturity) return "bond";

  // 4. CUSIP-shaped securityId without coupon data — still likely a bond
  //    (bond data may come from FINRA lookup later)
  if (secId && CUSIP_RE.test(secId) && !(/^\d+$/.test(secId))) return "bond";

  // 5. Numeric securityId → Chilean fund (RUN)
  if (/^\d+$/.test(secId)) return "fund";

  // 6. Non-numeric securityId → stock (ETF detection could be refined later)
  if (secId) return "stock";

  // 7. No securityId — guess from name
  return "fund";
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run lib/instrument-type.test.ts`
Expected: All 11 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/instrument-type.ts lib/instrument-type.test.ts
git commit -m "feat: inferInstrumentType — proper bond detection without assetClass confusion"
```

---

### Task 3: Wire `inferInstrumentType` into `HoldingReturnsPanel`

Replace the inline `inferAssetType` with the new `inferInstrumentType`. Update the bond holdings builder to use the new `BondPeriodResult` fields.

**Files:**
- Modify: `components/seguimiento/HoldingReturnsPanel.tsx`

- [ ] **Step 1: Replace `inferAssetType` import and usage**

In `components/seguimiento/HoldingReturnsPanel.tsx`:

1. Add import at top (after line 9):
```ts
import { inferInstrumentType } from "@/lib/instrument-type";
```

2. Delete the entire `inferAssetType` function (lines 41–72).

3. In `buildSummaries()` (~line 315), replace:
```ts
          const assetType = inferAssetType(merged);
```
with:
```ts
          const assetType = inferInstrumentType(merged);
```

- [ ] **Step 2: Update bond holdings builder to use new result fields**

In the bond holdings builder (~line 590–675), update the `calcBondPeriodReturn` result usage. Replace the block that starts with `let accruedInterest = 0` through the `calcBondPeriodReturn` call result assignments:

```ts
        let devengoUSD = 0;
        let devengoPct = 0;
        let marketDeviationUSD = 0;
        let totalReturnPct = 0;

        if (h.maturityDate && couponRateDecimal > 0 && previousSnapshotDate) {
          const periodResult = calcBondPeriodReturn({
            faceValue,
            couponRate: couponRateDecimal,
            couponFrequency: freq,
            maturityDate: h.maturityDate,
            purchasePrice: purchasePricePct,
            currentPrice: marketPricePct,
            startDate: previousSnapshotDate,
            endDate: latestDate || previousSnapshotDate,
            purchaseDate: h.purchaseDate || undefined,
          });
          devengoUSD = periodResult.devengoUSD;
          devengoPct = periodResult.devengoPct;
          marketDeviationUSD = periodResult.marketDeviationUSD;
          totalReturnPct = periodResult.totalReturnPct;
        }
```

Update the return object (replace `accruedInterest`, `accruedYieldPct`, `priceDiff`, `couponsPaid`):

```ts
        return {
          fundName: h.fundName,
          cusip: h.securityId || "",
          creditRating: h.creditRating || "NR",
          couponRate: couponRatePct,
          maturityDate: h.maturityDate || "",
          weight: h.weight,
          purchasePrice: purchasePricePct,
          marketPrice: marketPricePct,
          ytm,
          devengoUSD,
          devengoPct,
          marketDeviationUSD,
          totalReturn: totalReturnPct,
          contribution: h.weight > 0 ? (totalReturnPct * h.weight) / 100 : 0,
          marketValue: h.marketValue,
        };
```

- [ ] **Step 3: Remove unused import**

Remove the `calcYieldToMaturity` import from the top of the file (line 7) — it was only used by the standalone YTM calc in the bond builder, which we can keep inline. Actually, check: `calcYieldToMaturity` is still called at line ~641. Keep the import if still used, otherwise remove.

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit 2>&1 | grep -i "HoldingReturnsPanel\|FixedIncomeSection\|instrument-type"`
Expected: Errors in `FixedIncomeSection` (because `BondHoldingRow` interface changed). No errors in `HoldingReturnsPanel` or `instrument-type`.

- [ ] **Step 5: Commit**

```bash
git add components/seguimiento/HoldingReturnsPanel.tsx
git commit -m "refactor: use inferInstrumentType and devengo-only bond result in HoldingReturnsPanel"
```

---

### Task 4: Update `FixedIncomeSection` for devengo-only display

The `BondHoldingRow` interface needs to match the new result fields. Remove coupon/accrued columns, add market deviation.

**Files:**
- Modify: `components/seguimiento/FixedIncomeSection.tsx`

- [ ] **Step 1: Update `BondHoldingRow` interface and table**

Replace the entire contents of `components/seguimiento/FixedIncomeSection.tsx`:

```tsx
"use client";

import React from "react";
import { formatNumber, formatPercent } from "@/lib/format";
import { RATING_SCALE } from "@/lib/bonds/types";

export interface BondHoldingRow {
  fundName: string;
  cusip: string;
  creditRating: string;
  couponRate: number;       // annual % (e.g., 5.294)
  maturityDate: string;     // ISO date
  weight: number;           // % of total portfolio
  purchasePrice: number;    // % of par
  marketPrice: number;      // % of par
  ytm: number;              // annual %
  devengoUSD: number;       // YTM-based accrual in USD
  devengoPct: number;       // devengo as % of costBasis
  marketDeviationUSD: number; // market vs theoretical
  totalReturn: number;      // %
  contribution: number;     // totalReturn * weight / 100
  marketValue: number;      // USD
}

interface Props {
  holdings: BondHoldingRow[];
  totalPortfolioValue: number;
}

function ratingColor(rating: string): string {
  const n = RATING_SCALE[rating.toUpperCase()] ?? 99;
  if (n <= 4) return "bg-green-100 text-green-700";
  if (n <= 7) return "bg-blue-100 text-blue-700";
  if (n <= 10) return "bg-yellow-100 text-yellow-700";
  if (n <= 13) return "bg-orange-100 text-orange-700";
  return "bg-red-100 text-red-700";
}

export default function FixedIncomeSection({ holdings, totalPortfolioValue }: Props) {
  if (holdings.length === 0) return null;

  const subtotalValue = holdings.reduce((s, h) => s + h.marketValue, 0);
  const subtotalWeight = totalPortfolioValue > 0
    ? (subtotalValue / totalPortfolioValue) * 100
    : 0;
  const subtotalContrib = holdings.reduce((s, h) => s + h.contribution, 0);
  const subtotalDevengo = holdings.reduce((s, h) => s + h.devengoUSD, 0);
  const subtotalDeviation = holdings.reduce((s, h) => s + h.marketDeviationUSD, 0);

  const fmtMaturity = (iso: string) => {
    const d = new Date(iso + "T00:00:00");
    return d.toLocaleDateString("es-CL", { month: "short", year: "numeric" });
  };

  return (
    <div className="mb-6">
      <div className="flex items-center gap-2 mb-3 px-4">
        <div className="w-1 h-5 bg-orange-500 rounded" />
        <h3 className="text-sm font-semibold text-gb-black">Renta Fija (Bonos)</h3>
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
              <th className="px-3 py-2 text-right text-xs font-semibold text-gb-gray uppercase">Cupon</th>
              <th className="px-3 py-2 text-right text-xs font-semibold text-gb-gray uppercase">Venc.</th>
              <th className="px-3 py-2 text-right text-xs font-semibold text-gb-gray uppercase">Peso</th>
              <th className="px-3 py-2 text-right text-xs font-semibold text-gb-gray uppercase">P. Compra</th>
              <th className="px-3 py-2 text-right text-xs font-semibold text-gb-gray uppercase">P. Mercado</th>
              <th className="px-3 py-2 text-right text-xs font-semibold text-gb-gray uppercase">TIR</th>
              <th className="px-3 py-2 text-right text-xs font-semibold text-gb-gray uppercase">Devengo</th>
              <th className="px-3 py-2 text-right text-xs font-semibold text-gb-gray uppercase">Desv. Mdo.</th>
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
                  <UsdCell value={h.devengoUSD} />
                  {h.devengoPct > 0 && (
                    <div className="text-[10px] text-gb-gray">{formatNumber(h.devengoPct, 2)}%</div>
                  )}
                </td>
                <td className="px-3 py-2 text-right">
                  <UsdCell value={h.marketDeviationUSD} />
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
                <UsdCell value={subtotalDevengo} />
              </td>
              <td className="px-3 py-2 text-right">
                <UsdCell value={subtotalDeviation} />
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

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit 2>&1 | grep -i "FixedIncomeSection\|HoldingReturnsPanel"`
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add components/seguimiento/FixedIncomeSection.tsx
git commit -m "refactor: FixedIncomeSection displays devengo + market deviation (no coupons column)"
```

---

### Task 5: Fix `ReviewSnapshotModal` — purchaseDate only for bonds

The current condition shows the "F. Compra" date picker for `assetType === "bond" || assetClass === "fixedIncome"`. This is wrong — RF funds don't need a purchase date. Fix to only show for actual bonds.

**Files:**
- Modify: `components/seguimiento/ReviewSnapshotModal.tsx`

- [ ] **Step 1: Fix the purchaseDate condition**

In `components/seguimiento/ReviewSnapshotModal.tsx` at line 1504, replace:

```tsx
                      {(holding.assetType === "bond" || holding.assetClass === "fixedIncome") ? (
```

with:

```tsx
                      {holding.assetType === "bond" ? (
```

- [ ] **Step 2: Verify no type errors**

Run: `npx tsc --noEmit 2>&1 | grep -i "ReviewSnapshotModal"`
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add components/seguimiento/ReviewSnapshotModal.tsx
git commit -m "fix: purchaseDate input only for bonds, not all fixedIncome instruments"
```

---

### Task 6: Integration — run all tests and type-check

**Files:** None (verification only)

- [ ] **Step 1: Run all bond tests**

Run: `npx vitest run lib/bonds/`
Expected: All tests pass.

- [ ] **Step 2: Run instrument-type tests**

Run: `npx vitest run lib/instrument-type.test.ts`
Expected: All 11 tests pass.

- [ ] **Step 3: Full type-check**

Run: `npx tsc --noEmit 2>&1 | grep -v "rate-limit.test.ts"`
Expected: Only pre-existing `rate-limit.test.ts` errors, nothing new.

- [ ] **Step 4: Verify the parse-statement route still uses assetType correctly**

The AI prompt in `app/api/parse-portfolio-statement/route.ts` tells Claude to output `assetType: "fund" | "etf" | "stock" | "bond" | "cash" | "other"`. This is compatible — `inferInstrumentType` reads `assetType` as fallback. No change needed.

- [ ] **Step 5: Commit spec and plan**

```bash
git add docs/superpowers/specs/2026-05-22-instrument-taxonomy-design.md docs/superpowers/plans/2026-05-22-instrument-taxonomy.md
git commit -m "docs: instrument taxonomy spec and implementation plan"
```
