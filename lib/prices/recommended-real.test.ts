import { describe, it, expect } from "vitest";
import { expandRealInstruments, classProxyFor, type ResolveFn } from "./recommended-real";

// Mock de resolveSource: RUN numérico → CLP/cmf; cualquier otro (ETF) → USD/alphavantage.
const resolveFn: ResolveFn = ({ securityId }) => {
  if (/^\d+$/.test(securityId)) return { symbol: securityId, currency: "CLP", source: "cmf" };
  return { symbol: securityId, currency: "USD", source: "alphavantage" };
};

describe("classProxyFor", () => {
  it("expande una clase a su proxy con substituted=true y pesos escalados", () => {
    expect(classProxyFor("Renta Variable", 0.4)).toEqual([
      { ticker: "ACWI", weight: 0.4, currency: "USD", spread: undefined, clase: "renta variable", substituted: true },
    ]);
    // Alternativos = blend GLD 0.5 + RWO 0.5 → cada uno 0.5*weight
    const alt = classProxyFor("Alternativos", 0.2);
    expect(alt.map(c => [c.ticker, c.weight])).toEqual([["GLD", 0.1], ["RWO", 0.1]]);
    expect(alt.every(c => c.substituted)).toBe(true);
  });

  it("clase no reconocida → vacío", () => {
    expect(classProxyFor("Cripto", 0.5)).toEqual([]);
  });
});

describe("expandRealInstruments", () => {
  it("mezcla ETF USD + fondo CLP + Caja nula; pesos suman 1; Caja→proxy UF substituted", () => {
    const cartera = [
      { clase: "Renta Variable", ticker: "VOO", porcentaje: 50 },
      { clase: "Renta Fija", ticker: "9226", porcentaje: 30 },
      { clase: "Caja", ticker: null, porcentaje: 20 },
    ];
    const res = expandRealInstruments(cartera, resolveFn);
    // VOO (USD, real), 9226 (CLP, real), UF (proxy de Caja, substituted)
    expect(res.map(c => [c.ticker, c.currency, c.substituted])).toEqual([
      ["VOO", "USD", false],
      ["9226", "CLP", false],
      ["UF", "CLP", true],
    ]);
    const sum = res.reduce((s, c) => s + c.weight, 0);
    expect(Math.abs(sum - 1)).toBeLessThan(1e-9);
  });

  it("clase no reconocida se ignora y el resto re-normaliza a 1", () => {
    const cartera = [
      { clase: "Renta Variable", ticker: "VOO", porcentaje: 50 },
      { clase: "Cripto", ticker: "BTC", porcentaje: 50 }, // ignorada
    ];
    const res = expandRealInstruments(cartera, resolveFn);
    expect(res.length).toBe(1);
    expect(res[0].ticker).toBe("VOO");
    expect(res[0].weight).toBeCloseTo(1, 9);
  });

  it("posición con porcentaje 0 o negativo se ignora", () => {
    const cartera = [
      { clase: "Renta Variable", ticker: "VOO", porcentaje: 100 },
      { clase: "Renta Fija", ticker: "IEF", porcentaje: 0 },
    ];
    const res = expandRealInstruments(cartera, resolveFn);
    expect(res.map(c => c.ticker)).toEqual(["VOO"]);
  });
});
