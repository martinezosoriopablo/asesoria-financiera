import { describe, it, expect } from "vitest";
import { toCLP, fromCLP, isCurrencyCode } from "./currency";

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

describe("isCurrencyCode", () => {
  it("detecta códigos de moneda (case-insensitive)", () => {
    expect(isCurrencyCode("USD")).toBe(true);
    expect(isCurrencyCode("usd")).toBe(true);
    expect(isCurrencyCode(" EUR ")).toBe(true);
    expect(isCurrencyCode("UF")).toBe(true);
    expect(isCurrencyCode("CLP")).toBe(true);
  });
  it("no marca tickers/RUN reales como moneda", () => {
    expect(isCurrencyCode("AAPL")).toBe(false); // ticker
    expect(isCurrencyCode("8336")).toBe(false); // RUN
    expect(isCurrencyCode("SPY")).toBe(false);
    expect(isCurrencyCode("PER981831")).toBe(false);
  });
  it("maneja vacío/null", () => {
    expect(isCurrencyCode("")).toBe(false);
    expect(isCurrencyCode(null)).toBe(false);
    expect(isCurrencyCode(undefined)).toBe(false);
  });
});
