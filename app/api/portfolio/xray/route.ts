// app/api/portfolio/xray/route.ts
// Radiografía de portafolio: analiza costos, clasifica holdings, busca alternativas más baratas

import { NextRequest, NextResponse } from "next/server";
import { requireAdvisor, createAdminClient } from "@/lib/auth/api-auth";
import { applyRateLimit } from "@/lib/rate-limit";
import { stripAccents } from "@/lib/text";

interface HoldingInput {
  fundName: string;
  securityId?: string | null;
  serie?: string | null;
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
  rent_30d_nominal: number | null;
  rent_3m_nominal: number | null;
  rent_12m_nominal: number | null;
  clase_inversionista: string | null;
}

interface Alternative {
  nombre_fondo: string;
  nombre_agf: string;
  fm_serie: string;
  tac_sintetica: number;
  rent_1m: number | null;
  rent_3m: number | null;
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
  // Fondo de inversión detection
  isFondoInversion?: boolean;
  fiRut?: string;
  fiPrecioFecha?: string | null;
  fiValorLibro?: number | null;
  fiStale?: boolean; // true if price data is older than 3 days
  fiRent1m?: number | null;
  fiRent3m?: number | null;
  fiRent12m?: number | null;
  // Returns (unified: FM from vw_fondos_completo, FI from fiReturns)
  rent1m: number | null;
  rent3m: number | null;
  rent12m: number | null;
  // Cost
  tac: number | null; // Annual cost %
  tacImpactAnnual: number | null; // $ annual cost
  tacImpact10Y: number | null; // $ 10-year projected cost
  // Tax (from fund_fichas DB or name detection fallback)
  beneficio107lir: boolean;
  beneficio108lir: boolean;
  isApvEligible: boolean;
  regimen57bis: boolean;
  // Alternatives
  cheaperAlternatives: Alternative[];
  potentialSavingAnnual: number | null; // $ if switched to cheapest
  potentialSaving10Y: number | null;
}

interface ProposalHolding {
  originalFund: string;
  proposedFund: string;
  proposedAgf: string;
  proposedSerie: string;
  categoria: string;
  marketValue: number;
  weight: number;
  currentTac: number | null;
  proposedTac: number;
  currentRent1m: number | null;
  currentRent3m: number | null;
  currentRent12m: number | null;
  proposedRent1m: number | null;
  proposedRent3m: number | null;
  proposedRent12m: number | null;
  proposedSharpe: number | null;
  tacSavingBps: number; // basis points saved
  changed: boolean; // false if no cheaper alternative found (keep current)
}

interface OptimizedProposal {
  holdings: ProposalHolding[];
  currentTacPromedio: number;
  proposedTacPromedio: number;
  currentCostoAnual: number;
  proposedCostoAnual: number; // funds cost only (without advisory fee)
  ahorroFondosAnual: number; // savings on fund costs
  // Advisor can set their fee — frontend calculates total
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
  // Fondos de inversión detected
  fondosInversionDetected: Array<{ rut: string; nombre: string; stale: boolean }>;
  // Optimized proposal
  proposal: OptimizedProposal;
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
    // Supabase default max is 1000 rows — must paginate to get all ~3000
    const PAGE = 1000;
    const allFondos: FondoMatch[] = [];
    for (let offset = 0; ; offset += PAGE) {
      const { data: page } = await supabase
        .from("vw_fondos_completo")
        .select(
          "id, fo_run, fm_serie, nombre_fondo, nombre_agf, familia_estudios, tac_sintetica, rent_30d_nominal, rent_3m_nominal, rent_12m_nominal, clase_inversionista"
        )
        .range(offset, offset + PAGE - 1);
      if (!page || page.length === 0) break;
      allFondos.push(...(page as FondoMatch[]));
      if (page.length < PAGE) break;
    }

