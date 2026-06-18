// lib/bonds/period-return.ts
import { calcYieldToMaturity } from "./yield";
import { calcAccruedInterest } from "./accrued-interest";
import type { BondParams } from "./types";

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

/* ------------------------------------------------------------------ */
/*  Exact decomposition: devengo + repricing (oracle-verified)         */
/* ------------------------------------------------------------------ */

export interface DecomposeInput {
  faceValue: number;
  couponRate: number;        // decimal, e.g., 0.06
  couponFrequency: number;   // 1, 2, 4
  maturityDate: string;      // ISO date
  purchaseDate: string;      // ISO date
  purchaseCleanPct: number;  // clean price at purchase as % of par
  evalDate: string;          // ISO date
  observedCleanPct?: number; // FINRA clean price (international bonds)
  newYield?: number;         // manual yield (Chilean bonds — DCF reprice)
  isChilean?: boolean;       // true → act/365 annual; false/undefined → 30/360 semi-annual
}

export interface DecomposeResult {
  purchaseYTM: number;       // annual, decimal
  devengoUSD: number;        // exact coupon-to-cash accrual
  repricingUSD: number;      // observed vs theoretical (exact, no duration)
  totalReturnUSD: number;    // (MV_dirty - costBasis_dirty) + coupons
  totalReturnPct: number;    // totalReturnUSD / costBasisDirty * 100
  costBasisDirty: number;    // purchase clean + accrued at purchase
  marketValueDirty: number;
  couponsInPeriod: number;
}

/** Actual/365 day count between two dates. */
function daysAct365(d1: Date, d2: Date): number {
  return Math.round((d2.getTime() - d1.getTime()) / 86400000);
}

/** Generate coupon dates from maturity backward that are strictly after startDate. */
function generateCouponDates(maturityDate: string, couponFrequency: number, startDate: string): Date[] {
  const monthsPerPeriod = 12 / couponFrequency;
  const maturity = new Date(maturityDate + "T00:00:00");
  const start = new Date(startDate + "T00:00:00");
  const dates: Date[] = [];
  const d = new Date(maturity);
  while (d > start) {
    dates.unshift(new Date(d));
    d.setMonth(d.getMonth() - monthsPerPeriod);
  }
  return dates;
}

/**
 * Full PV (= dirty/full price) of remaining cash flows at a given YTM on evalDate.
 * With fractional time, PV from eval to each CF date IS the dirty price.
 *
 * Chilean (isChilean=true): annual compounding, act/365 fractional time
 *   factor = 1 / (1 + TIR)^(days_act365 / 365)
 *
 * International (isChilean=false): semi-annual compounding, 30/360 fractional time
 *   factor = 1 / (1 + y/freq)^(freq * t_30_360)
 */
function fullPriceAtYTM(
  faceValue: number, couponRate: number, couponFrequency: number,
  maturityDate: string, ytmAnnual: number, evalDate: string,
  isChilean = false,
): number {
  const coupon = faceValue * couponRate / couponFrequency;
  const futureDates = generateCouponDates(maturityDate, couponFrequency, evalDate);
  if (futureDates.length === 0) return faceValue;

  const evalD = new Date(evalDate + "T00:00:00");
  let pv = 0;

  if (isChilean) {
    // act/365 annual compounding: DF = 1 / (1 + TIR)^(actualDays / 365)
    for (let i = 0; i < futureDates.length; i++) {
      const days = daysAct365(evalD, futureDates[i]);
      const tau = days / 365;
      const cf = i === futureDates.length - 1 ? coupon + faceValue : coupon;
      pv += cf / Math.pow(1 + ytmAnnual, tau);
    }
  } else {
    // 30/360 semi-annual compounding: DF = 1 / (1 + y/freq)^(freq * t_30_360)
    const y = ytmAnnual / couponFrequency;
    for (let i = 0; i < futureDates.length; i++) {
      const days = days30_360(evalD, futureDates[i]);
      const tau = days / 360; // time in years (30/360)
      const exponent = couponFrequency * tau;
      const cf = i === futureDates.length - 1 ? coupon + faceValue : coupon;
      pv += cf / Math.pow(1 + y, exponent);
    }
  }

  return pv;
}

/** Accrued interest helper for a bond at a given date (always 30/360). */
function accruedAt(
  faceValue: number, couponRate: number, couponFrequency: number,
  maturityDate: string, evalDate: string,
): number {
  const bondParams: BondParams = {
    faceValue, couponRate, couponFrequency, maturityDate,
    purchaseDate: evalDate, purchasePrice: 100, currentPrice: 100,
  };
  return calcAccruedInterest(bondParams, evalDate);
}

/** Clean price = full PV - accrued interest. */
function cleanPriceAtYTM(
  faceValue: number, couponRate: number, couponFrequency: number,
  maturityDate: string, ytmAnnual: number, evalDate: string,
  isChilean = false,
): number {
  const full = fullPriceAtYTM(faceValue, couponRate, couponFrequency, maturityDate, ytmAnnual, evalDate, isChilean);
  const accrued = accruedAt(faceValue, couponRate, couponFrequency, maturityDate, evalDate);
  return full - accrued;
}

/** Dirty price = full PV of remaining cash flows. */
function dirtyPriceAtYTM(
  faceValue: number, couponRate: number, couponFrequency: number,
  maturityDate: string, ytmAnnual: number, evalDate: string,
  isChilean = false,
): number {
  return fullPriceAtYTM(faceValue, couponRate, couponFrequency, maturityDate, ytmAnnual, evalDate, isChilean);
}

/**
 * Convention-aware YTM solver via Newton-Raphson.
 * Chilean: act/365 annual compounding. Intl: 30/360 semi-annual compounding.
 */
