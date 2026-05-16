// lib/tax/calculator.ts
// Pure tax calculation functions for the custody change optimizer.
// All monetary amounts in UF unless otherwise noted.

import {
  TRAMOS_IMPUESTO,
  APV_TOPE_ANUAL_UF,
  DC_TOPE_ANUAL_UF,
  APV_CREDITO_REGIMEN_A,
  ART107_TASA_UNICA,
  EXENCION_NO_HABITUAL_UTA,
} from "@/lib/constants/chilean-tax";
import type { TaxableHolding, HoldingTaxResult, MitigacionResult } from "./types";

// ---------------------------------------------------------------------------
// 1. getTramoMarginal
// ---------------------------------------------------------------------------
export function getTramoMarginal(rentaMensualUF: number): {
  tasa: number;
  tramoDesde: number;
  tramoHasta: number;
} {
  for (const tramo of TRAMOS_IMPUESTO) {
    if (rentaMensualUF <= tramo.hasta) {
      return {
        tasa: tramo.tasa,
        tramoDesde: tramo.desde,
        tramoHasta: tramo.hasta,
      };
    }
  }
  // Should never reach here given Infinity in last bracket
  const last = TRAMOS_IMPUESTO[TRAMOS_IMPUESTO.length - 1];
  return { tasa: last.tasa, tramoDesde: last.desde, tramoHasta: Infinity };
}

// ---------------------------------------------------------------------------
// 2. getRegimenAPVOptimo
// ---------------------------------------------------------------------------
export function getRegimenAPVOptimo(tasaMarginal: number): "A" | "B" {
  return tasaMarginal > APV_CREDITO_REGIMEN_A ? "B" : "A";
}

// ---------------------------------------------------------------------------
// 3. calcularImpuestoProgresivo
// ---------------------------------------------------------------------------
export function calcularImpuestoProgresivo(rentaAnualUF: number): number {
  if (rentaAnualUF <= 0) return 0;

  const rentaMensual = rentaAnualUF / 12;
  let impuestoMensual = 0;

  for (const tramo of TRAMOS_IMPUESTO) {
    if (rentaMensual <= tramo.desde) break;
    const baseEnTramo = Math.min(rentaMensual, tramo.hasta) - tramo.desde;
    impuestoMensual += baseEnTramo * tramo.tasa;
  }

  return impuestoMensual * 12;
}

