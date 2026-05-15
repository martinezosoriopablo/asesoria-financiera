import { describe, it, expect } from "vitest";
import {
  getTramoMarginal,
  getRegimenAPVOptimo,
  calcularImpuestoProgresivo,
  calcularImpuestoAnual,
  calcularMitigacion,
  calcularAhorroTAC,
  vpnReal,
  calcularAlphaPorReasignacion,
} from "./calculator";
import type { TaxableHolding } from "./types";
import { RENTABILIDAD_ESPERADA_REAL } from "@/lib/constants/chilean-tax";

// ---------------------------------------------------------------------------
// 1. getTramoMarginal
// ---------------------------------------------------------------------------
describe("getTramoMarginal", () => {
  it("returns tasa 0 for 0 UF/month", () => {
    const r = getTramoMarginal(0);
    expect(r.tasa).toBe(0);
  });

  it("returns tasa 0 for 10 UF/month (within exempt bracket)", () => {
    const r = getTramoMarginal(10);
    expect(r.tasa).toBe(0);
    expect(r.tramoDesde).toBe(0);
    expect(r.tramoHasta).toBe(13.5);
  });

  it("returns tasa 0.04 for 20 UF/month", () => {
    const r = getTramoMarginal(20);
    expect(r.tasa).toBe(0.04);
  });

  it("returns tasa 0.23 for 80 UF/month", () => {
    const r = getTramoMarginal(80);
    expect(r.tasa).toBe(0.23);
  });

  it("returns tasa 0.40 for 500 UF/month", () => {
    const r = getTramoMarginal(500);
    expect(r.tasa).toBe(0.40);
  });
});

// ---------------------------------------------------------------------------
// 2. getRegimenAPVOptimo
// ---------------------------------------------------------------------------
describe("getRegimenAPVOptimo", () => {
  it.each([
    [0.04, "A"],
    [0.08, "A"],
    [0.135, "A"],
    [0.15, "A"],
  ] as const)("tasa %f -> regime %s", (tasa, expected) => {
    expect(getRegimenAPVOptimo(tasa)).toBe(expected);
  });

  it.each([
    [0.23, "B"],
    [0.304, "B"],
    [0.40, "B"],
  ] as const)("tasa %f -> regime %s", (tasa, expected) => {
    expect(getRegimenAPVOptimo(tasa)).toBe(expected);
  });
});

// ---------------------------------------------------------------------------
// 3. calcularImpuestoProgresivo
// ---------------------------------------------------------------------------
describe("calcularImpuestoProgresivo", () => {
  it("returns 0 for 0 annual income", () => {
    expect(calcularImpuestoProgresivo(0)).toBe(0);
  });

  it("returns 0 for 100 UF/year (8.33/month, within exempt bracket)", () => {
    expect(calcularImpuestoProgresivo(100)).toBe(0);
  });

  it("calculates tax for 360 UF/year (30 UF/month, top of 2nd bracket)", () => {
    // Monthly = 30 UF. Bracket 1: 0-13.5 @ 0% = 0. Bracket 2: 13.5-30 @ 4% = 0.66
    // Monthly tax = 0.66. Annual = 0.66 * 12 = 7.92
    const tax = calcularImpuestoProgresivo(360);
    expect(tax).toBeCloseTo(7.92, 1);
  });

  it("calculates tax for higher income", () => {
    // 600 UF/year = 50/month. Bracket 1: 0-13.5@0=0, Bracket 2: 13.5-30@4%=0.66, Bracket 3: 30-50@8%=1.60
    // Monthly = 2.26, Annual = 27.12
    const tax = calcularImpuestoProgresivo(600);
    expect(tax).toBeCloseTo(27.12, 1);
  });
});

