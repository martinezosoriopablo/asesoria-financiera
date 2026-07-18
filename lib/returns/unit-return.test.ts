import { describe, it, expect } from "vitest";
import { computePeriodUnitReturn, computeSnapshotReturnsHybrid } from "./unit-return";

// Retorno por período = Σ_matched [ pesoInicio × (valorCuotaFin/valorCuotaIni − 1) ].
// Inmune a aportes/retiros: cambiar la cantidad no altera el valor cuota.
// Híbrido: cuando no hay posiciones matched o faltan holdings, cae al método
// value-based (V−V₀−flujoNeto)/V₀.

describe("computePeriodUnitReturn", () => {
  it("es inmune a un aporte (comprar más cuotas del mismo fondo)", () => {
    // A: 100 cuotas@$1 -> 200 cuotas@$1.1 (compró más Y subió 10%)
    const prev = [{ fundName: "A", quantity: 100, marketValue: 100 }];
    const curr = [{ fundName: "A", quantity: 200, marketValue: 220 }];
    const r = computePeriodUnitReturn(prev, curr);
    expect(r.returnPct).toBeCloseTo(10, 6);
    expect(r.coverage).toBeCloseTo(1, 6);
  });

  it("es inmune a un retiro (vender cuotas)", () => {
    const prev = [{ fundName: "A", quantity: 100, marketValue: 100 }];
    const curr = [{ fundName: "A", quantity: 50, marketValue: 55 }]; // vendió mitad, subió 10%
    expect(computePeriodUnitReturn(prev, curr).returnPct).toBeCloseTo(10, 6);
  });

  it("pondera por valor de inicio entre varias posiciones", () => {
    const prev = [
      { fundName: "A", quantity: 60, marketValue: 60 },
      { fundName: "B", quantity: 40, marketValue: 40 },
    ];
    const curr = [
      { fundName: "A", quantity: 60, marketValue: 66 }, // +10%
      { fundName: "B", quantity: 40, marketValue: 38 }, // -5%
    ];
    // 0.6*10 + 0.4*(-5) = 4%
    expect(computePeriodUnitReturn(prev, curr).returnPct).toBeCloseTo(4, 6);
  });

  it("reporta cobertura parcial cuando solo matchea parte del valor", () => {
    // A (60% del valor previo) se mantiene; B (40%) se vende y entra C nuevo
    const prev = [
      { fundName: "A", quantity: 60, marketValue: 60 },
      { fundName: "B", quantity: 40, marketValue: 40 },
    ];
    const curr = [
      { fundName: "A", quantity: 60, marketValue: 66 }, // +10%
      { fundName: "C", quantity: 40, marketValue: 40 },
    ];
    const r = computePeriodUnitReturn(prev, curr);
    expect(r.returnPct).toBeCloseTo(10, 6); // solo A
    expect(r.coverage).toBeCloseTo(0.6, 6); // 60% del valor previo matcheó
  });

  it("devuelve returnPct null y coverage 0 si no hay matched (rebalanceo total)", () => {
    const prev = [{ fundName: "A", quantity: 100, marketValue: 100 }];
    const curr = [{ fundName: "B", quantity: 100, marketValue: 100 }];
    const r = computePeriodUnitReturn(prev, curr);
    expect(r.returnPct).toBeNull();
    expect(r.coverage).toBe(0);
  });

  it("devuelve null si faltan holdings", () => {
    expect(computePeriodUnitReturn(undefined, [{ fundName: "A", quantity: 1, marketValue: 1 }]).returnPct).toBeNull();
    expect(computePeriodUnitReturn([], []).returnPct).toBeNull();
  });
});

describe("computeSnapshotReturnsHybrid", () => {
  it("usa valor cuota cuando hay holdings y value-based como fallback", () => {
    const out = computeSnapshotReturnsHybrid([
      { id: "a", value: 1000, holdings: [{ fundName: "A", quantity: 100, marketValue: 1000 }] },
      { id: "b", value: 1100, holdings: [{ fundName: "A", quantity: 100, marketValue: 1100 }] }, // +10% valor cuota
      { id: "c", value: 1000, netCashFlow: -100, holdings: [] }, // sin holdings -> fallback value-based
    ]);
    expect(out[0].cumulativeReturn).toBe(0);
    expect(out[1].dailyReturn).toBeCloseTo(10, 6); // por valor cuota
    // b->c fallback: (1000 - (-100) - 1100)/1100 = 0
    expect(out[2].dailyReturn).toBeCloseTo(0, 6);
    expect(out[2].cumulativeReturn).toBeCloseTo(10, 6); // 1.1 * 1.0 - 1
  });

  it("un aporte no infla el retorno (inmune vía valor cuota)", () => {
    const out = computeSnapshotReturnsHybrid([
      { id: "a", value: 1000, holdings: [{ fundName: "A", quantity: 100, marketValue: 1000 }] },
      // aporta $1000 comprando 100 cuotas más; el precio no se movió
      { id: "b", value: 2000, netCashFlow: 1000, holdings: [{ fundName: "A", quantity: 200, marketValue: 2000 }] },
    ]);
    expect(out[1].cumulativeReturn).toBeCloseTo(0, 6);
    expect(out[1].confidence).toBe("high"); // 100% cobertura
  });

  it("marca confidence 'low' cuando la cobertura es baja y no hay flujo registrado", () => {
    const out = computeSnapshotReturnsHybrid([
      {
        id: "a", value: 100,
        holdings: [
          { fundName: "A", quantity: 60, marketValue: 60 },
          { fundName: "B", quantity: 40, marketValue: 40 },
        ],
      },
      {
        // rebalanceo grande: solo A (60%) matchea, sin flujo registrado
        id: "b", value: 106,
        holdings: [
          { fundName: "A", quantity: 60, marketValue: 66 },
          { fundName: "C", quantity: 40, marketValue: 40 },
        ],
      },
    ]);
    expect(out[1].confidence).toBe("low");
  });

  it("una cobertura baja PERO con flujo registrado se considera confiable", () => {
    const out = computeSnapshotReturnsHybrid([
      { id: "a", value: 1000, holdings: [{ fundName: "A", quantity: 100, marketValue: 1000 }] },
      // rebalanceo total (0% matched) pero el asesor registró el flujo
      { id: "b", value: 1100, netCashFlow: 50, holdings: [{ fundName: "Z", quantity: 10, marketValue: 1100 }] },
    ]);
    expect(out[1].confidence).toBe("high");
  });

  it("la baja confianza se propaga a los períodos siguientes de la cadena", () => {
    const out = computeSnapshotReturnsHybrid([
      { id: "a", value: 100, holdings: [{ fundName: "A", quantity: 60, marketValue: 60 }, { fundName: "B", quantity: 40, marketValue: 40 }] },
      { id: "b", value: 106, holdings: [{ fundName: "A", quantity: 60, marketValue: 66 }, { fundName: "C", quantity: 40, marketValue: 40 }] }, // low
      { id: "c", value: 110, holdings: [{ fundName: "A", quantity: 60, marketValue: 70 }, { fundName: "C", quantity: 40, marketValue: 40 }] }, // 100% match pero cadena ya es low
    ]);
    expect(out[1].confidence).toBe("low");
    expect(out[2].confidence).toBe("low");
  });
});
