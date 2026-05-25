// lib/instrument-type.test.ts
import { describe, it, expect } from "vitest";
import { inferInstrumentType } from "./instrument-type";

describe("inferInstrumentType", () => {
  it("returns explicit instrumentType when present", () => {
    expect(inferInstrumentType({ instrumentType: "etf", fundName: "AGG" })).toBe("etf");
    expect(inferInstrumentType({ instrumentType: "bond", fundName: "Goldman" })).toBe("bond");
  });

  it("returns explicit assetType as fallback (backward compat)", () => {
    expect(inferInstrumentType({ assetType: "stock", fundName: "AAPL" })).toBe("stock");
    expect(inferInstrumentType({ assetType: "fund", fundName: "BTG RF" })).toBe("fund");
  });

  it("detects bond: CUSIP + couponRate + maturityDate", () => {
    expect(inferInstrumentType({
      fundName: "Goldman Sachs",
      securityId: "38141GXZ2",
      couponRate: 6.75,
      maturityDate: "2029-10-01",
    })).toBe("bond");
  });

  it("detects bond: couponRate + maturityDate without CUSIP", () => {
    expect(inferInstrumentType({
      fundName: "AT&T Inc 4.75% 05/2046",
      couponRate: 4.75,
      maturityDate: "2046-05-15",
    })).toBe("bond");
  });

  it("does NOT classify RF fund as bond despite fixedIncome assetClass", () => {
    expect(inferInstrumentType({
      fundName: "BTG Renta Fija Chile",
      assetClass: "fixedIncome",
      securityId: "9832",  // numeric RUN → fund
    })).toBe("fund");
  });

  it("classifies RF ETF as etf despite fixedIncome assetClass", () => {
    expect(inferInstrumentType({
      fundName: "iShares Core US Aggregate Bond ETF",
      assetClass: "fixedIncome",
      securityId: "AGG",
    })).toBe("etf"); // known ETF ticker → etf
  });

  it("detects fund: numeric securityId (RUN)", () => {
    expect(inferInstrumentType({
      fundName: "Fintual Risky Norris",
      securityId: "10234",
    })).toBe("fund");
  });

  it("detects cash from assetClass", () => {
    expect(inferInstrumentType({
      fundName: "US Dollar Cash",
      assetClass: "cash",
    })).toBe("cash");
  });

  it("detects cash from fund name", () => {
    expect(inferInstrumentType({
      fundName: "Money Market Sweep",
    })).toBe("cash");
  });

  it("defaults non-numeric securityId without bond markers to stock", () => {
    expect(inferInstrumentType({
      fundName: "Apple Inc",
      securityId: "AAPL",
    })).toBe("stock");
  });

  it("defaults unknown to fund", () => {
    expect(inferInstrumentType({
      fundName: "Some Unknown Instrument",
    })).toBe("fund");
  });

  it("detects bond from CUSIP-shaped securityId even without coupon data", () => {
    expect(inferInstrumentType({
      fundName: "Blackstone Holdings",
      securityId: "09261LAC0",
    })).toBe("bond");
  });
});
