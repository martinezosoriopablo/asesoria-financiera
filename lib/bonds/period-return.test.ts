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