    // Pre-fetch aggregated returns for alternatives ranking
    const allReturns: Array<{ fondo_id: string; rent_365d: number | null; sharpe_365d: number | null; volatilidad_365d: number | null; patrimonio_mm: number | null }> = [];
    for (let offset = 0; ; offset += PAGE) {
      const { data: page } = await supabase
        .from("fondos_rentabilidades_latest")
        .select("fondo_id, rent_365d, sharpe_365d, volatilidad_365d, patrimonio_mm")
        .range(offset, offset + PAGE - 1);
      if (!page || page.length === 0) break;
      allReturns.push(...page);
      if (page.length < PAGE) break;
    }
    const latestReturns = allReturns;

    const returnsMap = new Map<string, { rent_365d: number | null; sharpe_365d: number | null; patrimonio_mm: number | null }>();
    for (const r of latestReturns || []) {
      returnsMap.set(r.fondo_id, r);
    }

    const fondosIndex = allFondos;

    // Pre-fetch fondos de inversión catalog for FI detection
    const { data: allFI } = await supabase
      .from("fondos_inversion")
      .select("id, rut, nombre, administradora, tipo, cmf_row, ultimo_sync")
      .eq("activo", true)
      .limit(500);

    // Pre-fetch FI prices (full history for return calculation, prefer serie A)
    const fiIndex = allFI || [];
    const fiIds = fiIndex.map(f => f.id);
    let fiLatestPrices: Record<string, { fecha: string; valor_libro: number; serie: string }> = {};
    // fiPriceHistory: fondo_id → sorted array of { fecha, valor_libro } (serie A preferred)
    const fiPriceHistory: Record<string, Array<{ fecha: string; valor_libro: number }>> = {};
    if (fiIds.length > 0) {
      const { data: fiPrices } = await supabase
        .from("fondos_inversion_precios")
        .select("fondo_id, serie, fecha, valor_libro")
        .in("fondo_id", fiIds)
        .order("fecha", { ascending: false })
        .limit(10000);

      if (fiPrices) {
        // Group by fondo_id, pick preferred serie per fondo (A if available)
        const fiSerieByFondo: Record<string, string> = {};
        for (const p of fiPrices) {
          const existing = fiLatestPrices[p.fondo_id];
          if (!existing) {
            fiLatestPrices[p.fondo_id] = { fecha: p.fecha, valor_libro: Number(p.valor_libro), serie: p.serie };
            fiSerieByFondo[p.fondo_id] = p.serie;
          } else if (existing.fecha === p.fecha && p.serie === "A" && existing.serie !== "A") {
            fiLatestPrices[p.fondo_id] = { fecha: p.fecha, valor_libro: Number(p.valor_libro), serie: p.serie };
            fiSerieByFondo[p.fondo_id] = "A";
          }
        }
        // Build price history per fondo using preferred serie
        for (const p of fiPrices) {
          const preferredSerie = fiSerieByFondo[p.fondo_id];
          if (p.serie !== preferredSerie) continue;
          if (!fiPriceHistory[p.fondo_id]) fiPriceHistory[p.fondo_id] = [];
          fiPriceHistory[p.fondo_id].push({ fecha: p.fecha, valor_libro: Number(p.valor_libro) });
        }
        // Sort ascending by date for return calculation
        for (const id of Object.keys(fiPriceHistory)) {
          fiPriceHistory[id].sort((a, b) => a.fecha.localeCompare(b.fecha));
        }
      }
    }

    // Pre-fetch fund_fichas for tax benefit info (paginated)
    const fichasMap = new Map<string, { beneficio_107lir: boolean; beneficio_108lir: boolean; beneficio_apv: boolean; beneficio_57bis: boolean }>();
    for (let offset = 0; ; offset += PAGE) {
      const { data: page } = await supabase
        .from("fund_fichas")
        .select("fo_run, fm_serie, beneficio_107lir, beneficio_108lir, beneficio_apv, beneficio_57bis")
        .range(offset, offset + PAGE - 1);
      if (!page || page.length === 0) break;
      for (const f of page) {
        fichasMap.set(`${f.fo_run}|${f.fm_serie}`, f);
      }
      if (page.length < PAGE) break;
    }

