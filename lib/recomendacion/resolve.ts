import { PREFERRED_TO_COMITE, type ComiteRole } from "@/lib/comite-categories";
import { normalizeText } from "@/lib/text";
import type { DirectHolding } from "./current-holdings";
import type {
  CarteraPosition, ComiteColumn, CustodianType, Decision, MiFondoOption, MiInstrumentoOption, RecomendacionRow, Vehiculo,
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

interface SleeveSector { sector?: string | null; vista?: string | null }

// Construye un lookup sector → vista desde model_portfolios.sleeves.
export function buildSectorVistaLookup(sleeves: SleeveSector[] | null | undefined): (sector: string | null) => string | null {
  const map = new Map<string, string>();
  for (const s of sleeves || []) {
    if (s.sector && s.vista) map.set(s.sector.toLowerCase(), s.vista);
  }
  return (sector: string | null) => (sector ? map.get(sector.toLowerCase()) ?? null : null);
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
  instrument_type?: "fund" | "stock" | "bond";
  sector?: string | null;
}
interface MappingInput {
  categoria: string;      // id de COMITE_CATEGORIES
  custodian_type: MiFondoOption["custodian_type"];
  preferred_fund_id: string;
}

// Match category (etiqueta del asesor) → sleeve del comité, con normalización.
// Dos caminos: (1) vocabulario genérico de fondos preferidos (PREFERRED_TO_COMITE,
// ej. "RV USA" para rv_usa_large_cap); (2) para acciones/bonos preferidos el
// asesor suele tagear directo con el nombre del sleeve (ej. "UST belly" para
// rf_ust_belly) — se compara contra el id sin prefijo de rol y con "_" → " ".
export function matchesSleeve(category: string, sleeveId: string, includeSleeveLabel = false): boolean {
  const wanted = new Set((PREFERRED_TO_COMITE[sleeveId] || []).map(normCategoria));
  if (wanted.has(normCategoria(category))) return true;
  if (!includeSleeveLabel) return false;
  // Fallback SOLO para instrumentos directos tageados con el nombre del sleeve (ej. "UST belly").
  const sleeveLabel = sleeveId.replace(/^(rv|rf|alt|cash)_/, "").replace(/_/g, " ");
  return normCategoria(category) === normCategoria(sleeveLabel);
}

export function resolveMisFondos(input: {
  categoria: string;
  custodios: MiFondoOption["custodian_type"][];
  preferredFunds: PreferredFundInput[];
  mappings: MappingInput[];
}): MiFondoOption[] {
  const { categoria, custodios, preferredFunds, mappings } = input;
  const custodioSet = new Set(custodios);
  const mappedIds = new Set(
    mappings.filter(m => m.categoria === categoria && custodioSet.has(m.custodian_type)).map(m => m.preferred_fund_id)
  );
  const candidates = preferredFunds.filter(f =>
    (f.instrument_type ?? "fund") === "fund" &&
    custodioSet.has(f.custodian_type) &&
    (mappedIds.has(f.id) || matchesSleeve(f.category, categoria))
  );
  const toOption = (f: PreferredFundInput): MiInstrumentoOption => ({
    fund_id: f.id, fund_run: f.fund_run, ticker: f.ticker, nombre: f.nombre,
    custodian_type: f.custodian_type, tac: f.tac, rent_12m: f.rent_12m, isMapped: mappedIds.has(f.id),
    tipo: "fund", origen: "preferido", sector: null, vista_comite: null, weight_pct: null,
  });
  return candidates.map(toOption).sort((a, b) => {
    if (a.isMapped !== b.isMapped) return a.isMapped ? -1 : 1;
    return (a.tac ?? Infinity) - (b.tac ?? Infinity);
  });
}

function etfOption(etf: string, custodio: MiInstrumentoOption["custodian_type"]): MiInstrumentoOption {
  return { fund_id: `etf:${etf}`, fund_run: null, ticker: etf, nombre: etf, custodian_type: custodio,
    tac: null, rent_12m: null, isMapped: false, tipo: "etf", origen: "comite", sector: null, vista_comite: null, weight_pct: null };
}

// Resuelve la columna del medio ("Mis Instrumentos") según el vehículo elegido
// para el rol (fondos / etf / directo). Generaliza resolveMisFondos (que sigue
// siendo el caso "fondos") agregando ETF del comité y, para "directo", los
// holdings actuales del cliente + instrumentos preferidos (acciones/bonos)
// tageados con la vista del comité (sector para RV, duración/vista del sleeve para RF).
export function resolveMisInstrumentos(input: {
  sleeveId: string;
  role: ComiteRole;
  vehiculo: Vehiculo;
  custodios: MiInstrumentoOption["custodian_type"][];
  preferred: PreferredFundInput[];
  currentDirect: DirectHolding[];
  comiteEtfUs: string | null;
  comiteEtfUcits: string | null;
  bondVista: string | null;
  sectorVista: (sector: string | null) => string | null;
  mappings: MappingInput[];
}): MiInstrumentoOption[] {
  const { sleeveId, role, vehiculo, custodios, preferred, currentDirect, comiteEtfUs, comiteEtfUcits, bondVista, sectorVista, mappings } = input;
  const custodioSet = new Set(custodios);

  if (vehiculo === "fondos") {
    return resolveMisFondos({ categoria: sleeveId, custodios, preferredFunds: preferred, mappings });
  }

  if (vehiculo === "etf") {
    const etf = comiteEtfUs || comiteEtfUcits;
    return etf ? [etfOption(etf, custodios[0] ?? "internacional")] : [];
  }

  // directo: RF → bonos, resto → acciones
  const wantType: "stock" | "bond" = role === "rf" ? "bond" : "stock";
  const vistaFor = (sector: string | null) => (wantType === "bond" ? bondVista : sectorVista(sector));

  const current: MiInstrumentoOption[] = currentDirect
    .filter(h => h.tipo === wantType)
    .map(h => ({
      fund_id: `hold:${h.ticker || h.nombre}`, fund_run: null, ticker: h.ticker, nombre: h.nombre,
      custodian_type: h.custodian_type, tac: null, rent_12m: null, isMapped: false,
      tipo: wantType, origen: "actual", sector: h.sector, vista_comite: vistaFor(h.sector), weight_pct: h.weight_pct,
    }));

  const pref: MiInstrumentoOption[] = preferred
    .filter(p => (p.instrument_type ?? "fund") === wantType && custodioSet.has(p.custodian_type) && matchesSleeve(p.category, sleeveId, true))
    .map(p => ({
      fund_id: p.id, fund_run: p.fund_run, ticker: p.ticker, nombre: p.nombre,
      custodian_type: p.custodian_type, tac: p.tac, rent_12m: p.rent_12m, isMapped: false,
      tipo: wantType, origen: "preferido", sector: p.sector ?? null, vista_comite: vistaFor(p.sector ?? null), weight_pct: null,
    }));

  return [...current, ...pref]; // actuales primero (default = mantener)
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
