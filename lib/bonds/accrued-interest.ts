// lib/bonds/accrued-interest.ts
import type { BondParams } from "./types";

/**
 * Calculate accrued interest using 30/360 day count convention.
 * Standard for US corporate bonds.
 */
export function calcAccruedInterest(bond: BondParams, settleDateStr: string): number {
  const { faceValue, couponRate, couponFrequency, maturityDate } = bond;
  const couponAmount = faceValue * couponRate / couponFrequency;
  const monthsPerPeriod = 12 / couponFrequency;

  const settle = new Date(settleDateStr + "T00:00:00");
  const maturity = new Date(maturityDate + "T00:00:00");

  // Find the last coupon date on or before settle
  const prevCoupon = new Date(maturity);
  while (prevCoupon > settle) {
    prevCoupon.setMonth(prevCoupon.getMonth() - monthsPerPeriod);
  }

  // Next coupon date
  const nextCoupon = new Date(prevCoupon);
  nextCoupon.setMonth(nextCoupon.getMonth() + monthsPerPeriod);

  // 30/360 day count
  const days30_360 = (d1: Date, d2: Date): number => {
    const y1 = d1.getFullYear(), m1 = d1.getMonth() + 1, dd1 = Math.min(d1.getDate(), 30);
    const y2 = d2.getFullYear(), m2 = d2.getMonth() + 1;
    let dd2 = Math.min(d2.getDate(), 30);
    if (dd1 >= 30) dd2 = Math.min(dd2, 30);
    return (y2 - y1) * 360 + (m2 - m1) * 30 + (dd2 - dd1);
  };

  const daysSinceCoupon = days30_360(prevCoupon, settle);
  const totalDays = days30_360(prevCoupon, nextCoupon);

  if (totalDays <= 0) return 0;

  return couponAmount * (daysSinceCoupon / totalDays);
}
