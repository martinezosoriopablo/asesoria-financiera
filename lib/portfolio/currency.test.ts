import { describe, it, expect } from "vitest";
import { toCLP, fromCLP } from "./currency";

const rates = { usd: 950, eur: 1020, uf: 38000 };

describe("toCLP", () => {
  it("converts USD to CLP", () => expect(toCLP(100, "USD", rates)).toBe(95000));
  it("converts EUR to CLP", () => expect(toCLP(100, "EUR", rates)).toBe(102000));
  it("converts UF to CLP", () => expect(toCLP(1, "UF", rates)).toBe(38000));
  it("returns CLP as-is", () => expect(toCLP(1000, "CLP", rates)).toBe(1000));
  it("returns value if unknown currency", () => expect(toCLP(100, "GBP", rates)).toBe(100));
});

describe("fromCLP", () => {
  it("converts CLP to USD", () => expect(fromCLP(95000, "USD", rates)).toBeCloseTo(100));
  it("converts CLP to EUR", () => expect(fromCLP(102000, "EUR", rates)).toBeCloseTo(100));
  it("converts CLP to UF", () => expect(fromCLP(38000, "UF", rates)).toBeCloseTo(1));
  it("returns CLP as-is", () => expect(fromCLP(1000, "CLP", rates)).toBe(1000));
});
