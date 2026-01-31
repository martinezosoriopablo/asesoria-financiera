// lib/risk/benchmark_weights.ts
// Adaptador que convierte los benchmarks de benchmark_map.ts
// al formato que espera modelo-cartera/page.tsx

import { getBenchmarkFromScore } from "./benchmarks";
import type { BenchmarkUniverse } from "./benchmarks";

// Tipos de bloques que espera la página
export type EquityBlockId =
  | "equity_chile"
  | "equity_latam_ex_chile"
  | "equity_usa"
  | "equity_europe"
  | "equity_asia_dev"
  | "equity_emergentes";

export type FixedIncomeBlockId =
  | "fi_chile_short"
  | "fi_chile_long"
  | "fi_global_ig"
  | "fi_global_hy"
  | "fi_inflation_linked";

export type AlternativeBlockId =
  | "alt_real_estate"
  | "alt_infrastructure"
  | "alt_others";

// Definiciones de etiquetas para cada bloque
export const EquityBenchmarkDefinition: Record<EquityBlockId, string> = {
  equity_chile: "Acciones Chile",
  equity_latam_ex_chile: "Acciones LatAm ex Chile",
  equity_usa: "Acciones USA",
  equity_europe: "Acciones Europa",
  equity_asia_dev: "Acciones Asia desarrollada",
  equity_emergentes: "Acciones mercados emergentes",
};

export const FixedIncomeBenchmarkDefinition: Record<FixedIncomeBlockId, string> = {
  fi_chile_short: "Renta fija Chile corto plazo",
  fi_chile_long: "Renta fija Chile largo plazo",
  fi_global_ig: "Renta fija global IG",
  fi_global_hy: "High Yield global",
  fi_inflation_linked: "Bonos ligados a inflación",
};

export const AlternativeBenchmarkDefinition: Record<AlternativeBlockId, string> = {
  alt_real_estate: "Real estate listado",
  alt_infrastructure: "Infraestructura",
  alt_others: "Otros alternativos",
};

/**
 * Genera los pesos de equity según el universo y un score de riesgo
 * Retorna un objeto con los pesos de cada bloque de equity
 */
function generateEquityWeights(
  universe: BenchmarkUniverse,
  score: number,
  totalEquityWeight: number
): Record<EquityBlockId, number> {
  const allocation = getBenchmarkFromScore(score, false, universe);
  const regions = allocation.equityRegions;

  // Convertir los pesos regionales (que suman 100) a pesos del portafolio
  // multiplicando por el peso total de equity
  const factor = totalEquityWeight / 100;

  return {
    equity_chile: regions.chile * factor,
    equity_latam_ex_chile: regions.latamExChile * factor,
    equity_usa: regions.usa * factor,
    equity_europe: regions.europe * factor,
    equity_asia_dev: regions.asiaDev * factor,
    equity_emergentes: regions.emergentes * factor,
  };
}

/**
 * Genera los pesos de renta fija según el universo y un score de riesgo
 */
function generateFixedIncomeWeights(
  universe: BenchmarkUniverse,
  score: number,
  totalFIWeight: number
): Record<FixedIncomeBlockId, number> {
  const allocation = getBenchmarkFromScore(score, false, universe);
  const buckets = allocation.fixedIncomeBuckets;

  const factor = totalFIWeight / 100;

  return {
    fi_chile_short: buckets.localShort * factor,
    fi_chile_long: buckets.localLong * factor,
    fi_global_ig: buckets.globalIG * factor,
    fi_global_hy: buckets.globalHY * factor,
    fi_inflation_linked: buckets.inflationLinked * factor,
  };
}

/**
 * Genera los pesos de alternativos
 */
function generateAlternativeWeights(
  score: number,
  totalAltWeight: number
): Record<AlternativeBlockId, number> {
  const allocation = getBenchmarkFromScore(score, true, "global");
  const buckets = allocation.alternativeBuckets;

  const factor = totalAltWeight / 100;

  return {
    alt_real_estate: buckets.realEstate * factor,
    alt_infrastructure: buckets.infrastructure * factor,
    alt_others: buckets.others * factor,
  };
}

/**
 * Función principal que genera todos los pesos para un perfil dado
 */
export function generateBenchmarkWeights(
  score: number | null,
  includeAlternatives: boolean,
  universe: "global" | "solo_chile"
) {
  const benchmarkUniverse: BenchmarkUniverse = universe === "global" ? "global" : "solo_chile";
  const allocation = getBenchmarkFromScore(score, includeAlternatives, benchmarkUniverse);

  const equityWeights = generateEquityWeights(
    benchmarkUniverse,
    score ?? 50,
    allocation.weights.equities
  );

  const fixedIncomeWeights = generateFixedIncomeWeights(
    benchmarkUniverse,
    score ?? 50,
    allocation.weights.fixedIncome
  );

  const alternativeWeights = includeAlternatives
    ? generateAlternativeWeights(score ?? 50, allocation.weights.alternatives)
    : {};

  return {
    equity: equityWeights,
    fixedIncome: fixedIncomeWeights,
    alternatives: alternativeWeights,
    allocation, // Incluimos la allocation completa por si se necesita
  };
}

/**
 * Estructura que espera page.tsx:
 * EQUITY_BENCHMARKS[universe] donde universe = "global" | "chile"
 * 
 * Como no tenemos scores dinámicos aquí, usamos un score medio (50)
 * para generar pesos "neutrales" por defecto
 */
export const EQUITY_BENCHMARKS: Record<"global" | "chile", Record<string, number>> = {
  global: generateEquityWeights("global", 50, 45), // 45% equity para perfil moderado
  chile: generateEquityWeights("solo_chile", 50, 45),
};

export const FIXED_INCOME_BENCHMARKS: Record<"global" | "chile", Record<string, number>> = {
  global: generateFixedIncomeWeights("global", 50, 45), // 45% FI para perfil moderado
  chile: generateFixedIncomeWeights("solo_chile", 50, 45),
};

export const ALTERNATIVE_BENCHMARKS: Record<string, number> = generateAlternativeWeights(50, 10); // 10% alternatives
