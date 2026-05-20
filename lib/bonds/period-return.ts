// lib/bonds/period-return.ts

interface BondPeriodInput {
  faceValue: number;
  couponRate: number;       // decimal, e.g., 0.05294
  couponFrequency: number;  // 2 for semi-annual
  maturityDate: string;     // ISO date
  purchasePrice: number;    // % of par
  currentPrice: number;     // % of par (at endDate)
  startDate: string;        // ISO date (snapshot A)
  endDate: string;          // ISO date (snapshot B)
  couponOverride?: number;  // advisor-provided coupon amount in USD
}

export interface BondPeriodResult {
  accruedInterest: number;   // USD accrued in the period (30/360)
  priceDiff: number;         // USD price change
  couponsPaid: number;       // USD coupons collected in the period
  couponDates: string[];     // ISO dates of coupons in the period
  totalReturnUSD: number;    // accrued + priceDiff + coupons
  totalReturnPercent: number; // totalReturnUSD / costBasis * 100
  costBasis: number;         // faceValue * purchasePrice / 100
}

/**
 * Calculate bond return between two snapshot dates.
 * Decomposes into: accrued interest + price diff + coupon payments.
 */
export function calcBondPeriodReturn(input: BondPeriodInput): BondPeriodResult {
  const {
    faceValue, couponRate, couponFrequency, maturityDate,
    purchasePrice, currentPrice, startDate, endDate, couponOverride,
  } = input;

  const costBasis = faceValue * purchasePrice / 100;
  const monthsPerPeriod = 12 / couponFrequency;
  const couponAmount = faceValue * couponRate / couponFrequency;

  // --- Accrued interest (30/360) for the period ---
  const days30_360 = (d1: Date, d2: Date): number => {
    const y1 = d1.getFullYear(), m1 = d1.getMonth() + 1, dd1 = Math.min(d1.getDate(), 30);
    const y2 = d2.getFullYear(), m2 = d2.getMonth() + 1;
    let dd2 = Math.min(d2.getDate(), 30);
    if (dd1 >= 30) dd2 = Math.min(dd2, 30);
    return (y2 - y1) * 360 + (m2 - m1) * 30 + (dd2 - dd1);
  };

  const start = new Date(startDate + "T00:00:00");
  const end = new Date(endDate + "T00:00:00");
  const periodDays = days30_360(start, end);
  const dailyRate = couponAmount / (360 / couponFrequency);
  const accruedInterest = dailyRate * periodDays;

  // --- Price difference ---
  const priceDiff = (currentPrice - purchasePrice) / 100 * faceValue;

  // --- Coupons paid in the period ---
  const maturity = new Date(maturityDate + "T00:00:00");
  const couponDates: string[] = [];
  let d = new Date(maturity);
  while (d > start) {
    const dateStr = d.toISOString().split("T")[0];
    if (d > start && d <= end) {
      couponDates.push(dateStr);
    }
    d = new Date(d);
    d.setMonth(d.getMonth() - monthsPerPeriod);
  }
  couponDates.sort();

  const couponsPaid = couponOverride !== undefined
    ? couponOverride
    : couponDates.length * couponAmount;

  // --- Totals ---
  const totalReturnUSD = accruedInterest + priceDiff + couponsPaid;
  const totalReturnPercent = costBasis > 0 ? (totalReturnUSD / costBasis) * 100 : 0;

  return {
    accruedInterest,
    priceDiff,
    couponsPaid,
    couponDates,
    totalReturnUSD,
    totalReturnPercent,
    costBasis,
  };
}
