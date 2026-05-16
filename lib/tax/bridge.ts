// lib/tax/bridge.ts
// Converts cartola holdings + xray enrichment → TaxableHolding[] for tax simulator

import type { TaxableHolding } from "./types";

// Raw holding from snapshot JSONB (cartola-parsed)
interface RawHolding {
  fundName: string;
  securityId?: string | null;
  serie?: string | null;
  quantity?: number;
  costBasis?: number;
  unitCost?: number;
  marketPrice?: number;
  marketValue: number;
  currency?: string;
  assetClass?: string;
}

// Enriched holding from xray API
interface XrayHolding {
  fundName: string;
  marketValue: number;
  weight: number;
  categoria: string;
  tac: number | null;
  matched: boolean;
  matchedFund: string | null;
  beneficio107lir?: boolean;
  beneficio108lir?: boolean;
  isApvEligible: boolean;
  regimen57bis?: boolean;
  isFondoInversion?: boolean;
}

// Proposed TAC from the xray proposal (if available)
interface ProposalInfo {
  proposedTac?: number | null;
}

function detectTaxRegime(xray: XrayHolding): TaxableHolding["taxRegime"] {
  if (xray.isApvEligible) return "apv";
  if (xray.beneficio107lir) return "107";
  if (xray.beneficio108lir) return "108";
  if (xray.regimen57bis) return "57bis";
  return "general";
}

// Map xray categoria to the tax simulator's expected category names
function normalizeCategoria(cat: string): string {
  const map: Record<string, string> = {
    "Renta Variable": "Renta Variable Nacional",
    "Renta Fija": "Renta Fija Nacional",
    "Balanceado": "Balanceado",
    "Alternativos": "Alternativos",
    "Otros": "Otros",
  };
  // If already a full name, return as-is
  if (cat.includes("Nacional") || cat.includes("Internacional")) return cat;
  return map[cat] || cat;
}

export function convertToTaxHoldings(
  rawHoldings: RawHolding[],
  xrayHoldings: XrayHolding[],
  ufValue: number,
  proposalMap?: Record<string, ProposalInfo>,
): TaxableHolding[] {
  return rawHoldings.map((raw, index) => {
    // Match xray holding by fundName (same order as input)
    const xray = xrayHoldings[index] || xrayHoldings.find(x =>
      x.fundName === raw.fundName
    );

    const currentValueCLP = raw.marketValue;
    const currentValueUF = currentValueCLP / ufValue;
    const quantity = raw.quantity || 1;

    // Cost basis: use cartola data if available, otherwise null (will trigger estimation)
    let acquisitionCostUF: number | null = null;
    let confianzaBaja = false;

    if (raw.costBasis != null && raw.costBasis > 0) {
      acquisitionCostUF = raw.costBasis / ufValue;
    } else {
      confianzaBaja = true;
    }

    const tacActual = xray?.tac ?? null;
    const proposalKey = raw.fundName;
    const tacPropuesto = proposalMap?.[proposalKey]?.proposedTac ?? null;

    const taxRegime = xray ? detectTaxRegime(xray) : "general";
    const categoria = xray ? normalizeCategoria(xray.categoria) : "Otros";

    // Determine if holding has international exposure based on category
    const hasInternationalHoldings = categoria.includes("Internacional");

    // MLT: possible if destination is a fund (not ETF in bolsa) and source has 108 benefit
    // For v1, default to true if beneficio108lir, false otherwise (advisor can override)
    const canMLT = xray?.beneficio108lir ?? false;

    const run = raw.securityId ? parseInt(raw.securityId, 10) : 0;

    return {
      fundName: raw.fundName,
      run: isNaN(run) ? 0 : run,
      serie: raw.serie || "",
      currentValueUF,
      quantity,
      acquisitionDate: null, // Not available from cartola
      acquisitionCostUF,
      estimatedCosts: [], // Will be populated by simulator if needed
      taxRegime,
      preTransitional: false, // Advisor can override
      canMLT,
      canDCV: false, // Advisor must mark manually
      comisionRescateUF: null,
      tacActual,
      tacPropuesto,
      categoria,
      hasInternationalHoldings,
      confianzaBaja,
    };
  });
}
