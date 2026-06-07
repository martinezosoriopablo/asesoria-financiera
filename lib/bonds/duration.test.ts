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