// ---------------------------------------------------------------------------
// 4. calcularAhorroTAC
// ---------------------------------------------------------------------------
describe("calcularAhorroTAC", () => {
  it("returns cumulative savings with 0 growth", () => {
    // 1000 UF, TAC diff = 1.5%, 10 years, 0 growth
    // Each year: 1000 * 0.015 = 15 UF. Total = 150
    const ahorro = calcularAhorroTAC(1000, 2, 0.5, 10, 0);
    expect(ahorro).toBeCloseTo(150, 1);
  });

  it("returns 0 when TACs are equal", () => {
    expect(calcularAhorroTAC(1000, 1.5, 1.5, 10, 0.05)).toBe(0);
  });

  it("returns more savings with growth than without", () => {
    const withoutGrowth = calcularAhorroTAC(1000, 2, 0.5, 10, 0);
    const withGrowth = calcularAhorroTAC(1000, 2, 0.5, 10, 0.05);
    expect(withGrowth).toBeGreaterThan(withoutGrowth);
  });
});

// ---------------------------------------------------------------------------
// 5. vpnReal
// ---------------------------------------------------------------------------
describe("vpnReal", () => {
  it("returns ~96.62 for 100 UF in year 1 at 3.5%", () => {
    const result = vpnReal([{ ano: 1, montoUF: 100 }], 0.035);
    expect(result).toBeCloseTo(96.62, 1);
  });

  it("returns 0 for empty flows", () => {
    expect(vpnReal([], 0.035)).toBe(0);
  });

  it("returns ~189.97 for two flows of 100 at 3.5%", () => {
    const result = vpnReal(
      [
        { ano: 1, montoUF: 100 },
        { ano: 2, montoUF: 100 },
      ],
      0.035
    );
    expect(result).toBeCloseTo(189.97, 1);
  });
});

