import { describe, it, expect } from "vitest";
import { buildSeguimientoHTML, type SeguimientoEmailData } from "./seguimiento-email";

function makeData(overrides: Partial<SeguimientoEmailData> = {}): SeguimientoEmailData {
  return {
    clientName: "Juan Perez",
    reportDate: "31 de mayo 2026",
    perfilCliente: "moderado",
    totalValueCLP: 150_000_000,
    displayCurrency: "CLP",
    exchangeRates: { usd: 950, uf: 38_500 },
    composition: {
      equity: { initial: 50_000_000, final: 55_000_000, returnPct: 10.0 },
      fixedIncome: { initial: 60_000_000, final: 61_500_000, returnPct: 2.5 },
      alternatives: { initial: 20_000_000, final: 19_000_000, returnPct: -5.0 },
      cash: { initial: 15_000_000, final: 14_500_000, returnPct: -3.3 },
    },
    periodReturns: {
      "1M": { nominal: 1.2, real: 0.8, usd: 0.5 },
      "3M": { nominal: 3.5, real: 2.9, usd: 2.1 },
      "6M": { nominal: null, real: null, usd: null },
      "1Y": { nominal: null, real: null, usd: null },
      YTD: { nominal: 5.2, real: 4.1, usd: 3.0 },
    },
    distribution: {
      byAssetType: [
        { label: "Renta Variable", pct: 36.7 },
        { label: "Renta Fija", pct: 41.0 },
        { label: "Alternativos", pct: 12.7 },
        { label: "Caja", pct: 9.7 },
      ],
      byCurrency: [
        { label: "CLP", pct: 55.0 },
        { label: "USD", pct: 40.0 },
        { label: "EUR", pct: 5.0 },
      ],
    },
    benchmarkComparison: {
      label: "UF + 2%",
      periods: {
        "1M": { portfolio: 1.2, benchmark: 0.5, diff: 0.7 },
        "3M": { portfolio: 3.5, benchmark: 1.5, diff: 2.0 },
        YTD: { portfolio: 5.2, benchmark: 2.5, diff: 2.7 },
      },
    },
    holdingReturns: [
      { name: "Fondo BTG Chile Acciones", assetType: "Fondo", returnPct: 12.5 },
      { name: "iShares S&P 500", assetType: "ETF", returnPct: 8.3 },
      { name: "Bono Tesoro US 2028", assetType: "Bono", returnPct: -1.2 },
      { name: "Deposito a Plazo BCI", assetType: "DAP", returnPct: 0.4 },
    ],
    attribution: [
      { name: "Fondo BTG Chile Acciones", instrumentType: "Fondo", contributionPp: 2.1 },
      { name: "iShares S&P 500", instrumentType: "ETF", contributionPp: 1.5 },
      { name: "Bono Tesoro US 2028", instrumentType: "Bono", contributionPp: -0.3 },
      { name: "Deposito a Plazo BCI", instrumentType: "DAP", contributionPp: 0.05 },
    ],
    narrative: "El portafolio tuvo un buen desempeno en mayo.\n\nLa renta variable chilena lidero los retornos gracias al rally del IPSA.",
    platformUrl: "https://app.greybark.cl/seguimiento",
    ...overrides,
  };
}

