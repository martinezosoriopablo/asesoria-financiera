// lib/prices/recommended-proxies.test.ts
import { describe, it, expect } from "vitest";
import {
  expandRecommendation,
  buildMonthEnds,
  computeRecommendedMonthlyReturnsCLP,
  type FlatProxy,
} from "./recommended-proxies";

describe("expandRecommendation", () => {
  it("mapea RV/RF a ACWI/AGG con pesos que suman 1", () => {
    const flat = expandRecommendation({ "Renta Variable": 60, "Renta Fija": 40 });
    const byTicker = Object.fromEntries(flat.map((f) => [f.ticker, f.weight]));
    expect(byTicker["ACWI"]).toBeCloseTo(0.6, 5);
    expect(byTicker["AGG"]).toBeCloseTo(0.4, 5);
    expect(flat.reduce((s, f) => s + f.weight, 0)).toBeCloseTo(1, 5);
  });

  it("expande Alternativos a blend oro+REIT y Caja a UF", () => {
    const flat = expandRecommendation({ "Renta Variable": 50, Alternativos: 10, Caja: 40 });
    const byTicker = Object.fromEntries(flat.map((f) => [f.ticker, f.weight]));
    expect(byTicker["ACWI"]).toBeCloseTo(0.5, 5);
    expect(byTicker["GLD"]).toBeCloseTo(0.05, 5);
    expect(byTicker["RWO"]).toBeCloseTo(0.05, 5);
    expect(byTicker["UF"]).toBeCloseTo(0.4, 5);
    expect(flat.find((f) => f.ticker === "UF")?.currency).toBe("CLP");
  });

  it("ignora clases no reconocidas y re-normaliza a suma 1", () => {
    const flat = expandRecommendation({ "Renta Variable": 50, Cripto: 50 });
    expect(flat).toHaveLength(1);
    expect(flat[0].ticker).toBe("ACWI");
    expect(flat[0].weight).toBeCloseTo(1, 5);
  });

  it("normaliza acentos/mayúsculas y variantes de caja", () => {
    const flat = expandRecommendation({ "renta variable": 100 });
    expect(flat[0].ticker).toBe("ACWI");
    const cash = expandRecommendation({ Liquidez: 100 });
    expect(cash[0].ticker).toBe("UF");
  });
});

describe("buildMonthEnds", () => {
  it("devuelve cierres de mes dentro del rango, sin saltarse febrero", () => {
    expect(buildMonthEnds("2026-01-15", "2026-03-10")).toEqual(["2026-01-31", "2026-02-28"]);
  });

  it("incluye el mes de fin si el rango llega al cierre", () => {
    expect(buildMonthEnds("2026-01-31", "2026-03-31")).toEqual([
      "2026-01-31",
      "2026-02-28",
      "2026-03-31",
    ]);
  });

  it("devuelve [] ante fechas inválidas (no cuelga)", () => {
    expect(buildMonthEnds("no-es-fecha", "2026-03-10")).toEqual([]);
    expect(buildMonthEnds("2026-01-15", "basura")).toEqual([]);
  });
});

describe("computeRecommendedMonthlyReturnsCLP", () => {
  const components: FlatProxy[] = [
    { ticker: "ACWI", weight: 0.6, currency: "USD" },
    { ticker: "UF", weight: 0.4, currency: "CLP", spread: 0 },
  ];
  const monthEnds = ["2026-01-31", "2026-02-28"];
  const pricesByTicker = {
    ACWI: [
      { date: "2026-01-31", price: 100 },
      { date: "2026-02-28", price: 110 },
    ],
  };
  const usdSeries = [
    { date: "2026-01-31", price: 900 },
    { date: "2026-02-28", price: 945 },
  ];
  const ufSeries = [
    { date: "2026-01-31", price: 37000 },
    { date: "2026-02-28", price: 37370 },
  ];

  it("pondera retornos CLP (ETF USD ajustado por dólar + UF por inflación)", () => {
    // ACWI: (1.10 × 945/900 − 1) = 15.5% ; UF: (37370/37000 − 1) = 1.0%
    // ponderado = 0.6×15.5 + 0.4×1.0 = 9.7%
    const { returns, accumulated } = computeRecommendedMonthlyReturnsCLP(
      components,
      pricesByTicker,
      usdSeries,
      ufSeries,
      monthEnds
    );
    expect(returns["2026-02"]).toBeCloseTo(9.7, 4);
    expect(accumulated).toBeCloseTo(9.7, 4);
  });

  it("re-normaliza por peso cubierto cuando falta el precio de un ticker", () => {
    // Sin serie de ACWI → solo UF (peso 0.4) cubre → retorno = 1.0% (re-normalizado)
    const { returns } = computeRecommendedMonthlyReturnsCLP(
      components,
      {},
      usdSeries,
      ufSeries,
      monthEnds
    );
    expect(returns["2026-02"]).toBeCloseTo(1.0, 4);
  });
});
