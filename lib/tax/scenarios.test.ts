import { describe, it, expect } from "vitest";
import { runScenarioA, runScenarioB, runScenarioC, runAllScenarios } from "./scenarios";
import type { TaxSimulatorInputs, TaxableHolding } from "./types";

function makeHolding(overrides: Partial<TaxableHolding> = {}): TaxableHolding {
  return {
    fundName: "Test Fund",
    run: 1234,
    serie: "A",
    currentValueCLP: 38000000,
    currentValueUF: 1000,
    quantity: 100,
    acquisitionDate: "2023-01-01",
    acquisitionCostUF: 800,
    ufAtPurchase: 35000,
    estimatedCosts: [],
    taxRegime: "general",
    preTransitional: false,
    canMLT: false,
    canDCV: false,
    comisionRescateUF: null,
    tacActual: 2.0,
    tacPropuesto: 0.5,
    categoria: "Renta Variable Nacional",
    hasInternationalHoldings: false,
    confianzaBaja: false,
    ...overrides,
  };
}

function makeInputs(holdingOverrides: Partial<TaxableHolding>[] = [{}]): TaxSimulatorInputs {
  return {
    clientId: "test",
    ingresoMensualCLP: 3000000,
    edad: 45,
    edadJubilacion: 65,
    apvUsadoEsteAno: 0,
    dcUsadoEsteAno: 0,
    esInversionistaHabitual: false,
    tasaDescuentoReal: 0.035,
    rentabilidadesEsperadas: {
      "Renta Variable Nacional": 0.08,
      "Renta Fija Nacional": 0.03,
    },
    holdings: holdingOverrides.map(o => makeHolding(o)),
    perfilRiesgo: "crecimiento",
    puntajeRiesgo: 70,
  };
}

describe("Scenario A: sell all today", () => {
  it("generates a single-year plan", () => {
    const result = runScenarioA(makeInputs(), 7.5, 38000);
    expect(result.planAnual.length).toBeGreaterThanOrEqual(1);
    expect(result.planAnual[0].ano).toBe(0);
    expect(result.impuestoTotal_UF).toBeGreaterThanOrEqual(0);
    expect(result.nombre).toContain("hoy");
  });

  it("DCV holdings have zero tax", () => {
    const result = runScenarioA(makeInputs([{ canDCV: true }]), 7.5, 38000);
    expect(result.impuestoTotal_UF).toBe(0);
  });

  it("calculates TAC savings", () => {
    const result = runScenarioA(makeInputs(), 7.5, 38000);
    expect(result.ahorroTAC_10Y_UF).toBeGreaterThan(0);
  });
});

describe("Scenario B: staged exit", () => {
  it("processes MLT holdings first", () => {
    const result = runScenarioB(makeInputs([
      { canMLT: true, fundName: "MLT Fund" },
      { fundName: "General Fund" },
    ]), 7.5, 38000);
    const year0 = result.planAnual[0];
    expect(year0.fondosMLT.length).toBeGreaterThanOrEqual(1);
  });
});

describe("Scenario C: hold until retirement", () => {
  it("has zero TAC savings and alpha", () => {
    const result = runScenarioC(makeInputs(), 7.5, 38000);
    expect(result.ahorroTAC_10Y_UF).toBe(0);
    expect(result.alphaReasignacion_10Y_UF).toBe(0);
  });

  it("defers all tax to retirement", () => {
    const result = runScenarioC(makeInputs(), 7.5, 38000);
    expect(result.planAnual[0].fondosAVender).toHaveLength(0);
  });
});

describe("runAllScenarios", () => {
  it("returns 4 scenarios with exactly one recommended", () => {
    const results = runAllScenarios(makeInputs(), 7.5, 38000);
    expect(results).toHaveLength(4);
    const recommended = results.filter(s => s.recomendado);
    expect(recommended).toHaveLength(1);
  });

  it("recommended has highest beneficioNetoVPN_UF", () => {
    const results = runAllScenarios(makeInputs(), 7.5, 38000);
    const rec = results.find(s => s.recomendado)!;
    for (const s of results) {
      expect(rec.beneficioNetoVPN_UF).toBeGreaterThanOrEqual(s.beneficioNetoVPN_UF);
    }
  });
});