function solveYTM(
  faceValue: number, couponRate: number, couponFrequency: number,
  maturityDate: string, cleanPricePct: number, asOfDate: string,
  isChilean: boolean,
): number {
  const marketPrice = faceValue * cleanPricePct / 100;

  const priceFn = (ytm: number) =>
    cleanPriceAtYTM(faceValue, couponRate, couponFrequency, maturityDate, ytm, asOfDate, isChilean);

  // Newton-Raphson
  let y = couponRate; // initial guess
  const h = 1e-7;
  for (let iter = 0; iter < 200; iter++) {
    const p = priceFn(y);
    const dp = (priceFn(y + h) - p) / h;
    if (Math.abs(dp) < 1e-14) break;
    const diff = p - marketPrice;
    if (Math.abs(diff) < 1e-10) break;
    y -= diff / dp;
    if (y <= -1) y = 0.001;
  }
  return y;
}

/** Sum of coupons paid between startDate (exclusive) and endDate (inclusive). */
function couponsInPeriod(
  faceValue: number, couponRate: number, couponFrequency: number,
  maturityDate: string, startDate: string, endDate: string,
): number {
  const coupon = faceValue * couponRate / couponFrequency;
  const monthsPerPeriod = 12 / couponFrequency;
  const maturity = new Date(maturityDate + "T00:00:00");
  const start = new Date(startDate + "T00:00:00");
  const end = new Date(endDate + "T00:00:00");

  // Generate coupon dates by stepping backward from maturity
  const couponDates: Date[] = [];
  const d = new Date(maturity);
  while (d > start) {
    couponDates.unshift(new Date(d));
    d.setMonth(d.getMonth() - monthsPerPeriod);
  }

  let total = 0;
  for (const cd of couponDates) {
    if (cd > start && cd <= end) total += coupon;
  }
  return total;
}

/**
 * Exact bond return decomposition into devengo + repricing.
 *
 * Devengo = (dirty@purchase_ytm,eval - dirty@purchase_ytm,purchase) + coupons_in_period
 *   This captures the time-value earned at the locked-in purchase YTM, with coupons
 *   treated as going to cash (not reinvested in the bond).
 *
 * Repricing (international/observed): observed_clean - theoretical_clean@purchase_ytm
 * Repricing (Chilean/new yield): clean@new_yield - clean@purchase_ytm
 *
 * Identity: devengo + repricing === total (where total = MV_dirty - costBasis_dirty + coupons)
 */
export function decomposeBondReturn(input: DecomposeInput): DecomposeResult {
  const {
    faceValue, couponRate, couponFrequency, maturityDate,
    purchaseDate, purchaseCleanPct, evalDate,
    observedCleanPct, newYield, isChilean = false,
  } = input;

  // Purchase YTM — convention-aware solver
  let purchaseYTM = couponRate; // fallback
  try {
    const ytm = solveYTM(faceValue, couponRate, couponFrequency, maturityDate,
      purchaseCleanPct, purchaseDate, isChilean);
    if (!isNaN(ytm) && ytm > -1) purchaseYTM = ytm;
  } catch { /* keep fallback */ }

  // Cost basis: dirty price at purchase (accrued always 30/360)
  const accruedAtPurchase = accruedAt(faceValue, couponRate, couponFrequency, maturityDate, purchaseDate);
  const costBasisDirty = faceValue * purchaseCleanPct / 100 + accruedAtPurchase;

  // Coupons paid during period
  const coupons = couponsInPeriod(faceValue, couponRate, couponFrequency, maturityDate, purchaseDate, evalDate);

  // Theoretical dirty price at purchase YTM on eval date — convention-aware
  const theoDirtyEval = dirtyPriceAtYTM(faceValue, couponRate, couponFrequency, maturityDate, purchaseYTM, evalDate, isChilean);

  // Devengo: exact coupon-to-cash
  const devengoUSD = (theoDirtyEval - costBasisDirty) + coupons;

  // Theoretical clean at purchase YTM on eval date — convention-aware
  const theoCleanEval = cleanPriceAtYTM(faceValue, couponRate, couponFrequency, maturityDate, purchaseYTM, evalDate, isChilean);

  let repricingUSD: number;
  let marketValueDirty: number;

  if (observedCleanPct != null) {
    // International: observed FINRA clean price
    const accruedAtEval = accruedAt(faceValue, couponRate, couponFrequency, maturityDate, evalDate);
    marketValueDirty = faceValue * observedCleanPct / 100 + accruedAtEval;
    repricingUSD = (observedCleanPct - theoCleanEval / faceValue * 100) * faceValue / 100;
  } else if (newYield != null) {
    // Chilean/DCF: reprice at new yield — convention-aware
    const cleanAtNew = cleanPriceAtYTM(faceValue, couponRate, couponFrequency, maturityDate, newYield, evalDate, isChilean);
    marketValueDirty = dirtyPriceAtYTM(faceValue, couponRate, couponFrequency, maturityDate, newYield, evalDate, isChilean);
    repricingUSD = cleanAtNew - theoCleanEval;
  } else {
    // No observed price and no new yield — no repricing
    marketValueDirty = theoDirtyEval;
    repricingUSD = 0;
  }

  const totalReturnUSD = (marketValueDirty - costBasisDirty) + coupons;
  const totalReturnPct = costBasisDirty > 0 ? (totalReturnUSD / costBasisDirty) * 100 : 0;

  return {
    purchaseYTM,
    devengoUSD,
    repricingUSD,
    totalReturnUSD,
    totalReturnPct,
    costBasisDirty,
    marketValueDirty,
    couponsInPeriod: coupons,
  };
}
