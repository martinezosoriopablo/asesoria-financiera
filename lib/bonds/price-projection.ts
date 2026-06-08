// lib/bonds/price-projection.ts
//
// Generate daily theoretical bond prices using constant-yield method.
// Standard approach: calculate the YTM at the reference (cartola) date,
// then price the bond at every day in the range using the same YTM.
// This captures accrued interest growth and pull-to-par, but NOT yield changes.

import { calcYieldToMaturity } from "./yield";
import { calcAccruedInterest } from "./accrued-interest";
import type { BondParams } from "./types";

interface ProjectionInput {
  faceValue: number;        // par/nominal (e.g. 70000)
  couponRate: number;       // annual %, e.g. 5.4 (NOT decimal)
  maturityDate: string;     // ISO date
  referencePrice: number;   // dirty price as % of par at reference date (e.g. 98.5)
  referenceDate: string;    // cartola date (ISO)
  fromDate: string;         // series start (ISO)
  toDate: string;           // series end (ISO)
  couponFrequency?: number; // default 2 (semi-annual, US corporate standard)
}

interface ProjectedPrice {
  date: string;
  price: number; // price per unit of face value (e.g. 0.985 for 98.5% of par)
}

/**
 * Project daily bond prices using constant-yield assumption.
 * Returns price as fraction of par (multiply by faceValue to get dollar value).
 */
export function projectBondPrices(input: ProjectionInput): ProjectedPrice[] {
  const {
    faceValue,
    couponRate,
    maturityDate,
    referencePrice,
    referenceDate,
    fromDate,
    toDate,
    couponFrequency = 2,
  } = input;

  if (faceValue <= 0 || couponRate < 0) return [];

  const couponDecimal = couponRate / 100;

  // Build BondParams to calculate YTM at reference date
  const bondParams: BondParams = {
    faceValue,
    couponRate: couponDecimal,
    couponFrequency,
    maturityDate,
    purchaseDate: referenceDate,
    purchasePrice: referencePrice,
    currentPrice: referencePrice,
  };

  // Calculate YTM at reference date
  const ytm = calcYieldToMaturity(bondParams, new Date(referenceDate + "T00:00:00"));
  if (isNaN(ytm) || !isFinite(ytm)) {
    // Fallback: flat line at reference price
    return generateFlatSeries(fromDate, toDate, referencePrice / 100);
  }

  const periodicYield = ytm / couponFrequency;
  const monthsPerPeriod = 12 / couponFrequency;
  const couponAmount = faceValue * couponDecimal / couponFrequency;
  const maturity = new Date(maturityDate + "T00:00:00");

  const results: ProjectedPrice[] = [];
  const start = new Date(fromDate + "T00:00:00");
  const end = new Date(toDate + "T00:00:00");

  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    if (d >= maturity) {
      // After maturity, bond is worth par (100%)
      results.push({ date: formatDate(d), price: 1.0 });
      continue;
    }

    // Count remaining coupon periods from this date to maturity
    let N = 0;
    const temp = new Date(maturity);
    while (temp > d) {
      N++;
      temp.setMonth(temp.getMonth() - monthsPerPeriod);
    }

    if (N === 0) {
      results.push({ date: formatDate(d), price: 1.0 });
      continue;
    }

    // Clean price = PV of future cash flows at constant YTM
    let cleanPV = 0;
    for (let i = 1; i <= N; i++) {
      cleanPV += couponAmount / Math.pow(1 + periodicYield, i);
    }
    cleanPV += faceValue / Math.pow(1 + periodicYield, N);

    // Add accrued interest for dirty price
    const accrued = calcAccruedInterest(bondParams, formatDate(d));
    const dirtyValue = cleanPV + accrued;

    // Return as fraction of face value
    results.push({ date: formatDate(d), price: dirtyValue / faceValue });
  }

  return results;
}

function generateFlatSeries(fromDate: string, toDate: string, priceFraction: number): ProjectedPrice[] {
  const results: ProjectedPrice[] = [];
  const start = new Date(fromDate + "T00:00:00");
  const end = new Date(toDate + "T00:00:00");
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    results.push({ date: formatDate(d), price: priceFraction });
  }
  return results;
}

function formatDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
