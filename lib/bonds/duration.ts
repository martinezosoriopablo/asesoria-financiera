// lib/bonds/duration.ts
import type { BondParams } from "./types";
import { calcYieldToMaturity } from "./yield";

/**
 * Macaulay Duration: weighted average time of cash flows.
 * Returns duration in years.
 */
export function calcMacaulayDuration(bond: BondParams): number {
  const { faceValue, couponRate, couponFrequency, maturityDate } = bond;
  const coupon = faceValue * couponRate / couponFrequency;
  const monthsPerPeriod = 12 / couponFrequency;

  const ytm = calcYieldToMaturity(bond);
  if (Number.isNaN(ytm)) return 0;
  const y = ytm / couponFrequency; // periodic yield

  const maturity = new Date(maturityDate + "T00:00:00");
  const now = new Date();
  now.setHours(0, 0, 0, 0);

  // Count remaining periods
  const couponDates: Date[] = [];
  let d = new Date(maturity);
  while (d > now) {
    couponDates.unshift(new Date(d));
    d = new Date(d);
    d.setMonth(d.getMonth() - monthsPerPeriod);
  }

  if (couponDates.length === 0) return 0;

  let pvTotal = 0;
  let weightedTime = 0;

  couponDates.forEach((date, idx) => {
    const i = idx + 1;
    const isLast = idx === couponDates.length - 1;
    const cf = isLast ? coupon + faceValue : coupon;
    const pv = cf / Math.pow(1 + y, i);
    const timeInYears = i / couponFrequency;

    pvTotal += pv;
    weightedTime += timeInYears * pv;
  });

  return pvTotal > 0 ? weightedTime / pvTotal : 0;
}

/**
 * Modified Duration = Macaulay / (1 + YTM/freq)
 */
export function calcModifiedDuration(bond: BondParams): number {
  const mac = calcMacaulayDuration(bond);
  const ytm = calcYieldToMaturity(bond);
  if (Number.isNaN(ytm)) return 0;
  return mac / (1 + ytm / bond.couponFrequency);
}
