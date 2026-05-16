// lib/tax/bridge.ts
// Converts cartola holdings + xray enrichment → TaxableHolding[] for tax simulator

import type { TaxableHolding } from "./types";
import { RENTABILIDAD_ESPERADA_REAL } from "@/lib/constants/chilean-tax";

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
  marketValueCLP?: number; // already converted to CLP (if present)
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

// Historical price data for cost estimation
export interface HistoricalQuote {
  today: number | null;
  prices: { years: number; price: number | null; date: string; ufAtDate: number }[];
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
  if (cat.includes("Nacional") || cat.includes("Internacional")) return cat;
  return map[cat] || cat;
}

// Convert value to CLP based on currency
function toCLP(value: number, currency: string | undefined, usdRate: number): number {
  if (!currency || currency === "CLP") return value;
  if (currency === "USD") return value * usdRate;
  // EUR and others: for now treat as CLP (rare in Chilean fund context)
  return value;
}

// Estimate costs using REAL historical prices (valor cuota ratios)
// costCLP_est = currentValueCLP * (priceNYearsAgo / priceToday)
// costUF = costCLP_est / UF_atThatDate  (corrección monetaria)
function estimateWithRealPrices(
  currentValueCLP: number,
  currentValueUF: number,
  quote: HistoricalQuote,
): TaxableHolding["estimatedCosts"] {
  if (!quote.today || quote.today <= 0) return [];

  const estimates: TaxableHolding["estimatedCosts"] = [];
  for (const p of quote.prices) {
    if (p.price != null && p.price > 0 && p.ufAtDate > 0) {
      const ratio = p.price / quote.today;
      const costCLP = currentValueCLP * ratio;
      const costUF = costCLP / p.ufAtDate; // divide by UF at PURCHASE date
      const gainsUF = currentValueUF - costUF;
      estimates.push({ years: p.years, costUF, gainsUF, ufAtDate: p.ufAtDate });
    }
  }
  return estimates;
}

// Fallback: estimate using expected returns by category (when no price history)
// Note: without real UF history, we use ufToday for both — nominal gain only
function estimateWithExpectedReturns(
  currentValueUF: number,
  categoria: string,
  ufToday: number,
): TaxableHolding["estimatedCosts"] {
  const expectedReturn = RENTABILIDAD_ESPERADA_REAL[categoria] ?? 0.04;
  const estimates: TaxableHolding["estimatedCosts"] = [];
  for (let years = 1; years <= 5; years++) {
    const costUF = currentValueUF / Math.pow(1 + expectedReturn, years);
    const gainsUF = currentValueUF - costUF;
    estimates.push({ years, costUF, gainsUF, ufAtDate: ufToday });
  }
  return estimates;
}

export function convertToTaxHoldings(
  rawHoldings: RawHolding[],
  xrayHoldings: XrayHolding[],
  ufValue: number,
  options?: {
    usdRate?: number;
    proposalMap?: Record<string, ProposalInfo>;
    quotes?: Record<string, HistoricalQuote>; // key: "run-serie"
    // UF at estimated purchase dates for holdings WITH costBasis
    // key: "run-serie" → { date, uf }
    purchaseUFs?: Record<string, { date: string; uf: number }>;
  },
): TaxableHolding[] {
  const usdRate = options?.usdRate ?? 0;
  const proposalMap = options?.proposalMap;
  const quotes = options?.quotes;
  const purchaseUFs = options?.purchaseUFs;

  return rawHoldings.map((raw, index) => {
    // Match xray holding by index first, then by name
    const xray = xrayHoldings[index] || xrayHoldings.find(x =>
      x.fundName === raw.fundName
    );

    // Convert to CLP: use marketValueCLP if already converted, otherwise convert
    const valueCLP = raw.marketValueCLP && raw.marketValueCLP > 0
      ? raw.marketValueCLP
      : toCLP(raw.marketValue, raw.currency, usdRate);
    const currentValueUF = valueCLP / ufValue;

    const quantity = raw.quantity || 1;
    const categoria = xray ? normalizeCategoria(xray.categoria) : "Otros";
    const run = raw.securityId ? parseInt(raw.securityId, 10) : 0;
    const runNum = isNaN(run) ? 0 : run;
    const serie = raw.serie || "";
    const quoteKey = `${runNum}-${serie}`;

    // Cost basis: use cartola data if available, otherwise estimate
    let acquisitionCostUF: number | null = null;
    let ufAtPurchase: number | null = null;
    let acquisitionDate: string | null = null;
    let confianzaBaja = false;
    let estimatedCosts: TaxableHolding["estimatedCosts"] = [];

    if (raw.costBasis != null && raw.costBasis > 0) {
      // costBasis is in the same currency as marketValue
      const costCLP = toCLP(raw.costBasis, raw.currency, usdRate);

      // Use UF at purchase date for corrección monetaria
      const purchaseInfo = purchaseUFs?.[quoteKey];
      if (purchaseInfo && purchaseInfo.uf > 0) {
        ufAtPurchase = purchaseInfo.uf;
        acquisitionDate = purchaseInfo.date;
        acquisitionCostUF = costCLP / purchaseInfo.uf;
      } else {
        // Fallback: divide by UF today (no corrección monetaria)
        acquisitionCostUF = costCLP / ufValue;
        confianzaBaja = true; // mark as low confidence since no purchase date UF
      }
    } else {
      confianzaBaja = true;

      // Try real historical prices first
      const quote = quotes?.[quoteKey];

      if (quote && quote.today && quote.prices.some(p => p.price != null && p.ufAtDate > 0)) {
        estimatedCosts = estimateWithRealPrices(valueCLP, currentValueUF, quote);
      } else {
        // Fallback: expected returns by category (no UF correction)
        estimatedCosts = estimateWithExpectedReturns(currentValueUF, categoria, ufValue);
      }

      // Use 2-year estimate as default (middle ground)
      const twoYearEstimate = estimatedCosts.find(e => e.years === 2);
      acquisitionCostUF = twoYearEstimate?.costUF ?? estimatedCosts[0]?.costUF ?? null;
      ufAtPurchase = twoYearEstimate?.ufAtDate ?? estimatedCosts[0]?.ufAtDate ?? null;
    }

    const tacActual = xray?.tac ?? null;
    const proposalKey = raw.fundName;
    const tacPropuesto = proposalMap?.[proposalKey]?.proposedTac ?? null;

    const taxRegime = xray ? detectTaxRegime(xray) : "general";
    const hasInternationalHoldings = categoria.includes("Internacional");
    const canMLT = xray?.beneficio108lir ?? false;

    return {
      fundName: raw.fundName,
      run: runNum,
      serie,
      currentValueCLP: valueCLP,
      currentValueUF,
      quantity,
      acquisitionDate,
      acquisitionCostUF,
      ufAtPurchase,
      estimatedCosts,
      taxRegime,
      preTransitional: false,
      canMLT,
      canDCV: false,
      comisionRescateUF: null,
      tacActual,
      tacPropuesto,
      categoria,
      hasInternationalHoldings,
      confianzaBaja,
    };
  });
}
