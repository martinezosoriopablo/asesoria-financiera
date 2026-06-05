// lib/prices/types.ts

export interface PricePoint {
  date: string;       // YYYY-MM-DD
  price: number;      // in original currency
  currency: string;   // 'CLP' | 'USD' | 'EUR'
  source: string;     // 'cmf' | 'alphavantage' | 'yahoo' | 'finra' | 'bcch' | 'fintual'
}

export interface DailyPrice {
  date: string;
  price: number;
}

/** Instrument classification for price routing */
export type PriceSource = 'cmf' | 'alphavantage' | 'yahoo' | 'fintual' | 'finra' | 'bcch' | 'bolsa-santiago' | 'eodhd' | 'cl-adr';

/** Holding as seen in cartola snapshots */
export interface HoldingForPricing {
  fundName: string;
  securityId?: string | null;
  serie?: string;
  quantity?: number;
  marketValue: number;
  marketValueCLP?: number;
  currency?: string;
  market?: 'CL' | 'INT' | 'US' | null;
  assetClass?: string;
  couponRate?: number | null;
  maturityDate?: string | null;
}

/** Benchmark component (stored in clients.benchmark_config JSONB) */
export interface BenchmarkComponent {
  ticker: string;     // e.g. "ACWI", "AGG", "UF"
  weight: number;     // 0-1
  spread?: number;    // annual spread in % (e.g. 2.0 for UF+2%)
}

/** Result of portfolio valuation at a date */
export interface PortfolioValuePoint {
  date: string;
  value: number;      // in CLP
}
