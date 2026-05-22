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
