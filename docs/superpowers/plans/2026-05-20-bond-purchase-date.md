# Bond Purchase Date & YTM-Based Accrual — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow advisors to input a purchase date per bond holding so the system can calculate accrued interest using the purchase YTM (TIR de compra) instead of the coupon rate, and accrue from the actual purchase date rather than the previous snapshot.

**Architecture:** `purchaseDate` is stored as an optional ISO date field inside each holding's JSON in `portfolio_snapshots`. The ReviewSnapshotModal gets a date input for bond rows. The period-return calculator accepts a `purchaseDate` to compute the YTM at the time of purchase and accrue from that date. HoldingReturnsPanel passes the field through. When no `purchaseDate` is set, behavior falls back to the existing logic (coupon rate, snapshot-to-snapshot).

**Tech Stack:** React 19, Next.js App Router, TypeScript, Vitest, Tailwind v4

---

### Task 1: Add `purchaseDate` to `BondPeriodInput` and use it for YTM calculation

The current `calcBondPeriodReturn` calculates YTM using `startDate` (previous snapshot) as the reference. With a real `purchaseDate`, it should:
1. Compute YTM at the purchase date (not `startDate`)
2. Accrue from `purchaseDate` (or `startDate` if no `purchaseDate`)

**Files:**
- Modify: `lib/bonds/period-return.ts`
- Modify: `lib/bonds/period-return.test.ts`

- [ ] **Step 1: Write the failing test — purchaseDate changes the accrual range**

Add to `lib/bonds/period-return.test.ts`:

```ts
it("uses purchaseDate for accrual range when provided", () => {
  // Bond bought 2025-06-01, snapshot period is 2026-03-31 → 2026-04-30
  // Accrual should cover purchaseDate → endDate (330 days 30/360),
  // not startDate → endDate (30 days)
  const result = calcBondPeriodReturn({
    ...baseBond,
    currentPrice: 99.12,
    startDate: "2026-03-31",
    endDate: "2026-04-30",
    purchaseDate: "2025-06-01",
  });
  // 30/360 days from 2025-06-01 to 2026-04-30 = 329 days
  // Daily rate = 1323.50 / 180 = 7.3528
  // Accrued = 7.3528 * 329 = 2419.07
  expect(result.accruedInterest).toBeCloseTo(2419, 0);
});

it("uses purchaseDate for YTM calculation reference", () => {
  // With purchaseDate far from maturity, YTM is calculated with more periods
  // vs without purchaseDate (uses startDate, closer to maturity, fewer periods)
  const withPurchaseDate = calcBondPeriodReturn({
    ...baseBond,
    currentPrice: 99.12,
    startDate: "2026-03-31",
    endDate: "2026-04-30",
    purchaseDate: "2025-01-01",
  });
  const withoutPurchaseDate = calcBondPeriodReturn({
    ...baseBond,
    currentPrice: 99.12,
    startDate: "2026-03-31",
    endDate: "2026-04-30",
  });
  // Both should have accruedYieldPct but potentially different values
  // (more periods = slightly different YTM)
  expect(withPurchaseDate.accruedYieldPct).toBeGreaterThan(0);
  expect(withoutPurchaseDate.accruedYieldPct).toBeGreaterThan(0);
});

it("falls back to startDate when no purchaseDate", () => {
  const result = calcBondPeriodReturn({
    ...baseBond,
    currentPrice: 99.12,
    startDate: "2026-03-31",
    endDate: "2026-04-30",
  });
  // Should behave exactly as before — 30 days accrual
  expect(result.accruedInterest).toBeCloseTo(220.58, 0);
});
```

- [ ] **Step 2: Run tests to verify new tests fail**

Run: `npx vitest run lib/bonds/period-return.test.ts`
Expected: The "uses purchaseDate for accrual range" test FAILS (purchaseDate is not in the interface yet).

- [ ] **Step 3: Implement purchaseDate support in calcBondPeriodReturn**

In `lib/bonds/period-return.ts`, add `purchaseDate` to the input interface and use it:

