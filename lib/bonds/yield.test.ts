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
      currentPrice: 96.50,
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
