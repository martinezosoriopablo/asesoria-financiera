// lib/bonds/cash-flows.test.ts
import { describe, it, expect } from "vitest";
import { generateCashFlows } from "./cash-flows";
import type { BondParams } from "./types";

const arcelormittal: BondParams = {
  faceValue: 70000,
  couponRate: 0.06,
  couponFrequency: 2,
  maturityDate: "2034-06-17",
  purchaseDate: "2024-01-15",
  purchasePrice: 102.6525,
  currentPrice: 105.3431,
};

describe("generateCashFlows", () => {
  it("generates correct number of flows for a semiannual bond", () => {
    const flows = generateCashFlows(arcelormittal);
    // From purchase 2024-01-15 to maturity 2034-06-17:
    // First coupon after purchase: 2024-06-17
    // Last coupon: 2034-06-17 (with principal)
    // ~21 semiannual periods (Jun and Dec from 2024-06 to 2034-06)
    expect(flows.length).toBe(21);
  });

  it("marks last flow as coupon+principal", () => {
    const flows = generateCashFlows(arcelormittal);
    const last = flows[flows.length - 1];
    expect(last.type).toBe("coupon+principal");
    expect(last.amount).toBe(70000 + 2100); // principal + semiannual coupon
    expect(last.date).toBe("2034-06-17");
  });

  it("calculates correct semiannual coupon amount", () => {
    const flows = generateCashFlows(arcelormittal);
    const couponOnly = flows.filter(f => f.type === "coupon");
    // Each semiannual coupon = 70000 * 0.06 / 2 = 2100
    expect(couponOnly[0].amount).toBe(2100);
  });

  it("marks past coupons as collected", () => {
    const flows = generateCashFlows(arcelormittal);
    const collected = flows.filter(f => f.status === "collected");
    // All flows with date <= today should be collected
    const today = new Date().toISOString().split("T")[0];
    collected.forEach(f => {
      expect(f.date <= today).toBe(true);
    });
  });

  it("cumulative amount increases monotonically", () => {
    const flows = generateCashFlows(arcelormittal);
    for (let i = 1; i < flows.length; i++) {
      expect(flows[i].cumulativeAmount).toBeGreaterThan(flows[i - 1].cumulativeAmount);
    }
  });

  it("handles annual coupon frequency", () => {
    const annual: BondParams = {
      ...arcelormittal,
      couponFrequency: 1,
    };
    const flows = generateCashFlows(annual);
    // Annual from 2024-06-17 to 2034-06-17 = 11 flows
    expect(flows.length).toBe(11);
    expect(flows[0].amount).toBe(4200); // annual coupon = 70000 * 0.06
  });

  it("handles quarterly coupon frequency", () => {
    const quarterly: BondParams = {
      ...arcelormittal,
      couponFrequency: 4,
    };
    const flows = generateCashFlows(quarterly);
    // Quarterly = ~42 flows
    const couponAmount = 70000 * 0.06 / 4; // 1050
    expect(flows[0].amount).toBe(couponAmount);
  });
});
