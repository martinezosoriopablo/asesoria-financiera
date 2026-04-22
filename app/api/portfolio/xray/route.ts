// app/api/portfolio/xray/route.ts
// Radiografía de portafolio: analiza costos, clasifica holdings, busca alternativas más baratas

import { NextRequest, NextResponse } from "next/server";
import { requireAdvisor, createAdminClient } from "@/lib/auth/api-auth";
import { applyRateLimit } from "@/lib/rate-limit";

interface HoldingInput {
  fundName: string;
  securityId?: string | null;
  quantity?: number;
  marketPrice?: number;
  marketValue: number;
  assetClass?: string;
  currency?: string;
}

interface FondoMatch {
  id: string;
  fo_run: number;
  fm_serie: string;
  nombre_fondo: string;
  nombre_agf: string;
  familia_estudios: string | null;
  tac_sintetica: number | null;
  rent_12m_nominal: number | null;
  rent_30d_nominal: number | null;
  clase_inversionista: string | null;
}

interface Alternative {
  nombre_fondo: string;
  nombre_agf: string;
  fm_serie: string;
  tac_sintetica: number;
  rent_12m: number | null;
  sharpe_365d: number | null;
  patrimonio_mm: number | null;
  categoria: string;
}

interface HoldingAnalysis {
  fundName: string;
  marketValue: number;
  weight: number; // % of portfolio
  currency: string;
  // Fund match
  matched: boolean;
  matchedFund: string | null;
  matchedAgf: string | null;
  categoria: string; // Renta Variable, Renta Fija, Balanceado, Alternativos, Otros
  // Cost
  tac: number | null; // Annual cost %
  tacImpactAnnual: number | null; // $ annual cost
  tacImpact10Y: number | null; // $ 10-year projected cost
  // Tax
  isApvEligible: boolean;
  regimen57bis: boolean;
  // Alternatives
  cheaperAlternatives: Alternative[];
  potentialSavingAnnual: number | null; // $ if switched to cheapest
  potentialSaving10Y: number | null;
}

interface XrayResult {
  totalValue: number;
  totalValueCLP: number;
  // Allocation
  allocation: {
    rentaVariable: { value: number; percent: number };
    rentaFija: { value: number; percent: number };
    balanceado: { value: number; percent: number };
    alternativos: { value: number; percent: number };
    otros: { value: number; percent: number };
  };
  // Costs
  tacPromedioPortfolio: number; // Weighted average TAC
  costoAnualTotal: number; // Total annual cost in CLP
  costoProyectado10Y: number; // 10-year projected cost
  // Potential savings
  ahorroAnualPotencial: number;
  ahorroPotencial10Y: number;
  // Holdings detail
  holdings: HoldingAnalysis[];
  // Summary
  holdingsConTac: number;
  holdingsSinTac: number;
  holdingsConAlternativa: number;
}

function getCategoriaSimple(familia: string | null): string {
  if (!familia) return "Otros";
  const f = familia.toLowerCase();
  if (f.includes("accionario") || f.includes("renta variable")) return "Renta Variable";
  if (f.includes("deuda") || f.includes("renta fija")) return "Renta Fija";
  if (f.includes("balanceado")) return "Balanceado";
  if (f.includes("estructurado") || f.includes("otro")) return "Alternativos";
  return "Otros";
}

