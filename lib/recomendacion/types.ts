import type { ComiteRole } from "@/lib/comite-categories";

export type CustodianType = "agf" | "corredora" | "internacional";
export type DecisionFuente = "mi_fondo" | "comite_etf" | "custom" | "caja";

export interface ComiteColumn {
  etf_us: string | null;
  etf_ucits: string | null;
  modelo_pct: number;
  vista: string | null;       // "OW" | "UW" | "N" | null
  conviction: string | null;  // "ALTA" | "MEDIA" | "BAJA" | null
}

export interface MiFondoOption {
  fund_id: string;
  fund_run: string | null; // RUN en CMF (TEXT, ej. "1234-1")
  ticker: string | null;
  nombre: string;
  custodian_type: CustodianType;
  tac: number | null;
  rent_12m: number | null;
  isMapped: boolean; // true = de model_fund_mapping (confirmado); false = sugerido
}

export interface Decision {
  fuente: DecisionFuente;
  ticker: string | null;
  nombre: string;
  clase: string; // "Renta Variable" | "Renta Fija" | "Alternativos" | "Cash"
  custodian_type: CustodianType | null;
  porcentaje: number;
}

export interface RecomendacionRow {
  categoria: string; // id de COMITE_CATEGORIES
  label: string;
  role: ComiteRole;
  comite: ComiteColumn;
  misFondos: MiFondoOption[];
  decision: Decision;
  sin_categoria?: boolean; // true = el comité trajo una categoría que no resuelve; se conserva con aviso
}

export interface CarteraPosition {
  clase: string;
  ticker: string | null;
  nombre: string;
  porcentaje: number;
}
