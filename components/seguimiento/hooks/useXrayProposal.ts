import { useMemo, useCallback } from "react";

export interface Alternative {
  nombre_fondo: string;
  nombre_agf: string;
  fm_serie: string;
  tac_sintetica: number;
  rent_12m: number | null;
  sharpe_365d: number | null;
  patrimonio_mm: number | null;
  categoria: string;
}

export interface HoldingAnalysis {
  fundName: string;
  marketValue: number;
  weight: number;
  currency: string;
  matched: boolean;
  matchedFund: string | null;
  matchedAgf: string | null;
  categoria: string;
  isFondoInversion?: boolean;
  fiRut?: string;
  fiPrecioFecha?: string | null;
  fiValorLibro?: number | null;
  fiStale?: boolean;
  rent1m: number | null;
  rent3m: number | null;
  rent12m: number | null;
  tac: number | null;
  tacImpactAnnual: number | null;
  tacImpact10Y: number | null;
  beneficio107lir?: boolean;
  beneficio108lir?: boolean;
  isApvEligible: boolean;
  regimen57bis: boolean;
  cheaperAlternatives: Alternative[];
  potentialSavingAnnual: number | null;
  potentialSaving10Y: number | null;
}

export interface ProposalHolding {
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
  tacSavingBps: number;
  changed: boolean;
  isPreferred?: boolean;
}

export interface OptimizedProposal {
  holdings: ProposalHolding[];
  currentTacPromedio: number;
  proposedTacPromedio: number;
  currentCostoAnual: number;
  proposedCostoAnual: number;
  ahorroFondosAnual: number;
}

export interface XrayData {
  totalValue: number;
  totalValueCLP: number;
  allocation: {
    rentaVariable: { value: number; percent: number };
    rentaFija: { value: number; percent: number };
    balanceado: { value: number; percent: number };
    alternativos: { value: number; percent: number };
    otros: { value: number; percent: number };
  };
  tacPromedioPortfolio: number;
  costoAnualTotal: number;
  costoProyectado10Y: number;
  ahorroAnualPotencial: number;
  ahorroPotencial10Y: number;
  holdings: HoldingAnalysis[];
  holdingsConTac: number;
  holdingsSinTac: number;
  holdingsConAlternativa: number;
  fondosInversionDetected: Array<{ rut: string; nombre: string; stale: boolean }>;
  proposal: OptimizedProposal;
}

export interface ProposalOverride {
  proposedFund: string;
  proposedAgf: string;
  proposedSerie: string;
  proposedTac: number;
  proposedRent1m: number | null;
  proposedRent3m: number | null;
  proposedRent12m: number | null;
}

export interface FundMeta {
  fundName: string;
  run: string;
  serie: string;
  tac: number | null;
  moneda: string;
  quantity: number;
}

export interface UseXrayProposalParams {
  data: XrayData | null;
  tacOverrides: Record<string, number>;
  proposalOverrides: Record<string, ProposalOverride>;
  proposedTacOverrides: Record<string, number>;
  fundsMeta?: FundMeta[];
  advisoryFee: number;
}

