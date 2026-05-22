// lib/bonds/period-return.ts
import { calcYieldToMaturity } from "./yield";

interface BondPeriodInput {
  faceValue: number;
  couponRate: number;       // decimal, e.g., 0.05294
  couponFrequency: number;  // 2 for semi-annual
  maturityDate: string;     // ISO date
  purchasePrice: number;    // % of par
  currentPrice: number;     // % of par (at endDate)
  startDate: string;        // ISO date (snapshot A — fallback accrual start)
  endDate: string;          // ISO date (snapshot B — accrual end)
  purchaseDate?: string;    // ISO date — actual purchase date (advisor-provided)
}

export interface BondPeriodResult {
  devengoUSD: number;          // YTM-based accrual in USD
  devengoPct: number;          // devengo as % of costBasis
  marketDeviationUSD: number;  // market value - theoretical value
  totalReturnUSD: number;      // devengoUSD + marketDeviationUSD
  totalReturnPct: number;      // totalReturnUSD / costBasis * 100
  costBasis: number;           // faceValue * purchasePrice / 100
  purchaseYTM: number;         // annual YTM at purchase (decimal)
}

/** 30/360 day count between two dates */
function days30_360(d1: Date, d2: Date): number {
  const y1 = d1.getFullYear(), m1 = d1.getMonth() + 1, dd1 = Math.min(d1.getDate(), 30);
  const y2 = d2.getFullYear(), m2 = d2.getMonth() + 1;
  let dd2 = Math.min(d2.getDate(), 30);
  if (dd1 >= 30) dd2 = Math.min(dd2, 30);
  return (y2 - y1) * 360 + (m2 - m1) * 30 + (dd2 - dd1);
}

/**
 * Calculate bond return using devengo-only model.
 *
 * Devengo = YTM at purchase * costBasis * days / 360
 * Market deviation = current market value - (costBasis + devengo)
 * Total return = devengo + market deviation
 *
 * No separate coupon tracking — the YTM-based devengo already captures
 * coupon income + pull-to-par. Adding coupons would double-count.
 */
export function calcBondPeriodReturn(input: BondPeriodInput): BondPeriodResult {
  const {
    faceValue, couponRate, couponFrequency, maturityDate,
    purchasePrice, currentPrice, startDate, endDate, purchaseDate,
  } = input;

  const costBasis = faceValue * purchasePrice / 100;

  const start = new Date(startDate + "T00:00:00");
  const end = new Date(endDate + "T00:00:00");

  // Accrual starts from purchaseDate if provided, else startDate
  const accrualStart = purchaseDate
    ? new Date(purchaseDate + "T00:00:00")
    : start;
  const periodDays = days30_360(accrualStart, end);

  // YTM at purchase — reference date is purchaseDate or startDate
  const ytmRefDate = purchaseDate
    ? new Date(purchaseDate + "T00:00:00")
    : start;

  let purchaseYTM = couponRate; // fallback: coupon rate
  try {
    const ytm = calcYieldToMaturity({
      faceValue,
      couponRate,
      couponFrequency,
      maturityDate,
      purchaseDate: purchaseDate || startDate,
      purchasePrice,
      currentPrice: purchasePrice, // solve YTM at purchase price
    }, ytmRefDate);
    if (!isNaN(ytm) && ytm > -1) purchaseYTM = ytm;
  } catch { /* keep fallback */ }

  // Devengo: YTM-based accrual from purchase/start to end
  const devengoUSD = purchaseYTM * costBasis * periodDays / 360;
  const devengoPct = costBasis > 0 ? (devengoUSD / costBasis) * 100 : 0;

  // Market deviation: how much better/worse than YTM prediction
  const marketValue = faceValue * currentPrice / 100;
  const theoreticalValue = costBasis + devengoUSD;
  const marketDeviationUSD = marketValue - theoreticalValue;

  // Totals
  const totalReturnUSD = devengoUSD + marketDeviationUSD;
  const totalReturnPct = costBasis > 0 ? (totalReturnUSD / costBasis) * 100 : 0;

  return {
    devengoUSD,
    devengoPct,
    marketDeviationUSD,
    totalReturnUSD,
    totalReturnPct,
    costBasis,
    purchaseYTM,
  };
}
