import { PREFERRED_TO_COMITE, type ComiteRole } from "@/lib/comite-categories";
import { normalizeText } from "@/lib/text";
import type {
  CarteraPosition, ComiteColumn, CustodianType, Decision, MiFondoOption, RecomendacionRow,
} from "./types";

// Normaliza una etiqueta de categoría de fondo para comparar el vocabulario del
// asesor (advisor_preferred_funds.category, ej. "Renta Variable USA") contra los
// códigos cortos de PREFERRED_TO_COMITE (ej. "RV USA"). Sin esto, ningún fondo
// matchea cuando el asesor guarda etiquetas largas → "Mis Fondos" vacío → todo caja.
function normCategoria(c: string): string {
  return normalizeText(c || "")
    .replace(/renta variable/g, "rv")
    .replace(/renta fija/g, "rf")
    .replace(/\s+/g, " ")
    .trim();
}

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
      clase, custodian_type: best.custodian_type, porcentaje: comite.modelo_pct,
      tac: best.tac, rent_12m: best.rent_12m };
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

// Fila para una posición del comité cuya categoría NO resuelve a COMITE_CATEGORIES.
// En vez de descartarla en silencio (dejando el total < 100%), se conserva con su
// peso, rol "cash" (para no inflar RV/RF), sin fondos, y marcada sin_categoria.
export function buildUnresolvedRow(rawCategoria: string, pct: number): RecomendacionRow {
  return {
    categoria: rawCategoria,
    label: rawCategoria,
    role: "cash",
    comite: { etf_us: null, etf_ucits: null, modelo_pct: pct, vista: null, conviction: null },
    misFondos: [],
    decision: { fuente: "caja", ticker: null, nombre: "Sin categoría", clase: "Cash", custodian_type: null, porcentaje: pct },
    sin_categoria: true,
  };
}

interface PreferredFundInput {
  id: string;
  fund_run: string | null;
  ticker: string | null;
  nombre: string;
  custodian_type: MiFondoOption["custodian_type"];
  category: string;       // categoría del asesor (ej. "RV Internacional")
  tac: number | null;
  rent_12m: number | null;
}
interface MappingInput {
  categoria: string;      // id de COMITE_CATEGORIES
  custodian_type: MiFondoOption["custodian_type"];
  preferred_fund_id: string;
}

export function resolveMisFondos(input: {
  categoria: string;
  custodios: MiFondoOption["custodian_type"][];
  preferredFunds: PreferredFundInput[];
  mappings: MappingInput[];
}): MiFondoOption[] {
  const { categoria, custodios, preferredFunds, mappings } = input;
  // Comparación normalizada: tolera "Renta Variable USA" ≡ "RV USA", acentos y mayúsculas.
  const wanted = new Set((PREFERRED_TO_COMITE[categoria] || []).map(normCategoria));
  const custodioSet = new Set(custodios);

  // IDs mapeados explícitamente para esta categoría y algún custodio del cliente
  const mappedIds = new Set(
    mappings.filter(m => m.categoria === categoria && custodioSet.has(m.custodian_type)).map(m => m.preferred_fund_id)
  );

  const candidates = preferredFunds.filter(f =>
    custodioSet.has(f.custodian_type) &&
    (mappedIds.has(f.id) || wanted.has(normCategoria(f.category)))
  );

  const toOption = (f: PreferredFundInput): MiFondoOption => ({
    fund_id: f.id, fund_run: f.fund_run, ticker: f.ticker, nombre: f.nombre,
    custodian_type: f.custodian_type, tac: f.tac, rent_12m: f.rent_12m, isMapped: mappedIds.has(f.id),
  });

  return candidates
    .map(toOption)
    .sort((a, b) => {
      if (a.isMapped !== b.isMapped) return a.isMapped ? -1 : 1;  // mapped primero
      return (a.tac ?? Infinity) - (b.tac ?? Infinity);           // luego menor TAC
    });
}

export function deriveCartera(rows: RecomendacionRow[]): CarteraPosition[] {
  return rows.map(r => ({
    clase: r.decision.clase, ticker: r.decision.ticker,
    nombre: r.decision.nombre, porcentaje: r.decision.porcentaje,
  }));
}

export function sumaPesos(rows: RecomendacionRow[]): number {
  return rows.reduce((acc, r) => acc + (r.decision.porcentaje || 0), 0);
}

// TAC y rent 12M ponderados por peso, SOLO sobre las decisiones que tienen el dato
// (típicamente "mi_fondo"). coverage = fracción de la cartera con dato (0..1).
export function weightedMetrics(rows: RecomendacionRow[]): { tac: number | null; rent12m: number | null; coverage: number } {
  let tacSum = 0, tacW = 0, rentSum = 0, rentW = 0, totalW = 0;
  for (const r of rows) {
    const w = r.decision.porcentaje || 0;
    totalW += w;
    if (r.decision.tac != null) { tacSum += r.decision.tac * w; tacW += w; }
    if (r.decision.rent_12m != null) { rentSum += r.decision.rent_12m * w; rentW += w; }
  }
  return {
    tac: tacW > 0 ? tacSum / tacW : null,
    rent12m: rentW > 0 ? rentSum / rentW : null,
    coverage: totalW > 0 ? tacW / totalW : 0,
  };
}
