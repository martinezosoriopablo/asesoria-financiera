// lib/patrimonio/entidades.ts
import { validateSeguro, validateInmueble, validateActivo, ValidationResult } from "./validate";

export type EntidadKey = "seguros" | "inmuebles" | "activos";

const TABLAS: Record<EntidadKey, string> = {
  seguros: "client_seguros",
  inmuebles: "client_inmuebles",
  activos: "client_activos_financieros",
};

// Whitelist de columnas escribibles por entidad (excluye id/client_id/created_by/timestamps).
const CAMPOS: Record<EntidadKey, string[]> = {
  seguros: [
    "tipo", "compania", "numero_poliza", "prima_monto", "prima_moneda",
    "prima_periodicidad", "cobertura_monto", "cobertura_moneda", "cobertura_desc",
    "deducible_monto", "deducible_moneda",
    "beneficiarios", "devuelve_prima", "devolucion_pct", "fecha_inicio", "fecha_termino",
    "componente_ahorro_monto", "componente_ahorro_moneda", "notas",
  ],
  inmuebles: [
    "tipo", "etiqueta", "ubicacion", "valor_compra_monto", "valor_compra_moneda",
    "fecha_compra", "valor_estimado_venta_monto", "valor_estimado_venta_moneda",
    "tiene_credito", "credito_saldo_monto", "credito_saldo_moneda", "credito_tasa_anual",
    "credito_plazo_meses_restantes", "credito_cuota_monto", "credito_cuota_moneda",
    "se_arrienda", "arriendo_monto", "arriendo_moneda", "notas",
  ],
  activos: [
    "tipo", "institucion", "saldo_monto", "saldo_moneda", "aporte_monto", "aporte_moneda",
    "aporte_periodicidad", "aporte_es_variable", "regimen", "notas",
  ],
};

const VALIDADORES: Record<EntidadKey, (i: Record<string, unknown>) => ValidationResult> = {
  seguros: validateSeguro,
  inmuebles: validateInmueble,
  activos: validateActivo,
};

function isEntidad(e: string): e is EntidadKey {
  return e === "seguros" || e === "inmuebles" || e === "activos";
}

export function resolveTabla(entidad: string): string | null {
  return isEntidad(entidad) ? TABLAS[entidad] : null;
}

export function pickAllowed(entidad: EntidadKey, body: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const k of CAMPOS[entidad]) {
    if (k in body) out[k] = body[k] === "" ? null : body[k];
  }
  return out;
}

export function validateFor(entidad: EntidadKey, input: Record<string, unknown>): ValidationResult {
  return VALIDADORES[entidad](input);
}
