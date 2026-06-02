import { describe, it, expect, vi, beforeEach } from "vitest";
import { fetchStockOverview, parseAVOverview } from "./stock-profiles";

describe("parseAVOverview", () => {
  it("parses a valid AV OVERVIEW response", () => {
    const raw = {
      Symbol: "AAPL",
      Name: "Apple Inc",
      Sector: "Technology",
      Industry: "Consumer Electronics",
      MarketCapitalization: "3000000000000",
      Country: "USA",
      Exchange: "NASDAQ",
    };
    const result = parseAVOverview(raw);
    expect(result).toEqual({
      ticker: "AAPL",
      name: "Apple Inc",
      sector: "Technology",
      industry: "Consumer Electronics",
      marketCap: 3000000000000,
      country: "US",
      exchange: "NASDAQ",
    });
  });

  it("normalizes USA/United States to US", () => {
    const raw = {
      Symbol: "MSFT",
      Name: "Microsoft",
      Sector: "Technology",
      Industry: "Software",
      MarketCapitalization: "2500000000000",
      Country: "United States",
      Exchange: "NASDAQ",
    };
    expect(parseAVOverview(raw)?.country).toBe("US");
  });

  it("returns null for empty/error response", () => {
    expect(parseAVOverview({})).toBeNull();
    expect(parseAVOverview({ Note: "API rate limit" })).toBeNull();
    expect(parseAVOverview({ "Error Message": "Invalid" })).toBeNull();
  });
});

describe("fetchStockOverview", () => {
  beforeEach(() => {
    vi.stubEnv("ALPHA_VANTAGE_API_KEY", "test-key");
  });

  it("returns null when API key is missing", async () => {
    vi.stubEnv("ALPHA_VANTAGE_API_KEY", "");
    const result = await fetchStockOverview("AAPL");
    expect(result).toBeNull();
  });
});
