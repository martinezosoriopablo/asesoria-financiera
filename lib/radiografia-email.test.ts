import { describe, it, expect } from "vitest";
import { buildRadiografiaHTML, type RadiografiaEmailData } from "./radiografia-email";

function makeData(overrides: Partial<RadiografiaEmailData> = {}): RadiografiaEmailData {
  return {
    clientName: "Juan Perez",
    reportDate: "2026-06-03",
    perfilCliente: "moderado_agresivo",
    perfilModelo: "moderado_agresivo",
    totalValueCLP: 142000000,
    allocation: {
      rv: { actual: 95, target: 60, delta: 35 },
      rf: { actual: 0, target: 25, delta: -25 },
      alt: { actual: 0, target: 10, delta: -10 },
      cash: { actual: 5, target: 5, delta: 0 },
    },
    instrumentBreakdown: {
      stocks: [
        { ticker: "AAPL", name: "Apple Inc", weightPct: 22.1, marketValueCLP: 31400000 },
        { ticker: "MSFT", name: "Microsoft", weightPct: 18.3, marketValueCLP: 26000000 },
      ],
      funds: [],
      bonds: [],
      etfs: [],
      cash: [{ name: "Caja USD", weightPct: 5, marketValueCLP: 7100000 }],
    },
    observations: [
      { severity: "alta", text: "Sin exposicion a Renta Fija" },
      { severity: "media", text: "Top 3 = 53% del portafolio" },
    ],
    narrative: null,
    platformUrl: "https://app.global.cl",
    ...overrides,
  };
}

describe("buildRadiografiaHTML", () => {
  it("returns valid HTML document", () => {
    const html = buildRadiografiaHTML(makeData());
    expect(html).toContain("<!DOCTYPE html>");
    expect(html).toContain("</html>");
  });

  it("includes client name in header", () => {
    const html = buildRadiografiaHTML(makeData());
    expect(html).toContain("Juan Perez");
  });

  it("includes allocation bars for all roles", () => {
    const html = buildRadiografiaHTML(makeData());
    expect(html).toContain("Renta Variable");
    expect(html).toContain("Renta Fija");
    expect(html).toContain("Alternativos");
    expect(html).toContain("Caja");
  });

  it("includes delta badges with correct sign", () => {
    const html = buildRadiografiaHTML(makeData());
    expect(html).toContain("+35.0pp");
    expect(html).toContain("-25.0pp");
  });

  it("includes SVG donut charts", () => {
    const html = buildRadiografiaHTML(makeData());
    expect(html).toContain("<svg");
    expect(html).toContain("stroke-dasharray");
    expect(html).toContain("Tu Cartera");
    expect(html).toContain("Modelo");
  });

  it("includes top holdings table", () => {
    const html = buildRadiografiaHTML(makeData());
    expect(html).toContain("AAPL");
    expect(html).toContain("Apple Inc");
    expect(html).toContain("22.1%");
  });

  it("includes observations with severity styling", () => {
    const html = buildRadiografiaHTML(makeData());
    expect(html).toContain("Sin exposicion a Renta Fija");
    expect(html).toContain("#ef4444");
    expect(html).toContain("#f59e0b");
  });

  it("excludes narrative section when null", () => {
    const html = buildRadiografiaHTML(makeData({ narrative: null }));
    expect(html).not.toContain("Diagnostico");
  });

  it("includes narrative section when provided", () => {
    const html = buildRadiografiaHTML(makeData({
      narrative: "Tu cartera presenta concentracion significativa.",
    }));
    expect(html).toContain("Diagnostico");
    expect(html).toContain("Tu cartera presenta concentracion significativa.");
  });

  it("includes footer with platform link", () => {
    const html = buildRadiografiaHTML(makeData());
    expect(html).toContain("https://app.global.cl");
    expect(html).toContain("no constituye recomendacion");
  });

  it("uses only inline styles (no style tags)", () => {
    const html = buildRadiografiaHTML(makeData());
    expect(html).not.toMatch(/<style[\s>]/);
  });

  it("merges all instrument types in holdings table sorted by weight", () => {
    const html = buildRadiografiaHTML(makeData({
      instrumentBreakdown: {
        stocks: [{ ticker: "AAPL", name: "Apple", weightPct: 10, marketValueCLP: 14200000 }],
        funds: [{ fundName: "Banchile RV", weightPct: 15, marketValueCLP: 21300000 }],
        bonds: [{ name: "UST 4.5%", couponRate: 4.5, maturityDate: "2030-01-15", weightPct: 20, marketValueUSD: 25000 }],
        etfs: [{ ticker: "VOO", name: "Vanguard S&P", weightPct: 30, marketValueCLP: 42600000 }],
        cash: [{ name: "Caja", weightPct: 5, marketValueCLP: 7100000 }],
      },
    }));
    const vooIdx = html.indexOf("VOO");
    const ustIdx = html.indexOf("UST 4.5%");
    const banchileIdx = html.indexOf("Banchile RV");
    const aaplIdx = html.indexOf("AAPL");
    expect(vooIdx).toBeLessThan(ustIdx);
    expect(ustIdx).toBeLessThan(banchileIdx);
    expect(banchileIdx).toBeLessThan(aaplIdx);
  });
});
