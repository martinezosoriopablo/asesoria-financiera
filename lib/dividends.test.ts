// lib/dividends.test.ts
import { describe, it, expect } from "vitest";
import { calcDividendsInPeriod } from "./alphavantage-dividends";

describe("calcDividendsInPeriod", () => {
  const events = [
    { ex_dividend_date: "2026-02-15", amount: 0.65 },
    { ex_dividend_date: "2026-03-20", amount: 0.70 },
    { ex_dividend_date: "2026-04-12", amount: 0.68 },
    { ex_dividend_date: "2026-05-18", amount: 0.72 },
  ];

  it("returns only events within the date range", () => {
    const result = calcDividendsInPeriod(events, "2026-03-01", "2026-04-30", 100);
    expect(result.events).toHaveLength(2);
    expect(result.events[0].amount).toBe(0.70);
    expect(result.events[1].amount).toBe(0.68);
  });

  it("calculates total dividend amount using quantity", () => {
    const result = calcDividendsInPeriod(events, "2026-03-01", "2026-04-30", 180);
    expect(result.totalAmount).toBeCloseTo(248.40, 2);
  });

  it("returns zero for empty range", () => {
    const result = calcDividendsInPeriod(events, "2026-06-01", "2026-06-30", 100);
    expect(result.events).toHaveLength(0);
    expect(result.totalAmount).toBe(0);
  });

  it("excludes start date, includes end date", () => {
    const result = calcDividendsInPeriod(events, "2026-03-20", "2026-04-12", 100);
    expect(result.events).toHaveLength(1);
    expect(result.events[0].ex_dividend_date).toBe("2026-04-12");
  });

  it("calculates dividend yield from market value", () => {
    const result = calcDividendsInPeriod(events, "2026-03-01", "2026-04-30", 180);
    expect(result.yieldPercent(50000)).toBeCloseTo(0.4968, 2);
  });
});
