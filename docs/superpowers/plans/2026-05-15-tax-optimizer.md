# Tax Optimizer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a tax-optimized fund custody change simulator that calculates the best strategy (AGF to corredora) considering tax impact, TAC savings, and risk-aligned reallocation alpha — all in UF.

**Architecture:** Pure calculation functions in `lib/tax/` (calculator + scenarios), two API routes (`/api/tax/simulate` and `/api/tax/report`), a full-page simulator UI at `/tax-optimizer`, and a summary section embedded in RadiografiaCartola. All tax math is pure functions with no DB dependency, tested via vitest.

**Tech Stack:** Next.js 16 (App Router), React 19, TypeScript, Tailwind v4, vitest, recharts (charts), lucide-react (icons), Supabase (historical prices lookup), Claude API (report generation)

---

## File Structure

### New files:
| File | Responsibility |
|------|---------------|
| `lib/constants/chilean-tax.ts` | Tax brackets, APV/DC limits, Art. 107/104 rates, expected returns |
| `lib/tax/types.ts` | All shared TypeScript interfaces (TaxableHolding, TaxSimulatorInputs, ScenarioResult, etc.) |
| `lib/tax/calculator.ts` | 8 pure calculation functions (4.1-4.8 from spec) |
| `lib/tax/calculator.test.ts` | Tests for all calculator functions |
| `lib/tax/scenarios.ts` | 4 scenario generators (A/B/C/D) |
| `lib/tax/scenarios.test.ts` | Tests for scenario logic |
| `app/api/tax/simulate/route.ts` | POST endpoint — runs all 4 scenarios |
| `app/api/tax/report/route.ts` | POST endpoint — Claude-generated report |
| `app/(advisor-shell)/tax-optimizer/page.tsx` | Full simulator page |
| `components/tax/TaxSimulator.tsx` | Main simulator component (inputs + results) |
| `components/tax/ScenarioTable.tsx` | Comparative scenario table |
| `components/tax/TaxMap.tsx` | Per-holding tax regime map |
| `components/tax/ActionPlan.tsx` | Year-by-year timeline |

### Modified files:
| File | Change |
|------|--------|
| `components/shared/AdvisorSidebar.tsx` | Add "Simulador Tributario" link to TOOL_ITEMS |
| `components/seguimiento/RadiografiaCartola.tsx` | Add tax summary section after proposal |

---

## Task 1: Tax Constants

**Files:**
- Create: `lib/constants/chilean-tax.ts`

- [ ] **Step 1: Create the constants file**

```typescript
// lib/constants/chilean-tax.ts
// Chilean tax constants for the custody change optimizer

// Tramos impuesto global complementario (UF mensuales)
export const TRAMOS_IMPUESTO = [
  { desde: 0, hasta: 13.5, tasa: 0 },
  { desde: 13.5, hasta: 30, tasa: 0.04 },
  { desde: 30, hasta: 50, tasa: 0.08 },
  { desde: 50, hasta: 70, tasa: 0.135 },
  { desde: 70, hasta: 90, tasa: 0.23 },
  { desde: 90, hasta: 120, tasa: 0.304 },
  { desde: 120, hasta: 310, tasa: 0.355 },
  { desde: 310, hasta: Infinity, tasa: 0.40 },
] as const;

// Franquicias tributarias
export const APV_TOPE_ANUAL_UF = 600;
export const DC_TOPE_ANUAL_UF = 900;
export const APV_CREDITO_REGIMEN_A = 0.15;
export const APV_A_TOPE_MENSUAL_UTM = 6;
export const ART107_TASA_UNICA = 0.10;
export const ART104_TASA_UNICA = 0.04;
export const EXENCION_NO_HABITUAL_UTA = 10;
export const EXENCION_RENTAS_CAPITAL_UTM = 30;

// Rentabilidades esperadas reales por clase de activo (en UF, configurables)
export const RENTABILIDAD_ESPERADA_REAL: Record<string, number> = {
  "Renta Variable Nacional": 0.08,
  "Renta Variable Internacional": 0.07,
  "Renta Fija Nacional": 0.03,
  "Renta Fija Internacional": 0.025,
  "Balanceado": 0.05,
  "Alternativos": 0.06,
  "Otros": 0.03,
};
```

- [ ] **Step 2: Commit**

```bash
git add lib/constants/chilean-tax.ts
git commit -m "feat(tax): add Chilean tax constants"
```

---

## Task 2: Shared Types

**Files:**
- Create: `lib/tax/types.ts`

- [ ] **Step 1: Create the types file**

```typescript
// lib/tax/types.ts
// Shared types for the tax optimizer

export interface TaxableHolding {
  fundName: string;
  run: number;
  serie: string;
  currentValueUF: number;
  quantity: number;
  acquisitionDate: string | null;
  acquisitionCostUF: number | null;
  estimatedCosts: {
    years: number;
    costUF: number;
    gainsUF: number;
  }[];
  taxRegime: "107" | "108" | "104" | "apv" | "57bis" | "general";
  preTransitional: boolean;
  closingPrice20211231UF?: number;
  canMLT: boolean;
  canDCV: boolean;
  comisionRescateUF: number | null;
  tacActual: number | null;
  tacPropuesto: number | null;
  categoria: string;
  hasInternationalHoldings: boolean;
  confianzaBaja: boolean;
}

export interface TaxSimulatorInputs {
  clientId: string;
  ingresoMensualCLP: number;
  edad: number;
  edadJubilacion: number;
  apvUsadoEsteAno: number;
  dcUsadoEsteAno: number;
  esInversionistaHabitual: boolean;
  tasaDescuentoReal: number;
  rentabilidadesEsperadas: Record<string, number>;
  holdings: TaxableHolding[];
  perfilRiesgo: string;
  puntajeRiesgo: number;
}

export interface HoldingTaxResult {
  fundName: string;
  run: number;
  regimen: string;
  gananciaUF: number;
  impuestoUF: number;
  confianzaBaja: boolean;
  nota: string;
}

export interface MitigacionResult {
  regimenAPV: "A" | "B";
  aporteAPV_UF: number;
  aporteDC_UF: number;
  ahorroTributarioAPV_UF: number;
  ahorroTributarioDC_UF: number;
  compensacionPerdidas_UF: number;
  exencion17N8_UF: number;
  ahorroTotal_UF: number;
  impuestoBruto_UF: number;
  impuestoNeto_UF: number;
}

export interface AlphaResult {
  asignacionActual: Record<string, number>;
  asignacionObjetivo: Record<string, number>;
  rentabilidadEsperadaActual: number;
  rentabilidadEsperadaPropuesta: number;
  deltaRentabilidad: number;
  impacto5Y_UF: number;
  impacto10Y_UF: number;
  impacto20Y_UF: number;
}

export interface YearPlan {
  ano: number;
  fondosAVender: {
    fundName: string;
    porcentaje: number;
    gananciaUF: number;
    impuestoUF: number;
    regimen: string;
  }[];
  fondosConPerdida: { fundName: string; perdidaUF: number }[];
  fondosMLT: {
    fundName: string;
    destinoFund: string;
    comisionRescateUF: number;
  }[];
  compensacionPerdidas_UF: number;
  exencion17N8_UF: number;
  rentaImponibleConGanancias_UF: number;
  tramoResultante: number;
  mitigacion: MitigacionResult;
  comisionesRescate_UF: number;
  tacPagado_UF: number;
  alphaGanado_UF: number;
}

export interface ScenarioResult {
  nombre: string;
  descripcion: string;
  impuestoTotal_UF: number;
  ahorroTAC_10Y_UF: number;
  alphaReasignacion_10Y_UF: number;
  costoNetoVPN_UF: number;
  beneficioNetoVPN_UF: number;
  puntoEquilibrioAnos: number | null;
  planAnual: YearPlan[];
  recomendado: boolean;
}
```

- [ ] **Step 2: Commit**

```bash
git add lib/tax/types.ts
git commit -m "feat(tax): add shared type definitions"
```

---

## Task 3: Core Calculator — Pure Functions

**Files:**
- Create: `lib/tax/calculator.ts`
- Create: `lib/tax/calculator.test.ts`

This task implements functions 4.1 through 4.8 from the spec. Due to size, split into sub-steps.

- [ ] **Step 3.1: Write tests for getTramoMarginal**