    // Compute FI returns from price history
    const computeFIReturns = (fondoId: string): { rent1m: number | null; rent3m: number | null; rent12m: number | null } => {
      const history = fiPriceHistory[fondoId];
      if (!history || history.length < 2) return { rent1m: null, rent3m: null, rent12m: null };

      const latest = history[history.length - 1];
      const latestDate = new Date(latest.fecha + "T12:00:00");

      const findPriceNearDate = (targetDate: Date): number | null => {
        // Find the closest price on or before targetDate (within 7 day tolerance)
        const targetStr = targetDate.toISOString().slice(0, 10);
        let best: typeof history[0] | null = null;
        for (const p of history) {
          if (p.fecha <= targetStr) best = p;
        }
        if (!best) return null;
        const daysDiff = Math.floor((latestDate.getTime() - new Date(best.fecha + "T12:00:00").getTime()) / (1000 * 60 * 60 * 24));
        // Don't use if the gap between target and found is too large
        const targetDays = Math.floor((latestDate.getTime() - targetDate.getTime()) / (1000 * 60 * 60 * 24));
        if (Math.abs(daysDiff - targetDays) > 7) return null;
        return best.valor_libro;
      }

      const d30 = new Date(latestDate.getTime() - 30 * 24 * 60 * 60 * 1000);
      const d90 = new Date(latestDate.getTime() - 90 * 24 * 60 * 60 * 1000);
      const d365 = new Date(latestDate.getTime() - 365 * 24 * 60 * 60 * 1000);

      const p30 = findPriceNearDate(d30);
      const p90 = findPriceNearDate(d90);
      const p365 = findPriceNearDate(d365);

      return {
        rent1m: p30 ? Math.round(((latest.valor_libro - p30) / p30) * 10000) / 100 : null,
        rent3m: p90 ? Math.round(((latest.valor_libro - p90) / p90) * 10000) / 100 : null,
        rent12m: p365 ? Math.round(((latest.valor_libro - p365) / p365) * 10000) / 100 : null,
      };
    }

