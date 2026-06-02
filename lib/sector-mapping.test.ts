import { describe, it, expect } from "vitest";
import {
  mapSectorToSleeve,
  mapSectorToCategory,
  type StockProfile,
} from "./sector-mapping";

describe("mapSectorToSleeve", () => {
  it("maps Technology to us_tech", () => {
    expect(mapSectorToSleeve("Technology")).toBe("us_tech");
  });

  it("maps Healthcare to us_healthcare", () => {
    expect(mapSectorToSleeve("Healthcare")).toBe("us_healthcare");
  });

  it("maps Real Estate to us_reits", () => {
    expect(mapSectorToSleeve("Real Estate")).toBe("us_reits");
  });

  it("returns null for unknown sector", () => {
    expect(mapSectorToSleeve("Unknown Sector")).toBeNull();
  });
});

describe("mapSectorToCategory", () => {
  it("maps US Technology stock to rv_usa_large_cap", () => {
    const profile: StockProfile = {
      ticker: "AAPL",
      name: "Apple Inc",
      sector: "Technology",
      industry: "Consumer Electronics",
      marketCap: 3000000000000,
      country: "US",
      exchange: "NASDAQ",
    };
    expect(mapSectorToCategory(profile)).toBe("rv_usa_large_cap");
  });

  it("maps US Real Estate stock to alt_reits", () => {
    const profile: StockProfile = {
      ticker: "O",
      name: "Realty Income",
      sector: "Real Estate",
      industry: "REIT",
      marketCap: 40000000000,
      country: "US",
      exchange: "NYSE",
    };
    expect(mapSectorToCategory(profile)).toBe("alt_reits");
  });

  it("maps Brazilian stock to rv_emergentes", () => {
    const profile: StockProfile = {
      ticker: "VALE",
      name: "Vale SA",
      sector: "Basic Materials",
      industry: "Mining",
      marketCap: 50000000000,
      country: "BR",
      exchange: "NYSE",
    };
    expect(mapSectorToCategory(profile)).toBe("rv_emergentes");
  });

  it("maps UK stock to rv_desarrollados_ex_us", () => {
    const profile: StockProfile = {
      ticker: "BP",
      name: "BP plc",
      sector: "Energy",
      industry: "Oil",
      marketCap: 80000000000,
      country: "GB",
      exchange: "NYSE",
    };
    expect(mapSectorToCategory(profile)).toBe("rv_desarrollados_ex_us");
  });
});