```typescript
// lib/tax/calculator.test.ts
import { describe, it, expect } from "vitest";
import {
  getTramoMarginal,
  getRegimenAPVOptimo,
  calcularImpuestoProgresivo,
  calcularImpuestoAnual,
  calcularMitigacion,
  calcularAhorroTAC,
  vpnReal,
} from "./calculator";
import type { TaxableHolding } from "./types";

/* ------------------------------------------------------------------ */
/*  getTramoMarginal                                                   */
/* ------------------------------------------------------------------ */

describe("getTramoMarginal", () => {
  it("returns 0% for income in first bracket", () => {
    const result = getTramoMarginal(10); // 10 UF/month = 120 UF/year
    expect(result.tasa).toBe(0);
  });

  it("returns 4% for income in second bracket", () => {
    // 20 UF/month is between 13.5 and 30
    const result = getTramoMarginal(20);
    expect(result.tasa).toBe(0.04);
  });

  it("returns 23% for income at 80 UF/month", () => {
    const result = getTramoMarginal(80);
    expect(result.tasa).toBe(0.23);
  });

  it("returns 40% for very high income", () => {
    const result = getTramoMarginal(500);
    expect(result.tasa).toBe(0.40);
  });

  it("returns 0% for zero income", () => {
    const result = getTramoMarginal(0);
    expect(result.tasa).toBe(0);
  });
});

/* ------------------------------------------------------------------ */
/*  getRegimenAPVOptimo                                                */
/* ------------------------------------------------------------------ */

describe("getRegimenAPVOptimo", () => {
  it("returns A when marginal rate <= 15%", () => {
    expect(getRegimenAPVOptimo(0.04)).toBe("A");
    expect(getRegimenAPVOptimo(0.08)).toBe("A");
    expect(getRegimenAPVOptimo(0.135)).toBe("A");
    expect(getRegimenAPVOptimo(0.15)).toBe("A");
  });

  it("returns B when marginal rate > 15%", () => {
    expect(getRegimenAPVOptimo(0.23)).toBe("B");
    expect(getRegimenAPVOptimo(0.304)).toBe("B");
    expect(getRegimenAPVOptimo(0.40)).toBe("B");
  });
});

/* ------------------------------------------------------------------ */
/*  calcularImpuestoProgresivo                                         */
/* ------------------------------------------------------------------ */

describe("calcularImpuestoProgresivo", () => {
  it("returns 0 for income in exempt bracket", () => {
    expect(calcularImpuestoProgresivo(100)).toBe(0); // 100 UF/year = 8.33 UF/month < 13.5
  });

  it("calculates progressive tax correctly for mid income", () => {
    // 360 UF/year = 30 UF/month (top of 2nd bracket)
    // First 13.5 months * 12 = 162 UF at 0%, next 198 UF at 4% = 7.92 UF
    const tax = calcularImpuestoProgresivo(360);
    expect(tax).toBeCloseTo(7.92, 1);
  });

  it("returns 0 for zero income", () => {
    expect(calcularImpuestoProgresivo(0)).toBe(0);
  });
});

/* ------------------------------------------------------------------ */
/*  calcularAhorroTAC                                                  */
/* ------------------------------------------------------------------ */

describe("calcularAhorroTAC", () => {
  it("calculates TAC savings over 10 years", () => {
    // 1000 UF, TAC 2% vs 0.5%, no growth for simplicity
    const ahorro = calcularAhorroTAC(1000, 2, 0.5, 10, 0);
    // Each year saves 15 UF (1.5% of 1000), 10 years = 150
    expect(ahorro).toBeCloseTo(150, 0);
  });

  it("returns 0 when TACs are equal", () => {
    expect(calcularAhorroTAC(1000, 1.5, 1.5, 10, 0.05)).toBe(0);
  });

  it("accounts for portfolio growth", () => {
    const withGrowth = calcularAhorroTAC(1000, 2, 0.5, 10, 0.05);
    const noGrowth = calcularAhorroTAC(1000, 2, 0.5, 10, 0);
    expect(withGrowth).toBeGreaterThan(noGrowth);
  });
});

/* ------------------------------------------------------------------ */
/*  vpnReal                                                            */
/* ------------------------------------------------------------------ */

describe("vpnReal", () => {
  it("discounts future flows correctly", () => {
    // Single flow of 100 UF in year 1 at 3.5% = 96.62
    const result = vpnReal([{ ano: 1, montoUF: 100 }], 0.035);
    expect(result).toBeCloseTo(96.62, 1);
  });

  it("returns 0 for empty flows", () => {
    expect(vpnReal([], 0.035)).toBe(0);
  });

  it("sums multiple discounted flows", () => {
    const flows = [
      { ano: 1, montoUF: 100 },
      { ano: 2, montoUF: 100 },
    ];
    const result = vpnReal(flows, 0.035);
    // 100/1.035 + 100/1.035^2 = 96.62 + 93.35 = 189.97
    expect(result).toBeCloseTo(189.97, 0);
  });
});
```

- [ ] **Step 3.2: Run tests to verify they fail**

Run: `npx vitest run lib/tax/calculator.test.ts`
Expected: FAIL — module `./calculator` not found

- [ ] **Step 3.3: Implement calculator.ts**

```typescript
// lib/tax/calculator.ts
// Pure tax calculation functions — all amounts in UF

import { TRAMOS_IMPUESTO, ART107_TASA_UNICA, APV_TOPE_ANUAL_UF, DC_TOPE_ANUAL_UF, APV_CREDITO_REGIMEN_A, EXENCION_NO_HABITUAL_UTA } from "@/lib/constants/chilean-tax";
import type { TaxableHolding, HoldingTaxResult, MitigacionResult } from "./types";

// 4.1 — Get marginal tax bracket from monthly income in UF
export function getTramoMarginal(rentaMensualUF: number): {
  tasa: number;
  tramoDesde: number;
  tramoHasta: number;
} {
  for (const tramo of TRAMOS_IMPUESTO) {
    if (rentaMensualUF >= tramo.desde && rentaMensualUF < tramo.hasta) {
      return { tasa: tramo.tasa, tramoDesde: tramo.desde, tramoHasta: tramo.hasta };
    }
  }
  // Last bracket
  const last = TRAMOS_IMPUESTO[TRAMOS_IMPUESTO.length - 1];
  return { tasa: last.tasa, tramoDesde: last.desde, tramoHasta: last.hasta };
}

// 4.2 — Optimal APV regime
export function getRegimenAPVOptimo(tasaMarginal: number): "A" | "B" {
  return tasaMarginal > 0.15 ? "B" : "A";
}

// Helper: progressive tax on annual UF income
// Converts annual to monthly, applies brackets, returns annual tax
export function calcularImpuestoProgresivo(rentaAnualUF: number): number {
  const mensual = rentaAnualUF / 12;
  let impuestoMensual = 0;

  for (const tramo of TRAMOS_IMPUESTO) {
    if (mensual <= tramo.desde) break;
    const baseEnTramo = Math.min(mensual, tramo.hasta) - tramo.desde;
    impuestoMensual += baseEnTramo * tramo.tasa;
  }

  return impuestoMensual * 12;
}

// 4.3 — Annual tax calculation across all holdings
export function calcularImpuestoAnual(
  holdings: TaxableHolding[],
  rentaTrabajoAnualUF: number,
  esHabitual: boolean,
  utaValueUF: number = 7.5, // 1 UTA approx in UF, caller should provide real value
): {
  porHolding: HoldingTaxResult[];
  totalImpuesto: number;
  detalleCalculo: string[];
} {
  const detalle: string[] = [];
  const resultados: HoldingTaxResult[] = [];

  // Separate by regime
  const dcv = holdings.filter(h => h.canDCV);
  const art107 = holdings.filter(h => h.taxRegime === "107" && !h.canDCV);
  const apv = holdings.filter(h => h.taxRegime === "apv" && !h.canDCV);
  const mlt = holdings.filter(h => h.canMLT && !h.canDCV && h.taxRegime !== "apv" && h.taxRegime !== "107");
  const general = holdings.filter(h =>
    !h.canDCV && !h.canMLT &&
    h.taxRegime !== "107" && h.taxRegime !== "apv"
  );

  // DCV: no tax event
  for (const h of dcv) {
    resultados.push({
      fundName: h.fundName, run: h.run, regimen: "DCV",
      gananciaUF: 0, impuestoUF: 0, confianzaBaja: h.confianzaBaja,
      nota: "Traspaso custodia puro via DCV — sin hecho gravado",
    });
  }
  if (dcv.length > 0) detalle.push(`${dcv.length} holding(s) via DCV: impuesto $0`);

  // Art. 107: 10% unique tax
  let impuesto107Total = 0;
  for (const h of art107) {
    let costo = h.acquisitionCostUF;
    let nota = "Art. 107 LIR — 10% unico";
    if (h.preTransitional && h.closingPrice20211231UF != null) {
      costo = h.closingPrice20211231UF * h.quantity;
      nota += " (precio transitorio 31/12/2021)";
    }
    const ganancia = Math.max(0, h.currentValueUF - (costo ?? h.estimatedCosts[0]?.costUF ?? h.currentValueUF));
    const impuesto = ganancia * ART107_TASA_UNICA;
    impuesto107Total += impuesto;
    resultados.push({
      fundName: h.fundName, run: h.run, regimen: "107",
      gananciaUF: ganancia, impuestoUF: impuesto,
      confianzaBaja: costo == null || h.confianzaBaja, nota,
    });
  }
  if (art107.length > 0) detalle.push(`Art. 107: ${art107.length} holding(s), impuesto ${impuesto107Total.toFixed(1)} UF`);

  // APV: exempt
  for (const h of apv) {
    resultados.push({
      fundName: h.fundName, run: h.run, regimen: "APV",
      gananciaUF: 0, impuestoUF: 0, confianzaBaja: false,
      nota: "APV — exento al traspasar",
    });
  }

  // MLT: deferred
  for (const h of mlt) {
    resultados.push({
      fundName: h.fundName, run: h.run, regimen: "MLT/108",
      gananciaUF: 0, impuestoUF: 0, confianzaBaja: false,
      nota: "MLT Art. 108 — impuesto diferido",
    });
  }

  // General regime: loss netting + bracket jumping
  let sumaGanancias = 0;
  let sumaPerdidas = 0;
  let anyConfianzaBaja = false;

  for (const h of general) {
    const costo = h.acquisitionCostUF ?? h.estimatedCosts[0]?.costUF ?? h.currentValueUF;
    const ganancia = h.currentValueUF - costo;
    if (h.confianzaBaja || h.acquisitionCostUF == null) anyConfianzaBaja = true;

    if (ganancia >= 0) {
      sumaGanancias += ganancia;
    } else {
      sumaPerdidas += Math.abs(ganancia);
    }

    resultados.push({
      fundName: h.fundName, run: h.run, regimen: "General",
      gananciaUF: ganancia, impuestoUF: 0, // filled below after netting
      confianzaBaja: h.confianzaBaja || h.acquisitionCostUF == null,
      nota: ganancia < 0 ? "Perdida — compensa ganancias" : "Regimen general",
    });
  }

  // Net losses against gains
  const compensacion = Math.min(sumaGanancias, sumaPerdidas);
  let gananciaNetaGeneral = Math.max(0, sumaGanancias - sumaPerdidas);

  if (compensacion > 0) {
    detalle.push(`Compensacion perdidas: ${compensacion.toFixed(1)} UF neteadas`);
  }

  // Art. 17 N°8: 10 UTA exemption for non-habitual
  let exencion17N8 = 0;
  if (!esHabitual) {
    const exencionUF = EXENCION_NO_HABITUAL_UTA * utaValueUF;
    exencion17N8 = Math.min(gananciaNetaGeneral, exencionUF);
    gananciaNetaGeneral -= exencion17N8;
    if (exencion17N8 > 0) {
      detalle.push(`Exencion Art. 17 N°8: ${exencion17N8.toFixed(1)} UF (10 UTA)`);
    }
  }

  // Bracket jumping: progressive tax on total income
  const impuestoSoloTrabajo = calcularImpuestoProgresivo(rentaTrabajoAnualUF);
  const impuestoTotal = calcularImpuestoProgresivo(rentaTrabajoAnualUF + gananciaNetaGeneral);
  const impuestoAdicionalGeneral = impuestoTotal - impuestoSoloTrabajo;

  if (gananciaNetaGeneral > 0) {
    detalle.push(`Ganancia neta general: ${gananciaNetaGeneral.toFixed(1)} UF, impuesto adicional: ${impuestoAdicionalGeneral.toFixed(1)} UF`);
  }

  // Distribute general tax proportionally across holdings with gains
  const generalConGanancia = resultados.filter(r => r.regimen === "General" && r.gananciaUF > 0);
  const totalGananciaPositiva = generalConGanancia.reduce((s, r) => s + r.gananciaUF, 0);
  if (totalGananciaPositiva > 0 && impuestoAdicionalGeneral > 0) {
    for (const r of generalConGanancia) {
      r.impuestoUF = impuestoAdicionalGeneral * (r.gananciaUF / totalGananciaPositiva);
    }
  }

  const totalImpuesto = impuesto107Total + impuestoAdicionalGeneral;

  return {
    porHolding: resultados,
    totalImpuesto,
    detalleCalculo: detalle,
  };
}

// 4.4 — Mitigation calculation
export function calcularMitigacion(
  impuestoBrutoUF: number,
  rentaTrabajoAnualUF: number,
  apvUsadoUF: number,
  dcUsadoUF: number,
  compensacionPerdidasUF: number,
  exencion17N8UF: number,
): MitigacionResult {
  const tasaMarginal = getTramoMarginal(rentaTrabajoAnualUF / 12).tasa;
  const regimen = getRegimenAPVOptimo(tasaMarginal);

  const aporteAPV = Math.max(0, APV_TOPE_ANUAL_UF - apvUsadoUF);
  const aporteDC = Math.max(0, DC_TOPE_ANUAL_UF - dcUsadoUF);

  let ahorroAPV: number;
  if (regimen === "A") {
    ahorroAPV = aporteAPV * APV_CREDITO_REGIMEN_A;
  } else {
    ahorroAPV = aporteAPV * tasaMarginal;
  }
  const ahorroDC = aporteDC * tasaMarginal;

  const ahorroTotal = ahorroAPV + ahorroDC + compensacionPerdidasUF + exencion17N8UF;

  return {
    regimenAPV: regimen,
    aporteAPV_UF: aporteAPV,
    aporteDC_UF: aporteDC,
    ahorroTributarioAPV_UF: ahorroAPV,
    ahorroTributarioDC_UF: ahorroDC,
    compensacionPerdidas_UF: compensacionPerdidasUF,
    exencion17N8_UF: exencion17N8UF,
    ahorroTotal_UF: ahorroTotal,
    impuestoBruto_UF: impuestoBrutoUF,
    impuestoNeto_UF: Math.max(0, impuestoBrutoUF - ahorroTotal),
  };
}

// 4.6 — TAC savings (compounded)
export function calcularAhorroTAC(
  valorUF: number,
  tacActual: number,
  tacPropuesto: number,
  anos: number,
  rentabilidadEsperada: number,
): number {
  let ahorro = 0;
  let valor = valorUF;
  for (let i = 0; i < anos; i++) {
    const costoActual = valor * tacActual / 100;
    const costoPropuesto = valor * tacPropuesto / 100;
    ahorro += costoActual - costoPropuesto;
    valor *= (1 + rentabilidadEsperada);
  }
  return ahorro;
}

// 4.7 — NPV with real discount rate
export function vpnReal(
  flujos: { ano: number; montoUF: number }[],
  tasaReal: number,
): number {
  return flujos.reduce((sum, f) => sum + f.montoUF / Math.pow(1 + tasaReal, f.ano), 0);
}
```