// ---------------------------------------------------------------------------
// 4. calcularImpuestoAnual
// ---------------------------------------------------------------------------
export function calcularImpuestoAnual(
  holdings: TaxableHolding[],
  rentaTrabajoAnualUF: number,
  esHabitual: boolean,
  utaValueUF: number
): {
  porHolding: HoldingTaxResult[];
  totalImpuesto: number;
  detalleCalculo: {
    gananciaGeneralBruta: number;
    perdidasGeneral: number;
    gananciaNetaGeneral: number;
    exencion17N8: number;
    gananciaImponible: number;
  };
} {
  const results: HoldingTaxResult[] = [];

  // Separate holdings by regime
  const generalHoldings: {
    holding: TaxableHolding;
    ganancia: number;
    costBasis: number;
    confianzaBaja: boolean;
  }[] = [];

  for (const h of holdings) {
    // Priority order: DCV > APV > Art.107 > MLT > General
    if (h.canDCV) {
      results.push({
        fundName: h.fundName,
        run: h.run,
        regimen: "DCV",
        gananciaUF: 0,
        impuestoUF: 0,
        confianzaBaja: h.confianzaBaja,
        nota: "Traspaso vía DCV, sin hecho gravado",
      });
      continue;
    }

    if (h.taxRegime === "apv") {
      results.push({
        fundName: h.fundName,
        run: h.run,
        regimen: "APV",
        gananciaUF: 0,
        impuestoUF: 0,
        confianzaBaja: h.confianzaBaja,
        nota: "APV exento",
      });
      continue;
    }

    if (h.taxRegime === "107") {
      let costBasis = h.acquisitionCostUF ?? 0;
      let confianza = h.confianzaBaja;

      if (h.preTransitional && h.closingPrice20211231UF != null) {
        costBasis = h.closingPrice20211231UF;
      } else if (h.acquisitionCostUF == null) {
        if (h.estimatedCosts.length > 0) {
          costBasis = h.estimatedCosts[0].costUF;
          confianza = true;
        }
      }

      const ganancia = Math.max(0, h.currentValueUF - costBasis);
      const impuesto = ganancia * ART107_TASA_UNICA;

      results.push({
        fundName: h.fundName,
        run: h.run,
        regimen: "107",
        gananciaUF: ganancia,
        impuestoUF: impuesto,
        confianzaBaja: confianza,
        nota: "Impuesto único 10% Art. 107",
      });
      continue;
    }

    if (h.canMLT) {
      results.push({
        fundName: h.fundName,
        run: h.run,
        regimen: "MLT",
        gananciaUF: 0,
        impuestoUF: 0,
        confianzaBaja: h.confianzaBaja,
        nota: "Traspaso diferido vía MLT",
      });
      continue;
    }

    // General regime
    let costBasis = h.acquisitionCostUF;
    let confianza = h.confianzaBaja;

    if (costBasis == null) {
      if (h.estimatedCosts.length > 0) {
        costBasis = h.estimatedCosts[0].costUF;
        confianza = true;
      } else {
        costBasis = h.currentValueUF; // assume no gain
        confianza = true;
      }
    }

    const ganancia = h.currentValueUF - costBasis;
    generalHoldings.push({ holding: h, ganancia, costBasis, confianzaBaja: confianza });
  }

  // Process general regime: loss netting + bracket jumping
  let gananciaBruta = 0;
  let perdidas = 0;

  for (const gh of generalHoldings) {
    if (gh.ganancia > 0) {
      gananciaBruta += gh.ganancia;
    } else {
      perdidas += Math.abs(gh.ganancia);
    }
  }

  let gananciaNetaGeneral = Math.max(0, gananciaBruta - perdidas);

  // Art. 17 N8 exemption for non-habitual investors
  let exencion17N8 = 0;
  if (!esHabitual && gananciaNetaGeneral > 0) {
    const exencionMax = EXENCION_NO_HABITUAL_UTA * utaValueUF;
    exencion17N8 = Math.min(gananciaNetaGeneral, exencionMax);
    gananciaNetaGeneral -= exencion17N8;
  }

  // Bracket jumping: tax on (work + gains) minus tax on (work alone)
  const impuestoConGanancia = calcularImpuestoProgresivo(
    rentaTrabajoAnualUF + gananciaNetaGeneral
  );
  const impuestoSinGanancia = calcularImpuestoProgresivo(rentaTrabajoAnualUF);
  const impuestoGeneral = impuestoConGanancia - impuestoSinGanancia;

  // Distribute tax proportionally across holdings with positive gains
  const holdingsConGanancia = generalHoldings.filter((gh) => gh.ganancia > 0);
  const totalGananciaPositiva = holdingsConGanancia.reduce(
    (sum, gh) => sum + gh.ganancia,
    0
  );

  for (const gh of generalHoldings) {
    let impuestoHolding = 0;
    if (gh.ganancia > 0 && totalGananciaPositiva > 0) {
      impuestoHolding = impuestoGeneral * (gh.ganancia / totalGananciaPositiva);
    }

    results.push({
      fundName: gh.holding.fundName,
      run: gh.holding.run,
      regimen: "General",
      gananciaUF: gh.ganancia,
      impuestoUF: Math.max(0, impuestoHolding),
      confianzaBaja: gh.confianzaBaja,
      nota:
        gh.ganancia <= 0
          ? "Pérdida compensable"
          : "Régimen general, impuesto progresivo",
    });
  }

  const totalImpuesto = results.reduce((sum, r) => sum + r.impuestoUF, 0);

  return {
    porHolding: results,
    totalImpuesto,
    detalleCalculo: {
      gananciaGeneralBruta: gananciaBruta,
      perdidasGeneral: perdidas,
      gananciaNetaGeneral: gananciaNetaGeneral,
      exencion17N8,
      gananciaImponible: gananciaNetaGeneral,
    },
  };
}

// ---------------------------------------------------------------------------
// 5. calcularMitigacion
// ---------------------------------------------------------------------------
export function calcularMitigacion(
  impuestoBrutoUF: number,
  rentaTrabajoAnualUF: number,
  apvUsadoUF: number,
  dcUsadoUF: number,
  compensacionPerdidasUF: number,
  exencion17N8UF: number
): MitigacionResult {
  const rentaMensual = rentaTrabajoAnualUF / 12;
  const { tasa: tasaMarginal } = getTramoMarginal(rentaMensual);
  const regimenAPV = getRegimenAPVOptimo(tasaMarginal);

  const aporteAPV = Math.max(0, APV_TOPE_ANUAL_UF - apvUsadoUF);
  const aporteDC = Math.max(0, DC_TOPE_ANUAL_UF - dcUsadoUF);

  const ahorroAPV =
    regimenAPV === "A"
      ? aporteAPV * APV_CREDITO_REGIMEN_A
      : aporteAPV * tasaMarginal;

  const ahorroDC = aporteDC * tasaMarginal;

  const ahorroTotal =
    ahorroAPV + ahorroDC + compensacionPerdidasUF + exencion17N8UF;

  const impuestoNeto = Math.max(0, impuestoBrutoUF - ahorroTotal);

  return {
    regimenAPV,
    aporteAPV_UF: aporteAPV,
    aporteDC_UF: aporteDC,
    ahorroTributarioAPV_UF: ahorroAPV,
    ahorroTributarioDC_UF: ahorroDC,
    compensacionPerdidas_UF: compensacionPerdidasUF,
    exencion17N8_UF: exencion17N8UF,
    ahorroTotal_UF: ahorroTotal,
    impuestoBruto_UF: impuestoBrutoUF,
    impuestoNeto_UF: impuestoNeto,
  };
}

