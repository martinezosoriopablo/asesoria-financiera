// lib/tax/scenarios.ts
// Tax optimization scenarios engine for custody change optimizer.
// All monetary amounts in UF unless otherwise noted.

import type {
  TaxSimulatorInputs,
  TaxableHolding,
  ScenarioResult,
  YearPlan,
  MitigacionResult,
} from "./types";

import {
  getTramoMarginal,
  calcularImpuestoAnual,
  calcularMitigacion,
  calcularAhorroTAC,
  calcularAlphaPorReasignacion,
  vpnReal,
} from "./calculator";

// ---------------------------------------------------------------------------
// Helper: convert CLP monthly income to UF
// ---------------------------------------------------------------------------
export function ingresoMensualUF(clp: number, ufValue: number): number {
  return clp / ufValue;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function emptyMitigacion(): MitigacionResult {
  return {
    regimenAPV: "A",
    aporteAPV_UF: 0,
    aporteDC_UF: 0,
    ahorroTributarioAPV_UF: 0,
    ahorroTributarioDC_UF: 0,
    compensacionPerdidas_UF: 0,
    exencion17N8_UF: 0,
    ahorroTotal_UF: 0,
    impuestoBruto_UF: 0,
    impuestoNeto_UF: 0,
  };
}

function emptyYearPlan(ano: number): YearPlan {
  return {
    ano,
    fondosAVender: [],
    fondosConPerdida: [],
    fondosMLT: [],
    compensacionPerdidas_UF: 0,
    exencion17N8_UF: 0,
    rentaImponibleConGanancias_UF: 0,
    tramoResultante: 0,
    mitigacion: emptyMitigacion(),
    comisionesRescate_UF: 0,
    tacPagado_UF: 0,
    alphaGanado_UF: 0,
  };
}

function computeTotalTACSavings(
  holdings: TaxableHolding[],
  rentabilidadesEsperadas: Record<string, number>,
  fractionMigrated: number
): number {
  let total = 0;
  for (const h of holdings) {
    const tacActual = h.tacActual ?? 0;
    const tacPropuesto = h.tacPropuesto ?? tacActual;
    if (tacActual <= tacPropuesto) continue;
    const rent = rentabilidadesEsperadas[h.categoria] ?? 0.04;
    total += calcularAhorroTAC(h.currentValueUF, tacActual, tacPropuesto, 10, rent);
  }
  return total * fractionMigrated;
}

function computeAlpha10Y(inputs: TaxSimulatorInputs): number {
  const totalValue = inputs.holdings.reduce((s, h) => s + h.currentValueUF, 0);
  if (totalValue <= 0) return 0;
  const alpha = calcularAlphaPorReasignacion({
    holdings: inputs.holdings.map((h) => ({
      categoria: h.categoria,
      currentValueUF: h.currentValueUF,
    })),
    totalValueUF: totalValue,
    puntajeRiesgo: inputs.puntajeRiesgo,
    rentabilidadesEsperadas: inputs.rentabilidadesEsperadas,
  });
  return Math.max(0, alpha.impacto10Y_UF);
}

function buildYearPlanFromTax(
  ano: number,
  holdings: TaxableHolding[],
  rentaTrabajoAnualUF: number,
  esHabitual: boolean,
  utaValueUF: number,
  apvUsadoUF: number,
  dcUsadoUF: number
): { plan: YearPlan; impuestoNeto: number } {
  const taxResult = calcularImpuestoAnual(holdings, rentaTrabajoAnualUF, esHabitual, utaValueUF);

  const plan = emptyYearPlan(ano);

  // Fill fondosAVender, fondosConPerdida, fondosMLT from tax results
  for (const r of taxResult.porHolding) {
    if (r.regimen === "MLT") {
      plan.fondosMLT.push({
        fundName: r.fundName,
        destinoFund: "Fondo destino",
        comisionRescateUF: 0,
      });
    } else if (r.regimen === "DCV") {
      // DCV: no sale, no tax — include as 100% moved with zero tax
      plan.fondosAVender.push({
        fundName: r.fundName,
        porcentaje: 100,
        gananciaUF: 0,
        impuestoUF: 0,
        regimen: "DCV",
      });
    } else if (r.gananciaUF < 0) {
      plan.fondosConPerdida.push({
        fundName: r.fundName,
        perdidaUF: Math.abs(r.gananciaUF),
      });
    } else {
      plan.fondosAVender.push({
        fundName: r.fundName,
        porcentaje: 100,
        gananciaUF: r.gananciaUF,
        impuestoUF: r.impuestoUF,
        regimen: r.regimen,
      });
    }
  }

  plan.compensacionPerdidas_UF = taxResult.detalleCalculo.perdidasGeneral;
  plan.exencion17N8_UF = taxResult.detalleCalculo.exencion17N8;
  plan.rentaImponibleConGanancias_UF =
    rentaTrabajoAnualUF + taxResult.detalleCalculo.gananciaImponible;

  const rentaMensualConGanancia = plan.rentaImponibleConGanancias_UF / 12;
  const tramo = getTramoMarginal(rentaMensualConGanancia);
  plan.tramoResultante = tramo.tasa * 100;

  // Comisiones de rescate
  for (const h of holdings) {
    if (h.comisionRescateUF && !h.canDCV && !h.canMLT) {
      plan.comisionesRescate_UF += h.comisionRescateUF;
    }
  }

  // Mitigation
  const mitigacion = calcularMitigacion(
    taxResult.totalImpuesto,
    rentaTrabajoAnualUF,
    apvUsadoUF,
    dcUsadoUF,
    taxResult.detalleCalculo.perdidasGeneral,
    taxResult.detalleCalculo.exencion17N8
  );

  plan.mitigacion = mitigacion;

  return { plan, impuestoNeto: mitigacion.impuestoNeto_UF };
}

// ---------------------------------------------------------------------------
// Scenario A: Vender todo hoy
// ---------------------------------------------------------------------------
export function runScenarioA(
  inputs: TaxSimulatorInputs,
  utaValueUF: number,
  ufValue: number
): ScenarioResult {
  const rentaMensualUF = ingresoMensualUF(inputs.ingresoMensualCLP, ufValue);
  const rentaAnualUF = rentaMensualUF * 12;

  const { plan, impuestoNeto } = buildYearPlanFromTax(
    0,
    inputs.holdings,
    rentaAnualUF,
    inputs.esInversionistaHabitual,
    utaValueUF,
    inputs.apvUsadoEsteAno,
    inputs.dcUsadoEsteAno
  );

  // TAC savings: all migrate immediately
  const ahorroTAC = computeTotalTACSavings(inputs.holdings, inputs.rentabilidadesEsperadas, 1);
  plan.tacPagado_UF = 0; // already migrated

  // Alpha from reallocation
  const alpha10Y = computeAlpha10Y(inputs);
  plan.alphaGanado_UF = alpha10Y;

  // Annual benefit for break-even
  const annualBenefit = (ahorroTAC + alpha10Y) / 10;
  const breakEven = annualBenefit > 0 ? impuestoNeto / annualBenefit : null;

  // VPN calculation
  const benefitFlows = Array.from({ length: 10 }, (_, i) => ({
    ano: i + 1,
    montoUF: annualBenefit,
  }));
  const vpnBenefit = vpnReal(benefitFlows, inputs.tasaDescuentoReal);
  const beneficioNeto = vpnBenefit - impuestoNeto;

  return {
    nombre: "Vender todo hoy",
    descripcion:
      "Rescatar todas las posiciones de inmediato, pagar impuestos y migrar a la nueva custodia.",
    impuestoTotal_UF: impuestoNeto,
    ahorroTAC_10Y_UF: ahorroTAC,
    alphaReasignacion_10Y_UF: alpha10Y,
    costoNetoVPN_UF: impuestoNeto,
    beneficioNetoVPN_UF: beneficioNeto,
    puntoEquilibrioAnos: breakEven,
    planAnual: [plan],
    recomendado: false,
  };
}

// ---------------------------------------------------------------------------
// Scenario B: Salida escalonada optima
// ---------------------------------------------------------------------------

function sortHoldingsForStagedExit(holdings: TaxableHolding[]): TaxableHolding[] {
  const priority = (h: TaxableHolding): number => {
    if (h.canDCV) return 0;
    if (h.canMLT) return 1;
    if (h.taxRegime === "107") return 2;
    const gain = (h.currentValueUF ?? 0) - (h.acquisitionCostUF ?? h.currentValueUF);
    if (gain < 0) return 3; // losses first
    return 4;
  };

  return [...holdings].sort((a, b) => {
    const pa = priority(a);
    const pb = priority(b);
    if (pa !== pb) return pa - pb;
    // Within same priority, sort by gain ascending
    const gainA = (a.currentValueUF ?? 0) - (a.acquisitionCostUF ?? a.currentValueUF);
    const gainB = (b.currentValueUF ?? 0) - (b.acquisitionCostUF ?? b.currentValueUF);
    return gainA - gainB;
  });
}

export function runScenarioB(
  inputs: TaxSimulatorInputs,
  utaValueUF: number,
  ufValue: number
): ScenarioResult {
  const rentaMensualUF = ingresoMensualUF(inputs.ingresoMensualCLP, ufValue);
  const rentaAnualUF = rentaMensualUF * 12;
  const tramo = getTramoMarginal(rentaMensualUF);
  const bracketSpace = (tramo.tramoHasta - rentaMensualUF) * 12;

  const sorted = sortHoldingsForStagedExit(inputs.holdings);
  const remaining = new Set(sorted.map((_, i) => i));
  const plans: YearPlan[] = [];
  let totalImpuesto = 0;
  let totalMigrated = 0;
  const totalHoldings = sorted.length;

  for (let year = 0; year < 5 && remaining.size > 0; year++) {
    const yearHoldings: TaxableHolding[] = [];
    let gainAccum = 0;

    for (const idx of [...remaining]) {
      const h = sorted[idx];

      // DCV: always process (free)
      if (h.canDCV) {
        yearHoldings.push(h);
        remaining.delete(idx);
        totalMigrated++;
        continue;
      }

      // MLT: always process (deferred)
      if (h.canMLT) {
        yearHoldings.push(h);
        remaining.delete(idx);
        totalMigrated++;
        continue;
      }

      // Art 107: always process (flat 10%)
      if (h.taxRegime === "107") {
        yearHoldings.push(h);
        remaining.delete(idx);
        totalMigrated++;
        continue;
      }

      // Losses: harvest immediately
      const gain = h.currentValueUF - (h.acquisitionCostUF ?? h.currentValueUF);
      if (gain <= 0) {
        yearHoldings.push(h);
        remaining.delete(idx);
        totalMigrated++;
        continue;
      }

      // General gains: fill bracket space
      if (gainAccum + gain <= bracketSpace || bracketSpace <= 0) {
        yearHoldings.push(h);
        remaining.delete(idx);
        totalMigrated++;
        gainAccum += gain;
      }
    }

    if (yearHoldings.length === 0) break;

    const { plan, impuestoNeto } = buildYearPlanFromTax(
      year,
      yearHoldings,
      rentaAnualUF,
      inputs.esInversionistaHabitual,
      utaValueUF,
      year === 0 ? inputs.apvUsadoEsteAno : 0,
      year === 0 ? inputs.dcUsadoEsteAno : 0
    );

    totalImpuesto += impuestoNeto;
    plans.push(plan);
  }

  // If there are still remaining holdings after 5 years, sell them in year 5
  if (remaining.size > 0) {
    const leftover = [...remaining].map((i) => sorted[i]);
    const { plan, impuestoNeto } = buildYearPlanFromTax(
      5,
      leftover,
      rentaAnualUF,
      inputs.esInversionistaHabitual,
      utaValueUF,
      0,
      0
    );
    totalImpuesto += impuestoNeto;
    totalMigrated += leftover.length;
    plans.push(plan);
  }

  const fractionMigrated = totalHoldings > 0 ? totalMigrated / totalHoldings : 0;
  const ahorroTAC = computeTotalTACSavings(
    inputs.holdings,
    inputs.rentabilidadesEsperadas,
    fractionMigrated
  );
  const alpha10Y = computeAlpha10Y(inputs) * fractionMigrated;

  const annualBenefit = (ahorroTAC + alpha10Y) / 10;
  const breakEven = annualBenefit > 0 ? totalImpuesto / annualBenefit : null;

  // VPN: benefits start proportionally as holdings migrate
  const benefitFlows = Array.from({ length: 10 }, (_, i) => ({
    ano: i + 1,
    montoUF: annualBenefit,
  }));
  const vpnBenefit = vpnReal(benefitFlows, inputs.tasaDescuentoReal);
  const taxFlows = plans.map((p) => ({
    ano: p.ano,
    montoUF: p.mitigacion.impuestoNeto_UF,
  }));
  const vpnTax = vpnReal(taxFlows, inputs.tasaDescuentoReal);

  return {
    nombre: "Salida escalonada optima",
    descripcion:
      "Migrar posiciones gradualmente en hasta 5 anos, priorizando DCV, MLT y perdidas para minimizar impuesto.",
    impuestoTotal_UF: totalImpuesto,
    ahorroTAC_10Y_UF: ahorroTAC,
    alphaReasignacion_10Y_UF: alpha10Y,
    costoNetoVPN_UF: vpnTax,
    beneficioNetoVPN_UF: vpnBenefit - vpnTax,
    puntoEquilibrioAnos: breakEven,
    planAnual: plans,
    recomendado: false,
  };
}

// ---------------------------------------------------------------------------
// Scenario C: Mantener hasta jubilacion
// ---------------------------------------------------------------------------
export function runScenarioC(
  inputs: TaxSimulatorInputs,
  utaValueUF: number,
  _ufValue: number
): ScenarioResult {
  const anosHastaJubilacion = Math.max(1, inputs.edadJubilacion - inputs.edad);

  // Year 0: no sales
  const plan0 = emptyYearPlan(0);

  // At retirement: sell everything at low bracket
  const retirementIncomeAnnualUF = 200; // 200 UF/year pension
  const retirementTax = calcularImpuestoAnual(
    inputs.holdings,
    retirementIncomeAnnualUF,
    inputs.esInversionistaHabitual,
    utaValueUF
  );

  const retirementPlan = emptyYearPlan(anosHastaJubilacion);
  for (const r of retirementTax.porHolding) {
    if (r.gananciaUF < 0) {
      retirementPlan.fondosConPerdida.push({
        fundName: r.fundName,
        perdidaUF: Math.abs(r.gananciaUF),
      });
    } else {
      retirementPlan.fondosAVender.push({
        fundName: r.fundName,
        porcentaje: 100,
        gananciaUF: r.gananciaUF,
        impuestoUF: r.impuestoUF,
        regimen: r.regimen,
      });
    }
  }

  const mitigacion = calcularMitigacion(
    retirementTax.totalImpuesto,
    retirementIncomeAnnualUF,
    0,
    0,
    retirementTax.detalleCalculo.perdidasGeneral,
    retirementTax.detalleCalculo.exencion17N8
  );
  retirementPlan.mitigacion = mitigacion;
  retirementPlan.compensacionPerdidas_UF = retirementTax.detalleCalculo.perdidasGeneral;
  retirementPlan.exencion17N8_UF = retirementTax.detalleCalculo.exencion17N8;
  retirementPlan.rentaImponibleConGanancias_UF =
    retirementIncomeAnnualUF + retirementTax.detalleCalculo.gananciaImponible;

  const impuestoNeto = mitigacion.impuestoNeto_UF;

  // VPN of retirement tax
  const costoNetoVPN = vpnReal(
    [{ ano: anosHastaJubilacion, montoUF: impuestoNeto }],
    inputs.tasaDescuentoReal
  );

  return {
    nombre: "Mantener hasta jubilacion",
    descripcion:
      "No vender nada ahora. Esperar hasta la jubilacion para rescatar con un tramo impositivo mas bajo.",
    impuestoTotal_UF: impuestoNeto,
    ahorroTAC_10Y_UF: 0,
    alphaReasignacion_10Y_UF: 0,
    costoNetoVPN_UF: costoNetoVPN,
    beneficioNetoVPN_UF: -costoNetoVPN,
    puntoEquilibrioAnos: null,
    planAnual: [plan0, retirementPlan],
    recomendado: false,
  };
}

// ---------------------------------------------------------------------------
// Scenario D: Hibrido inteligente
// ---------------------------------------------------------------------------
export function runScenarioD(
  inputs: TaxSimulatorInputs,
  utaValueUF: number,
  ufValue: number
): ScenarioResult {
  // v1: reuse scenario B logic (already sorts DCV first, aggressive APV/DC in year 0)
  const base = runScenarioB(inputs, utaValueUF, ufValue);

  return {
    ...base,
    nombre: "Hibrido inteligente",
    descripcion:
      "Priorizar traspasos DCV y MLT de inmediato, maximizar APV/DC en ano 0, y escalonar ventas gravadas en los anos siguientes.",
    recomendado: false,
  };
}

// ---------------------------------------------------------------------------
// Run all scenarios and mark recommended
// ---------------------------------------------------------------------------
export function runAllScenarios(
  inputs: TaxSimulatorInputs,
  utaValueUF: number,
  ufValue: number
): ScenarioResult[] {
  const scenarios = [
    runScenarioA(inputs, utaValueUF, ufValue),
    runScenarioB(inputs, utaValueUF, ufValue),
    runScenarioC(inputs, utaValueUF, ufValue),
    runScenarioD(inputs, utaValueUF, ufValue),
  ];

  // Find the one with highest beneficioNetoVPN_UF
  let bestIdx = 0;
  for (let i = 1; i < scenarios.length; i++) {
    if (scenarios[i].beneficioNetoVPN_UF > scenarios[bestIdx].beneficioNetoVPN_UF) {
      bestIdx = i;
    }
  }
  scenarios[bestIdx].recomendado = true;

  return scenarios;
}