// ---------------------------------------------------------------------------
// 6. calcularImpuestoAnual
// ---------------------------------------------------------------------------
describe("calcularImpuestoAnual", () => {
  const makeHolding = (overrides: Partial<TaxableHolding>): TaxableHolding => ({
    fundName: "Test Fund",
    run: 1234,
    serie: "A",
    currentValueUF: 100,
    quantity: 100,
    acquisitionDate: "2023-01-01",
    acquisitionCostUF: 80,
    estimatedCosts: [],
    taxRegime: "general",
    preTransitional: false,
    canMLT: false,
    canDCV: false,
    comisionRescateUF: null,
    tacActual: null,
    tacPropuesto: null,
    categoria: "Renta Variable Nacional",
    hasInternationalHoldings: false,
    confianzaBaja: false,
    ...overrides,
  });

  it("DCV holding has 0 tax", () => {
    const holding = makeHolding({ canDCV: true, fundName: "DCV Fund" });
    const result = calcularImpuestoAnual([holding], 0, false, 0.66);
    expect(result.porHolding[0].impuestoUF).toBe(0);
    expect(result.porHolding[0].regimen).toBe("DCV");
  });

  it("Art. 107 holding pays 10% unique tax on gain", () => {
    const holding = makeHolding({
      taxRegime: "107",
      currentValueUF: 200,
      acquisitionCostUF: 100,
      fundName: "Art107 Fund",
    });
    const result = calcularImpuestoAnual([holding], 0, false, 0.66);
    expect(result.porHolding[0].impuestoUF).toBeCloseTo(10, 1); // 10% of 100
    expect(result.porHolding[0].regimen).toBe("107");
  });

  it("Art. 107 pre-transitional uses closingPrice20211231UF as cost basis", () => {
    const holding = makeHolding({
      taxRegime: "107",
      currentValueUF: 200,
      acquisitionCostUF: 50,
      preTransitional: true,
      closingPrice20211231UF: 150,
      fundName: "Art107 Pre Fund",
    });
    const result = calcularImpuestoAnual([holding], 0, false, 0.66);
    // Gain = 200 - 150 = 50, tax = 5
    expect(result.porHolding[0].impuestoUF).toBeCloseTo(5, 1);
  });

  it("APV holding is exempt", () => {
    const holding = makeHolding({ taxRegime: "apv", fundName: "APV Fund" });
    const result = calcularImpuestoAnual([holding], 0, false, 0.66);
    expect(result.porHolding[0].impuestoUF).toBe(0);
    expect(result.porHolding[0].regimen).toBe("APV");
  });

  it("MLT holding is deferred", () => {
    const holding = makeHolding({ canMLT: true, fundName: "MLT Fund" });
    const result = calcularImpuestoAnual([holding], 0, false, 0.66);
    expect(result.porHolding[0].impuestoUF).toBe(0);
    expect(result.porHolding[0].regimen).toBe("MLT");
  });

  it("General holding with gain pays progressive tax (bracket jumping)", () => {
    // Gain = 100 - 80 = 20 UF. RentaTrabajo = 0.
    // impuesto(0 + 20 annual) - impuesto(0) = impuesto(20 annual)
    // 20 annual = 1.667/month, within exempt bracket -> 0
    const holding = makeHolding({
      currentValueUF: 100,
      acquisitionCostUF: 80,
    });
    const result = calcularImpuestoAnual([holding], 0, false, 0.66);
    // Small gain, likely exempt
    expect(result.porHolding[0].impuestoUF).toBe(0);
  });

  it("General holding with large gain on top of work income pays tax", () => {
    // rentaTrabajo = 600 UF/year, gain = 200 UF
    // impuesto(800) - impuesto(600)
    const holding = makeHolding({
      currentValueUF: 300,
      acquisitionCostUF: 100,
      fundName: "Big Gain Fund",
    });
    const result = calcularImpuestoAnual([holding], 600, true, 0.66);
    // habitual = true -> no Art 17 N8 exemption
    expect(result.porHolding[0].impuestoUF).toBeGreaterThan(0);
    expect(result.totalImpuesto).toBeGreaterThan(0);
  });

  it("Loss netting reduces taxable gain in general regime", () => {
    const winner = makeHolding({
      fundName: "Winner",
      currentValueUF: 200,
      acquisitionCostUF: 100,
    });
    const loser = makeHolding({
      fundName: "Loser",
      currentValueUF: 50,
      acquisitionCostUF: 100,
    });
    const result = calcularImpuestoAnual([winner, loser], 600, true, 0.66);
    // Net gain = 100 - 50 = 50 (instead of 100)
    // Compare with winner-only scenario
    const resultNoLoss = calcularImpuestoAnual([winner], 600, true, 0.66);
    expect(result.totalImpuesto).toBeLessThan(resultNoLoss.totalImpuesto);
  });

  it("Non-habitual investor gets Art. 17 N8 exemption", () => {
    const holding = makeHolding({
      currentValueUF: 200,
      acquisitionCostUF: 100,
      fundName: "Exempt Fund",
    });
    // utaValueUF = 0.66, exemption = 10 * 0.66 = 6.6 UF
    const habitual = calcularImpuestoAnual([holding], 600, true, 0.66);
    const noHabitual = calcularImpuestoAnual([holding], 600, false, 0.66);
    expect(noHabitual.totalImpuesto).toBeLessThan(habitual.totalImpuesto);
  });

  it("Uses estimatedCosts fallback when acquisitionCostUF is null", () => {
    const holding = makeHolding({
      acquisitionCostUF: null,
      estimatedCosts: [{ years: 3, costUF: 85, gainsUF: 15 }],
      fundName: "No Cost Fund",
    });
    const result = calcularImpuestoAnual([holding], 0, false, 0.66);
    expect(result.porHolding[0].confianzaBaja).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 7. calcularMitigacion
// ---------------------------------------------------------------------------
describe("calcularMitigacion", () => {
  it("high earner (tasa > 15%) gets regime B", () => {
    // Renta trabajo = 80*12 = 960 UF/year -> 80/month -> tasa 0.23
    const result = calcularMitigacion(50, 960, 0, 0, 0, 0);
    expect(result.regimenAPV).toBe("B");
    expect(result.aporteAPV_UF).toBe(600);
    expect(result.ahorroTributarioAPV_UF).toBeCloseTo(600 * 0.23, 1);
  });

  it("low earner gets regime A with 15% credit", () => {
    // Renta trabajo = 20*12 = 240 UF/year -> 20/month -> tasa 0.04
    const result = calcularMitigacion(50, 240, 0, 0, 0, 0);
    expect(result.regimenAPV).toBe("A");
    expect(result.aporteAPV_UF).toBe(600);
    expect(result.ahorroTributarioAPV_UF).toBeCloseTo(600 * 0.15, 1);
  });

  it("respects already-used APV and DC", () => {
    const result = calcularMitigacion(50, 960, 200, 400, 0, 0);
    expect(result.aporteAPV_UF).toBe(400); // 600 - 200
    expect(result.aporteDC_UF).toBe(500); // 900 - 400
  });

  it("includes compensacion perdidas and exencion 17N8", () => {
    const result = calcularMitigacion(100, 960, 0, 0, 20, 10);
    expect(result.compensacionPerdidas_UF).toBe(20);
    expect(result.exencion17N8_UF).toBe(10);
    expect(result.ahorroTotal_UF).toBeGreaterThan(
      result.ahorroTributarioAPV_UF + result.ahorroTributarioDC_UF
    );
  });

  it("impuestoNeto is never negative", () => {
    // Huge mitigation vs small tax
    const result = calcularMitigacion(5, 960, 0, 0, 100, 100);
    expect(result.impuestoNeto_UF).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// 8. calcularAlphaPorReasignacion
// ---------------------------------------------------------------------------
describe("calcularAlphaPorReasignacion", () => {
  it("calculates positive alpha when rebalancing from RF-heavy to crecimiento", () => {
    const result = calcularAlphaPorReasignacion({
      holdings: [
        { categoria: "Renta Fija Nacional", currentValueUF: 8000 },
        { categoria: "Renta Variable Nacional", currentValueUF: 2000 },
      ],
      totalValueUF: 10000,
      puntajeRiesgo: 70,
      rentabilidadesEsperadas: RENTABILIDAD_ESPERADA_REAL,
    });
    expect(result.deltaRentabilidad).toBeGreaterThan(0);
    expect(result.impacto10Y_UF).toBeGreaterThan(0);
  });

  it("returns near-zero alpha when already aligned", () => {
    // Portfolio roughly matching crecimiento: 65% RV, 25% RF, 10% alt
    const result = calcularAlphaPorReasignacion({
      holdings: [
        { categoria: "Renta Variable Internacional", currentValueUF: 4550 },
        { categoria: "Renta Variable Nacional", currentValueUF: 1950 },
        { categoria: "Renta Fija Nacional", currentValueUF: 1250 },
        { categoria: "Renta Fija Internacional", currentValueUF: 1250 },
        { categoria: "Alternativos", currentValueUF: 1000 },
      ],
      totalValueUF: 10500,
      puntajeRiesgo: 70,
      rentabilidadesEsperadas: RENTABILIDAD_ESPERADA_REAL,
    });
    expect(Math.abs(result.deltaRentabilidad)).toBeLessThan(0.01);
  });

  it("returns negative alpha when already over-allocated to equities vs defensivo target", () => {
    const result = calcularAlphaPorReasignacion({
      holdings: [
        { categoria: "Renta Variable Internacional", currentValueUF: 8000 },
        { categoria: "Renta Fija Nacional", currentValueUF: 2000 },
      ],
      totalValueUF: 10000,
      puntajeRiesgo: 20, // defensivo: only 25% equities
      rentabilidadesEsperadas: RENTABILIDAD_ESPERADA_REAL,
    });
    expect(result.deltaRentabilidad).toBeLessThan(0);
  });
});