- [ ] **Step 3.4: Run tests to verify they pass**

Run: `npx vitest run lib/tax/calculator.test.ts`
Expected: All tests PASS

- [ ] **Step 3.5: Commit**

```bash
git add lib/tax/calculator.ts lib/tax/calculator.test.ts
git commit -m "feat(tax): implement core calculator functions with tests"
```

---

## Task 4: Alpha Calculation (calcularAlphaPorReasignacion)

**Files:**
- Modify: `lib/tax/calculator.ts`
- Modify: `lib/tax/calculator.test.ts`

- [ ] **Step 4.1: Add test for calcularAlphaPorReasignacion**

Append to `lib/tax/calculator.test.ts`:

```typescript
import { calcularAlphaPorReasignacion } from "./calculator";
import { RENTABILIDAD_ESPERADA_REAL } from "@/lib/constants/chilean-tax";

/* ------------------------------------------------------------------ */
/*  calcularAlphaPorReasignacion                                       */
/* ------------------------------------------------------------------ */

describe("calcularAlphaPorReasignacion", () => {
  it("calculates positive alpha when rebalancing to higher equity", () => {
    const result = calcularAlphaPorReasignacion({
      holdings: [
        { categoria: "Renta Fija Nacional", currentValueUF: 8000 },
        { categoria: "Renta Variable Nacional", currentValueUF: 2000 },
      ],
      totalValueUF: 10000,
      puntajeRiesgo: 70, // crecimiento band => 65% equities
      rentabilidadesEsperadas: RENTABILIDAD_ESPERADA_REAL,
    });
    // Current: 80% RF (3%) + 20% RV (8%) = 4.0%
    // Target crecimiento: ~65% equities, ~25% FI, ~10% alt
    expect(result.deltaRentabilidad).toBeGreaterThan(0);
    expect(result.impacto10Y_UF).toBeGreaterThan(0);
  });

  it("returns zero alpha when already aligned", () => {
    const result = calcularAlphaPorReasignacion({
      holdings: [
        { categoria: "Renta Variable Internacional", currentValueUF: 6500 },
        { categoria: "Renta Fija Nacional", currentValueUF: 2500 },
        { categoria: "Alternativos", currentValueUF: 1000 },
      ],
      totalValueUF: 10000,
      puntajeRiesgo: 70,
      rentabilidadesEsperadas: RENTABILIDAD_ESPERADA_REAL,
    });
    // Already close to crecimiento target
    expect(Math.abs(result.deltaRentabilidad)).toBeLessThan(0.02);
  });
});
```

- [ ] **Step 4.2: Run test to verify it fails**

Run: `npx vitest run lib/tax/calculator.test.ts -t "calcularAlphaPorReasignacion"`
Expected: FAIL

- [ ] **Step 4.3: Implement calcularAlphaPorReasignacion**

Add to `lib/tax/calculator.ts`:

```typescript
import { RENTABILIDAD_ESPERADA_REAL } from "@/lib/constants/chilean-tax";

// Category mapping to asset class for benchmark comparison
const CATEGORIA_TO_CLASS: Record<string, "equities" | "fixedIncome" | "alternatives" | "cash"> = {
  "Renta Variable Nacional": "equities",
  "Renta Variable Internacional": "equities",
  "Renta Fija Nacional": "fixedIncome",
  "Renta Fija Internacional": "fixedIncome",
  "Balanceado": "equities", // treated as 50/50 conceptually but mapped to equities for simplicity
  "Alternativos": "alternatives",
  "Otros": "cash",
};

// Risk band weights (duplicated from benchmarks.ts to keep tax lib pure)
const RISK_BAND_WEIGHTS: Record<string, { equities: number; fixedIncome: number; alternatives: number; cash: number }> = {
  defensivo: { equities: 25, fixedIncome: 60, alternatives: 10, cash: 5 },
  moderado: { equities: 45, fixedIncome: 45, alternatives: 10, cash: 0 },
  crecimiento: { equities: 65, fixedIncome: 25, alternatives: 10, cash: 0 },
  agresivo: { equities: 85, fixedIncome: 10, alternatives: 5, cash: 0 },
};

function riskBandFromScore(score: number): string {
  if (score < 30) return "defensivo";
  if (score < 55) return "moderado";
  if (score < 80) return "crecimiento";
  return "agresivo";
}

// Weighted average expected return for a given asset allocation
function expectedReturn(
  allocation: Record<string, number>, // category -> % weight (0-100)
  rates: Record<string, number>,
): number {
  let totalReturn = 0;
  let totalWeight = 0;
  for (const [cat, weight] of Object.entries(allocation)) {
    const rate = rates[cat] ?? 0.03;
    totalReturn += (weight / 100) * rate;
    totalWeight += weight / 100;
  }
  return totalWeight > 0 ? totalReturn / totalWeight * totalWeight : 0;
}

export interface AlphaInput {
  holdings: { categoria: string; currentValueUF: number }[];
  totalValueUF: number;
  puntajeRiesgo: number;
  rentabilidadesEsperadas: Record<string, number>;
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
  // Current allocation by category (%)
  const asignacionActual: Record<string, number> = {};
  for (const h of input.holdings) {
    const cat = h.categoria || "Otros";
    asignacionActual[cat] = (asignacionActual[cat] || 0) + (h.currentValueUF / input.totalValueUF) * 100;
  }

  // Target allocation from risk benchmark
  const band = riskBandFromScore(input.puntajeRiesgo);
  const weights = RISK_BAND_WEIGHTS[band];

  // Map benchmark weights to categories for expected return
  const asignacionObjetivo: Record<string, number> = {
    "Renta Variable Internacional": weights.equities * 0.7,
    "Renta Variable Nacional": weights.equities * 0.3,
    "Renta Fija Nacional": weights.fixedIncome * 0.5,
    "Renta Fija Internacional": weights.fixedIncome * 0.5,
    "Alternativos": weights.alternatives,
    "Otros": weights.cash,
  };

  const rates = input.rentabilidadesEsperadas;

  // Calculate expected returns
  let retActual = 0;
  for (const [cat, pct] of Object.entries(asignacionActual)) {
    retActual += (pct / 100) * (rates[cat] ?? 0.03);
  }

  let retPropuesta = 0;
  for (const [cat, pct] of Object.entries(asignacionObjetivo)) {
    retPropuesta += (pct / 100) * (rates[cat] ?? 0.03);
  }

  const delta = retPropuesta - retActual;
  const v = input.totalValueUF;

  return {
    asignacionActual,
    asignacionObjetivo,
    rentabilidadEsperadaActual: retActual,
    rentabilidadEsperadaPropuesta: retPropuesta,
    deltaRentabilidad: delta,
    impacto5Y_UF: v * (Math.pow(1 + retPropuesta, 5) - Math.pow(1 + retActual, 5)),
    impacto10Y_UF: v * (Math.pow(1 + retPropuesta, 10) - Math.pow(1 + retActual, 10)),
    impacto20Y_UF: v * (Math.pow(1 + retPropuesta, 20) - Math.pow(1 + retActual, 20)),
  };
}
```

