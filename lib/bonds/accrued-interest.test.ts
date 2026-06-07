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
    expect(ai).toBeGreaterThan(semiCoupon * 0.95);
    expect(ai).toBeLessThanOrEqual(semiCoupon);
  });
});