function stripAccents(str: string): string {
  return str.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

// Detect if fund name suggests APV eligibility
function detectApvEligible(fundName: string): boolean {
  return /\bAPV\b/i.test(fundName);
}

// Build PostgREST filter for asset class category
function buildCategoryFilter(categoria: string): string {
  switch (categoria) {
    case "Renta Variable":
      return "familia_estudios.ilike.%accionario%,familia_estudios.ilike.%renta variable%";
    case "Renta Fija":
      return "familia_estudios.ilike.%deuda%,familia_estudios.ilike.%renta fija%";
    case "Balanceado":
      return "familia_estudios.ilike.%balanceado%";
    case "Alternativos":
      return "familia_estudios.ilike.%estructurado%,familia_estudios.ilike.%otro%";
    default:
      return "";
  }
}

export async function POST(request: NextRequest) {
  const blocked = await applyRateLimit(request, "portfolio-xray", { limit: 10, windowSeconds: 60 });
  if (blocked) return blocked;

  const { error: authError } = await requireAdvisor();
  if (authError) return authError;

  const supabase = createAdminClient();

  try {
    const { holdings } = (await request.json()) as { holdings: HoldingInput[] };

    if (!holdings || !Array.isArray(holdings) || holdings.length === 0) {
      return NextResponse.json(
        { success: false, error: "holdings array requerido" },
        { status: 400 }
      );
    }

    const totalValue = holdings.reduce((s, h) => s + (h.marketValue || 0), 0);
    if (totalValue <= 0) {
      return NextResponse.json(
        { success: false, error: "El portafolio tiene valor 0" },
        { status: 400 }
      );
    }

    // Pre-fetch all fondos_mutuos with TAC for matching
    const { data: allFondos } = await supabase
      .from("vw_fondos_completo")
      .select(
        "id, fo_run, fm_serie, nombre_fondo, nombre_agf, familia_estudios, tac_sintetica, rent_12m_nominal, rent_30d_nominal, clase_inversionista"
      )
      .limit(5000);

    // Pre-fetch aggregated returns for alternatives ranking
    const { data: latestReturns } = await supabase
      .from("fondos_rentabilidades_latest")
      .select("fondo_id, rent_365d, sharpe_365d, volatilidad_365d, patrimonio_mm")
      .limit(5000);

    const returnsMap = new Map<string, { rent_365d: number | null; sharpe_365d: number | null; patrimonio_mm: number | null }>();
    for (const r of latestReturns || []) {
      returnsMap.set(r.fondo_id, r);
    }

    const fondosIndex = allFondos || [];

    // Match each holding to a fondo
    const analyzeHolding = (holding: HoldingInput): HoldingAnalysis => {
      const weight = totalValue > 0 ? (holding.marketValue / totalValue) * 100 : 0;
      const nameNorm = stripAccents(holding.fundName.toLowerCase());
      const words = nameNorm
        .split(/\s+/)
        .filter((w) => w.length > 3 && !/^(fondo|mutuo|de|del|la|los|las|el|en|con|por|serie?)$/i.test(w));

      // Find best matching fondo
      let bestMatch: FondoMatch | null = null;
      let bestScore = 0;

      for (const f of fondosIndex) {
        const fNorm = stripAccents(f.nombre_fondo.toLowerCase());
        let score = 0;
        for (const w of words) {
          if (fNorm.includes(w)) score++;
        }
        // Serie matching
        if (holding.fundName.match(/\s-\s*([A-Z]+)\s*$/i)) {
          const serie = RegExp.$1.toUpperCase();
          if (f.fm_serie && f.fm_serie.toUpperCase().includes(serie)) score += 3;
        }
        if (score > bestScore && score >= 2) {
          bestScore = score;
          bestMatch = f;
        }
      }

      const categoria = bestMatch
        ? getCategoriaSimple(bestMatch.familia_estudios)
        : holding.assetClass === "equity"
          ? "Renta Variable"
          : holding.assetClass === "fixedIncome"
            ? "Renta Fija"
            : "Otros";

      const tac = bestMatch?.tac_sintetica || null;
      const tacAnnual = tac && holding.marketValue ? (tac / 100) * holding.marketValue : null;
      // 10-year cost projection (compound effect of TAC on returns)
      const tac10Y = tacAnnual ? tacAnnual * 10 * 1.05 : null; // rough projection with growth

      // Find cheaper alternatives in same category
      const alternatives: Alternative[] = [];
      let potentialSavingAnnual: number | null = null;
      let potentialSaving10Y: number | null = null;

      if (bestMatch && tac && tac > 0) {
        const categoryFilter = buildCategoryFilter(categoria);
        if (categoryFilter) {
          // Find funds in same category with lower TAC
          const candidates = fondosIndex.filter((f) => {
            if (!f.tac_sintetica || f.tac_sintetica >= tac) return false;
            if (f.id === bestMatch!.id) return false;
            const fCat = getCategoriaSimple(f.familia_estudios);
            return fCat === categoria;
          });

          // Sort by TAC ascending, take top 3
          candidates.sort((a, b) => (a.tac_sintetica || 99) - (b.tac_sintetica || 99));
          for (const c of candidates.slice(0, 3)) {
            const returns = returnsMap.get(c.id);
            alternatives.push({
              nombre_fondo: c.nombre_fondo,
              nombre_agf: c.nombre_agf,
              fm_serie: c.fm_serie,
              tac_sintetica: c.tac_sintetica!,
              rent_12m: c.rent_12m_nominal,
              sharpe_365d: returns?.sharpe_365d || null,
              patrimonio_mm: returns?.patrimonio_mm || null,
              categoria,
            });
          }

          // Calculate potential savings (vs cheapest alternative)
          if (alternatives.length > 0) {
            const cheapestTac = alternatives[0].tac_sintetica;
            const tacDiff = (tac - cheapestTac) / 100;
            potentialSavingAnnual = tacDiff * holding.marketValue;
            potentialSaving10Y = potentialSavingAnnual * 10 * 1.05;
          }
        }
      }

      return {
        fundName: holding.fundName,
        marketValue: holding.marketValue,
        weight: Math.round(weight * 100) / 100,
        currency: holding.currency || "CLP",
        matched: !!bestMatch,
        matchedFund: bestMatch?.nombre_fondo || null,
        matchedAgf: bestMatch?.nombre_agf || null,
        categoria,
        tac,
        tacImpactAnnual: tacAnnual ? Math.round(tacAnnual) : null,
        tacImpact10Y: tac10Y ? Math.round(tac10Y) : null,
        isApvEligible: detectApvEligible(holding.fundName),
        regimen57bis: false, // Cannot auto-detect from cartola, needs manual input
        cheaperAlternatives: alternatives,
        potentialSavingAnnual: potentialSavingAnnual ? Math.round(potentialSavingAnnual) : null,
        potentialSaving10Y: potentialSaving10Y ? Math.round(potentialSaving10Y) : null,
      };
    };

    const analyzedHoldings = holdings.map(analyzeHolding);

    // Aggregate allocation
    const allocation = {
      rentaVariable: { value: 0, percent: 0 },
      rentaFija: { value: 0, percent: 0 },
      balanceado: { value: 0, percent: 0 },
      alternativos: { value: 0, percent: 0 },
      otros: { value: 0, percent: 0 },
    };

    const catKey: Record<string, keyof typeof allocation> = {
      "Renta Variable": "rentaVariable",
      "Renta Fija": "rentaFija",
      Balanceado: "balanceado",
      Alternativos: "alternativos",
      Otros: "otros",
    };

    for (const h of analyzedHoldings) {
      const key = catKey[h.categoria] || "otros";
      allocation[key].value += h.marketValue;
    }
    for (const key of Object.keys(allocation) as Array<keyof typeof allocation>) {
      allocation[key].percent =
        totalValue > 0
          ? Math.round((allocation[key].value / totalValue) * 10000) / 100
          : 0;
    }

    // Aggregate costs
    const holdingsConTac = analyzedHoldings.filter((h) => h.tac !== null);
    const weightedTac =
      holdingsConTac.length > 0
        ? holdingsConTac.reduce((s, h) => s + (h.tac || 0) * (h.weight / 100), 0)
        : 0;
    const costoAnual = analyzedHoldings.reduce((s, h) => s + (h.tacImpactAnnual || 0), 0);
    const costoProyectado = analyzedHoldings.reduce((s, h) => s + (h.tacImpact10Y || 0), 0);
    const ahorroAnual = analyzedHoldings.reduce((s, h) => s + (h.potentialSavingAnnual || 0), 0);
    const ahorro10Y = analyzedHoldings.reduce((s, h) => s + (h.potentialSaving10Y || 0), 0);

    const result: XrayResult = {
      totalValue,
      totalValueCLP: totalValue, // TODO: convert if multi-currency
      allocation,
      tacPromedioPortfolio: Math.round(weightedTac * 100) / 100,
      costoAnualTotal: Math.round(costoAnual),
      costoProyectado10Y: Math.round(costoProyectado),
      ahorroAnualPotencial: Math.round(ahorroAnual),
      ahorroPotencial10Y: Math.round(ahorro10Y),
      holdings: analyzedHoldings,
      holdingsConTac: holdingsConTac.length,
      holdingsSinTac: analyzedHoldings.length - holdingsConTac.length,
      holdingsConAlternativa: analyzedHoldings.filter((h) => h.cheaperAlternatives.length > 0).length,
    };

    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    console.error("Error in portfolio xray:", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Error en radiografía" },
      { status: 500 }
    );
  }
}
