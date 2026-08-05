import type { ComiteRole } from "@/lib/comite-categories";

export type CustodianType = "agf" | "corredora" | "internacional";
export type DecisionFuente = "mi_fondo" | "comite_etf" | "custom" | "caja" | "accion" | "bono";

export type Vehiculo = "fondos" | "etf" | "directo";
export interface VehiculosConfig { rv: Vehiculo; rf: Vehiculo; alt: Vehiculo }

export type InstrumentoTipo = "fund" | "stock" | "bond" | "etf";
export type InstrumentoOrigen = "preferido" | "actual" | "comite";

export interface ComiteColumn {
  etf_us: string | null;
  etf_ucits: string | null;
  modelo_pct: number;
  vista: string | null;       // "OW" | "UW" | "N" | null
  conviction: string | null;  // "ALTA" | "MEDIA" | "BAJA" | null
}

export interface MiInstrumentoOption {
  fund_id: string;
  fund_run: string | null; // RUN en CMF (TEXT, ej. "1234-1")
  ticker: string | null;
  nombre: string;
  custodian_type: CustodianType;
  tac: number | null;
  rent_12m: number | null;
  isMapped: boolean; // true = de model_fund_mapping (confirmado); false = sugerido
  // nuevos (opcionales para retrocompat; el resolver los puebla siempre)
  tipo?: InstrumentoTipo;         // default "fund"
  origen?: InstrumentoOrigen;     // default "preferido"
  sector?: string | null;
  vista_comite?: string | null;   // "OW" | "UW" | "N" | null
  weight_pct?: number | null;     // solo origen "actual"
}
// Alias retrocompatible: código existente que usa MiFondoOption sigue compilando.
export type MiFondoOption = MiInstrumentoOption;

export interface Decision {
  fuente: DecisionFuente;
  ticker: string | null;
  nombre: string;
  clase: string; // "Renta Variable" | "Renta Fija" | "Alternativos" | "Cash"
  custodian_type: CustodianType | null;
  porcentaje: number;
  tac?: number | null;       // solo cuando fuente = mi_fondo (para el ponderado del footer)
  rent_12m?: number | null;
  sector?: string | null;
}

export interface RecomendacionRow {
  categoria: string; // id de COMITE_CATEGORIES
  label: string;
  role: ComiteRole;
  comite: ComiteColumn;
  misFondos: MiInstrumentoOption[];
  decision: Decision;
  sin_categoria?: boolean; // true = el comité trajo una categoría que no resuelve; se conserva con aviso
}

export interface CarteraPosition {
  clase: string;
  ticker: string | null;
  nombre: string;
  porcentaje: number;
}