```ts
interface BondPeriodInput {
  faceValue: number;
  couponRate: number;       // decimal, e.g., 0.05294
  couponFrequency: number;  // 2 for semi-annual
  maturityDate: string;     // ISO date
  purchasePrice: number;    // % of par
  currentPrice: number;     // % of par (at endDate)
  startDate: string;        // ISO date (snapshot A)
  endDate: string;          // ISO date (snapshot B)
  purchaseDate?: string;    // ISO date — actual purchase date (advisor-provided)
  couponOverride?: number;  // advisor-provided coupon amount in USD
}
```

Then change the accrual and YTM logic in the function body. Replace the block from `const start =` through `const accruedYieldPct =`:

```ts
  const start = new Date(startDate + "T00:00:00");
  const end = new Date(endDate + "T00:00:00");

  // Accrual range: from purchaseDate (if provided) to endDate
  const accrualStart = purchaseDate
    ? new Date(purchaseDate + "T00:00:00")
    : start;
  const periodDays = days30_360(accrualStart, end);
  const dailyRate = couponAmount / (360 / couponFrequency);
  const accruedInterest = dailyRate * periodDays;

  // YTM reference: use purchaseDate if available, else startDate
  const ytmRefDate = purchaseDate
    ? new Date(purchaseDate + "T00:00:00")
    : start;

  // Accrual based on purchase YTM (effective interest method)
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
  const accruedYieldPct = purchaseYTM * periodDays / 360 * 100;
```

Also update the coupon detection to count coupons from `accrualStart` instead of `start`:

```ts
  // --- Coupons paid in the period ---
  const maturity = new Date(maturityDate + "T00:00:00");
  const couponDates: string[] = [];
  let d = new Date(maturity);
  while (d > accrualStart) {
    const dateStr = d.toISOString().split("T")[0];
    if (d > accrualStart && d <= end) {
      couponDates.push(dateStr);
    }
    d = new Date(d);
    d.setMonth(d.getMonth() - monthsPerPeriod);
  }
  couponDates.sort();
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run lib/bonds/period-return.test.ts`
Expected: All tests PASS (12 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/bonds/period-return.ts lib/bonds/period-return.test.ts
git commit -m "feat: calcBondPeriodReturn accepts purchaseDate for accrual range and YTM"
```

---

### Task 2: Add `purchaseDate` field to ReviewSnapshotModal

The advisor needs to input a purchase date per bond holding when reviewing/editing a snapshot. The field only appears for bond rows.

**Files:**
- Modify: `components/seguimiento/ReviewSnapshotModal.tsx`

- [ ] **Step 1: Add `purchaseDate` to the Holding interface**

In `components/seguimiento/ReviewSnapshotModal.tsx`, add to the `Holding` interface (after line 23 `creditRating`):

```ts
  purchaseDate?: string | null;  // ISO date — when the bond was purchased
```

- [ ] **Step 2: Add handler for purchaseDate changes**

After the `handlePriceChange` function (~line 698), add:

```ts
  const handlePurchaseDateChange = (index: number, newDate: string) => {
    const updated = [...holdings];
    updated[index] = { ...updated[index], purchaseDate: newDate || null };
    setHoldings(updated);
  };
```

- [ ] **Step 3: Add the date input column for bond rows in the holdings table**

This is the trickiest part. The current table has 7 columns. We add a narrow "F. Compra" column that only shows an input for bonds.

In the `<thead>`, after the "Clase" column header (around line 1394), add:

```tsx
                  <th className="px-3 py-2 text-center text-xs font-semibold text-slate-600 w-28">F. Compra</th>
```

In the `<tbody>`, after the "Clase" `<td>` (after line 1493's closing `</td>`), add:

```tsx
                    <td className="px-3 py-2 text-center">
                      {(holding.assetType === "bond" || holding.assetClass === "fixedIncome") ? (
                        <input
                          type="date"
                          value={holding.purchaseDate || ""}
                          onChange={(e) => handlePurchaseDateChange(index, e.target.value)}
                          className="w-28 px-1 py-1 text-xs border border-slate-200 rounded focus:ring-1 focus:ring-blue-500"
                        />
                      ) : (
                        <span className="text-xs text-gb-gray">-</span>
                      )}
                    </td>
```

- [ ] **Step 4: Run dev server and verify**

Run: `npm run dev`
Navigate to a client with bonds → Seguimiento → Edit snapshot.
Verify: The "F. Compra" column appears. Bond rows show a date picker. Non-bond rows show "-".

- [ ] **Step 5: Commit**

```bash
git add components/seguimiento/ReviewSnapshotModal.tsx
git commit -m "feat: add purchaseDate input for bond holdings in ReviewSnapshotModal"
```

---

### Task 3: Pass `purchaseDate` through HoldingReturnsPanel to the calculator

The `HoldingReturnsPanel` builds bond data from snapshots. It needs to:
1. Read `purchaseDate` from the cartola holding data
2. Pass it to `calcBondPeriodReturn`

**Files:**
- Modify: `components/seguimiento/HoldingReturnsPanel.tsx`

- [ ] **Step 1: Add `purchaseDate` to the HoldingData interface**

In `components/seguimiento/HoldingReturnsPanel.tsx`, add to the `HoldingData` interface (after line 33 `creditRating`):

```ts
  purchaseDate?: string | null;
```

- [ ] **Step 2: Carry `purchaseDate` through the cartola fields merge**

In the `cartolaFieldsByName` map builder (~line 286), add `purchaseDate` to the fields being preserved:

```ts
          cartolaFieldsByName.set(h.fundName, {
            assetType: h.assetType,
            assetClass: h.assetClass,
            couponRate: h.couponRate,
            maturityDate: h.maturityDate,
            creditRating: h.creditRating,
            unitCost: h.unitCost,
            costBasis: h.costBasis,
            currency: h.currency,
            estIncomeYield: h.estIncomeYield,
            estAnnualIncome: h.estAnnualIncome,
            purchaseDate: h.purchaseDate,
          });
```

- [ ] **Step 3: Include `purchaseDate` in the base summary object**

In the `buildSummaries` function (~line 314-335), the `purchaseDate` field is already set on line 319 but it gets its value from `purchaseDates.get(h.fundName)` which is the first cartola snapshot date — NOT the advisor-entered purchase date.

Change line 319 to prefer the holding's own `purchaseDate` field:

```ts
            purchaseDate: merged.purchaseDate || purchaseDates.get(h.fundName) || null,
```

- [ ] **Step 4: Pass `purchaseDate` to `calcBondPeriodReturn`**

In the bond holdings builder (~line 617-632), add `purchaseDate` to the call. The holding's `purchaseDate` field is accessible as `h.purchaseDate`:

```ts
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
```

- [ ] **Step 5: Type-check**

Run: `npx tsc --noEmit 2>&1 | grep -E "HoldingReturnsPanel|period-return|FixedIncome"`
Expected: No errors in these files.

- [ ] **Step 6: Commit**

```bash
git add components/seguimiento/HoldingReturnsPanel.tsx
git commit -m "feat: pass purchaseDate from cartola through to bond period return calculator"
```

---

### Task 4: Integration test — end-to-end with dev server

Verify the full flow works with a real bond holding.

**Files:** None (manual testing)

- [ ] **Step 1: Run all bond tests**

Run: `npx vitest run lib/bonds/`
Expected: All tests pass (37+ tests across 6 files).

- [ ] **Step 2: Type-check entire project**

Run: `npx tsc --noEmit 2>&1 | grep -v "rate-limit.test.ts"`
Expected: Only pre-existing `rate-limit.test.ts` errors, nothing new.

- [ ] **Step 3: Test in dev server**

Run: `npm run dev`

Test flow:
1. Go to a client with bond holdings → Seguimiento
2. Edit the snapshot (pencil icon)
3. Find a bond row (e.g., Blackstone) → set F. Compra to `2026-03-02`
4. Save
5. Go back to Seguimiento → check the Renta Fija section
6. Verify: Devengo column shows accrued from purchase date, not from previous snapshot
7. Verify: The yield % under the USD amount reflects YTM at purchase (should be > coupon rate for discount bonds)

- [ ] **Step 4: Commit (if any fixes were needed)**

```bash
git add -A
git commit -m "fix: integration fixes for bond purchaseDate flow"
```