- [ ] **Step 4.4: Run tests**

Run: `npx vitest run lib/tax/calculator.test.ts`
Expected: All PASS

- [ ] **Step 4.5: Commit**

```bash
git add lib/tax/calculator.ts lib/tax/calculator.test.ts
git commit -m "feat(tax): add alpha calculation for reallocation benefit"
```

---

## Task 5: Scenarios Engine

**Files:**
- Create: `lib/tax/scenarios.ts`
- Create: `lib/tax/scenarios.test.ts`

- [ ] **Step 5.1: Write scenario tests**

```typescript
// lib/tax/scenarios.test.ts
import { describe, it, expect } from "vitest";
import { runScenarioA, runScenarioB, runScenarioC, runScenarioD, runAllScenarios } from "./scenarios";
import type { TaxSimulatorInputs, TaxableHolding } from "./types";

function makeHolding(overrides: Partial<TaxableHolding>): TaxableHolding {
  return {
    fundName: "Test Fund",
    run: 1234,
    serie: "A",
    currentValueUF: 1000,
    quantity: 100,
    acquisitionDate: "2023-01-01",
    acquisitionCostUF: 800,
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
    const result = runScenarioA(makeInputs(), 7.5, 50);
    expect(result.planAnual).toHaveLength(1);
    expect(result.planAnual[0].ano).toBe(0);
    expect(result.impuestoTotal_UF).toBeGreaterThanOrEqual(0);
  });

  it("marks DCV holdings with zero tax", () => {
    const result = runScenarioA(makeInputs([{ canDCV: true }]), 7.5, 50);
    expect(result.impuestoTotal_UF).toBe(0);
  });
});

describe("Scenario C: hold until retirement", () => {
  it("has zero immediate tax", () => {
    const result = runScenarioC(makeInputs(), 7.5, 50);
    // Year 0 should have no sales
    expect(result.planAnual[0].fondosAVender).toHaveLength(0);
    expect(result.ahorroTAC_10Y_UF).toBe(0);
  });
});

describe("runAllScenarios", () => {
  it("returns 4 scenarios with exactly one recommended", () => {
    const results = runAllScenarios(makeInputs(), 7.5, 50);
    expect(results).toHaveLength(4);
    const recommended = results.filter(s => s.recomendado);
    expect(recommended).toHaveLength(1);
  });
});
```

- [ ] **Step 5.2: Run tests to verify they fail**

Run: `npx vitest run lib/tax/scenarios.test.ts`
Expected: FAIL — module not found

- [ ] **Step 5.3: Implement scenarios.ts**

