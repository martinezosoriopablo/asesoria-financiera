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
