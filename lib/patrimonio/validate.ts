// lib/patrimonio/validate.ts
import { MONEDAS } from "./types";

export interface ValidationResult { ok: boolean; errors: string[]; }

export function isMoneda(v: unknown): boolean {
  return typeof v === "string" && (MONEDAS as string[]).includes(v);
}

/** Reglas de un par monto/moneda. Devuelve lista de errores (vacía = ok). */
export function validateMoney(
  monto: number | null | undefined,
  moneda: string | null | undefined,
  label: string
): string[] {
  const errors: string[] = [];
  if (monto === null || monto === undefined) return errors;
  if (typeof monto !== "number" || Number.isNaN(monto)) {
    errors.push(`${label}: el monto no es válido`);
    return errors;
  }
  if (monto < 0) errors.push(`${label}: el monto no puede ser negativo`);
  if (moneda === null || moneda === undefined || moneda === "") {
    errors.push(`${label}: falta la moneda`);
  } else if (!isMoneda(moneda)) {
    errors.push(`${label}: moneda inválida`);
  }
  return errors;
}

const SEGURO_TIPOS = ["vida", "salud", "vida_con_ahorro", "otros"];
const INMUEBLE_TIPOS = ["inversion", "habitacion"];
const ACTIVO_TIPOS = ["apv", "afp", "ahorro_periodico", "cuenta_ahorro", "otro"];

export function validateSeguro(input: Record<string, unknown>): ValidationResult {
  const errors: string[] = [];
  if (!SEGURO_TIPOS.includes(input.tipo as string)) errors.push("Tipo de seguro inválido");
  errors.push(...validateMoney(input.prima_monto as number, input.prima_moneda as string, "Prima"));
  errors.push(...validateMoney(input.cobertura_monto as number, input.cobertura_moneda as string, "Cobertura"));
  errors.push(...validateMoney(input.deducible_monto as number, input.deducible_moneda as string, "Deducible"));
  errors.push(...validateMoney(input.componente_ahorro_monto as number, input.componente_ahorro_moneda as string, "Ahorro"));
  const pct = input.devolucion_pct as number | null | undefined;
  if (pct !== null && pct !== undefined && (pct < 0 || pct > 100)) {
    errors.push("Devolución: el porcentaje debe estar entre 0 y 100");
  }
  return { ok: errors.length === 0, errors };
}

export function validateInmueble(input: Record<string, unknown>): ValidationResult {
  const errors: string[] = [];
  if (!INMUEBLE_TIPOS.includes(input.tipo as string)) errors.push("Tipo de inmueble inválido");
  errors.push(...validateMoney(input.valor_compra_monto as number, input.valor_compra_moneda as string, "Precio de compra"));
  errors.push(...validateMoney(input.valor_estimado_venta_monto as number, input.valor_estimado_venta_moneda as string, "Valor de venta"));
  if (input.tiene_credito) {
    errors.push(...validateMoney(input.credito_saldo_monto as number, input.credito_saldo_moneda as string, "Crédito"));
    if (input.credito_cuota_monto === null || input.credito_cuota_monto === undefined) {
      errors.push("Crédito: falta el dividendo (cuota)");
    } else {
      errors.push(...validateMoney(input.credito_cuota_monto as number, input.credito_cuota_moneda as string, "Dividendo"));
    }
    const tasa = input.credito_tasa_anual as number | null | undefined;
    if (tasa !== null && tasa !== undefined && (tasa < 0 || tasa > 100)) {
      errors.push("Crédito: la tasa anual debe estar entre 0 y 100");
    }
  }
  if (input.se_arrienda) {
    if (input.arriendo_monto === null || input.arriendo_monto === undefined) {
      errors.push("Arriendo: falta el monto");
    } else {
      errors.push(...validateMoney(input.arriendo_monto as number, input.arriendo_moneda as string, "Arriendo"));
    }
  }
  return { ok: errors.length === 0, errors };
}

export function validateActivo(input: Record<string, unknown>): ValidationResult {
  const errors: string[] = [];
  if (!ACTIVO_TIPOS.includes(input.tipo as string)) errors.push("Tipo de activo inválido");
  errors.push(...validateMoney(input.saldo_monto as number, input.saldo_moneda as string, "Saldo"));
  errors.push(...validateMoney(input.aporte_monto as number, input.aporte_moneda as string, "Aporte"));
  const regimen = input.regimen === "" ? null : input.regimen;
  if (regimen !== null && regimen !== undefined) {
    if (input.tipo !== "apv") errors.push("Régimen: solo aplica a APV");
    else if (regimen !== "A" && regimen !== "B") errors.push("Régimen: debe ser A o B");
  }
  if (input.aporte_monto !== null && input.aporte_monto !== undefined && !input.aporte_periodicidad) {
    errors.push("Aporte: falta la periodicidad");
  }
  return { ok: errors.length === 0, errors };
}
