// lib/bonds/period-return.test.ts
import { describe, it, expect } from "vitest";
import { calcBondPeriodReturn, decomposeBondReturn } from "./period-return";
import { calcYieldToMaturity } from "./yield";

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

/* ------------------------------------------------------------------ */
/*  decomposeBondReturn — exact decomposition (oracle-verified)        */
/* ------------------------------------------------------------------ */

describe("decomposeBondReturn — CASO 3: international with observed FINRA price", () => {
  // Bond: 6% semi-annual, maturity 2030-06-15, face 100
  // Purchase: 2024-06-15, clean 98.00 (purchase YTM ≈ 6.41%)
  // Eval: 2024-12-15, FINRA clean 96.50
  // Both dates are coupon dates → accrued = 0 at both
  // One coupon of 3.00 paid during period
  const input = {
    faceValue: 100,
    couponRate: 0.06,
    couponFrequency: 2,
    maturityDate: "2030-06-15",
    purchaseDate: "2024-06-15",
    purchaseCleanPct: 98.0,
    evalDate: "2024-12-15",
    observedCleanPct: 96.5,
    isChilean: false,
  };

  it("devengo ≈ +3.1393 (theo dirty growth + coupons)", () => {
    const r = decomposeBondReturn(input);
    expect(r.devengoUSD).toBeCloseTo(3.1393, 3);
  });

  it("repricing ≈ -1.6393 (observed clean - theo clean)", () => {
    const r = decomposeBondReturn(input);
    expect(r.repricingUSD).toBeCloseTo(-1.6393, 3);
  });

  it("total ≈ +1.5000 (MV dirty - cost basis dirty + coupons)", () => {
    const r = decomposeBondReturn(input);
    expect(r.totalReturnUSD).toBeCloseTo(1.5, 3);
  });

  it("reconciles: |devengo + repricing - total| < 1e-3", () => {
    const r = decomposeBondReturn(input);
    expect(Math.abs(r.devengoUSD + r.repricingUSD - r.totalReturnUSD)).toBeLessThan(1e-3);
  });

  it("couponsInPeriod = 3.00 (one semi-annual coupon)", () => {
    const r = decomposeBondReturn(input);
    expect(r.couponsInPeriod).toBeCloseTo(3.0, 3);
  });
});

describe("decomposeBondReturn — CASO 1 (legacy): Chilean DCF reprice", () => {
  // These tests use isChilean: true with act/365 annual convention
  // Bond: 3.5% semi-annual, maturity 2032-03-01, face 100
  // Purchase: 2024-03-01, clean 92.50 (purchase YTM ≈ 4.6828% act/365 annual)
  // Eval: 2024-09-01, new yield = purchase YTM + 1%
  // Both dates are coupon dates → accrued = 0

  it("repricing by DCF differs from duration approximation", () => {
    const r = decomposeBondReturn({
      faceValue: 100,
      couponRate: 0.035,
      couponFrequency: 2,
      maturityDate: "2032-03-01",
      purchaseDate: "2024-03-01",
      purchaseCleanPct: 92.50,
      evalDate: "2024-09-01",
      newYield: 0.046828 + 0.01,
      isChilean: true,
    });

    // DCF repricing should be significantly negative
    expect(r.repricingUSD).toBeGreaterThan(-6.5); // less negative than duration approx
    expect(r.repricingUSD).toBeLessThan(-5.0);    // but still significantly negative
  });

  it("reconciles: |devengo + repricing - total| < 1e-3", () => {
    const r = decomposeBondReturn({
      faceValue: 100,
      couponRate: 0.035,
      couponFrequency: 2,
      maturityDate: "2032-03-01",
      purchaseDate: "2024-03-01",
      purchaseCleanPct: 92.50,
      evalDate: "2024-09-01",
      newYield: 0.046828 + 0.01,
      isChilean: true,
    });

    expect(Math.abs(r.devengoUSD + r.repricingUSD - r.totalReturnUSD)).toBeLessThan(1e-3);
  });

  it("coupons = 1.75 (one semi-annual coupon of 3.5%/2 * 100)", () => {
    const r = decomposeBondReturn({
      faceValue: 100,
      couponRate: 0.035,
      couponFrequency: 2,
      maturityDate: "2032-03-01",
      purchaseDate: "2024-03-01",
      purchaseCleanPct: 92.50,
      evalDate: "2024-09-01",
      newYield: 0.046828 + 0.01,
      isChilean: true,
    });

    expect(r.couponsInPeriod).toBeCloseTo(1.75, 3);
  });
});

