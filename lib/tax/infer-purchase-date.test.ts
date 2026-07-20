import { describe, it, expect } from "vitest";
import { inferPurchaseDate, suggestPurchaseDate } from "./infer-purchase-date";

describe("inferPurchaseDate", () => {
  it("match exacto único devuelve esa fecha", () => {
    const serie = [
      { fecha: "2024-06-27", valorCuota: 2284.3253 },
      { fecha: "2024-07-17", valorCuota: 2284.0084 },
      { fecha: "2024-08-01", valorCuota: 2283.2596 },
    ];
    expect(inferPurchaseDate(2284.0084, serie)).toEqual({ date: "2024-07-17" });
  });

  it("plateau contiguo devuelve la fecha más antigua", () => {
    const serie = [
      { fecha: "2024-07-15", valorCuota: 1000.0 },
      { fecha: "2024-07-16", valorCuota: 1000.0 },
      { fecha: "2024-07-17", valorCuota: 1000.0 },
    ];
    expect(inferPurchaseDate(1000.0, serie)).toEqual({ date: "2024-07-15" });
  });

  it("matches dispersos (dos épocas) devuelve null", () => {
    const serie = [
      { fecha: "2022-01-10", valorCuota: 1500.0 },
      { fecha: "2024-09-10", valorCuota: 1500.0 },
    ];
    expect(inferPurchaseDate(1500.0, serie)).toBeNull();
  });

  it("sin match (promedio ponderado) devuelve null", () => {
    const serie = [
      { fecha: "2024-01-10", valorCuota: 2200.0 },
      { fecha: "2024-06-10", valorCuota: 2300.0 },
    ];
    expect(inferPurchaseDate(2250.0, serie)).toBeNull();
  });

  it("unitCost <= 0 o serie vacía devuelve null", () => {
    expect(inferPurchaseDate(0, [{ fecha: "2024-01-01", valorCuota: 100 }])).toBeNull();
    expect(inferPurchaseDate(100, [])).toBeNull();
  });

  it("tolera redondeo dentro de EPS", () => {
    // unitCost 5000 -> EPS = max(0.01, 0.25) = 0.25; diff 0.1 matchea, diff 0.5 no
    const serie = [{ fecha: "2024-05-05", valorCuota: 5000.1 }];
    expect(inferPurchaseDate(5000.0, serie)).toEqual({ date: "2024-05-05" });
    const serie2 = [{ fecha: "2024-05-05", valorCuota: 5000.5 }];
    expect(inferPurchaseDate(5000.0, serie2)).toBeNull();
  });
});

describe("suggestPurchaseDate", () => {
  it("sin match exacto pero dentro de banda (0.5%): sugiere la fecha más cercana", () => {
    // unitCost 1480.4857 vs vc 1480.5703 -> dif 0.0846 (0.006%) — supera EPS exacto
    // pero cae en la banda de sugerencia.
    const serie = [
      { fecha: "2025-08-01", valorCuota: 1478.0 },
      { fecha: "2025-08-03", valorCuota: 1480.5703 },
      { fecha: "2025-08-10", valorCuota: 1490.0 },
    ];
    expect(suggestPurchaseDate(1480.4857, serie)).toEqual({
      date: "2025-08-03",
      valorCuota: 1480.5703,
      diffPct: expect.closeTo(0.0057, 3),
    });
  });

  it("si hay match exacto NO sugiere (lo resuelve inferPurchaseDate)", () => {
    const serie = [{ fecha: "2024-05-05", valorCuota: 5000.0 }];
    expect(suggestPurchaseDate(5000.0, serie)).toBeNull();
  });

  it("demasiado lejos (>0.5%) devuelve null", () => {
    // 607.95 vs máx 400 -> ~34% de diferencia
    const serie = [
      { fecha: "2025-01-01", valorCuota: 127.48 },
      { fecha: "2026-06-02", valorCuota: 400.85 },
    ];
    expect(suggestPurchaseDate(607.9524, serie)).toBeNull();
  });

  it("unitCost <= 0 o serie vacía devuelve null", () => {
    expect(suggestPurchaseDate(0, [{ fecha: "2024-01-01", valorCuota: 100 }])).toBeNull();
    expect(suggestPurchaseDate(100, [])).toBeNull();
  });
});