export function useXrayProposal({
  data,
  tacOverrides,
  proposalOverrides,
  proposedTacOverrides,
  fundsMeta,
  advisoryFee,
}: UseXrayProposalParams) {
  // Get effective TAC for a holding (override or from data, or from fundsMeta fallback)
  const getEffectiveTac = useCallback((h: HoldingAnalysis): number | null => {
    if (tacOverrides[h.fundName] !== undefined) return tacOverrides[h.fundName];
    if (h.tac !== null) return h.tac;
    // Fallback: check fundsMeta
    const meta = fundsMeta?.find(m => m.fundName === h.fundName);
    return meta?.tac ?? null;
  }, [tacOverrides, fundsMeta]);

  // Recalculate adjusted costs with TAC overrides
  const adjustedCosts = useMemo(() => {
    if (!data) return null;
    let weightedTac = 0;
    let costoAnual = 0;
    let countConTac = 0;

    for (const h of data.holdings) {
      const tac = getEffectiveTac(h);
      if (tac !== null) {
        weightedTac += tac * (h.weight / 100);
        costoAnual += (tac / 100) * h.marketValue;
        countConTac++;
      }
    }

    return {
      tacPromedio: Math.round(weightedTac * 100) / 100,
      costoAnual: Math.round(costoAnual),
      costoProyectado10Y: Math.round(costoAnual * 10 * 1.05),
      holdingsConTac: countConTac,
    };
  }, [data, getEffectiveTac]);

  // Merged proposal: original data + overrides
  const mergedProposal = useMemo(() => {
    if (!data?.proposal) return null;
    const totalValue = data.totalValue;

    const mergedHoldings = data.proposal.holdings.map(ph => {
      // 1) Current TAC: use tacOverrides if edited, else fallback to fundsMeta
      const effectiveCurrentTac = tacOverrides[ph.originalFund] !== undefined
        ? tacOverrides[ph.originalFund]
        : ph.currentTac !== null
          ? ph.currentTac
          : (fundsMeta?.find(m => m.fundName === ph.originalFund)?.tac ?? null);

      // 2) Proposed fund override (from search)
      const override = proposalOverrides[ph.originalFund];

      // 3) Proposed TAC: manual override > search override > original
      let proposedTac = ph.proposedTac;
      let proposedFund = ph.proposedFund;
      let proposedAgf = ph.proposedAgf;
      let proposedSerie = ph.proposedSerie;
      let proposedRent1m = ph.proposedRent1m;
      let proposedRent3m = ph.proposedRent3m;
      let proposedRent12m = ph.proposedRent12m;
      let changed = ph.changed;
      let isPreferred = ph.isPreferred || false;

      if (override) {
        proposedFund = override.proposedFund;
        proposedAgf = override.proposedAgf;
        proposedSerie = override.proposedSerie;
        proposedTac = override.proposedTac;
        proposedRent1m = override.proposedRent1m;
        proposedRent3m = override.proposedRent3m;
        proposedRent12m = override.proposedRent12m;
        changed = true;
        isPreferred = false; // manual override replaces the preferred flag
      }

      // Manual TAC override for proposed fund (takes priority)
      if (proposedTacOverrides[ph.originalFund] !== undefined) {
        proposedTac = proposedTacOverrides[ph.originalFund];
      }

      const tacSavingBps = effectiveCurrentTac !== null
        ? Math.round((effectiveCurrentTac - proposedTac) * 100)
        : 0;

      return {
        ...ph,
        currentTac: effectiveCurrentTac,
        proposedFund,
        proposedAgf,
        proposedSerie,
        proposedTac,
        proposedRent1m,
        proposedRent3m,
        proposedRent12m,
        tacSavingBps,
        changed,
        isPreferred,
      };
    });

    // Use adjusted current TAC if overrides exist
    const currentCostoAnual = adjustedCosts?.costoAnual ?? data.proposal.currentCostoAnual;
    const currentTacPromedio = adjustedCosts?.tacPromedio ?? data.proposal.currentTacPromedio;
    const proposedCostoAnual = mergedHoldings.reduce(
      (s, h) => s + (h.proposedTac / 100) * h.marketValue, 0
    );
    const proposedTacPromedio = mergedHoldings.reduce(
      (s, h) => s + h.proposedTac * (h.weight / 100), 0
    );
    const feeAnual = Math.round(totalValue * advisoryFee / 100);
    const costoTotalPropuesto = Math.round(proposedCostoAnual) + feeAnual;
    const ahorroNeto = currentCostoAnual - costoTotalPropuesto;

    // Weighted rent 12M for current and proposed portfolios
    let currentRent12mWeighted = 0;
    let currentRent12mCoverage = 0;
    let proposedRent12mWeighted = 0;
    let proposedRent12mCoverage = 0;
    for (const h of mergedHoldings) {
      if (h.currentRent12m !== null) {
        currentRent12mWeighted += h.currentRent12m * (h.weight / 100);
        currentRent12mCoverage += h.weight;
      }
      if (h.proposedRent12m !== null) {
        proposedRent12mWeighted += h.proposedRent12m * (h.weight / 100);
        proposedRent12mCoverage += h.weight;
      }
    }

    return {
      holdings: mergedHoldings,
      currentTacPromedio: Math.round(currentTacPromedio * 100) / 100,
      proposedTacPromedio: Math.round(proposedTacPromedio * 100) / 100,
      currentCostoAnual,
      proposedCostoAnual: Math.round(proposedCostoAnual),
      ahorroFondosAnual: Math.round(currentCostoAnual - proposedCostoAnual),
      feeAnual,
      costoTotalPropuesto,
      ahorroNeto,
      currentRent12m: currentRent12mCoverage > 0 ? currentRent12mWeighted : null,
      proposedRent12m: proposedRent12mCoverage > 0 ? proposedRent12mWeighted : null,
      currentRent12mCoverage: Math.round(currentRent12mCoverage),
      proposedRent12mCoverage: Math.round(proposedRent12mCoverage),
    };
  }, [data, proposalOverrides, proposedTacOverrides, tacOverrides, fundsMeta, adjustedCosts, advisoryFee]);

  // Weighted portfolio return 12M (must be before ALL early returns — Rules of Hooks)
  const portfolioRent12m = useMemo(() => {
    if (!data) return null;
    let weightedSum = 0;
    let coveredWeight = 0;
    for (const h of data.holdings) {
      if (h.rent12m !== null && h.rent12m !== undefined) {
        weightedSum += h.rent12m * h.weight;
        coveredWeight += h.weight;
      }
    }
    if (coveredWeight === 0) return null;
    return { value: weightedSum / coveredWeight, coverage: Math.round(coveredWeight) };
  }, [data]);

  return { getEffectiveTac, adjustedCosts, mergedProposal, portfolioRent12m };
}
