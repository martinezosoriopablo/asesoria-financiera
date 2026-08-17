// components/clients/patrimonio/itemDisplay.ts
import type { FieldDef } from "./schemas";

/** Devuelve el valor de un campo listo para mostrar (read-only), o null si no hay valor. */
export function formatFieldValue(field: FieldDef, item: Record<string, unknown>): string | null {
  if (field.type === "money") {
    const monto = item[`${field.key}_monto`] as number | null | undefined;
    const moneda = (item[`${field.key}_moneda`] as string | null | undefined) ?? "";
    if (monto === null || monto === undefined) return null;
    const n = Number(monto).toLocaleString("es-CL", { maximumFractionDigits: 2 });
    return `${n} ${moneda}`.trim();
  }
  const raw = item[field.key];
  if (raw === null || raw === undefined || raw === "") return null;
  if (field.type === "switch") return raw ? "Sí" : "No";
  if (field.type === "select") {
    const opt = (field.options ?? []).find((o) => o.value === raw);
    return opt ? opt.label : String(raw);
  }
  if (field.type === "number") return Number(raw).toLocaleString("es-CL", { maximumFractionDigits: 2 });
  return String(raw);
}