/* ------------------------------------------------------------------ */
/*  Split day-count conventions (Phase 3)                              */
/* ------------------------------------------------------------------ */

describe("decomposeBondReturn — CASO 1 (Chilean, on coupon date, act/365 annual)", () => {
  // Bond: 3.5% semi-annual, maturity 2032-03-01, face 100
  // Purchase: 2024-03-01, clean 92.50
  // Eval: 2024-09-01, new yield = purchase YTM + 1%
  // Both dates are coupon dates → accrued = 0
  // Chilean convention: discount act/365 annual, accrued 30/360

  it("purchase YTM ≈ 4.6828% (act/365 annual)", () => {
    const r = decomposeBondReturn({
      faceValue: 100,
      couponRate: 0.035,
      couponFrequency: 2,
      maturityDate: "2032-03-01",
      purchaseDate: "2024-03-01",
      purchaseCleanPct: 92.50,
      evalDate: "2024-09-01",
      newYield: 0.046828 + 0.01, // placeholder, will be replaced by actual purchaseYTM + 0.01
      isChilean: true,
    });
    expect(r.purchaseYTM).toBeCloseTo(0.046828, 4);
  });

  it("devengo ≈ +2.1588, repricing ≈ -5.6555, total ≈ -3.4966", () => {
    // We need purchaseYTM first to set newYield = purchaseYTM + 0.01
    // For the test, use the oracle value
    const r = decomposeBondReturn({
      faceValue: 100,
      couponRate: 0.035,
      couponFrequency: 2,
      maturityDate: "2032-03-01",
      purchaseDate: "2024-03-01",
      purchaseCleanPct: 92.50,
      evalDate: "2024-09-01",
      newYield: 0.046828 + 0.01,
      isChilean: true,
    });
    expect(r.devengoUSD).toBeCloseTo(2.1588, 3);
    expect(r.repricingUSD).toBeCloseTo(-5.6555, 3);
    expect(r.totalReturnUSD).toBeCloseTo(-3.4966, 3);
    expect(r.couponsInPeriod).toBeCloseTo(1.75, 3);
  });

  it("reconciles: |devengo + repricing - total| < 1e-3", () => {
    const r = decomposeBondReturn({
      faceValue: 100,
      couponRate: 0.035,
      couponFrequency: 2,
      maturityDate: "2032-03-01",
      purchaseDate: "2024-03-01",
      purchaseCleanPct: 92.50,
      evalDate: "2024-09-01",
      newYield: 0.046828 + 0.01,
      isChilean: true,
    });
    expect(Math.abs(r.devengoUSD + r.repricingUSD - r.totalReturnUSD)).toBeLessThan(1e-3);
  });
});

describe("decomposeBondReturn — CASO 1b (Chilean, mid-period stub, act/365 annual)", () => {
  // Same bond as CASO 1 but eval 2024-06-01 (mid-period, NOT a coupon date)
  // Accrued = 0.8750 (3 months of 6-month coupon = 1.75 * 0.5)
  // No coupons paid in period (purchase 2024-03-01 to eval 2024-06-01)
  // purchaseYTM same as CASO 1 ≈ 4.6828%

  it("devengo ≈ +1.0732, repricing ≈ -5.8012, total ≈ -4.7280", () => {
    const r = decomposeBondReturn({
      faceValue: 100,
      couponRate: 0.035,
      couponFrequency: 2,
      maturityDate: "2032-03-01",
      purchaseDate: "2024-03-01",
      purchaseCleanPct: 92.50,
      evalDate: "2024-06-01",
      newYield: 0.046828 + 0.01,
      isChilean: true,
    });
    expect(r.devengoUSD).toBeCloseTo(1.0732, 3);
    expect(r.repricingUSD).toBeCloseTo(-5.8012, 3);
    expect(r.totalReturnUSD).toBeCloseTo(-4.7280, 3);
    expect(r.couponsInPeriod).toBeCloseTo(0, 3);
  });

  it("reconciles: |devengo + repricing - total| < 1e-3", () => {
    const r = decomposeBondReturn({
      faceValue: 100,
      couponRate: 0.035,
      couponFrequency: 2,
      maturityDate: "2032-03-01",
      purchaseDate: "2024-03-01",
      purchaseCleanPct: 92.50,
      evalDate: "2024-06-01",
      newYield: 0.046828 + 0.01,
      isChilean: true,
    });
    expect(Math.abs(r.devengoUSD + r.repricingUSD - r.totalReturnUSD)).toBeLessThan(1e-3);
  });
});