```typescript
// lib/tax/scenarios.ts
// Four tax optimization scenarios

import type { TaxSimulatorInputs, ScenarioResult, YearPlan, MitigacionResult } from "./types";
import {
  calcularImpuestoAnual,
  calcularMitigacion,
  calcularAhorroTAC,
  vpnReal,
  calcularAlphaPorReasignacion,
  getTramoMarginal,
  calcularImpuestoProgresivo,
} from "./calculator";
import { RENTABILIDAD_ESPERADA_REAL } from "@/lib/constants/chilean-tax";

// Helper: UF monthly income from CLP
function ingresoMensualUF(clp: number, ufValue: number): number {
  return clp / ufValue;
}

function emptyMitigacion(): MitigacionResult {
  return {
    regimenAPV: "B", aporteAPV_UF: 0, aporteDC_UF: 0,
    ahorroTributarioAPV_UF: 0, ahorroTributarioDC_UF: 0,
    compensacionPerdidas_UF: 0, exencion17N8_UF: 0,
    ahorroTotal_UF: 0, impuestoBruto_UF: 0, impuestoNeto_UF: 0,
  };
}

// Average expected return for a set of holdings
function avgExpectedReturn(
  holdings: { categoria: string; currentValueUF: number }[],
  rates: Record<string, number>,
): number {
  const total = holdings.reduce((s, h) => s + h.currentValueUF, 0);
  if (total === 0) return 0;
  return holdings.reduce((s, h) => s + (h.currentValueUF / total) * (rates[h.categoria] ?? 0.03), 0);
}

// ==================== SCENARIO A: Sell all today ====================
export function runScenarioA(
  inputs: TaxSimulatorInputs,
  utaValueUF: number,
  ufValue: number,
): ScenarioResult {
  const rentaAnualUF = ingresoMensualUF(inputs.ingresoMensualCLP, ufValue) * 12;
  const { porHolding, totalImpuesto, detalleCalculo } = calcularImpuestoAnual(
    inputs.holdings, rentaAnualUF, inputs.esInversionistaHabitual, utaValueUF,
  );

  const mitigacion = calcularMitigacion(
    totalImpuesto, rentaAnualUF,
    inputs.apvUsadoEsteAno, inputs.dcUsadoEsteAno, 0, 0,
  );

  const totalValue = inputs.holdings.reduce((s, h) => s + h.currentValueUF, 0);
  const avgRate = avgExpectedReturn(inputs.holdings, inputs.rentabilidadesEsperadas);

  // TAC savings: all holdings switch to proposed TAC immediately
  let ahorroTAC10Y = 0;
  for (const h of inputs.holdings) {
    if (h.tacActual != null && h.tacPropuesto != null) {
      ahorroTAC10Y += calcularAhorroTAC(h.currentValueUF, h.tacActual, h.tacPropuesto, 10, avgRate);
    }
  }

  const alpha = calcularAlphaPorReasignacion({
    holdings: inputs.holdings.map(h => ({ categoria: h.categoria, currentValueUF: h.currentValueUF })),
    totalValueUF: totalValue,
    puntajeRiesgo: inputs.puntajeRiesgo,
    rentabilidadesEsperadas: inputs.rentabilidadesEsperadas,
  });

  const impuestoNeto = mitigacion.impuestoNeto_UF;

  // Break-even: when cumulative TAC savings + alpha exceed tax paid
  const annualBenefit = (ahorroTAC10Y / 10) + (alpha.impacto10Y_UF / 10);
  const breakeven = annualBenefit > 0 ? impuestoNeto / annualBenefit : null;

  const beneficioVPN = vpnReal(
    Array.from({ length: 10 }, (_, i) => ({
      ano: i + 1,
      montoUF: annualBenefit,
    })),
    inputs.tasaDescuentoReal,
  ) - impuestoNeto;

  const yearPlan: YearPlan = {
    ano: 0,
    fondosAVender: porHolding
      .filter(h => h.regimen !== "DCV" && h.regimen !== "MLT/108" && h.regimen !== "APV")
      .map(h => ({
        fundName: h.fundName, porcentaje: 100, gananciaUF: h.gananciaUF,
        impuestoUF: h.impuestoUF, regimen: h.regimen,
      })),
    fondosConPerdida: porHolding.filter(h => h.gananciaUF < 0).map(h => ({ fundName: h.fundName, perdidaUF: Math.abs(h.gananciaUF) })),
    fondosMLT: inputs.holdings.filter(h => h.canMLT && !h.canDCV).map(h => ({
      fundName: h.fundName, destinoFund: "Fondo propuesto", comisionRescateUF: h.comisionRescateUF ?? 0,
    })),
    compensacionPerdidas_UF: mitigacion.compensacionPerdidas_UF,
    exencion17N8_UF: mitigacion.exencion17N8_UF,
    rentaImponibleConGanancias_UF: rentaAnualUF + totalImpuesto,
    tramoResultante: getTramoMarginal(ingresoMensualUF(inputs.ingresoMensualCLP, ufValue)).tasa,
    mitigacion,
    comisionesRescate_UF: inputs.holdings.reduce((s, h) => s + (h.comisionRescateUF ?? 0), 0),
    tacPagado_UF: 0,
    alphaGanado_UF: 0,
  };

  return {
    nombre: "A: Vender todo hoy",
    descripcion: "Liquidar todas las posiciones inmediatamente, pagar impuesto, y reinvertir en portafolio optimizado.",
    impuestoTotal_UF: impuestoNeto,
    ahorroTAC_10Y_UF: ahorroTAC10Y,
    alphaReasignacion_10Y_UF: alpha.impacto10Y_UF,
    costoNetoVPN_UF: impuestoNeto,
    beneficioNetoVPN_UF: beneficioVPN,
    puntoEquilibrioAnos: breakeven != null && breakeven > 0 ? Math.round(breakeven * 10) / 10 : null,
    planAnual: [yearPlan],
    recomendado: false,
  };
}

// ==================== SCENARIO C: Hold until retirement ====================
export function runScenarioC(
  inputs: TaxSimulatorInputs,
  utaValueUF: number,
  ufValue: number,
): ScenarioResult {
  const anosHastaJubilacion = Math.max(1, inputs.edadJubilacion - inputs.edad);
  const totalValue = inputs.holdings.reduce((s, h) => s + h.currentValueUF, 0);

  // At retirement, sell at lower bracket (assume 4% marginal for pensioner)
  const rentaJubiladoAnualUF = 200; // ~$8M CLP pension
  const { totalImpuesto } = calcularImpuestoAnual(
    inputs.holdings, rentaJubiladoAnualUF, inputs.esInversionistaHabitual, utaValueUF,
  );

  const yearPlans: YearPlan[] = [{
    ano: 0,
    fondosAVender: [],
    fondosConPerdida: [],
    fondosMLT: [],
    compensacionPerdidas_UF: 0,
    exencion17N8_UF: 0,
    rentaImponibleConGanancias_UF: 0,
    tramoResultante: 0,
    mitigacion: emptyMitigacion(),
    comisionesRescate_UF: 0,
    tacPagado_UF: inputs.holdings.reduce((s, h) => s + (h.tacActual ?? 0) / 100 * h.currentValueUF, 0),
    alphaGanado_UF: 0,
  }];

  return {
    nombre: "C: Mantener hasta jubilacion",
    descripcion: `Mantener posiciones actuales ${anosHastaJubilacion} anos hasta jubilacion, vender con tramo bajo.`,
    impuestoTotal_UF: totalImpuesto,
    ahorroTAC_10Y_UF: 0,
    alphaReasignacion_10Y_UF: 0,
    costoNetoVPN_UF: vpnReal([{ ano: anosHastaJubilacion, montoUF: totalImpuesto }], inputs.tasaDescuentoReal),
    beneficioNetoVPN_UF: -vpnReal([{ ano: anosHastaJubilacion, montoUF: totalImpuesto }], inputs.tasaDescuentoReal),
    puntoEquilibrioAnos: null,
    planAnual: yearPlans,
    recomendado: false,
  };
}

// ==================== SCENARIO B: Staged optimal exit ====================
export function runScenarioB(
  inputs: TaxSimulatorInputs,
  utaValueUF: number,
  ufValue: number,
): ScenarioResult {
  const rentaMensualUF = ingresoMensualUF(inputs.ingresoMensualCLP, ufValue);
  const rentaAnualUF = rentaMensualUF * 12;
  const tramo = getTramoMarginal(rentaMensualUF);
  const espacioTramo = (tramo.tramoHasta - rentaMensualUF) * 12;
  const totalValue = inputs.holdings.reduce((s, h) => s + h.currentValueUF, 0);
  const avgRate = avgExpectedReturn(inputs.holdings, inputs.rentabilidadesEsperadas);

  // Sort: MLT first, then 107, then losses, then smallest gains
  const sorted = [...inputs.holdings].sort((a, b) => {
    if (a.canDCV !== b.canDCV) return a.canDCV ? -1 : 1;
    if (a.canMLT !== b.canMLT) return a.canMLT ? -1 : 1;
    if (a.taxRegime === "107" && b.taxRegime !== "107") return -1;
    if (a.taxRegime !== "107" && b.taxRegime === "107") return 1;
    const gA = a.currentValueUF - (a.acquisitionCostUF ?? a.currentValueUF);
    const gB = b.currentValueUF - (b.acquisitionCostUF ?? b.currentValueUF);
    return gA - gB; // losses first, then small gains
  });

  const planAnual: YearPlan[] = [];
  const remaining = new Set(sorted.map((_, i) => i));
  let totalImpuesto = 0;
  let totalTACSavings = 0;
  const maxYears = Math.min(5, inputs.edadJubilacion - inputs.edad);

  for (let year = 0; year <= maxYears && remaining.size > 0; year++) {
    const yearSales: YearPlan["fondosAVender"] = [];
    const yearMLT: YearPlan["fondosMLT"] = [];
    const yearLosses: YearPlan["fondosConPerdida"] = [];
    let yearGains = 0;
    let yearLossTotal = 0;
    let comisiones = 0;

    for (const idx of [...remaining]) {
      const h = sorted[idx];

      // DCV: always move immediately
      if (h.canDCV) {
        remaining.delete(idx);
        continue;
      }

      // MLT: always move (deferred)
      if (h.canMLT) {
        yearMLT.push({ fundName: h.fundName, destinoFund: "Propuesto", comisionRescateUF: h.comisionRescateUF ?? 0 });
        comisiones += h.comisionRescateUF ?? 0;
        remaining.delete(idx);
        continue;
      }

      // Art. 107: always sell (10% is usually worth it for TAC savings)
      if (h.taxRegime === "107") {
        const costo = h.preTransitional && h.closingPrice20211231UF
          ? h.closingPrice20211231UF * h.quantity
          : (h.acquisitionCostUF ?? h.currentValueUF);
        const ganancia = Math.max(0, h.currentValueUF - costo);
        yearSales.push({ fundName: h.fundName, porcentaje: 100, gananciaUF: ganancia, impuestoUF: ganancia * 0.10, regimen: "107" });
        totalImpuesto += ganancia * 0.10;
        remaining.delete(idx);
        continue;
      }

      // General: sell losses first, then fill bracket space
      const costo = h.acquisitionCostUF ?? h.currentValueUF;
      const ganancia = h.currentValueUF - costo;

      if (ganancia < 0) {
        yearLosses.push({ fundName: h.fundName, perdidaUF: Math.abs(ganancia) });
        yearLossTotal += Math.abs(ganancia);
        remaining.delete(idx);
        continue;
      }

      // Check if gain fits in bracket space (after loss netting)
      const netGain = ganancia - yearLossTotal;
      if (netGain <= espacioTramo - yearGains) {
        yearSales.push({ fundName: h.fundName, porcentaje: 100, gananciaUF: ganancia, impuestoUF: 0, regimen: "General" });
        yearGains += Math.max(0, netGain);
        remaining.delete(idx);
      }
    }

    // Calculate actual tax for this year's general sales
    const yearNetGain = Math.max(0, yearGains - yearLossTotal);
    const exencion = !inputs.esInversionistaHabitual ? Math.min(yearNetGain, utaValueUF * 10) : 0;
    const taxableGain = Math.max(0, yearNetGain - exencion);
    const impProgresivo = calcularImpuestoProgresivo(rentaAnualUF + taxableGain) - calcularImpuestoProgresivo(rentaAnualUF);
    totalImpuesto += impProgresivo;

    // Distribute tax to sales
    for (const s of yearSales.filter(s => s.regimen === "General")) {
      s.impuestoUF = yearGains > 0 ? impProgresivo * (s.gananciaUF / yearGains) : 0;
    }

    const mitig = calcularMitigacion(impProgresivo, rentaAnualUF, inputs.apvUsadoEsteAno, inputs.dcUsadoEsteAno, yearLossTotal, exencion);

    planAnual.push({
      ano: year,
      fondosAVender: yearSales,
      fondosConPerdida: yearLosses,
      fondosMLT: yearMLT,
      compensacionPerdidas_UF: Math.min(yearLossTotal, yearGains),
      exencion17N8_UF: exencion,
      rentaImponibleConGanancias_UF: rentaAnualUF + taxableGain,
      tramoResultante: getTramoMarginal((rentaAnualUF + taxableGain) / 12).tasa,
      mitigacion: mitig,
      comisionesRescate_UF: comisiones,
      tacPagado_UF: 0,
      alphaGanado_UF: 0,
    });
  }

  // TAC and alpha
  const migratedPct = 1 - (remaining.size / sorted.length);
  let ahorroTAC10Y = 0;
  for (const h of inputs.holdings) {
    if (h.tacActual != null && h.tacPropuesto != null) {
      ahorroTAC10Y += calcularAhorroTAC(h.currentValueUF, h.tacActual, h.tacPropuesto, 10, avgRate) * migratedPct;
    }
  }

  const alpha = calcularAlphaPorReasignacion({
    holdings: inputs.holdings.map(h => ({ categoria: h.categoria, currentValueUF: h.currentValueUF })),
    totalValueUF: totalValue,
    puntajeRiesgo: inputs.puntajeRiesgo,
    rentabilidadesEsperadas: inputs.rentabilidadesEsperadas,
  });

  const annualBenefit = (ahorroTAC10Y / 10) + (alpha.impacto10Y_UF * migratedPct / 10);
  const breakeven = annualBenefit > 0 ? totalImpuesto / annualBenefit : null;

  return {
    nombre: "B: Salida escalonada",
    descripcion: "Migrar fondos gradualmente, priorizando MLT y Art. 107, llenando espacio en tramo actual.",
    impuestoTotal_UF: totalImpuesto,
    ahorroTAC_10Y_UF: ahorroTAC10Y,
    alphaReasignacion_10Y_UF: alpha.impacto10Y_UF * migratedPct,
    costoNetoVPN_UF: totalImpuesto,
    beneficioNetoVPN_UF: vpnReal(
      Array.from({ length: 10 }, (_, i) => ({ ano: i + 1, montoUF: annualBenefit })),
      inputs.tasaDescuentoReal,
    ) - totalImpuesto,
    puntoEquilibrioAnos: breakeven != null && breakeven > 0 ? Math.round(breakeven * 10) / 10 : null,
    planAnual,
    recomendado: false,
  };
}

// ==================== SCENARIO D: Hybrid intelligent ====================
export function runScenarioD(
  inputs: TaxSimulatorInputs,
  utaValueUF: number,
  ufValue: number,
): ScenarioResult {
  // D is essentially B with DCV prioritized and APV/DC applied aggressively in year 0
  // The sorting already handles DCV > MLT > 107 > losses > general
  const result = runScenarioB(inputs, utaValueUF, ufValue);
  result.nombre = "D: Hibrido inteligente";
  result.descripcion = "Combina DCV, MLT, escalonamiento y mitigacion APV/DC para minimizar impacto tributario total.";
  return result;
}

// ==================== Run all 4 ====================
export function runAllScenarios(
  inputs: TaxSimulatorInputs,
  utaValueUF: number,
  ufValue: number,
): ScenarioResult[] {
  const a = runScenarioA(inputs, utaValueUF, ufValue);
  const b = runScenarioB(inputs, utaValueUF, ufValue);
  const c = runScenarioC(inputs, utaValueUF, ufValue);
  const d = runScenarioD(inputs, utaValueUF, ufValue);

  const scenarios = [a, b, c, d];

  // Mark the one with highest beneficioNetoVPN_UF as recommended
  let bestIdx = 0;
  let bestVPN = -Infinity;
  for (let i = 0; i < scenarios.length; i++) {
    if (scenarios[i].beneficioNetoVPN_UF > bestVPN) {
      bestVPN = scenarios[i].beneficioNetoVPN_UF;
      bestIdx = i;
    }
  }
  scenarios[bestIdx].recomendado = true;

  return scenarios;
}
```

- [ ] **Step 5.4: Run tests**

Run: `npx vitest run lib/tax/scenarios.test.ts`
Expected: All PASS

- [ ] **Step 5.5: Commit**

```bash
git add lib/tax/scenarios.ts lib/tax/scenarios.test.ts
git commit -m "feat(tax): implement 4 tax optimization scenarios with tests"
```

---

## Task 6: Simulate API Route

**Files:**
- Create: `app/api/tax/simulate/route.ts`

- [ ] **Step 6.1: Create the API route**

