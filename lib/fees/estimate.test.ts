import { describe, it, expect } from "vitest";
import { estimateAnnualRevenue } from "./estimate";

describe("estimateAnnualRevenue", () => {
  it("advisory + rebate sobre la base", () => {
    expect(estimateAnnualRevenue({ advisory_fee_pct: 1, rebate_pct: 0.5 }, 100_000_000)).toBe(1_500_000);
  });
  it("solo advisory", () => {
    expect(estimateAnnualRevenue({ advisory_fee_pct: 0.8, rebate_pct: null }, 50_000_000)).toBe(400_000);
  });
  it("solo rebate", () => {
    expect(estimateAnnualRevenue({ rebate_pct: 1 }, 10_000_000)).toBe(100_000);
  });
  it("sin porcentajes → null", () => {
    expect(estimateAnnualRevenue({ advisory_fee_pct: 0, rebate_pct: 0 }, 100)).toBeNull();
  });
  it("base 0 o null → null", () => {
    expect(estimateAnnualRevenue({ advisory_fee_pct: 1 }, 0)).toBeNull();
    expect(estimateAnnualRevenue({ advisory_fee_pct: 1 }, null)).toBeNull();
  });
});
