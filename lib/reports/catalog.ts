import type { ReportTypeDef, ScopeKey } from "./types";

export const SEED_TYPES: ReportTypeDef[] = [
  { id: "macro", label: "Macro", scopeKey: "date", defaultUsos: ["distribucion", "insumo_cartera"], formatos: ["html", "pdf"] },
  { id: "rv", label: "Renta Variable", scopeKey: "date", defaultUsos: ["distribucion", "insumo_cartera"], formatos: ["html", "pdf"] },
  { id: "rf", label: "Renta Fija", scopeKey: "date", defaultUsos: ["distribucion", "insumo_cartera"], formatos: ["html", "pdf"] },
  { id: "asset_allocation", label: "Asset Allocation", scopeKey: "date", defaultUsos: ["insumo_cartera"], formatos: ["html", "json", "pdf"] },
  { id: "arbol_decision", label: "Árbol de Decisión", scopeKey: "date", defaultUsos: ["insumo_cartera"], formatos: ["html", "json", "pdf"] },
  { id: "sectorial", label: "Análisis sectorial/coyuntura", scopeKey: "date", defaultUsos: ["distribucion", "insumo_cartera"], formatos: ["html", "pdf"] },
  { id: "seleccion_acciones", label: "Selección de acciones", scopeKey: "date", defaultUsos: ["insumo_cartera"], formatos: ["html", "pdf"] },
  { id: "diario", label: "Reporte diario (AM/PM)", scopeKey: "period", defaultUsos: ["distribucion"], formatos: ["html", "mp3"] },
  { id: "cierre_mensual", label: "Cierre mensual", scopeKey: "month", defaultUsos: ["insumo_cierre", "distribucion"], formatos: ["html", "pdf"] },
  { id: "cartera_modelo", label: "Cartera modelo", scopeKey: "perfil", defaultUsos: [], formatos: ["json"] },
];

export function requiredScopeFields(scopeKey: ScopeKey): Array<"report_date" | "period" | "perfil"> {
  switch (scopeKey) {
    case "date": return ["report_date"];
    case "period": return ["report_date", "period"];
    case "month": return ["period"];
    case "perfil": return ["report_date", "perfil"];
  }
}
