import type { ComiteRole } from "@/lib/comite-categories";
import type { ComiteColumn, CustodianType, Decision, MiFondoOption } from "./types";

const ROLE_TO_CLASE: Record<ComiteRole, string> = {
  rv: "Renta Variable",
  rf: "Renta Fija",
  alt: "Alternativos",
  cash: "Cash",
};

export function roleToClase(role: ComiteRole): string {
  return ROLE_TO_CLASE[role];
}

export function defaultDecision(input: {
  categoria: string;
  role: ComiteRole;
  comite: ComiteColumn;
  misFondos: MiFondoOption[];
  custodio: CustodianType;
}): Decision {
  const { role, comite, misFondos, custodio } = input;
  const clase = roleToClase(role);
  const best = misFondos[0]; // ya viene ordenado (mapped primero, luego mejor TAC)

  // Prioridad 1: si hay un fondo del asesor disponible, usarlo (aplica a todos los custodios)
  if (best) {
    return { fuente: "mi_fondo", ticker: best.ticker, nombre: best.nombre,
      clase, custodian_type: best.custodian_type, porcentaje: comite.modelo_pct };
  }

  // Prioridad 2: sin fondo del asesor.
  // internacional/corredora pueden comprar el ETF del comité en bolsa.
  if (custodio === "internacional" || custodio === "corredora") {
    const etf = comite.etf_us || comite.etf_ucits;
    if (etf) {
      return { fuente: "comite_etf", ticker: etf, nombre: etf,
        clase, custodian_type: custodio, porcentaje: comite.modelo_pct };
    }
  }

  // AGF sin equivalente (o categoría sin ETF): default a caja, el asesor decide.
  return { fuente: "caja", ticker: null, nombre: "Caja",
    clase, custodian_type: custodio, porcentaje: comite.modelo_pct };
}