describe("decomposeBondReturn — CASO 5 (Intl, mid-period stub, 30/360 semi-annual)", () => {
  // Bond: 6% semi-annual, maturity 2030-06-15, face 100
  // Purchase: 2024-06-15, clean 98.00
  // Eval: 2024-09-15 (mid-period — NOT a coupon date)
  // Accrued at eval = 1.50 (3 months of 6-month coupon)
  // No coupons in period (next coupon 2024-12-15)
  // Observed clean = 97.00 → MV_dirty = 97.00 + 1.50 = 98.50

  it("devengo ≈ +1.5573, repricing ≈ -1.0573, total ≈ +0.5000", () => {
    const r = decomposeBondReturn({
      faceValue: 100,
      couponRate: 0.06,
      couponFrequency: 2,
      maturityDate: "2030-06-15",
      purchaseDate: "2024-06-15",
      purchaseCleanPct: 98.0,
      evalDate: "2024-09-15",
      observedCleanPct: 97.0,
      isChilean: false,
    });
    expect(r.devengoUSD).toBeCloseTo(1.5573, 3);
    expect(r.repricingUSD).toBeCloseTo(-1.0573, 3);
    expect(r.totalReturnUSD).toBeCloseTo(0.5, 3);
    expect(r.couponsInPeriod).toBeCloseTo(0, 3);
  });

  it("reconciles: |devengo + repricing - total| < 1e-3", () => {
    const r = decomposeBondReturn({
      faceValue: 100,
      couponRate: 0.06,
      couponFrequency: 2,
      maturityDate: "2030-06-15",
      purchaseDate: "2024-06-15",
      purchaseCleanPct: 98.0,
      evalDate: "2024-09-15",
      observedCleanPct: 97.0,
      isChilean: false,
    });
    expect(Math.abs(r.devengoUSD + r.repricingUSD - r.totalReturnUSD)).toBeLessThan(1e-3);
  });
});

describe("decomposeBondReturn — couponFrequency propagation", () => {
  it("annual (freq=1) vs semi-annual (freq=2) gives different coupons and devengo", () => {
    // Bond maturity 2030-06-15, purchase 2024-06-15, eval 2024-12-15.
    // freq=2: coupon dates Jun-15, Dec-15 → 1 coupon (Dec-15) in period = 3.00
    // freq=1: coupon date only Jun-15 → 0 coupons in period = 0.00
    const base = {
      faceValue: 100,
      couponRate: 0.06,
      maturityDate: "2030-06-15",
      purchaseDate: "2024-06-15",
      purchaseCleanPct: 98.0,
      evalDate: "2024-12-15",
      observedCleanPct: 96.5,
    };

    const semi = decomposeBondReturn({ ...base, couponFrequency: 2, isChilean: false });
    const annual = decomposeBondReturn({ ...base, couponFrequency: 1, isChilean: false });

    // Semi-annual pays a coupon at Dec-15; annual doesn't
    expect(semi.couponsInPeriod).toBeCloseTo(3.0, 3);
    expect(annual.couponsInPeriod).toBeCloseTo(0, 3);

    // Devengo must differ (different YTMs and coupon schedules)
    expect(Math.abs(semi.devengoUSD - annual.devengoUSD)).toBeGreaterThan(0.01);
  });

  it("quarterly bond still reconciles", () => {
    const r = decomposeBondReturn({
      faceValue: 100,
      couponRate: 0.06,
      couponFrequency: 4,
      maturityDate: "2030-06-15",
      purchaseDate: "2024-06-15",
      purchaseCleanPct: 98.0,
      evalDate: "2024-12-15",
      observedCleanPct: 96.5,
      isChilean: false,
    });

    expect(Math.abs(r.devengoUSD + r.repricingUSD - r.totalReturnUSD)).toBeLessThan(1e-3);
  });
});