describe("buildSeguimientoHTML", () => {
  it("returns valid HTML document", () => {
    const html = buildSeguimientoHTML(makeData());
    expect(html).toContain("<!DOCTYPE html>");
    expect(html).toContain("</html>");
  });

  it("includes client name in header", () => {
    const html = buildSeguimientoHTML(makeData({ clientName: "Maria Lopez" }));
    expect(html).toContain("Maria Lopez");
    expect(html).toContain("Reporte de Seguimiento");
  });

  it("includes composition section with all 4 classes and return %", () => {
    const html = buildSeguimientoHTML(makeData());
    expect(html).toContain("Composicion");
    expect(html).toContain("Renta Variable");
    expect(html).toContain("Renta Fija");
    expect(html).toContain("Alternativos");
    expect(html).toContain("Caja");
    expect(html).toContain("+10.0%");
    expect(html).toContain("+2.5%");
    expect(html).toContain("-5.0%");
    expect(html).toContain("-3.3%");
  });

  it("includes period returns table with 1M/3M/YTD", () => {
    const html = buildSeguimientoHTML(makeData());
    expect(html).toContain("Rentabilidad por Periodo");
    expect(html).toContain("1M");
    expect(html).toContain("3M");
    expect(html).toContain("YTD");
    expect(html).toContain("+1.2%");
    expect(html).toContain("+3.5%");
  });

  it("shows dash for null period returns", () => {
    const html = buildSeguimientoHTML(makeData());
    // 6M and 1Y have null values — should show mdash
    expect(html).toContain("6M");
    expect(html).toContain("1Y");
    // Count mdash occurrences — 6M has 3 nulls, 1Y has 3 nulls = 6 dashes
    const mdashCount = (html.match(/&mdash;/g) || []).length;
    expect(mdashCount).toBeGreaterThanOrEqual(6);
  });

  it("includes distribution tables", () => {
    const html = buildSeguimientoHTML(makeData());
    expect(html).toContain("Distribucion");
    expect(html).toContain("Por Tipo de Activo");
    expect(html).toContain("Por Moneda");
    expect(html).toContain("36.7%");
    expect(html).toContain("55.0%");
  });

  it("includes benchmark comparison with diff", () => {
    const html = buildSeguimientoHTML(makeData());
    expect(html).toContain("Benchmark");
    expect(html).toContain("UF + 2%");
    expect(html).toContain("Portafolio");
    expect(html).toContain("Diferencia");
    expect(html).toContain("+2.7%");
  });

  it("omits benchmark section when null", () => {
    const html = buildSeguimientoHTML(makeData({ benchmarkComparison: null }));
    expect(html).not.toContain("Benchmark");
    expect(html).not.toContain("Diferencia");
  });

  it("includes holding returns sorted by return", () => {
    const html = buildSeguimientoHTML(makeData());
    expect(html).toContain("Rentabilidad por Posicion");
    expect(html).toContain("Fondo BTG Chile Acciones");
    expect(html).toContain("+12.5%");
    // Check sort order: 12.5 should appear before -1.2
    const idx125 = html.indexOf("+12.5%");
    const idxNeg = html.indexOf("-1.2%");
    expect(idx125).toBeLessThan(idxNeg);
  });

  it("includes attribution with contribution bars", () => {
    const html = buildSeguimientoHTML(makeData());
    expect(html).toContain("Atribucion");
    expect(html).toContain("+2.10pp");
    expect(html).toContain("-0.30pp");
    expect(html).toContain("TOTAL");
  });

  it("includes narrative when provided", () => {
    const html = buildSeguimientoHTML(makeData());
    expect(html).toContain("Explicacion de Resultados");
    expect(html).toContain("buen desempeno en mayo");
    expect(html).toContain("rally del IPSA");
  });

  it("omits narrative section when null", () => {
    const html = buildSeguimientoHTML(makeData({ narrative: null }));
    expect(html).not.toContain("Explicacion de Resultados");
  });

  it("uses only inline styles (no style tags)", () => {
    const html = buildSeguimientoHTML(makeData());
    expect(html).not.toMatch(/<style[\s>]/);
  });

  it("includes footer with disclaimer and exchange rates", () => {
    const html = buildSeguimientoHTML(makeData());
    expect(html).toContain("no constituye recomendacion de inversion");
    expect(html).toContain("ingresa a la plataforma");
    expect(html).toContain("app.greybark.cl");
    // Exchange rates in footer
    expect(html).toContain("USD");
    expect(html).toContain("UF");
  });

  it("converts values to display currency when USD", () => {
    const html = buildSeguimientoHTML(makeData({ displayCurrency: "USD" }));
    // totalValueCLP = 150M CLP / 950 = ~157,894 USD → "USD $158K"
    expect(html).toContain("USD $");
  });
});
