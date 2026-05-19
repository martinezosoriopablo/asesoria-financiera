// lib/bonds/yield.ts
import type { BondParams } from "./types";

/**
 * Calculate Yield to Maturity using Newton-Raphson.
 * Uses currentPrice to solve: price = sum(CF_i / (1 + y/freq)^i)
 * Returns annual yield as decimal (e.g., 0.057 = 5.7%).
 */
export function calcYieldToMaturity(bond: BondParams): number {
  const { faceValue, couponRate, couponFrequency, maturityDate, currentPrice } = bond;

  if (faceValue <= 0 || couponFrequency <= 0) return NaN;

  const coupon = faceValue * couponRate / couponFrequency;
  const monthsPerPeriod = 12 / couponFrequency;

  // Count periods from now to maturity
  const maturity = new Date(maturityDate + "T00:00:00");
  const now = new Date();
  now.setHours(0, 0, 0, 0);

  if (maturity <= now) return NaN;

  // Count remaining coupon dates
  let d = new Date(maturity);
  let N = 0;
  while (d > now) {
    N++;
    d = new Date(d);
    d.setMonth(d.getMonth() - monthsPerPeriod);
  }

  if (N === 0) return NaN;

  const marketPrice = currentPrice / 100 * faceValue;

  // Price as function of periodic yield y:
  // P(y) = sum(coupon/(1+y)^i) + faceValue/(1+y)^N

  function price(y: number): number {
    let pv = 0;
    for (let i = 1; i <= N; i++) {
      pv += coupon / Math.pow(1 + y, i);
    }
    pv += faceValue / Math.pow(1 + y, N);
    return pv;
  }

  function dPrice(y: number): number {
    let dpv = 0;
    for (let i = 1; i <= N; i++) {
      dpv -= i * coupon / Math.pow(1 + y, i + 1);
    }
    dpv -= N * faceValue / Math.pow(1 + y, N + 1);
    return dpv;
  }

  // Newton-Raphson
  let y = couponRate / couponFrequency; // initial guess: coupon rate per period
  for (let iter = 0; iter < 100; iter++) {
    const p = price(y);
    const dp = dPrice(y);
    if (Math.abs(dp) < 1e-12) break;
    const diff = p - marketPrice;
    if (Math.abs(diff) < 0.0001) break;
    y = y - diff / dp;
    if (y <= -1) y = 0.001; // guard against divergence
  }

  // Convert periodic yield to annual
  return y * couponFrequency;
}
