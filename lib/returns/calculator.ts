// Pure-function returns calculator — single source of truth for all return calculations.
// Business rules:
//   - Periods < 1 year  => simple return, NEVER annualize
//   - Periods >= 1 year => ALWAYS annualize via (1+r)^(365/days) - 1

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface AnnualizedResult {
  value: number;
  isAnnualized: boolean;
}

export interface Position {
  weight: number;
  returnValue: number;
}

export interface PositionWithDates {
  initialPrice: number;
  currentPrice: number;
  initialDate: string; // ISO date string (YYYY-MM-DD)
  currentDate: string;
  weight: number;
}

export interface PeriodResult {
  label: string;
  result: AnnualizedResult | null; // null when position is younger than the period
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

/** Number of calendar days between two dates (absolute). */
export function daysBetween(start: Date | string, end: Date | string): number {
  const s = typeof start === "string" ? new Date(start) : start;
  const e = typeof end === "string" ? new Date(end) : end;
  const ms = Math.abs(e.getTime() - s.getTime());
  return Math.round(ms / (1000 * 60 * 60 * 24));
}

/** Return a Date that is `months` months before `date`. */
export function monthsAgo(date: Date | string, months: number): Date {
  const d = typeof date === "string" ? new Date(date) : new Date(date.getTime());
  d.setMonth(d.getMonth() - months);
  return d;
}

/* ------------------------------------------------------------------ */
/*  Core functions                                                     */
/* ------------------------------------------------------------------ */

/** Simple return: (Pfinal / Pinicial) - 1.  Returns 0 if initialPrice <= 0. */
export function positionReturn(initialPrice: number, finalPrice: number): number {
  if (initialPrice <= 0) return 0;
  return finalPrice / initialPrice - 1;
}

/**
 * Conditionally annualize a simple return.
 *  - days < 365 => return as-is (simple)
 *  - days >= 365 => annualize: (1 + r)^(365/days) - 1
 */
export function annualizeReturn(
  simpleReturn: number,
  days: number,
): AnnualizedResult {
  if (days < 365) {
    return { value: simpleReturn, isAnnualized: false };
  }
  // Guard: returns <= -100% would produce NaN via negative base exponentiation
  if (simpleReturn <= -1) {
    return { value: -1, isAnnualized: true };
  }
  const annualized = Math.pow(1 + simpleReturn, 365 / days) - 1;
  return { value: annualized, isAnnualized: true };
}

/** Weighted-average portfolio return: sum(w_i * r_i). */
export function portfolioReturn(positions: Position[]): number {
  if (positions.length === 0) return 0;
  return positions.reduce((acc, p) => acc + p.weight * p.returnValue, 0);
}

/* ------------------------------------------------------------------ */
/*  Periodic returns                                                   */
/* ------------------------------------------------------------------ */

const PERIOD_DEFS: { label: string; months: number | null }[] = [
  { label: "1M", months: 1 },
  { label: "3M", months: 3 },
  { label: "6M", months: 6 },
  { label: "12M", months: 12 },
  { label: "YTD", months: null }, // special
  { label: "Inicio", months: null }, // since inception
];

/**
 * Calculate returns for standard periods (1M, 3M, 6M, 12M, YTD, since inception).
 *
 * For each period, if *any* position is younger than the period start date,
 * that period returns null.
 *
 * Each position contributes its weighted simple return over the period;
 * the result is then conditionally annualized.
 */
export function periodicReturns(
  positions: PositionWithDates[],
  asOfDate: Date | string,
): PeriodResult[] {
  if (positions.length === 0) {
    return PERIOD_DEFS.map((def) => ({ label: def.label, result: null }));
  }

  const asOf = typeof asOfDate === "string" ? new Date(asOfDate) : asOfDate;

  return PERIOD_DEFS.map((def) => {
    let periodStart: Date;

    if (def.label === "YTD") {
      periodStart = new Date(asOf.getFullYear(), 0, 1); // Jan 1 of current year
    } else if (def.label === "Inicio") {
      // Earliest initialDate among positions
      const earliest = positions.reduce((min, p) => {
        const d = new Date(p.initialDate);
        return d < min ? d : min;
      }, new Date(positions[0]?.initialDate ?? asOf));
      periodStart = earliest;
    } else {
      periodStart = monthsAgo(asOf, def.months!);
    }

    // Check if any position is younger than the period start
    const allOldEnough = positions.every(
      (p) => new Date(p.initialDate) <= periodStart,
    );

    if (!allOldEnough) {
      return { label: def.label, result: null };
    }

    // Compute weighted portfolio return for the period
    const simpleRet = portfolioReturn(
      positions.map((p) => ({
        weight: p.weight,
        returnValue: positionReturn(p.initialPrice, p.currentPrice),
      })),
    );

    const days = daysBetween(periodStart, asOf);
    const result = annualizeReturn(simpleRet, days);

    return { label: def.label, result };
  });
}

/* ------------------------------------------------------------------ */
/*  Formatting                                                         */
/* ------------------------------------------------------------------ */

/** Format for UI display: "3.2%" or "8.1% anual". */
export function formatReturnDisplay(result: AnnualizedResult): string {
  const pct = (result.value * 100).toFixed(1);
  return result.isAnnualized ? `${pct}% anual` : `${pct}%`;
}
