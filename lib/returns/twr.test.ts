import { describe, it, expect } from "vitest";
import { computeTWR, computeSnapshotReturns } from "./twr";

// Retorno Time-Weighted encadenado: r_i = (V_i - V_{i-1} - flujoNeto_i) / V_{i-1},
// cumulativo = Π(1 + r_i) - 1. Inmune a flujos externos (aportes/retiros) y a
// rebalanceos (un rebalanceo tiene flujo neto 0 y valor continuo).
// netCashFlow: >0 = aporte (entra plata), <0 = retiro (sale plata).

describe("computeTWR", () => {
  it("neutraliza un retiro (ejemplo 1000 -> 1030 -> retiro 15 -> 1045)", () => {
    const r = computeTWR([
      { value: 1000 },
      { value: 1030 },
      { value: 1015, netCashFlow: -15 },
      { value: 1045 },
    ]);
    // r1=3%, r2=0% (retiro no es pérdida), r3=(1045-1015)/1015=2.9557%
    // cum = 1.03 * 1 * 1.029557 - 1 = 6.04%
    expect(r.cumulative).toBeCloseTo(6.044, 2);
  });

  it("maneja un rebalanceo (vender A, comprar B, mismo valor) sin distorsión", () => {
    const r = computeTWR([
      { value: 1000 },
      { value: 1100 },                 // A +10%
      { value: 1100, netCashFlow: 0 }, // rebalanceo A->B, valor continuo
      { value: 1320 },                 // B +20%
    ]);
    // 1.10 * 1.00 * 1.20 - 1 = 32%
    expect(r.cumulative).toBeCloseTo(32, 6);
  });

  it("un aporte no cuenta como rentabilidad", () => {
    const r = computeTWR([
      { value: 1000 },
      { value: 2000, netCashFlow: 1000 }, // deposito 1000, sin ganancia
    ]);
    expect(r.cumulative).toBeCloseTo(0, 6);
  });

  it("encadena retornos sin flujos", () => {
    const r = computeTWR([
      { value: 1000 },
      { value: 1100 }, // +10%
      { value: 1210 }, // +10%
    ]);
    expect(r.cumulative).toBeCloseTo(21, 6);
    expect(r.periodReturns).toHaveLength(2);
    expect(r.periodReturns[0]).toBeCloseTo(10, 6);
    expect(r.periodReturns[1]).toBeCloseTo(10, 6);
  });

  it("expone la serie acumulada alineada a cada punto (primero = 0)", () => {
    const r = computeTWR([
      { value: 1000 },
      { value: 1100 },
      { value: 1210 },
    ]);
    expect(r.cumulativeSeries).toHaveLength(3);
    expect(r.cumulativeSeries[0]).toBe(0);
    expect(r.cumulativeSeries[1]).toBeCloseTo(10, 6);
    expect(r.cumulativeSeries[2]).toBeCloseTo(21, 6);
  });

  it("un solo punto o vacío no rompe (cumulativo 0)", () => {
    expect(computeTWR([]).cumulative).toBe(0);
    expect(computeTWR([{ value: 1000 }]).cumulative).toBe(0);
  });

  it("ignora períodos con valor inicial no positivo", () => {
    const r = computeTWR([
      { value: 0 },
      { value: 100, netCashFlow: 100 }, // arranque desde 0 (aporte inicial)
      { value: 110 },
    ]);
    // primer período se salta (V_ini=0); segundo = +10%
    expect(r.cumulative).toBeCloseTo(10, 6);
  });
});

describe("computeSnapshotReturns", () => {
  it("asigna daily_return y cumulative_return TWR por snapshot", () => {
    const out = computeSnapshotReturns([
      { id: "a", value: 1000 },
      { id: "b", value: 1030 },
      { id: "c", value: 1015, netCashFlow: -15 },
      { id: "d", value: 1045 },
    ]);
    expect(out.map((o) => o.id)).toEqual(["a", "b", "c", "d"]);
    expect(out[0].dailyReturn).toBeNull();
    expect(out[0].cumulativeReturn).toBe(0);
    expect(out[1].dailyReturn).toBeCloseTo(3, 4);
    expect(out[2].dailyReturn).toBeCloseTo(0, 4); // retiro no es pérdida
    expect(out[3].cumulativeReturn).toBeCloseTo(6.044, 2);
  });
});
