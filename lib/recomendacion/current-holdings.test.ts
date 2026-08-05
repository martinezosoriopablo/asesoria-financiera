import { describe, it, expect } from "vitest";
import { detectDirectTipo, classifyDirectHoldingsBySleeve } from "./current-holdings";

describe("detectDirectTipo", () => {
  it("bono por cupón+vencimiento", () => {
    expect(detectDirectTipo({ fundName: "US TREASURY 4% 2030", securityId: "912828XY9", marketValue: 100, couponRate: 4, maturityDate: "2030-01-01" })).toBe("bond");
  });
  it("acción por assetClass equity + ticker", () => {
    expect(detectDirectTipo({ fundName: "NVIDIA", securityId: "NVDA", marketValue: 100, assetClass: "equity" })).toBe("stock");
  });
  it("fondo (RUN numérico) → null", () => {
    expect(detectDirectTipo({ fundName: "FM BCI", securityId: "9226", marketValue: 100, assetClass: "fund" })).toBeNull();
  });
});

describe("classifyDirectHoldingsBySleeve", () => {
  it("agrupa directos por sleeve con weight_pct; ignora fondos", () => {
    const holdings = [
      { fundName: "NVIDIA", securityId: "NVDA", marketValue: 300, assetClass: "equity", currency: "USD", sector: "technology" },
      { fundName: "US TREASURY 4% 2030", securityId: "912828XY9", marketValue: 500, couponRate: 4, maturityDate: "2030-01-01", currency: "USD" },
      { fundName: "FM BCI", securityId: "9226", marketValue: 200, assetClass: "fund", currency: "CLP" },
    ];
    const map = classifyDirectHoldingsBySleeve(holdings, 1000);
    // NVDA → sleeve RV (equity US large), bono → sleeve RF
    const allTickers = [...map.values()].flat().map(d => d.ticker);
    expect(allTickers).toContain("NVDA");
    expect(allTickers).toContain("912828XY9");
    expect(allTickers).not.toContain("9226"); // el fondo se ignora
    const nvda = [...map.values()].flat().find(d => d.ticker === "NVDA")!;
    expect(nvda.tipo).toBe("stock");
    expect(nvda.weight_pct).toBeCloseTo(30, 4);
    expect(nvda.sector).toBe("technology");
  });
});
