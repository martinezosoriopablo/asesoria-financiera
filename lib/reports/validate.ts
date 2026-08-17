import type { ReportTypeDef, Uso, Formato } from "./types";
import { requiredScopeFields } from "./catalog";

const VALID_PERIODS_AMPM = ["am", "pm"];
const VALID_PERFILES = ["conservador", "moderado_conservador", "moderado", "moderado_agresivo", "agresivo"];
const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

export function resolveUsos(reportUsos: Uso[] | null | undefined, typeDefaults: Uso[]): Uso[] {
  return reportUsos == null ? typeDefaults : reportUsos;
}

export interface ReportInput {
  report_date?: string;
  period?: string;
  perfil?: string;
  formatosPresentes: Formato[];
  usos?: Uso[] | null;
}

export function validateReportInput(def: ReportTypeDef, input: ReportInput): string | null {
  const required = requiredScopeFields(def.scopeKey);
  if (required.includes("report_date") && !input.report_date) {
    return "Falta report_date para este tipo de reporte.";
  }
  if (def.scopeKey === "period") {
    if (!input.period || !VALID_PERIODS_AMPM.includes(input.period)) {
      return "El reporte diario requiere period 'am' o 'pm'.";
    }
  }
  if (def.scopeKey === "month") {
    if (!input.period || !MONTH_RE.test(input.period)) {
      return "El cierre mensual requiere period con formato 'YYYY-MM'.";
    }
  }
  if (def.scopeKey === "perfil") {
    if (!input.perfil || !VALID_PERFILES.includes(input.perfil)) {
      return "Este tipo requiere un perfil válido.";
    }
  }
  if (input.formatosPresentes.length === 0) {
    return "Debe subir al menos un formato de contenido.";
  }
  for (const f of input.formatosPresentes) {
    if (!def.formatos.includes(f)) {
      return `El formato '${f}' no está permitido para el tipo '${def.id}'.`;
    }
  }
  return null;
}

export function insumoNeedsTextWarning(effectiveUsos: Uso[], hasHtml: boolean, hasPayload: boolean): boolean {
  const isInsumo = effectiveUsos.includes("insumo_cartera") || effectiveUsos.includes("insumo_cierre");
  return isInsumo && !hasHtml && !hasPayload;
}
