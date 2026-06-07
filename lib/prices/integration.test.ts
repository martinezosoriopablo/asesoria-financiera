// lib/prices/integration.test.ts
// resolveSource routing tests — verifies every instrument type maps to the correct price source

import { describe, it, expect } from "vitest";
import { resolveSource, type SourceResolution } from "./price-service";
import type { HoldingForPricing } from "./types";

function holding(overrides: Partial<HoldingForPricing> = {}): HoldingForPricing {
  return {
    fundName: "Test Fund",
    marketValue: 1000,
    ...overrides,
  };
}

describe("resolveSource", () => {
  // ------------------------------------------------------------------
  // 1. FX tickers → bcch
  // ------------------------------------------------------------------
  describe("FX tickers → bcch", () => {
    it("routes UF by securityId", () => {
      const r = resolveSource(holding({ securityId: "UF" }));
      expect(r).toEqual<SourceResolution>({ source: "bcch", symbol: "UF", currency: "CLP" });
    });

    it("routes USD by fundName", () => {
      const r = resolveSource(holding({ fundName: "USD", securityId: "" }));
      expect(r).toEqual<SourceResolution>({ source: "bcch", symbol: "USD", currency: "CLP" });
    });

    it("routes EUR by securityId", () => {
      const r = resolveSource(holding({ securityId: "EUR" }));
      expect(r).toEqual<SourceResolution>({ source: "bcch", symbol: "EUR", currency: "CLP" });
    });
  });

  // ------------------------------------------------------------------
  // 2. Numeric RUN → cmf
  // ------------------------------------------------------------------
  describe("numeric RUN → cmf", () => {
    it("routes 3-digit RUN", () => {
      const r = resolveSource(holding({ securityId: "123" }));
      expect(r.source).toBe("cmf");
      expect(r.symbol).toBe("123");
      expect(r.currency).toBe("CLP");
    });

    it("routes 6-digit RUN", () => {
      const r = resolveSource(holding({ securityId: "123456" }));
      expect(r.source).toBe("cmf");
    });

    it("does NOT route 7-digit as cmf", () => {
      const r = resolveSource(holding({ securityId: "1234567" }));
      expect(r.source).not.toBe("cmf");
    });
  });

  // ------------------------------------------------------------------
  // 3. CFIETF* → yahoo .SN
  // ------------------------------------------------------------------
  describe("CFIETF → yahoo .SN", () => {
    it("adds .SN suffix", () => {
      const r = resolveSource(holding({ securityId: "CFIETFIPSA" }));
      expect(r).toEqual<SourceResolution>({
        source: "yahoo",
        symbol: "CFIETFIPSA.SN",
        currency: "CLP",
      });
    });

    it("does not double .SN suffix", () => {
      const r = resolveSource(holding({ securityId: "CFIETFIPSA.SN" }));
      expect(r.symbol).toBe("CFIETFIPSA.SN");
    });
  });

  // ------------------------------------------------------------------
  // 4. CFI* (non-ETF) → cmf
  // ------------------------------------------------------------------
  describe("CFI* (non-ETF) → cmf", () => {
    it("routes CFI fund to cmf", () => {
      const r = resolveSource(holding({ securityId: "CFICONSOL-A" }));
      expect(r.source).toBe("cmf");
      expect(r.symbol).toBe("CFICONSOL-A");
    });
  });

  // ------------------------------------------------------------------
  // 5. Bond with CUSIP → finra
  // ------------------------------------------------------------------
  describe("bond with CUSIP → finra", () => {
    it("routes 9-char CUSIP bond to finra", () => {
      const r = resolveSource(
        holding({
          securityId: "912828YK0",
          fundName: "US Treasury 2.5% 2025",
          couponRate: 2.5,
          maturityDate: "2025-12-31",
        })
      );
      expect(r).toEqual<SourceResolution>({
        source: "finra",
        symbol: "912828YK0",
        currency: "USD",
      });
    });

    it("CUSIP-like ID without coupon still routes to finra (CUSIP detected as bond)", () => {
      // inferInstrumentType uses CUSIP regex (9-char alphanumeric) to detect bonds
      const r = resolveSource(holding({ securityId: "ABCDE1234" }));
      expect(r.source).toBe("finra");
    });

    it("non-CUSIP ticker does NOT route to finra", () => {
      const r = resolveSource(holding({ securityId: "AAPL" }));
      expect(r.source).not.toBe("finra");
    });
  });

  // ------------------------------------------------------------------
  // 6. US/INT market → alphavantage
  // ------------------------------------------------------------------
  describe("US/INT market → alphavantage", () => {
    it("routes US market ETF", () => {
      const r = resolveSource(holding({ securityId: "ACWI", market: "US" }));
      expect(r).toEqual<SourceResolution>({
        source: "alphavantage",
        symbol: "ACWI",
        currency: "USD",
      });
    });

    it("routes INT market stock", () => {
      const r = resolveSource(
        holding({ securityId: "AAPL", market: "INT", currency: "USD" })
      );
      expect(r.source).toBe("alphavantage");
      expect(r.symbol).toBe("AAPL");
    });
  });

  // ------------------------------------------------------------------
  // 7. .SN suffix already present → yahoo
  // ------------------------------------------------------------------
  describe(".SN suffix → yahoo", () => {
    it("routes existing .SN ticker", () => {
      const r = resolveSource(holding({ securityId: "BSANTANDER.SN" }));
      expect(r.source).toBe("yahoo");
      expect(r.symbol).toBe("BSANTANDER.SN");
    });
  });

  // ------------------------------------------------------------------
  // 8. Generic securityId → alphavantage
  // ------------------------------------------------------------------
  describe("generic securityId → alphavantage", () => {
    it("routes unknown ticker to alphavantage", () => {
      const r = resolveSource(holding({ securityId: "XYZ123" }));
      expect(r.source).toBe("alphavantage");
      expect(r.symbol).toBe("XYZ123");
    });
  });

  // ------------------------------------------------------------------
  // 9. No securityId → cmf (default)
  // ------------------------------------------------------------------
  describe("no securityId → cmf default", () => {
    it("falls back to cmf using fundName", () => {
      const r = resolveSource(holding({ fundName: "Fondo Mutuo Seguro", securityId: "" }));
      expect(r.source).toBe("cmf");
      expect(r.symbol).toBe("Fondo Mutuo Seguro");
      expect(r.currency).toBe("CLP");
    });

    it("null securityId falls back to cmf", () => {
      const r = resolveSource(holding({ fundName: "Mi Fondo", securityId: null }));
      expect(r.source).toBe("cmf");
    });
  });
});
