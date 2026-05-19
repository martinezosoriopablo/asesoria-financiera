// lib/bonds/types.ts

export interface BondParams {
  faceValue: number;        // e.g., 70000
  couponRate: number;       // annual, decimal, e.g., 0.06
  couponFrequency: number;  // payments per year: 1, 2, 4, 12
  maturityDate: string;     // ISO date "2034-06-17"
  purchaseDate: string;     // ISO date "2024-01-15"
  purchasePrice: number;    // % of par, e.g., 102.65
  currentPrice: number;     // % of par, e.g., 105.34
}

export interface CashFlow {
  date: string;             // ISO date
  type: "coupon" | "principal" | "coupon+principal";
  amount: number;           // USD
  cumulativeAmount: number; // running total
  status: "collected" | "pending";
}

export interface BondMetrics {
  macaulayDuration: number;
  modifiedDuration: number;
  yieldToMaturity: number;     // annual, decimal
  accruedInterest: number;     // USD
  totalCouponCollected: number;
  totalCouponPending: number;
  totalCashFlows: number;
}

export interface BondHolding {
  // From parsed cartola
  fundName: string;
  cusip: string;
  couponRate: number;          // annual %, e.g., 6.0
  maturityDate: string;        // ISO date
  creditRating: string;        // e.g., "BBB"
  bondType: string;            // "corporate" | "sovereign" | "agency" | "municipal"
  faceValue: number;           // par/nominal
  unitCost: number;            // purchase price as % of par
  costBasis: number;           // total cost USD
  currentPrice: number;        // current price as % of par
  marketValue: number;         // current market value USD
  unrealizedGainLoss: number;
  estIncomeYield: number;      // %
  estAnnualIncome: number;     // USD
  currency: string;
  // From bond_overrides (editable)
  purchaseDate?: string;       // ISO date, editable by advisor
  couponFrequency?: number;    // payments per year, default 2
  issuer?: string;             // short issuer name
}

export interface PortfolioMetrics {
  totalMarketValue: number;
  weightedDuration: number;
  weightedYield: number;
  totalAnnualIncome: number;
  weightedRating: string;
  weightedRatingNumeric: number;
}

// S&P rating scale: lower number = better rating
export const RATING_SCALE: Record<string, number> = {
  "AAA": 1, "AA+": 2, "AA": 3, "AA-": 4,
  "A+": 5, "A": 6, "A-": 7,
  "BBB+": 8, "BBB": 9, "BBB-": 10,
  "BB+": 11, "BB": 12, "BB-": 13,
  "B+": 14, "B": 15, "B-": 16,
  "CCC+": 17, "CCC": 18, "CCC-": 19,
  "CC": 20, "C": 21, "D": 22,
};

export const RATING_FROM_NUMBER: Record<number, string> = Object.fromEntries(
  Object.entries(RATING_SCALE).map(([k, v]) => [v, k])
);
