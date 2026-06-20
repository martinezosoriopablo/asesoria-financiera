// src/lib/risk/benchmarks.ts

// Universo en el que construimos el benchmark
export type BenchmarkUniverse = "global" | "solo_chile";

// Bandas de riesgo según el perfil
export type RiskBand = "defensivo" | "conservador" | "moderado" | "agresivo" | "muy_agresivo";

// Asset allocation estratégico que consume la página modelo-cartera
export interface AssetAllocation {
  band: string;
  weights: {
    equities: number;      // % total en renta variable
    fixedIncome: number;   // % total en renta fija
    alternatives: number;  // % total en alternativos
    cash: number;          // % efectivo / money market
  };
  equityRegions: {
    chile: number;
    latamExChile: number;
    usa: number;
    europe: number;
    asiaDev: number;
    emergentes: number;
  };
  fixedIncomeBuckets: {
    localShort: number;
    localLong: number;
    globalIG: number;
    globalHY: number;
    inflationLinked: number;
  };
  alternativeBuckets: {
    realEstate: number;
    infrastructure: number;
    others: number;
  };
}

// ----------------------------------------------------------
// 1. Pesos por banda de riesgo (clase de activo)
// ----------------------------------------------------------
//
// Suma siempre 100%: equities + fixedIncome + alternatives + cash
//
// Defensivo      : 20 / 65 / 10 / 5
// Conservador    : 35 / 55 / 10 / 0
// Moderado       : 50 / 40 / 10 / 0
// Agresivo       : 70 / 20 / 10 / 0
// Muy Agresivo   : 85 / 10 /  5 / 0
//

const RISK_BAND_WEIGHTS: Record<
  RiskBand,
  { equities: number; fixedIncome: number; alternatives: number; cash: number }
> = {
  defensivo:    { equities: 20, fixedIncome: 65, alternatives: 10, cash: 5 },
  conservador:  { equities: 35, fixedIncome: 55, alternatives: 10, cash: 0 },
  moderado:     { equities: 50, fixedIncome: 40, alternatives: 10, cash: 0 },
  agresivo:     { equities: 70, fixedIncome: 20, alternatives: 10, cash: 0 },
  muy_agresivo: { equities: 85, fixedIncome: 10, alternatives: 5,  cash: 0 },
};

// ----------------------------------------------------------
// 2. Distribución regional de equities
// ----------------------------------------------------------

// Universo global: parecido a MSCI ACWI con pequeño home bias LatAm
const EQUITY_REGIONS_GLOBAL = {
  chile: 5,
  latamExChile: 5,
  usa: 55,
  europe: 15,
  asiaDev: 10,
  emergentes: 10,
};

// Universo “Solo Chile”: fuerte peso Chile, el resto satélites
const EQUITY_REGIONS_SOLO_CHILE = {
  chile: 60,
  latamExChile: 10,
  usa: 15,
  europe: 7.5,
  asiaDev: 2.5,
  emergentes: 5,
};

// ----------------------------------------------------------
// 3. Buckets de renta fija
// ----------------------------------------------------------

const FI_BUCKETS_GLOBAL = {
  localShort: 20,
  localLong: 20,
  globalIG: 40,
  globalHY: 10,
  inflationLinked: 10,
};

const FI_BUCKETS_SOLO_CHILE = {
  localShort: 40,
  localLong: 40,
  globalIG: 15,
  globalHY: 0,
  inflationLinked: 5,
};

// ----------------------------------------------------------
// 4. Alternativos
// ----------------------------------------------------------

const ALT_BUCKETS_BASE = {
  realEstate: 40,
  infrastructure: 40,
  others: 20,
};

// ----------------------------------------------------------
// 5. Mapeo score → banda de riesgo
// ----------------------------------------------------------
//
// Puedes ajustar los cortes, pero así queda bien razonable:
//  0–20  : defensivo
// 20–40  : conservador
// 40–60  : moderado
// 60–80  : agresivo
// 80–100 : muy_agresivo
//

function riskBandFromScore(score: number | null): RiskBand {
  const s = score ?? 0;
  if (s < 20) return "defensivo";
  if (s < 40) return "conservador";
  if (s < 60) return "moderado";
  if (s < 80) return "agresivo";
  return "muy_agresivo";
}

// ----------------------------------------------------------
// 6. Función principal consumida por la página
// ----------------------------------------------------------

/**
 * Devuelve el asset allocation estratégico (benchmark) en función
 * del puntaje de perfil de riesgo, si incluimos alternativos y
 * del universo (global vs solo Chile).
 *
 * Todos los pesos están en porcentaje (0–100).
 */
export function getBenchmarkFromScore(
  score: number | null,
  includeAlternatives: boolean,
  universe: BenchmarkUniverse
): AssetAllocation {
  const band = riskBandFromScore(score);
  const base = { ...RISK_BAND_WEIGHTS[band] };

  // Si NO incluimos alternativos, movemos ese % a renta variable
  if (!includeAlternatives) {
    base.equities += base.alternatives;
    base.alternatives = 0;
  }

  // Elegir distribución regional según universo
  const equityRegions =
    universe === "global"
      ? EQUITY_REGIONS_GLOBAL
      : EQUITY_REGIONS_SOLO_CHILE;

  // Buckets de renta fija según universo
  const fixedIncomeBuckets =
    universe === "global" ? FI_BUCKETS_GLOBAL : FI_BUCKETS_SOLO_CHILE;

  // Alternativos siempre misma estructura (si weight = 0, igual se respeta)
  const alternativeBuckets = ALT_BUCKETS_BASE;

  const allocation: AssetAllocation = {
    band,
    weights: {
      equities: base.equities,
      fixedIncome: base.fixedIncome,
      alternatives: base.alternatives,
      cash: base.cash,
    },
    equityRegions,
    fixedIncomeBuckets,
    alternativeBuckets,
  };

  return allocation;
}
