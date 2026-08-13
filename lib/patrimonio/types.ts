// lib/patrimonio/types.ts
export type Moneda = "CLP" | "UF" | "USD";
export const MONEDAS: Moneda[] = ["CLP", "UF", "USD"];
export type Periodicidad = "mensual" | "anual";

export type SeguroTipo = "vida" | "salud" | "vida_con_ahorro" | "otros";
export interface Seguro {
  id: string;
  client_id: string;
  tipo: SeguroTipo;
  compania: string | null;
  numero_poliza: string | null;
  prima_monto: number | null;
  prima_moneda: Moneda | null;
  prima_periodicidad: Periodicidad;
  cobertura_monto: number | null;
  cobertura_moneda: Moneda | null;
  cobertura_desc: string | null;
  deducible_monto: number | null;
  deducible_moneda: Moneda | null;
  beneficiarios: string | null;
  devuelve_prima: boolean;
  devolucion_pct: number | null;
  fecha_inicio: string | null;
  fecha_termino: string | null;
  componente_ahorro_monto: number | null;
  componente_ahorro_moneda: Moneda | null;
  notas: string | null;
}

export type InmuebleTipo = "inversion" | "habitacion";
export interface Inmueble {
  id: string;
  client_id: string;
  tipo: InmuebleTipo;
  etiqueta: string | null;
  ubicacion: string | null;
  valor_compra_monto: number | null;
  valor_compra_moneda: Moneda | null;
  fecha_compra: string | null;
  valor_estimado_venta_monto: number | null;
  valor_estimado_venta_moneda: Moneda | null;
  tiene_credito: boolean;
  credito_saldo_monto: number | null;
  credito_saldo_moneda: Moneda | null;
  credito_tasa_anual: number | null;
  credito_plazo_meses_restantes: number | null;
  credito_cuota_monto: number | null;
  credito_cuota_moneda: Moneda | null;
  se_arrienda: boolean;
  arriendo_monto: number | null;
  arriendo_moneda: Moneda | null;
  notas: string | null;
}

export type ActivoTipo = "apv" | "afp" | "ahorro_periodico" | "cuenta_ahorro" | "otro";
export interface ActivoFinanciero {
  id: string;
  client_id: string;
  tipo: ActivoTipo;
  institucion: string | null;
  saldo_monto: number | null;
  saldo_moneda: Moneda | null;
  aporte_monto: number | null;
  aporte_moneda: Moneda | null;
  aporte_periodicidad: Periodicidad | null;
  aporte_es_variable: boolean;
  regimen: "A" | "B" | null;
  notas: string | null;
}

export interface PatrimonioData {
  seguros: Seguro[];
  inmuebles: Inmueble[];
  activos: ActivoFinanciero[];
}
