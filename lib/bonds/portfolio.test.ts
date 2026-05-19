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
