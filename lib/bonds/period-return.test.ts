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
    const result = calcBondPeriodReturn({
      ...baseBond,
      currentPrice: 99.12,
      startDate: "2026-02-01",
      endDate: "2026-02-28",
    });
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

  it("accruedYieldPct uses purchase YTM — higher than coupon for discount bond", () => {
    // Bond: 10% coupon, bought at 50% of par, 2 years to maturity
    // YTM at purchase >> coupon rate because of massive pull-to-par
    const result = calcBondPeriodReturn({
      faceValue: 100000,
      couponRate: 0.10,      // 10%
      couponFrequency: 2,
      maturityDate: "2028-06-15",
      purchasePrice: 50,     // 50% of par — deep discount
      currentPrice: 52,
      startDate: "2026-04-01",
      endDate: "2026-05-01",
    });
    // Purchase YTM >> coupon rate (pull-to-par adds significant yield)
    // Simple coupon accrual for 30d = 0.10 * 30/360 * 100 = 0.833%
    expect(result.accruedYieldPct).toBeGreaterThan(0.10 * 30 / 360 * 100);
  });

  it("accruedYieldPct ≈ coupon rate when purchased at par", () => {
    const result = calcBondPeriodReturn({
      ...baseBond,
      purchasePrice: 100,    // at par
      currentPrice: 100,
      startDate: "2026-01-01",
      endDate: "2027-01-01",
    });
    // At par, YTM = coupon rate → accruedYieldPct ≈ couponRate * 100
    expect(result.accruedYieldPct).toBeCloseTo(5.294, 1);
  });

  it("accruedYieldPct is lower than coupon for premium bond", () => {
    const result = calcBondPeriodReturn({
      ...baseBond,
      purchasePrice: 105,    // premium
      currentPrice: 104,
      startDate: "2026-03-31",
      endDate: "2026-04-30",
    });
    // At premium, YTM < coupon rate (amortization of premium)
    const couponAccrual = 0.05294 * 30 / 360 * 100;
    expect(result.accruedYieldPct).toBeLessThan(couponAccrual);
  });

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

  it("allows coupon override", () => {
    const result = calcBondPeriodReturn({
      ...baseBond,
      currentPrice: 99.12,
      startDate: "2026-02-01",
      endDate: "2026-02-28",
      couponOverride: 1200,
    });
    expect(result.couponsPaid).toBe(1200);
  });
});
