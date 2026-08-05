import type { ComiteRole } from "@/lib/comite-categories";
import type { Vehiculo, VehiculosConfig } from "./types";

const VALID: Vehiculo[] = ["fondos", "etf", "directo"];
const one = (v: unknown): Vehiculo => (VALID.includes(v as Vehiculo) ? (v as Vehiculo) : "fondos");

// Normaliza el JSONB clients.recomendacion_vehiculos a una config completa.
// Ausente/nulo/basura → todo "fondos" (retrocompatible).
export function parseVehiculos(raw: unknown): VehiculosConfig {
  const r = (raw ?? {}) as Record<string, unknown>;
  return { rv: one(r.rv), rf: one(r.rf), alt: one(r.alt) };
}

// Rol del comité → vehículo de su clase. "cash" usa "fondos".
export function resolveVehiculo(config: VehiculosConfig | null | undefined, role: ComiteRole): Vehiculo {
  const c = config ?? { rv: "fondos", rf: "fondos", alt: "fondos" };
  if (role === "rv") return c.rv;
  if (role === "rf") return c.rf;
  if (role === "alt") return c.alt;
  return "fondos"; // cash
}
