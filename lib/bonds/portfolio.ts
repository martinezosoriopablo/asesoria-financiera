// lib/bonds/portfolio.ts
import { RATING_SCALE, RATING_FROM_NUMBER } from "./types";
import type { PortfolioMetrics } from "./types";

export function ratingToNumber(rating: string): number {
  return RATING_SCALE[rating.toUpperCase()] ?? 0;
}

export function numberToRating(n: number): string {
  const rounded = Math.round(n);
  return RATING_FROM_NUMBER[rounded] ?? "NR";
}

interface BondForMetrics {
  marketValue: number;
  duration: number;
  ytm: number;
  annualIncome: number;
  ratingNumeric: number;
}

export function calcWeightedMetrics(bonds: BondForMetrics[]): PortfolioMetrics {
  if (bonds.length === 0) {
    return {
      totalMarketValue: 0,
      weightedDuration: 0,
      weightedYield: 0,
      totalAnnualIncome: 0,
      weightedRating: "NR",
      weightedRatingNumeric: 0,
    };
  }

  const totalMV = bonds.reduce((s, b) => s + b.marketValue, 0);
  if (totalMV === 0) {
    return {
      totalMarketValue: 0,
      weightedDuration: 0,
      weightedYield: 0,
      totalAnnualIncome: bonds.reduce((s, b) => s + b.annualIncome, 0),
      weightedRating: "NR",
      weightedRatingNumeric: 0,
    };
  }

  const weightedDuration = bonds.reduce((s, b) => s + b.marketValue * b.duration, 0) / totalMV;
  const weightedYield = bonds.reduce((s, b) => s + b.marketValue * b.ytm, 0) / totalMV;
  const totalAnnualIncome = bonds.reduce((s, b) => s + b.annualIncome, 0);

  const ratedBonds = bonds.filter(b => b.ratingNumeric > 0);
  const ratedMV = ratedBonds.reduce((s, b) => s + b.marketValue, 0);
  const weightedRatingNum = ratedMV > 0
    ? ratedBonds.reduce((s, b) => s + b.marketValue * b.ratingNumeric, 0) / ratedMV
    : 0;

  return {
    totalMarketValue: totalMV,
    weightedDuration,
    weightedYield,
    totalAnnualIncome,
    weightedRating: numberToRating(weightedRatingNum),
    weightedRatingNumeric: weightedRatingNum,
  };
}