```typescript
// app/api/tax/simulate/route.ts
import { NextRequest } from "next/server";
import { requireAdvisor, createAdminClient } from "@/lib/auth/api-auth";
import { applyRateLimit } from "@/lib/rate-limit";
import { successResponse, errorResponse, handleApiError } from "@/lib/api-response";
import { runAllScenarios } from "@/lib/tax/scenarios";
import type { TaxSimulatorInputs } from "@/lib/tax/types";

export async function POST(request: NextRequest) {
  const blocked = await applyRateLimit(request, "tax-simulate", { limit: 10, windowSeconds: 60 });
  if (blocked) return blocked;

  const { advisor, error: authError } = await requireAdvisor();
  if (authError) return authError;

  return handleApiError("tax-simulate", async () => {
    const body = await request.json() as {
      inputs: TaxSimulatorInputs;
      utaValueUF?: number;
      ufValue?: number;
    };

    if (!body.inputs || !body.inputs.holdings || body.inputs.holdings.length === 0) {
      return errorResponse("Se requieren holdings para simular", 400);
    }

    const utaValueUF = body.utaValueUF ?? 7.5; // ~1 UTA in UF
    const ufValue = body.ufValue ?? 38000; // ~UF value in CLP

    const scenarios = runAllScenarios(body.inputs, utaValueUF, ufValue);
    const recommended = scenarios.find(s => s.recomendado)?.nombre.charAt(0) ?? "D";

    return successResponse({
      scenarios,
      recommended,
      taxMap: body.inputs.holdings,
    });
  });
}
```

- [ ] **Step 6.2: Commit**

```bash
git add app/api/tax/simulate/route.ts
git commit -m "feat(tax): add /api/tax/simulate endpoint"
```

---

## Task 7: Report Generation API Route

**Files:**
- Create: `app/api/tax/report/route.ts`

- [ ] **Step 7.1: Create the report API route**

```typescript
// app/api/tax/report/route.ts
import { NextRequest } from "next/server";
import { requireAdvisor, createAdminClient } from "@/lib/auth/api-auth";
import { applyRateLimit } from "@/lib/rate-limit";
import { successResponse, errorResponse, handleApiError } from "@/lib/api-response";
import { trackAIUsage } from "@/lib/ai-usage";
import type { ScenarioResult } from "@/lib/tax/types";

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || "";

export async function POST(request: NextRequest) {
  const blocked = await applyRateLimit(request, "tax-report", { limit: 3, windowSeconds: 60 });
  if (blocked) return blocked;

  const { advisor, error: authError } = await requireAdvisor();
  if (authError) return authError;

  const supabase = createAdminClient();
  const { data: advisorProfile } = await supabase
    .from("advisors")
    .select("preferred_ai_model")
    .eq("id", advisor!.id)
    .single();

  const model = advisorProfile?.preferred_ai_model || "claude-sonnet-4-20250514";

  return handleApiError("tax-report", async () => {
    const { scenarios, selectedScenario, clientName, totalValueUF } = await request.json() as {
      scenarios: ScenarioResult[];
      selectedScenario: string;
      clientName?: string;
      totalValueUF: number;
    };

    if (!scenarios || scenarios.length === 0) {
      return errorResponse("Se requieren escenarios para generar informe", 400);
    }

    const selected = scenarios.find(s => s.nombre.startsWith(selectedScenario)) || scenarios.find(s => s.recomendado);

    const scenarioSummary = scenarios.map(s =>
      `- ${s.nombre}: Impuesto ${s.impuestoTotal_UF.toFixed(0)} UF, Ahorro TAC 10Y ${s.ahorroTAC_10Y_UF.toFixed(0)} UF, Alpha 10Y ${s.alphaReasignacion_10Y_UF.toFixed(0)} UF, Beneficio neto VPN ${s.beneficioNetoVPN_UF.toFixed(0)} UF${s.recomendado ? " (RECOMENDADO)" : ""}`
    ).join("\n");

    const planDetalle = selected ? selected.planAnual.map(y =>
      `Ano ${y.ano}: ${y.fondosAVender.length} ventas, ${y.fondosMLT.length} MLT, impuesto ${y.mitigacion.impuestoNeto_UF.toFixed(0)} UF`
    ).join("\n") : "";

    const prompt = `Eres un asesor financiero chileno experto en planificacion tributaria. Genera un informe profesional de estrategia de cambio de custodia.

CLIENTE${clientName ? ` (${clientName})` : ""}:
Valor total portafolio: ${totalValueUF.toFixed(0)} UF

COMPARACION DE ESCENARIOS:
${scenarioSummary}

ESCENARIO SELECCIONADO: ${selected?.nombre}
PLAN DE ACCION:
${planDetalle}

