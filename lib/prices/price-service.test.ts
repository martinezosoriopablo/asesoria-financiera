// lib/prices/price-service.test.ts

import { describe, it, expect } from "vitest";
import { resolveSource } from "./price-service";
import type { HoldingForPricing } from "./types";

describe("resolveSource", () => {
  it("routes Chilean FM (numeric RUN) to cmf", () => {
    const h: HoldingForPricing = {
      fundName: "Fondo Mutuo Security",
      securityId: "9085",
      marketValue: 1_000_000,
    };
    const res = resolveSource(h);
    expect(res.source).toBe("cmf");
    expect(res.symbol).toBe("9085");
    expect(res.currency).toBe("CLP");
  });

  it("routes Chilean ETF (CFIETFIPSA) to yahoo with .SN", () => {
    const h: HoldingForPricing = {
      fundName: "FI ETF SINGULAR IPSA",
      securityId: "CFIETFIPSA",
      marketValue: 500_000,
    };
    const res = resolveSource(h);
    expect(res.source).toBe("yahoo");
    expect(res.symbol).toBe("CFIETFIPSA.SN");
    expect(res.currency).toBe("CLP");
  });

  it("routes Chilean FI (CFICAPITAL) to yahoo with .SN", () => {
    const h: HoldingForPricing = {
      fundName: "FI Capital Chile",
      securityId: "CFICAPITAL",
      marketValue: 2_000_000,
    };
    const res = resolveSource(h);
    expect(res.source).toBe("yahoo");
    expect(res.symbol).toBe("CFICAPITAL.SN");
    expect(res.currency).toBe("CLP");
  });

  it("routes international ETF (ACWI, market US) to alphavantage", () => {
    const h: HoldingForPricing = {
      fundName: "iShares MSCI ACWI ETF",
      securityId: "ACWI",
      market: "US",
      marketValue: 50_000,
      currency: "USD",
    };
    const res = resolveSource(h);
    expect(res.source).toBe("alphavantage");
    expect(res.symbol).toBe("ACWI");
    expect(res.currency).toBe("USD");
  });

  it("routes CUSIP bond to finra", () => {
    const h: HoldingForPricing = {
      fundName: "ECOPETROL 5.875% 2045",
      securityId: "279158AN4",
      couponRate: 5.875,
      maturityDate: "2045-05-28",
      marketValue: 100_000,
    };
    const res = resolveSource(h);
    expect(res.source).toBe("finra");
    expect(res.symbol).toBe("279158AN4");
    expect(res.currency).toBe("USD");
  });

  it("routes UF to bcch", () => {
    const h: HoldingForPricing = {
      fundName: "UF",
      securityId: "UF",
      marketValue: 37_000,
    };
    const res = resolveSource(h);
    expect(res.source).toBe("bcch");
    expect(res.symbol).toBe("UF");
    expect(res.currency).toBe("CLP");
  });

  it("routes international fund (LU prefix, market INT) to alphavantage", () => {
    const h: HoldingForPricing = {
      fundName: "Nordea 1 Global Climate",
      securityId: "LU0348926287",
      market: "INT",
      marketValue: 25_000,
      currency: "EUR",
    };
    const res = resolveSource(h);
    expect(res.source).toBe("alphavantage");
    expect(res.symbol).toBe("LU0348926287");
    expect(res.currency).toBe("EUR");
  });

  it("defaults to cmf when no securityId", () => {
    const h: HoldingForPricing = {
      fundName: "Fondo Mutuo BTG Pactual Chile Acción",
      marketValue: 3_000_000,
    };
    const res = resolveSource(h);
    expect(res.source).toBe("cmf");
    expect(res.symbol).toBe("Fondo Mutuo BTG Pactual Chile Acción");
    expect(res.currency).toBe("CLP");
  });

  it("routes .SN suffix to yahoo", () => {
    const h: HoldingForPricing = {
      fundName: "Banco Santander Chile",
      securityId: "BSANTANDER.SN",
      marketValue: 1_000_000,
    };
    const res = resolveSource(h);
    expect(res.source).toBe("yahoo");
    expect(res.symbol).toBe("BSANTANDER.SN");
    expect(res.currency).toBe("CLP");
  });

  it("routes Chilean ADR stock (GOOGLCL) to yahoo with .SN", () => {
    const h: HoldingForPricing = {
      fundName: "Alphabet Inc. A",
      securityId: "GOOGLCL",
      marketValue: 5_000_000,
    };
    const res = resolveSource(h);
    expect(res.source).toBe("yahoo");
    expect(res.symbol).toBe("GOOGLCL.SN");
    expect(res.currency).toBe("CLP");
  });

  it("routes USD FX ticker by name when no securityId", () => {
    const h: HoldingForPricing = {
      fundName: "USD",
      marketValue: 900,
    };
    const res = resolveSource(h);
    expect(res.source).toBe("bcch");
    expect(res.symbol).toBe("USD");
  });
});