    // Match each holding to a fondo
    const analyzeHolding = (holding: HoldingInput): HoldingAnalysis => {
      const weight = totalValue > 0 ? (holding.marketValue / totalValue) * 100 : 0;
      const nameNorm = stripAccents(holding.fundName.toLowerCase());
      const words = nameNorm
        .split(/\s+/)
        .filter((w) => w.length > 3 && !/^(fondo|mutuo|de|del|la|los|las|el|en|con|por|serie?)$/i.test(w));

      // Find best matching fondo
      let bestMatch: FondoMatch | null = null;

      // 1) Exact match by RUN + serie (if securityId is a RUN number)
      if (holding.securityId) {
        const runNum = parseInt(holding.securityId);
        if (!isNaN(runNum)) {
          const exactMatches = fondosIndex.filter(f => f.fo_run === runNum);
          if (exactMatches.length > 0) {
            if (holding.serie) {
              const serieMatch = exactMatches.find(f => f.fm_serie && f.fm_serie.toUpperCase() === holding.serie!.toUpperCase());
              bestMatch = serieMatch || exactMatches[0];
            } else {
              bestMatch = exactMatches[0];
            }
          }
        }
      }

      // 2) Fallback: fuzzy name matching
      if (!bestMatch) {
        let bestScore = 0;
        // For short fund names (1 unique word like "Gold"), accept score >= 1
        const minScore = words.length <= 1 ? 1 : 2;
        for (const f of fondosIndex) {
          const fNorm = stripAccents(f.nombre_fondo.toLowerCase());
          let score = 0;
          for (const w of words) {
            if (fNorm.includes(w)) score++;
          }
          // Serie matching (from holding.serie or name pattern like " - B")
          const holdingSerie = holding.serie?.toUpperCase() ||
            (holding.fundName.match(/\s-\s*([A-Z]+)\s*$/i) ? RegExp.$1.toUpperCase() : null);
          if (holdingSerie && f.fm_serie && f.fm_serie.toUpperCase() === holdingSerie) {
            score += 3;
          }
          if (score > bestScore && score >= minScore) {
            bestScore = score;
            bestMatch = f;
          }
        }
      }

      // 3) If no match in fondos_mutuos, check fondos de inversión by RUT
      let fiMatch: typeof fiIndex[0] | null = null;
      let fiPrice: typeof fiLatestPrices[string] | null = null;
      let fiStale = false;

      if (!bestMatch && holding.securityId) {
        const rutStr = holding.securityId.replace(/\D/g, "");
        fiMatch = fiIndex.find(f => f.rut === rutStr) || null;
        if (fiMatch) {
          fiPrice = fiLatestPrices[fiMatch.id] || null;
          if (fiPrice) {
            const daysSincePrice = Math.floor((Date.now() - new Date(fiPrice.fecha + "T12:00:00").getTime()) / (1000 * 60 * 60 * 24));
            fiStale = daysSincePrice > 3;
          } else {
            fiStale = true; // No prices at all
          }
        }
      }

      // Also try matching FI by name if no RUT match
      if (!bestMatch && !fiMatch) {
        for (const fi of fiIndex) {
          const fiNorm = stripAccents(fi.nombre.toLowerCase());
          let score = 0;
          for (const w of words) {
            if (fiNorm.includes(w)) score++;
          }
          if (score >= 2) {
            fiMatch = fi;
            fiPrice = fiLatestPrices[fi.id] || null;
            fiStale = !fiPrice || Math.floor((Date.now() - new Date(fiPrice.fecha + "T12:00:00").getTime()) / (1000 * 60 * 60 * 24)) > 3;
            break;
          }
        }
      }

      // Compute FI returns if matched
      const fiReturns = fiMatch ? computeFIReturns(fiMatch.id) : null;

      const categoria = bestMatch
        ? getCategoriaSimple(bestMatch.familia_estudios)
        : fiMatch
          ? "Alternativos" // FI default category
          : holding.assetClass === "equity"
            ? "Renta Variable"
            : holding.assetClass === "fixedIncome"
              ? "Renta Fija"
              : "Otros";

      // Lookup fund ficha for tax benefits
      const fichaEntry = bestMatch
        ? fichasMap.get(`${bestMatch.fo_run}|${bestMatch.fm_serie}`)
        : undefined;

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
              rent_1m: c.rent_30d_nominal,
              rent_3m: c.rent_3m_nominal,
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
        matched: !!bestMatch || !!fiMatch,
        matchedFund: bestMatch?.nombre_fondo || fiMatch?.nombre || null,
        matchedAgf: bestMatch?.nombre_agf || fiMatch?.administradora || null,
        categoria,
        // Fondo de inversión fields
        isFondoInversion: !!fiMatch,
        fiRut: fiMatch?.rut || undefined,
        fiPrecioFecha: fiPrice?.fecha || null,
        fiValorLibro: fiPrice?.valor_libro || null,
        fiStale: fiMatch ? fiStale : undefined,
        fiRent1m: fiReturns?.rent1m ?? undefined,
        fiRent3m: fiReturns?.rent3m ?? undefined,
        fiRent12m: fiReturns?.rent12m ?? undefined,
        // Returns (fondos mutuos from vw_fondos_completo, FI from fiReturns)
        rent1m: bestMatch?.rent_30d_nominal ?? fiReturns?.rent1m ?? null,
        rent3m: bestMatch?.rent_3m_nominal ?? fiReturns?.rent3m ?? null,
        rent12m: bestMatch?.rent_12m_nominal ?? fiReturns?.rent12m ?? null,
        // Cost
        tac,
        tacImpactAnnual: tacAnnual ? Math.round(tacAnnual) : null,
        tacImpact10Y: tac10Y ? Math.round(tac10Y) : null,
        beneficio107lir: fichaEntry?.beneficio_107lir || false,
        beneficio108lir: fichaEntry?.beneficio_108lir || false,
        isApvEligible: fichaEntry?.beneficio_apv || detectApvEligible(holding.fundName),
        regimen57bis: fichaEntry?.beneficio_57bis || false,
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

    // Build optimized proposal: for each holding, pick the best alternative
    // Best = lowest TAC that still has decent returns (Sharpe > 0 or rent_12m >= current)
    const proposalHoldings: ProposalHolding[] = analyzedHoldings.map((h) => {
      const alts = h.cheaperAlternatives;
      let bestAlt: Alternative | null = null;

      if (alts.length > 0) {
        // Prefer alternatives with good Sharpe AND significantly lower TAC
        // Sort by: best Sharpe first, then lowest TAC
        const ranked = [...alts].sort((a, b) => {
          // If both have Sharpe, prefer higher Sharpe
          if (a.sharpe_365d !== null && b.sharpe_365d !== null) {
            if (Math.abs(a.sharpe_365d - b.sharpe_365d) > 0.1) {
              return b.sharpe_365d - a.sharpe_365d;
            }
          }
          // Then lowest TAC
          return a.tac_sintetica - b.tac_sintetica;
        });
        bestAlt = ranked[0];
      }

      // Get current fund returns if matched (fondo mutuo or fondo de inversión)
      let currentRent1m: number | null = null;
      let currentRent3m: number | null = null;
      let currentRent12m: number | null = null;
      if (h.isFondoInversion) {
        currentRent1m = h.fiRent1m ?? null;
        currentRent3m = h.fiRent3m ?? null;
        currentRent12m = h.fiRent12m ?? null;
      } else if (h.matched) {
        const matchedFondo = fondosIndex.find(f => f.nombre_fondo === h.matchedFund);
        if (matchedFondo) {
          currentRent1m = matchedFondo.rent_30d_nominal;
          currentRent3m = matchedFondo.rent_3m_nominal;
          currentRent12m = matchedFondo.rent_12m_nominal;
        }
      }

      return {
        originalFund: h.fundName,
        proposedFund: bestAlt ? bestAlt.nombre_fondo : h.fundName,
        proposedAgf: bestAlt ? bestAlt.nombre_agf : (h.matchedAgf || ""),
        proposedSerie: bestAlt ? bestAlt.fm_serie : "",
        categoria: h.categoria,
        marketValue: h.marketValue,
        weight: h.weight,
        currentTac: h.tac,
        proposedTac: bestAlt ? bestAlt.tac_sintetica : (h.tac || 0),
        currentRent1m,
        currentRent3m,
        currentRent12m,
        proposedRent1m: bestAlt ? bestAlt.rent_1m : currentRent1m,
        proposedRent3m: bestAlt ? bestAlt.rent_3m : currentRent3m,
        proposedRent12m: bestAlt ? bestAlt.rent_12m : currentRent12m,
        proposedSharpe: bestAlt ? bestAlt.sharpe_365d : null,
        tacSavingBps: bestAlt && h.tac ? Math.round((h.tac - bestAlt.tac_sintetica) * 100) : 0,
        changed: !!bestAlt,
      };
    });

    const proposedCostoAnual = proposalHoldings.reduce(
      (s, h) => s + (h.proposedTac / 100) * h.marketValue, 0
    );
    const proposedWeightedTac = proposalHoldings.reduce(
      (s, h) => s + h.proposedTac * (h.weight / 100), 0
    );

    const proposal: OptimizedProposal = {
      holdings: proposalHoldings,
      currentTacPromedio: Math.round(weightedTac * 100) / 100,
      proposedTacPromedio: Math.round(proposedWeightedTac * 100) / 100,
      currentCostoAnual: Math.round(costoAnual),
      proposedCostoAnual: Math.round(proposedCostoAnual),
      ahorroFondosAnual: Math.round(costoAnual - proposedCostoAnual),
    };

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
      fondosInversionDetected: analyzedHoldings
        .filter(h => h.isFondoInversion && h.fiRut)
        .map(h => ({ rut: h.fiRut!, nombre: h.matchedFund || h.fundName, stale: !!h.fiStale })),
      proposal,
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
