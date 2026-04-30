import { describe, it, expect } from "vitest";
import {
  positionReturn,
  annualizeReturn,
  portfolioReturn,
  periodicReturns,
  formatReturnDisplay,
  daysBetween,
  monthsAgo,
} from "./calculator";

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

describe("daysBetween", () => {
  it("returns correct days between two dates", () => {
    expect(daysBetween("2025-01-01", "2025-01-31")).toBe(30);
  });

  it("works with Date objects", () => {
    expect(daysBetween(new Date("2025-01-01"), new Date("2025-12-31"))).toBe(364);
  });

  it("returns 0 for the same date", () => {
    expect(daysBetween("2025-06-15", "2025-06-15")).toBe(0);
  });
});

describe("monthsAgo", () => {
  it("subtracts months correctly", () => {
    const result = monthsAgo("2025-06-15", 3);
    expect(result.getFullYear()).toBe(2025);
    expect(result.getMonth()).toBe(2); // March = 2
  });

  it("crosses year boundary", () => {
    const result = monthsAgo("2025-02-15", 6);
    expect(result.getFullYear()).toBe(2024);
    expect(result.getMonth()).toBe(7); // August = 7
  });
});

/* ------------------------------------------------------------------ */
/*  positionReturn                                                     */
/* ------------------------------------------------------------------ */

describe("positionReturn", () => {
  it("calculates a simple 10% gain", () => {
    expect(positionReturn(100, 110)).toBeCloseTo(0.1);
  });

  it("calculates a 10% loss", () => {
    expect(positionReturn(100, 90)).toBeCloseTo(-0.1);
  });

  it("returns 0 when initial price is zero", () => {
    expect(positionReturn(0, 50)).toBe(0);
  });

  it("returns 0 when initial price is negative", () => {
    expect(positionReturn(-10, 50)).toBe(0);
  });

  it("returns 0 when prices are equal", () => {
    expect(positionReturn(100, 100)).toBeCloseTo(0);
  });
});

/* ------------------------------------------------------------------ */
/*  annualizeReturn                                                    */
/* ------------------------------------------------------------------ */

describe("annualizeReturn", () => {
  it("does NOT annualize when days < 365", () => {
    const result = annualizeReturn(0.05, 180);
    expect(result.value).toBeCloseTo(0.05);
    expect(result.isAnnualized).toBe(false);
  });

  it("annualizes when days >= 365", () => {
    // 21% over 730 days => (1.21)^(365/730) - 1 = ~10%
    const result = annualizeReturn(0.21, 730);
    expect(result.isAnnualized).toBe(true);
    expect(result.value).toBeCloseTo(0.1, 1);
  });

  it("annualizes exactly at 365 days (same as simple)", () => {
    const result = annualizeReturn(0.08, 365);
    expect(result.isAnnualized).toBe(true);
    expect(result.value).toBeCloseTo(0.08);
  });

  it("handles 0 days without error", () => {
    const result = annualizeReturn(0.05, 0);
    expect(result.value).toBeCloseTo(0.05);
    expect(result.isAnnualized).toBe(false);
  });

  it("handles negative returns", () => {
    const result = annualizeReturn(-0.1, 730);
    expect(result.isAnnualized).toBe(true);
    expect(result.value).toBeLessThan(0);
  });
});

/* ------------------------------------------------------------------ */
/*  portfolioReturn                                                    */
/* ------------------------------------------------------------------ */

describe("portfolioReturn", () => {
  it("computes weighted average", () => {
    const result = portfolioReturn([
      { weight: 0.6, returnValue: 0.1 },
      { weight: 0.4, returnValue: 0.05 },
    ]);
    // 0.6*0.1 + 0.4*0.05 = 0.08
    expect(result).toBeCloseTo(0.08);
  });

  it("returns 0 for empty positions", () => {
    expect(portfolioReturn([])).toBe(0);
  });

  it("handles single position", () => {
    expect(portfolioReturn([{ weight: 1, returnValue: 0.15 }])).toBeCloseTo(0.15);
  });
});

/* ------------------------------------------------------------------ */
/*  periodicReturns                                                    */
/* ------------------------------------------------------------------ */

describe("periodicReturns", () => {
  it("returns all periods for a long-lived position", () => {
    const positions = [
      {
        initialPrice: 1000,
        currentPrice: 1100,
        initialDate: "2024-01-01",
        currentDate: "2026-04-30",
        weight: 1,
      },
    ];
    const results = periodicReturns(positions, "2026-04-30");

    // Should have 6 period results
    expect(results).toHaveLength(6);

    // All should have a result (position old enough for all periods)
    results.forEach((r) => {
      expect(r.result).not.toBeNull();
    });

    // "Inicio" should be annualized (> 1 year since 2024-01-01)
    const inicio = results.find((r) => r.label === "Inicio");
    expect(inicio?.result?.isAnnualized).toBe(true);
  });

  it("returns null for periods where position is too young", () => {
    const positions = [
      {
        initialPrice: 1000,
        currentPrice: 1050,
        initialDate: "2026-03-15", // only ~6 weeks old relative to 2026-04-30
        currentDate: "2026-04-30",
        weight: 1,
      },
    ];
    const results = periodicReturns(positions, "2026-04-30");

    // 1M: monthsAgo(Apr 30, 1) = Mar 30 => initialDate Mar 15 < Mar 30 => old enough => result
    const oneMonth = results.find((r) => r.label === "1M");
    expect(oneMonth?.result).not.toBeNull();

    // 3M: monthsAgo(Apr 30, 3) = Jan 30 => initialDate Mar 15 > Jan 30 => too young => null
    const threeMonth = results.find((r) => r.label === "3M");
    expect(threeMonth?.result).toBeNull();

    // 12M should also be null
    const twelveMonth = results.find((r) => r.label === "12M");
    expect(twelveMonth?.result).toBeNull();
  });

  it("short periods are not annualized", () => {
    const positions = [
      {
        initialPrice: 1000,
        currentPrice: 1050,
        initialDate: "2025-01-01",
        currentDate: "2026-04-30",
        weight: 1,
      },
    ];
    const results = periodicReturns(positions, "2026-04-30");

    const oneMonth = results.find((r) => r.label === "1M");
    expect(oneMonth?.result?.isAnnualized).toBe(false);
  });
});

/* ------------------------------------------------------------------ */
/*  formatReturnDisplay                                                */
/* ------------------------------------------------------------------ */

describe("formatReturnDisplay", () => {
  it("formats positive simple return", () => {
    expect(formatReturnDisplay({ value: 0.032, isAnnualized: false })).toBe("3.2%");
  });

  it("formats negative simple return", () => {
    expect(formatReturnDisplay({ value: -0.05, isAnnualized: false })).toBe("-5.0%");
  });

  it("formats annualized return with suffix", () => {
    expect(formatReturnDisplay({ value: 0.081, isAnnualized: true })).toBe("8.1% anual");
  });

  it("formats zero return", () => {
    expect(formatReturnDisplay({ value: 0, isAnnualized: false })).toBe("0.0%");
  });
});