// ---------------------------------------------------------------------------
// 6. calcularAhorroTAC
// ---------------------------------------------------------------------------
export function calcularAhorroTAC(
  valorUF: number,
  tacActual: number,
  tacPropuesto: number,
  anos: number,
  rentabilidadEsperada: number
): number {
  let ahorro = 0;
  let valor = valorUF;

  for (let i = 0; i < anos; i++) {
    ahorro += valor * (tacActual - tacPropuesto) / 100;
    valor *= 1 + rentabilidadEsperada;
  }

  return ahorro;
}

// ---------------------------------------------------------------------------
// 7. calcularAlphaPorReasignacion
// ---------------------------------------------------------------------------

export interface AlphaInput {
  holdings: { categoria: string; currentValueUF: number }[];
  totalValueUF: number;
  puntajeRiesgo: number;
  rentabilidadesEsperadas: Record<string, number>;
}

// Risk-band target allocations (duplicated from risk module to keep tax lib pure)
const BANDAS_RIESGO: Record<
  string,
  { equities: number; fixedIncome: number; alt: number; cash: number }
> = {
  defensivo:   { equities: 0.25, fixedIncome: 0.60, alt: 0.10, cash: 0.05 },
  moderado:    { equities: 0.45, fixedIncome: 0.45, alt: 0.10, cash: 0.00 },
  crecimiento: { equities: 0.65, fixedIncome: 0.25, alt: 0.10, cash: 0.00 },
  agresivo:    { equities: 0.85, fixedIncome: 0.10, alt: 0.05, cash: 0.00 },
};

function getBandaRiesgo(puntaje: number) {
  if (puntaje < 30) return BANDAS_RIESGO.defensivo;
  if (puntaje < 55) return BANDAS_RIESGO.moderado;
  if (puntaje < 80) return BANDAS_RIESGO.crecimiento;
  return BANDAS_RIESGO.agresivo;
}

function bandaToCategories(banda: {
  equities: number;
  fixedIncome: number;
  alt: number;
  cash: number;
}): Record<string, number> {
  return {
    "Renta Variable Internacional": banda.equities * 0.70 * 100,
    "Renta Variable Nacional": banda.equities * 0.30 * 100,
    "Renta Fija Internacional": banda.fixedIncome * 0.50 * 100,
    "Renta Fija Nacional": banda.fixedIncome * 0.50 * 100,
    "Alternativos": banda.alt * 100,
    "Otros": banda.cash * 100,
  };
}

export function calcularAlphaPorReasignacion(input: AlphaInput): {
  asignacionActual: Record<string, number>;
  asignacionObjetivo: Record<string, number>;
  rentabilidadEsperadaActual: number;
  rentabilidadEsperadaPropuesta: number;
  deltaRentabilidad: number;
  impacto5Y_UF: number;
  impacto10Y_UF: number;
  impacto20Y_UF: number;
} {
  const { holdings, totalValueUF, puntajeRiesgo, rentabilidadesEsperadas } = input;

  // 1. Current allocation by category (% of total)
  const asignacionActual: Record<string, number> = {};
  for (const h of holdings) {
    const cat = h.categoria || "Otros";
    asignacionActual[cat] = (asignacionActual[cat] || 0) + (h.currentValueUF / totalValueUF) * 100;
  }

  // 2. Target allocation from risk benchmark
  const banda = getBandaRiesgo(puntajeRiesgo);
  const asignacionObjetivo = bandaToCategories(banda);

  // 3. Weighted average expected returns
  let rentActual = 0;
  for (const [cat, pct] of Object.entries(asignacionActual)) {
    rentActual += (pct / 100) * (rentabilidadesEsperadas[cat] ?? 0);
  }

  let rentPropuesta = 0;
  for (const [cat, pct] of Object.entries(asignacionObjetivo)) {
    rentPropuesta += (pct / 100) * (rentabilidadesEsperadas[cat] ?? 0);
  }

  const delta = rentPropuesta - rentActual;

  // 4. Impact projections
  const impacto = (n: number) =>
    totalValueUF * (Math.pow(1 + rentPropuesta, n) - Math.pow(1 + rentActual, n));

  return {
    asignacionActual,
    asignacionObjetivo,
    rentabilidadEsperadaActual: rentActual,
    rentabilidadEsperadaPropuesta: rentPropuesta,
    deltaRentabilidad: delta,
    impacto5Y_UF: impacto(5),
    impacto10Y_UF: impacto(10),
    impacto20Y_UF: impacto(20),
  };
}

// ---------------------------------------------------------------------------
// 8. vpnReal
// ---------------------------------------------------------------------------
export function vpnReal(
  flujos: { ano: number; montoUF: number }[],
  tasaReal: number
): number {
  return flujos.reduce(
    (sum, f) => sum + f.montoUF / Math.pow(1 + tasaReal, f.ano),
    0
  );
}