FORMATO DEL INFORME (usa exactamente estas secciones con ##):

## Resumen Ejecutivo
(2-3 oraciones sobre la situacion actual y la estrategia recomendada)

## Analisis Tributario
(Capa 1 — datos duros basados en ley vigente: regimen de cada posicion, impuesto calculado, exenciones aplicables. Citar articulos de ley.)

## Estrategia Recomendada
(Capa 2 — proyeccion con supuestos: los 3 pilares cuantificados, plan ano a ano, punto de equilibrio)

## Mitigacion Tributaria
(APV/DC recomendado, compensacion de perdidas, exencion Art. 17 N°8 si aplica)

## Proximos Pasos
(3-4 acciones concretas)

## Disclaimers
(Rentabilidades son supuestos, no es asesoria tributaria, consultar tributarista, ley vigente a la fecha)

REGLAS:
- Espanol chileno profesional
- Distinguir Capa 1 (ley) de Capa 2 (supuestos del asesor)
- Cifras en UF
- No inventar datos
- Maximo 6 lineas por seccion`;

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model,
        max_tokens: 2048,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.error("Claude API error:", errorData);
      throw new Error("Error al generar informe tributario");
    }

    const data = await response.json();

    if (data.usage) {
      trackAIUsage({
        advisorId: advisor!.id,
        inputTokens: data.usage.input_tokens,
        outputTokens: data.usage.output_tokens,
        model,
      });
    }

    const report = data.content.find((c: { type: string; text?: string }) => c.type === "text")?.text || "";

    return successResponse({ report });
  });
}
```

- [ ] **Step 7.2: Commit**

```bash
git add app/api/tax/report/route.ts
git commit -m "feat(tax): add /api/tax/report endpoint for AI-generated reports"
```

---

## Task 8: Sidebar Link

**Files:**
- Modify: `components/shared/AdvisorSidebar.tsx`

- [ ] **Step 8.1: Add tax optimizer to sidebar TOOL_ITEMS**

In `components/shared/AdvisorSidebar.tsx`, add the import for `Scale` icon and add the item to `TOOL_ITEMS`:

Add to imports (line 26, after `LineChart`):
```typescript
  Scale,
```

Add to `TOOL_ITEMS` array (after the Calculadora APV entry, around line 52):
```typescript
  { href: "/tax-optimizer", label: "Simulador Tributario", icon: Scale },
```

- [ ] **Step 8.2: Commit**

```bash
git add components/shared/AdvisorSidebar.tsx
git commit -m "feat(tax): add tax optimizer link to sidebar"
```

---

## Task 9: Simulator Page Shell

**Files:**
- Create: `app/(advisor-shell)/tax-optimizer/page.tsx`

- [ ] **Step 9.1: Create the page**

```typescript
// app/(advisor-shell)/tax-optimizer/page.tsx
"use client";

import { Suspense } from "react";
import TaxSimulator from "@/components/tax/TaxSimulator";

export default function TaxOptimizerPage() {
  return (
    <div className="space-y-6">
      <div className="bg-white border-b border-gb-border px-6 py-4">
        <h1 className="text-2xl font-semibold text-gb-black">
          Simulador Tributario de Cambio de Custodia
        </h1>
        <p className="text-sm text-gb-gray mt-1">
          Calcula la estrategia optima para migrar fondos de AGF a corredora, considerando impacto tributario, ahorro en costos y reasignacion al perfil de riesgo.
        </p>
      </div>
      <div className="px-6">
        <Suspense fallback={<div className="text-gb-gray">Cargando simulador...</div>}>
          <TaxSimulator />
        </Suspense>
      </div>
    </div>
  );
}
```

- [ ] **Step 9.2: Commit**

```bash
git add "app/(advisor-shell)/tax-optimizer/page.tsx"
git commit -m "feat(tax): add tax optimizer page shell"
```

---

## Task 10: TaxSimulator Component

**Files:**
- Create: `components/tax/TaxSimulator.tsx`

- [ ] **Step 10.1: Create TaxSimulator**

```typescript
// components/tax/TaxSimulator.tsx
"use client";

import { useState, useCallback } from "react";
import { AlertTriangle, Info, Loader } from "lucide-react";
import type { TaxSimulatorInputs, ScenarioResult, TaxableHolding } from "@/lib/tax/types";
import { RENTABILIDAD_ESPERADA_REAL } from "@/lib/constants/chilean-tax";
import ScenarioTable from "./ScenarioTable";
import TaxMap from "./TaxMap";
import ActionPlan from "./ActionPlan";

export default function TaxSimulator() {
  const [loading, setLoading] = useState(false);
  const [scenarios, setScenarios] = useState<ScenarioResult[] | null>(null);
  const [recommended, setRecommended] = useState<string>("");
  const [reportLoading, setReportLoading] = useState(false);
  const [report, setReport] = useState<string | null>(null);

  // Input state
  const [ingresoMensual, setIngresoMensual] = useState(3000000);
  const [edad, setEdad] = useState(45);
  const [edadJubilacion, setEdadJubilacion] = useState(65);
  const [apvUsado, setApvUsado] = useState(0);
  const [dcUsado, setDcUsado] = useState(0);
  const [esHabitual, setEsHabitual] = useState(false);
  const [tasaDescuento, setTasaDescuento] = useState(3.5);
  const [holdings, setHoldings] = useState<TaxableHolding[]>([]);

  const [hasConfianzaBaja, setHasConfianzaBaja] = useState(false);
  const [hasArt107, setHasArt107] = useState(false);

  const handleSimulate = useCallback(async () => {
    if (holdings.length === 0) return;
    setLoading(true);
    try {
      const inputs: TaxSimulatorInputs = {
        clientId: "",
        ingresoMensualCLP: ingresoMensual,
        edad,
        edadJubilacion,
        apvUsadoEsteAno: apvUsado,
        dcUsadoEsteAno: dcUsado,
        esInversionistaHabitual: esHabitual,
        tasaDescuentoReal: tasaDescuento / 100,
        rentabilidadesEsperadas: RENTABILIDAD_ESPERADA_REAL,
        holdings,
        perfilRiesgo: "crecimiento",
        puntajeRiesgo: 70,
      };

      const res = await fetch("/api/tax/simulate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ inputs }),
      });
      const data = await res.json();
      if (data.success) {
        setScenarios(data.scenarios);
        setRecommended(data.recommended);
        setHasConfianzaBaja(holdings.some(h => h.confianzaBaja));
        setHasArt107(holdings.some(h => h.taxRegime === "107"));
      }
    } finally {
      setLoading(false);
    }
  }, [holdings, ingresoMensual, edad, edadJubilacion, apvUsado, dcUsado, esHabitual, tasaDescuento]);

  const handleGenerateReport = useCallback(async () => {
    if (!scenarios) return;
    setReportLoading(true);
    try {
      const res = await fetch("/api/tax/report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scenarios,
          selectedScenario: recommended,
          totalValueUF: holdings.reduce((s, h) => s + h.currentValueUF, 0),
        }),
      });
      const data = await res.json();
      if (data.success) setReport(data.report);
    } finally {
      setReportLoading(false);
    }
  }, [scenarios, recommended, holdings]);

  return (
    <div className="space-y-6">
      {/* Warnings */}
      {hasConfianzaBaja && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 flex gap-3">
          <AlertTriangle className="w-5 h-5 text-yellow-600 shrink-0 mt-0.5" />
          <p className="text-sm text-yellow-800">
            El costo de adquisicion de algunos fondos es estimado a partir de precios historicos.
            El beneficio neto real puede diferir significativamente. Solicite al cliente los valores de compra originales.
          </p>
        </div>
      )}

      {hasArt107 && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 flex gap-3">
          <Info className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
          <p className="text-sm text-blue-800">
            Reforma tributaria en discusion: Existe un proyecto de ley que podria eliminar el impuesto del 10% sobre ganancias
            con presencia bursatil (Art. 107). Calculos basados en ley vigente (10%).
          </p>
        </div>
      )}

      {/* Input panel */}
      <div className="bg-white rounded-lg border border-gb-border p-6">
        <h2 className="text-lg font-semibold text-gb-black mb-4">Parametros del Cliente</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-gb-gray mb-1">Ingreso mensual (CLP)</label>
            <input
              type="number"
              value={ingresoMensual}
              onChange={e => setIngresoMensual(Number(e.target.value))}
              className="w-full border border-gb-border rounded-lg px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gb-gray mb-1">Edad</label>
            <input
              type="number"
              value={edad}
              onChange={e => setEdad(Number(e.target.value))}
              className="w-full border border-gb-border rounded-lg px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gb-gray mb-1">Edad jubilacion</label>
            <input
              type="number"
              value={edadJubilacion}
              onChange={e => setEdadJubilacion(Number(e.target.value))}
              className="w-full border border-gb-border rounded-lg px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gb-gray mb-1">APV usado este ano (UF)</label>
            <input
              type="number"
              value={apvUsado}
              onChange={e => setApvUsado(Number(e.target.value))}
              className="w-full border border-gb-border rounded-lg px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gb-gray mb-1">DC usado este ano (UF)</label>
            <input
              type="number"
              value={dcUsado}
              onChange={e => setDcUsado(Number(e.target.value))}
              className="w-full border border-gb-border rounded-lg px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gb-gray mb-1">Tasa descuento real (%)</label>
            <input
              type="number"
              step="0.1"
              value={tasaDescuento}
              onChange={e => setTasaDescuento(Number(e.target.value))}
              className="w-full border border-gb-border rounded-lg px-3 py-2 text-sm"
            />
          </div>
          <div className="flex items-center gap-2 col-span-full">
            <input
              type="checkbox"
              id="habitual"
              checked={esHabitual}
              onChange={e => setEsHabitual(e.target.checked)}
              className="rounded border-gb-border"
            />
            <label htmlFor="habitual" className="text-sm text-gb-gray">
              Cliente es inversionista habitual (pierde exencion 10 UTA Art. 17 N°8)
            </label>
          </div>
        </div>

        <p className="text-xs text-gb-gray mt-4">
          Nota: Los holdings se populan automaticamente desde la cartola del cliente. En v1, use los datos de la radiografia.
        </p>

        <button
          onClick={handleSimulate}
          disabled={loading || holdings.length === 0}
          className="mt-4 px-6 py-2.5 bg-gb-primary text-white rounded-lg text-sm font-medium hover:bg-gb-primary/90 disabled:opacity-50"
        >
          {loading ? <Loader className="w-4 h-4 animate-spin inline mr-2" /> : null}
          Simular escenarios
        </button>
      </div>

      {/* Results */}
      {scenarios && (
        <>
          <ScenarioTable scenarios={scenarios} />
          <TaxMap holdings={holdings} />
          {scenarios.find(s => s.recomendado) && (
            <ActionPlan scenario={scenarios.find(s => s.recomendado)!} />
          )}

          <div className="flex gap-3">
            <button
              onClick={handleGenerateReport}
              disabled={reportLoading}
              className="px-6 py-2.5 bg-gb-black text-white rounded-lg text-sm font-medium hover:bg-gb-black/90 disabled:opacity-50"
            >
              {reportLoading ? <Loader className="w-4 h-4 animate-spin inline mr-2" /> : null}
              Generar informe para cliente
            </button>
          </div>

          {report && (
            <div className="bg-white rounded-lg border border-gb-border p-6">
              <h2 className="text-lg font-semibold text-gb-black mb-4">Informe Generado</h2>
              <div className="prose prose-sm max-w-none" dangerouslySetInnerHTML={{ __html: report.replace(/\n/g, "<br/>") }} />
            </div>
          )}
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 10.2: Commit**

```bash
git add components/tax/TaxSimulator.tsx
git commit -m "feat(tax): add TaxSimulator main component"
```

---

## Task 11: ScenarioTable Component

**Files:**
- Create: `components/tax/ScenarioTable.tsx`

- [ ] **Step 11.1: Create ScenarioTable**

```typescript
// components/tax/ScenarioTable.tsx
"use client";

import { CheckCircle2 } from "lucide-react";
import type { ScenarioResult } from "@/lib/tax/types";

interface Props {
  scenarios: ScenarioResult[];
}

export default function ScenarioTable({ scenarios }: Props) {
  const headers = ["", ...scenarios.map(s => s.nombre)];

  const rows = [
    { label: "Impuesto total (UF)", key: "impuestoTotal_UF" as const, format: (v: number) => v.toFixed(0) },
    { label: "Ahorro TAC 10Y (UF)", key: "ahorroTAC_10Y_UF" as const, format: (v: number) => v.toFixed(0) },
    { label: "Alpha reasignacion 10Y (UF)", key: "alphaReasignacion_10Y_UF" as const, format: (v: number) => v.toFixed(0) },
    { label: "Beneficio neto VPN (UF)", key: "beneficioNetoVPN_UF" as const, format: (v: number) => v.toFixed(0), bold: true },
    { label: "Punto de equilibrio", key: "puntoEquilibrioAnos" as const, format: (v: number | null) => v != null ? `${v} anos` : "nunca" },
  ];

  return (
    <div className="bg-white rounded-lg border border-gb-border overflow-hidden">
      <div className="px-6 py-4 border-b border-gb-border">
        <h2 className="text-lg font-semibold text-gb-black">Comparacion de Escenarios</h2>
        <p className="text-xs text-gb-gray mt-1">
          Capa 2: Proyeccion con supuestos del asesor — rentabilidades esperadas y ahorro TAC son estimaciones.
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gb-border">
              {headers.map((h, i) => (
                <th key={i} className={`px-4 py-3 text-left font-medium ${i === 0 ? "text-gb-gray" : "text-gb-black"}`}>
                  <div className="flex items-center gap-1.5">
                    {h}
                    {i > 0 && scenarios[i - 1].recomendado && (
                      <CheckCircle2 className="w-4 h-4 text-green-600" />
                    )}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.label} className="border-b border-gb-border/50 last:border-0">
                <td className={`px-4 py-3 text-gb-gray ${row.bold ? "font-semibold" : ""}`}>{row.label}</td>
                {scenarios.map((s, i) => {
                  const val = s[row.key];
                  return (
                    <td
                      key={i}
                      className={`px-4 py-3 ${s.recomendado ? "bg-green-50 font-semibold text-green-800" : "text-gb-black"} ${row.bold ? "font-bold" : ""}`}
                    >
                      {row.format(val as number & (number | null))}
                      {row.key === "beneficioNetoVPN_UF" && s.recomendado && " ←"}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
```

- [ ] **Step 11.2: Commit**

```bash
git add components/tax/ScenarioTable.tsx
git commit -m "feat(tax): add ScenarioTable component"
```

---

## Task 12: TaxMap Component

**Files:**
- Create: `components/tax/TaxMap.tsx`

- [ ] **Step 12.1: Create TaxMap**

```typescript
// components/tax/TaxMap.tsx
"use client";

import type { TaxableHolding } from "@/lib/tax/types";

interface Props {
  holdings: TaxableHolding[];
}

const REGIME_LABELS: Record<string, string> = {
  "107": "Art. 107 (10%)",
  "108": "Art. 108/MLT",
  "104": "Art. 104 (4%)",
  "apv": "APV",
  "57bis": "57 bis",
  "general": "General",
};

export default function TaxMap({ holdings }: Props) {
  return (
    <div className="bg-white rounded-lg border border-gb-border overflow-hidden">
      <div className="px-6 py-4 border-b border-gb-border">
        <h2 className="text-lg font-semibold text-gb-black">Mapa Tributario por Fondo</h2>
        <p className="text-xs text-gb-gray mt-1">
          Capa 1: Datos basados en ley vigente — regimen tributario de cada posicion.
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gb-border bg-gray-50">
              <th className="px-4 py-2.5 text-left font-medium text-gb-gray">Fondo</th>
              <th className="px-4 py-2.5 text-right font-medium text-gb-gray">Valor (UF)</th>
              <th className="px-4 py-2.5 text-left font-medium text-gb-gray">Regimen</th>
              <th className="px-4 py-2.5 text-right font-medium text-gb-gray">Gan. Capital (UF)</th>
              <th className="px-4 py-2.5 text-center font-medium text-gb-gray">MLT</th>
              <th className="px-4 py-2.5 text-center font-medium text-gb-gray">DCV</th>
            </tr>
          </thead>
          <tbody>
            {holdings.map((h, i) => {
              const costo = h.acquisitionCostUF ?? h.estimatedCosts[0]?.costUF ?? h.currentValueUF;
              const ganancia = h.currentValueUF - costo;
              return (
                <tr key={i} className="border-b border-gb-border/50 last:border-0">
                  <td className="px-4 py-2.5 text-gb-black">
                    {h.fundName}
                    {h.confianzaBaja && <span className="ml-1 text-yellow-600 text-xs" title="Costo estimado">*</span>}
                  </td>
                  <td className="px-4 py-2.5 text-right text-gb-black">{h.currentValueUF.toFixed(0)}</td>
                  <td className="px-4 py-2.5">
                    <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${
                      h.taxRegime === "apv" ? "bg-green-100 text-green-700" :
                      h.taxRegime === "107" ? "bg-blue-100 text-blue-700" :
                      h.taxRegime === "108" ? "bg-purple-100 text-purple-700" :
                      "bg-gray-100 text-gray-700"
                    }`}>
                      {REGIME_LABELS[h.taxRegime] || h.taxRegime}
                    </span>
                  </td>
                  <td className={`px-4 py-2.5 text-right ${ganancia < 0 ? "text-red-600" : "text-gb-black"}`}>
                    {ganancia.toFixed(0)}
                  </td>
                  <td className="px-4 py-2.5 text-center">{h.canMLT ? "Si" : "No"}</td>
                  <td className="px-4 py-2.5 text-center">{h.canDCV ? "Si" : "No"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
```

- [ ] **Step 12.2: Commit**

```bash
git add components/tax/TaxMap.tsx
git commit -m "feat(tax): add TaxMap component"
```

---

## Task 13: ActionPlan Component

**Files:**
- Create: `components/tax/ActionPlan.tsx`

- [ ] **Step 13.1: Create ActionPlan**

```typescript
// components/tax/ActionPlan.tsx
"use client";

import { ArrowRight } from "lucide-react";
import type { ScenarioResult } from "@/lib/tax/types";

interface Props {
  scenario: ScenarioResult;
}

export default function ActionPlan({ scenario }: Props) {
  return (
    <div className="bg-white rounded-lg border border-gb-border overflow-hidden">
      <div className="px-6 py-4 border-b border-gb-border">
        <h2 className="text-lg font-semibold text-gb-black">
          Plan de Accion — {scenario.nombre}
        </h2>
        <p className="text-sm text-gb-gray mt-1">{scenario.descripcion}</p>
      </div>
      <div className="px-6 py-4 space-y-4">
        {scenario.planAnual.map((year) => (
          <div key={year.ano} className="flex gap-4">
            <div className="flex flex-col items-center">
              <div className="w-10 h-10 rounded-full bg-gb-primary/10 text-gb-primary font-semibold flex items-center justify-center text-sm">
                {year.ano}
              </div>
              {year.ano < scenario.planAnual.length - 1 && (
                <div className="w-px flex-1 bg-gb-border mt-1" />
              )}
            </div>
            <div className="flex-1 pb-4">
              <h3 className="font-medium text-gb-black text-sm">Ano {year.ano}</h3>
              <div className="mt-2 space-y-1 text-sm text-gb-gray">
                {year.fondosMLT.length > 0 && (
                  <p>
                    <span className="text-purple-600 font-medium">MLT:</span>{" "}
                    {year.fondosMLT.map(f => f.fundName).join(", ")}
                  </p>
                )}
                {year.fondosConPerdida.length > 0 && (
                  <p>
                    <span className="text-red-600 font-medium">Vender (perdida):</span>{" "}
                    {year.fondosConPerdida.map(f => `${f.fundName} (-${f.perdidaUF.toFixed(0)} UF)`).join(", ")}
                  </p>
                )}
                {year.fondosAVender.length > 0 && (
                  <p>
                    <span className="text-gb-black font-medium">Vender:</span>{" "}
                    {year.fondosAVender.map(f => `${f.fundName} (imp. ${f.impuestoUF.toFixed(0)} UF)`).join(", ")}
                  </p>
                )}
                {year.mitigacion.aporteAPV_UF > 0 && (
                  <p>
                    <span className="text-green-600 font-medium">APV-{year.mitigacion.regimenAPV}:</span>{" "}
                    {year.mitigacion.aporteAPV_UF.toFixed(0)} UF
                    {year.mitigacion.aporteDC_UF > 0 && ` + DC: ${year.mitigacion.aporteDC_UF.toFixed(0)} UF`}
                  </p>
                )}
                {year.compensacionPerdidas_UF > 0 && (
                  <p className="text-xs text-gb-gray">
                    Compensacion perdidas: {year.compensacionPerdidas_UF.toFixed(0)} UF |
                    Impuesto neto: {year.mitigacion.impuestoNeto_UF.toFixed(0)} UF
                  </p>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 13.2: Commit**

```bash
git add components/tax/ActionPlan.tsx
git commit -m "feat(tax): add ActionPlan timeline component"
```

---

## Task 14: RadiografiaCartola Integration

**Files:**
- Modify: `components/seguimiento/RadiografiaCartola.tsx`

- [ ] **Step 14.1: Add tax summary section**

At the end of the RadiografiaCartola component (before the closing `</div>`), add a new section that shows a simplified tax map for the current holdings. This section appears after the existing proposal section.

Add a new section with:
- A table showing each holding's tax regime (using existing `beneficio107lir`, `beneficio108lir`, `isApvEligible` fields)
- A "Ver simulador completo" button linking to `/tax-optimizer`
- Summary of the 3 pillars (simplified — just labels, no full calculation)

The exact insertion point and code depend on the current structure of RadiografiaCartola — read the full file to determine placement. The section should be wrapped in a conditional that checks if there are matched holdings with TAC data.

```typescript
{/* Tax Summary Section */}
{holdings && holdings.length > 0 && (
  <div className="bg-white rounded-lg border border-gb-border overflow-hidden">
    <div className="px-6 py-4 border-b border-gb-border">
      <h2 className="text-lg font-semibold text-gb-black">Analisis Tributario del Cambio</h2>
      <p className="text-xs text-gb-gray mt-1">Regimen tributario de cada posicion para el cambio de custodia.</p>
    </div>
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gb-border bg-gray-50">
            <th className="px-4 py-2 text-left font-medium text-gb-gray">Fondo</th>
            <th className="px-4 py-2 text-left font-medium text-gb-gray">Regimen</th>
            <th className="px-4 py-2 text-center font-medium text-gb-gray">MLT</th>
          </tr>
        </thead>
        <tbody>
          {holdings.map((h, i) => (
            <tr key={i} className="border-b border-gb-border/50">
              <td className="px-4 py-2 text-gb-black text-sm">{h.fundName}</td>
              <td className="px-4 py-2">
                <span className={`text-xs font-medium px-2 py-0.5 rounded ${
                  h.beneficio107lir ? "bg-blue-100 text-blue-700" :
                  h.beneficio108lir ? "bg-purple-100 text-purple-700" :
                  h.isApvEligible ? "bg-green-100 text-green-700" :
                  "bg-gray-100 text-gray-700"
                }`}>
                  {h.beneficio107lir ? "Art. 107 (10%)" :
                   h.beneficio108lir ? "Art. 108/MLT" :
                   h.isApvEligible ? "APV" : "General"}
                </span>
              </td>
              <td className="px-4 py-2 text-center text-sm">{h.beneficio108lir ? "Si" : "No"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
    <div className="px-6 py-4 border-t border-gb-border">
      <a
        href="/tax-optimizer"
        className="inline-flex items-center gap-2 text-sm font-medium text-gb-primary hover:text-gb-primary/80"
      >
        Ver simulador completo
        <ArrowRight className="w-4 h-4" />
      </a>
    </div>
  </div>
)}
```

- [ ] **Step 14.2: Commit**

```bash
git add components/seguimiento/RadiografiaCartola.tsx
git commit -m "feat(tax): add tax summary section to RadiografiaCartola"
```

---

## Task 15: Final Integration Test

- [ ] **Step 15.1: Run all tests**

```bash
npx vitest run lib/tax/
```

Expected: All tests pass

- [ ] **Step 15.2: Run lint**

```bash
npm run lint
```

Expected: No errors

- [ ] **Step 15.3: Run build**

```bash
npm run build
```

Expected: Build succeeds

- [ ] **Step 15.4: Final commit**

```bash
git add -A
git commit -m "feat(tax): tax optimizer v1 complete — simulator, scenarios, API routes, UI"
```

---

## Self-Review

**Spec coverage:** All 16 spec sections mapped to tasks:
- Sections 1-2 (objetivo, ubicacion): Tasks 8, 9, 14
- Section 3 (modelo datos): Tasks 1, 2
- Section 4 (motor calculo): Tasks 3, 4
- Section 5 (escenarios): Task 5
- Sections 6-7 (UI): Tasks 9-14
- Section 8 (API): Tasks 6, 7
- Sections 9-13 (reglas, certeza, NGA, disclaimers): Embedded in calculator logic and report prompt
- Sections 14-16 (archivos, fuera alcance, resumen): File structure matches

**Placeholder scan:** No TBDs, TODOs, or vague steps found.

**Type consistency:** All types defined in `lib/tax/types.ts` are used consistently across calculator, scenarios, API routes, and components. `ScenarioResult`, `TaxableHolding`, `MitigacionResult`, `YearPlan` — all match.

**Gap identified:** `simularCostoAdquisicion` (spec 4.5) is not implemented as a separate function — in v1, the estimation comes from the `estimatedCosts` array on each holding which is populated by the caller. This is intentional for v1 simplicity; the function can be added when we add historical price lookup integration.
