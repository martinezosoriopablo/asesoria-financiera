// components/clients/patrimonio/schemas.ts
import { EntidadKey } from "@/lib/patrimonio/entidades";

export type FieldType = "text" | "number" | "date" | "money" | "select" | "switch" | "textarea";

export interface FieldDef {
  key: string;           // money: base -> escribe key_monto / key_moneda
  label: string;
  type: FieldType;
  options?: { value: string; label: string }[];
  showIf?: (v: Record<string, unknown>) => boolean;
  width?: "full" | "half" | "third";
}

const PERIODICIDAD = [
  { value: "mensual", label: "Mensual" },
  { value: "anual", label: "Anual" },
];

export const SEGURO_FIELDS: FieldDef[] = [
  { key: "compania", label: "Compañía", type: "text", width: "third" },
  { key: "numero_poliza", label: "N° de póliza", type: "text", width: "third" },
  { key: "prima", label: "Prima", type: "money", width: "third" },
  { key: "prima_periodicidad", label: "Periodicidad", type: "select", options: PERIODICIDAD, width: "third" },
  { key: "cobertura", label: "Monto asegurado", type: "money", width: "third" },
  { key: "deducible", label: "Deducible", type: "money", width: "third", showIf: (v) => v.tipo === "salud" },
  { key: "cobertura_desc", label: "¿Qué cubre?", type: "text", width: "third" },
  { key: "beneficiarios", label: "Beneficiarios", type: "text", width: "full" },
  { key: "devuelve_prima", label: "Devuelve prima al final", type: "switch", width: "third" },
  { key: "devolucion_pct", label: "% devolución", type: "number", width: "third", showIf: (v) => !!v.devuelve_prima },
  { key: "fecha_termino", label: "Fecha término", type: "date", width: "third", showIf: (v) => !!v.devuelve_prima },
  { key: "componente_ahorro", label: "Saldo de ahorro", type: "money", width: "third", showIf: (v) => v.tipo === "vida_con_ahorro" },
  { key: "fecha_inicio", label: "Fecha inicio", type: "date", width: "third" },
  { key: "notas", label: "Notas", type: "textarea", width: "full" },
];

export const INMUEBLE_FIELDS: FieldDef[] = [
  { key: "etiqueta", label: "Etiqueta", type: "text", width: "third" },
  { key: "ubicacion", label: "Ubicación", type: "text", width: "third" },
  { key: "fecha_compra", label: "Fecha compra", type: "date", width: "third" },
  { key: "valor_compra", label: "Precio de compra", type: "money", width: "half" },
  { key: "valor_estimado_venta", label: "Valor venta estimado (hoy)", type: "money", width: "half" },
  { key: "tiene_credito", label: "Tiene crédito hipotecario", type: "switch", width: "full" },
  { key: "credito_saldo", label: "Saldo del crédito", type: "money", width: "third", showIf: (v) => !!v.tiene_credito },
  { key: "credito_tasa_anual", label: "Tasa anual (%)", type: "number", width: "third", showIf: (v) => !!v.tiene_credito },
  { key: "credito_plazo_meses_restantes", label: "Plazo restante (meses)", type: "number", width: "third", showIf: (v) => !!v.tiene_credito },
  { key: "credito_cuota", label: "Dividendo (cuota mensual)", type: "money", width: "third", showIf: (v) => !!v.tiene_credito },
  { key: "se_arrienda", label: "Se arrienda", type: "switch", width: "full" },
  { key: "arriendo", label: "Arriendo mensual", type: "money", width: "third", showIf: (v) => !!v.se_arrienda },
  { key: "notas", label: "Notas", type: "textarea", width: "full" },
];

export const ACTIVO_FIELDS: FieldDef[] = [
  { key: "institucion", label: "Institución", type: "text", width: "third" },
  { key: "saldo", label: "Saldo actual", type: "money", width: "third" },
  { key: "regimen", label: "Régimen APV", type: "select",
    options: [{ value: "", label: "—" }, { value: "A", label: "A" }, { value: "B", label: "B" }],
    width: "third", showIf: (v) => v.tipo === "apv" },
  { key: "aporte", label: "Aporte periódico", type: "money", width: "third" },
  { key: "aporte_periodicidad", label: "Periodicidad", type: "select", options: PERIODICIDAD, width: "third",
    showIf: (v) => v.aporte_monto !== null && v.aporte_monto !== undefined },
  { key: "aporte_es_variable", label: "Monto variable", type: "switch", width: "third" },
  { key: "notas", label: "Notas", type: "textarea", width: "full" },
];

export const GRUPOS: {
  key: EntidadKey; titulo: string; icono: string;
  fields: FieldDef[]; tipos: { value: string; label: string }[];
  defaults?: Record<string, unknown>;
}[] = [
  { key: "seguros", titulo: "Seguros", icono: "🛡️", fields: SEGURO_FIELDS,
    tipos: [
      { value: "vida", label: "Vida" }, { value: "salud", label: "Salud" },
      { value: "vida_con_ahorro", label: "Vida con ahorro" }, { value: "otros", label: "Otros" },
    ],
    defaults: { prima_periodicidad: "mensual" } },
  { key: "inmuebles", titulo: "Inmuebles", icono: "🏢", fields: INMUEBLE_FIELDS,
    tipos: [
      { value: "inversion", label: "Inversión (arrienda)" }, { value: "habitacion", label: "Habitación (vive)" },
    ] },
  { key: "activos", titulo: "Activos financieros", icono: "💰", fields: ACTIVO_FIELDS,
    tipos: [
      { value: "apv", label: "APV" }, { value: "afp", label: "AFP" },
      { value: "ahorro_periodico", label: "Ahorro periódico" },
      { value: "cuenta_ahorro", label: "Cuenta ahorro" }, { value: "otro", label: "Otro" },
    ],
    defaults: { aporte_periodicidad: "mensual" } },
];
