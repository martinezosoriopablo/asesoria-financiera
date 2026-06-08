"use client";

import React, { useState, useMemo, useEffect } from "react";
import { BarChart3, Loader } from "lucide-react";
import { formatNumber, formatPercent } from "@/lib/format";
import { inferInstrumentType } from "@/lib/instrument-type";
import EquitySection, { type EquityHolding } from "./EquitySection";
import FixedIncomeSection, { type BondHoldingRow } from "./FixedIncomeSection";
import type { Snapshot } from "./SeguimientoPage";
import { useHoldingQuotes } from "./hooks/useHoldingQuotes";
import { useBondCalculations } from "./hooks/useBondCalculations";

interface HoldingData {
  fundName: string;
  securityId?: string | null;
  serie?: string;
  quantity?: number;
  marketPrice?: number;
  unitCost?: number;
  costBasis?: number;
  marketValue: number;
  marketValueCLP?: number;
  assetClass?: string;
  assetType?: string;
  currency?: string;
  market?: string;
  returnFromBase?: number;
  weight?: number;
  // Income fields (from cartola)
  estIncomeYield?: number | null;
  estAnnualIncome?: number | null;
  // Bond-specific
  couponRate?: number | null;
  maturityDate?: string | null;
  creditRating?: string | null;
  purchaseDate?: string | null;
  marketYield?: number | null;
}

// inferAssetType removed — now using inferInstrumentType from @/lib/instrument-type

// Extract bond fields (coupon, maturity, rating) from fundName when missing
const COUPON_RE = /\b(\d{1,2}(?:\.\d{1,4})?)\s*%/;
const MATURITY_RE = /\b(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})\b/;
const MATURITY_ISO_RE = /\b(\d{4})-(\d{2})-(\d{2})\b/;
const SP_RATING_RE = /\b(AAA|AA\+|AA-|AA|A\+|A-|BBB\+|BBB-|BBB|BB\+|BB-|BB|B\+|B-|CCC\+|CCC-|CCC|CC|D|NR)\b/i;
const MOODYS_RE = /\b(Aaa|Aa[123]|A[123]|Baa[123]|Ba[123]|B[123]|Caa[123]|Ca)\b/i;
const MOODYS_SP: Record<string, string> = {
  "AAA": "AAA", "AA1": "AA+", "AA2": "AA", "AA3": "AA-",
  "A1": "A+", "A2": "A", "A3": "A-",
  "BAA1": "BBB+", "BAA2": "BBB", "BAA3": "BBB-",
  "BA1": "BB+", "BA2": "BB", "BA3": "BB-",
  "B1": "B+", "B2": "B", "B3": "B-",
  "CAA1": "CCC+", "CAA2": "CCC", "CAA3": "CCC-", "CA": "CC",
};

function extractRating(text: string): string | null {
  const sp = text.match(SP_RATING_RE);
  if (sp) return sp[1].toUpperCase();
  const mo = text.match(MOODYS_RE);
  if (mo) return MOODYS_SP[mo[1].toUpperCase()] || mo[1].toUpperCase();
  return null;
}

function parseBondName<T extends { fundName: string; couponRate?: number | null; maturityDate?: string | null; creditRating?: string | null }>(h: T): T {
  const name = h.fundName || "";
  if (!name) return h;

  let couponRate = h.couponRate || null;
  let maturityDate = h.maturityDate || null;
  let creditRating = h.creditRating || null;

  // Extract coupon
  if (!couponRate) {
    const m = name.match(COUPON_RE);
    if (m) couponRate = parseFloat(m[1]);
  }
  // Extract maturity
  if (!maturityDate) {
    const dm = name.match(MATURITY_RE);
    if (dm) {
      maturityDate = `${dm[3]}-${dm[1].padStart(2, "0")}-${dm[2].padStart(2, "0")}`;
    } else {
      const im = name.match(MATURITY_ISO_RE);
      if (im) maturityDate = `${im[1]}-${im[2]}-${im[3]}`;
    }
  }
  // Extract rating (S&P or Moody's → S&P)
  if (!creditRating) {
    creditRating = extractRating(name);
  } else {
    // Convert Moody's if stored as such
    const mo = String(creditRating).match(MOODYS_RE);
    if (mo) creditRating = MOODYS_SP[mo[1].toUpperCase()] || creditRating;
  }

  // Clean name: remove extracted data
  let cleanName = name;
  cleanName = cleanName.replace(/\s*\d{1,2}(?:\.\d{1,4})?\s*%/g, "");
  cleanName = cleanName.replace(/\s*\d{1,2}[\/\-]\d{1,2}[\/\-]\d{4}/g, "");
  cleanName = cleanName.replace(/\s*\d{4}-\d{2}-\d{2}/g, "");
  cleanName = cleanName.replace(SP_RATING_RE, "");
  cleanName = cleanName.replace(MOODYS_RE, "");
  cleanName = cleanName.replace(/Rating\s*Information\s*:?/gi, "");
  cleanName = cleanName.replace(/Moody'?s?\s*:\s*/gi, "");
  cleanName = cleanName.replace(/S&P\s*:\s*/gi, "");
  cleanName = cleanName.replace(/Fitch\s*:\s*/gi, "");
  cleanName = cleanName.replace(/[\s\/\-]+$/g, "").replace(/^[\s\/\-]+/g, "").replace(/\s{2,}/g, " ").trim();

  return {
    ...h,
    fundName: cleanName.length >= 3 ? cleanName : h.fundName,
    couponRate,
    maturityDate,
    creditRating,
  };
}

interface FundMeta {
  fundName: string;
  run: string;
  serie: string;
  tac: number | null;
  quantity: number;
}

export interface HoldingReturnsData {
  equityHoldings: EquityHolding[];
  fixedIncomeFundHoldings: EquityHolding[];
  alternativesHoldings: EquityHolding[];
  bondHoldings: BondHoldingRow[];
  cashValue: number;
  totalValue: number;
  portfolioReturn: number;
}

interface Props {
  snapshots: Snapshot[];
  clientId?: string;
  onCurrentValueUpdate?: (totalValue: number) => void;
  onPriceDateUpdate?: (date: string) => void;
  onHoldingReturnsReady?: (data: HoldingReturnsData) => void;
  fundsMeta?: FundMeta[];
  usdRate?: number;
  ufRate?: number;
  ufRateInitial?: number;
  pricesAtDateEndpoint?: string;
}

export default function HoldingReturnsPanel({ snapshots, clientId, onCurrentValueUpdate, onPriceDateUpdate, onHoldingReturnsReady, fundsMeta, usdRate, ufRate, ufRateInitial, pricesAtDateEndpoint = "/api/portfolio/prices-at-date" }: Props) {
  const [returnMode, setReturnMode] = useState<"cartola" | "compra">("cartola");

  // Extract unique holdings and their returns over time from snapshots
  // Note: usdRate/ufRate used to convert non-CLP holdings to CLP at build time
  const { holdingSummaries, latestRawHoldings, previousSnapshotDate } = useMemo(() => {
    const snapshotsWithHoldings = snapshots
      .filter((s) => s.holdings && Array.isArray(s.holdings) && s.holdings.length > 0)
      .sort((a, b) => a.snapshot_date.localeCompare(b.snapshot_date));

    if (snapshotsWithHoldings.length === 0) {
      return { holdingSummaries: [] as ReturnType<typeof buildSummaries>, latestRawHoldings: [] as HoldingData[], previousSnapshotDate: null as string | null };
    }

    // Find previous snapshot date for period calculations
    const cartolas = snapshotsWithHoldings.filter(
      (s) => s.source === "statement" || s.source === "manual" || s.source === "excel"
    );
    const prevSnapDate = cartolas.length >= 2
      ? cartolas[cartolas.length - 2].snapshot_date
      : cartolas.length === 1
        ? cartolas[0].snapshot_date
        : snapshotsWithHoldings[0].snapshot_date;

    // For each holding, find the base price from the FIRST cartola
    const cartolaBasePrices = new Map<string, number>(); // market price at cartola date
    const compraBasePrices = new Map<string, number>();   // cost basis (purchase price)
    const purchaseDates = new Map<string, string>();

    // Purchase price: costBasis first (set by enrichHoldingsWithCostBasis), then legacy fallbacks
    const extractPurchasePrice = (h: HoldingData): number => {
      // 1. costBasis — set by enrichHoldingsWithCostBasis on save (per-unit acquisition price)
      const cb2 = Number(h.costBasis);
      if (cb2 > 0 && isFinite(cb2)) return cb2;
      // 2. unitCost — actual purchase price per unit (legacy)
      const uc = Number(h.unitCost);
      if (uc > 0 && isFinite(uc)) return uc;
      // 3. marketPrice — price at cartola date (fallback)
      const mp = Number(h.marketPrice);
      if (mp > 0 && isFinite(mp)) return mp;
      // 4. marketValue / quantity
      const qty = Number(h.quantity);
      const mv = Number(h.marketValue);
      if (qty > 0 && mv > 0) return mv / qty;
      const mvCLP = Number(h.marketValueCLP);
      if (qty > 0 && mvCLP > 0) return mvCLP / qty;
      return 0;
    };

    // Current market price: marketPrice first, then marketValue/quantity
    const extractMarketPrice = (h: HoldingData): number => {
      const mp = Number(h.marketPrice);
      if (mp > 0 && isFinite(mp)) return mp;
      const qty = Number(h.quantity);
      const mv = Number(h.marketValue);
      if (qty > 0 && mv > 0) return mv / qty;
      const mvCLP = Number(h.marketValueCLP);
      if (qty > 0 && mvCLP > 0) return mvCLP / qty;
      // Last resort: unitCost
      const uc = Number(h.unitCost);
      if (uc > 0 && isFinite(uc)) return uc;
      return 0;
    };

    for (const cartola of cartolas) {
      if (!cartola.holdings) continue;
      for (const h of cartola.holdings as HoldingData[]) {
        if (h.fundName && !cartolaBasePrices.has(h.fundName)) {
          const mktPrice = extractMarketPrice(h);
          if (mktPrice > 0) {
            cartolaBasePrices.set(h.fundName, mktPrice);
            purchaseDates.set(h.fundName, cartola.snapshot_date);
          }
          const purchasePrice = extractPurchasePrice(h);
          if (purchasePrice > 0) {
            compraBasePrices.set(h.fundName, purchasePrice);
          }
        }
      }
    }

    // Select base prices according to returnMode
    const basePrices = returnMode === "compra" ? compraBasePrices : cartolaBasePrices;

    // Build summary from latest snapshot
    const apiPricesSnaps = snapshotsWithHoldings.filter(s => s.source === "api-prices");
    const latestSnap = apiPricesSnaps.length > 0
      ? apiPricesSnaps[apiPricesSnaps.length - 1]
      : snapshotsWithHoldings[snapshotsWithHoldings.length - 1];
    const latestHoldings = latestSnap.holdings as HoldingData[];
    const latestTotal = latestSnap.total_value || latestHoldings.reduce((s, h) => s + (h.marketValue || 0), 0);

    // Build a map of bond-specific fields from the original cartola (statement/manual)
    // because api-prices snapshots don't carry couponRate, maturityDate, creditRating, etc.
    const cartolaFieldsByName = new Map<string, Partial<HoldingData>>();
    for (const cartola of cartolas) {
      if (!cartola.holdings) continue;
      for (const h of cartola.holdings as HoldingData[]) {
        if (!h.fundName) continue;
        // Only overwrite if this cartola has more data
        const existing = cartolaFieldsByName.get(h.fundName);
        if (!existing || (!existing.couponRate && h.couponRate) || (!existing.creditRating && h.creditRating)) {
          cartolaFieldsByName.set(h.fundName, {
            assetType: h.assetType,
            assetClass: h.assetClass,
            couponRate: h.couponRate,
            maturityDate: h.maturityDate,
            creditRating: h.creditRating,
            unitCost: h.unitCost,
            costBasis: h.costBasis,
            currency: h.currency,
            market: h.market,
            estIncomeYield: h.estIncomeYield,
            estAnnualIncome: h.estAnnualIncome,
            purchaseDate: h.purchaseDate,
            marketYield: h.marketYield,
          });
        }
      }
    }

    function buildSummaries() {
      return latestHoldings
        .filter((h) => h.fundName && h.marketValue > 0)
        .map((h) => {
          // Merge with cartola fields (api-prices snapshots lose bond data)
          const cf = cartolaFieldsByName.get(h.fundName);
          const currentPrice = extractMarketPrice(h);
          const purchasePrice = basePrices.get(h.fundName) || currentPrice;
          const returnCalc = purchasePrice > 0 ? ((currentPrice / purchasePrice) - 1) * 100 : 0;

          const merged = cf ? { ...h, ...Object.fromEntries(Object.entries(cf).filter(([, v]) => v != null && v !== undefined)) } : h;
          const assetType = inferInstrumentType(merged);
          const base = {
            fundName: h.fundName,
            marketValue: h.marketValue,
            currentPrice,
            purchasePrice,
            purchaseDate: merged.purchaseDate || purchaseDates.get(h.fundName) || null,
            quantity: h.quantity || 0,
            weight: h.weight || (latestTotal > 0 ? Math.round((h.marketValue / latestTotal) * 10000) / 100 : 0),
            returnFromBase: Math.round(returnCalc * 100) / 100,
            assetClass: merged.assetClass || "equity",
            assetType,
            currency: merged.currency || "CLP",
            market: merged.market || h.market || null,
            // Bond fields — prefer cartola data over api-prices
            couponRate: merged.couponRate || null,
            maturityDate: merged.maturityDate || null,
            creditRating: merged.creditRating || null,
            unitCost: merged.unitCost || null,
            costBasis: merged.costBasis || null,
            securityId: h.securityId || null,
            serie: h.serie || null,
            estIncomeYield: merged.estIncomeYield || null,
            estAnnualIncome: merged.estAnnualIncome || null,
            marketYield: merged.marketYield ?? null,
          };

          // For bonds, extract coupon/maturity/rating from fundName if missing
          if (assetType === "bond") {
            return parseBondName(base);
          }
          return base;
        })
        .sort((a, b) => (b.weight || 0) - (a.weight || 0));
    }

    return {
      holdingSummaries: buildSummaries(),
      latestRawHoldings: latestHoldings,
      previousSnapshotDate: prevSnapDate,
    };
  }, [snapshots, returnMode]);

  // Fetch market prices, bond lookups, and bond prices via unified hook
  const { marketPrices, bondLookups, bondPrices, loadingPrices } = useHoldingQuotes(holdingSummaries, pricesAtDateEndpoint);

  // Build TAC map from fundsMeta
  const tacByFundName = useMemo(() => {
    const map = new Map<string, number | null>();
    if (!fundsMeta || fundsMeta.length === 0 || !latestRawHoldings) return map;
    for (const raw of latestRawHoldings as HoldingData[]) {
      const secId = (raw.securityId || "").trim();
      const serie = (raw.serie || "").trim();
      if (!secId || !serie) continue;
      const meta = fundsMeta.find((m) => m.run === secId && m.serie.toUpperCase() === serie.toUpperCase());
      if (meta && raw.fundName) map.set(raw.fundName, meta.tac);
    }
    return map;
  }, [fundsMeta, latestRawHoldings]);

  // Merge prices and bond lookups into summaries
  const enrichedSummaries = useMemo(() => {
    const mapped = holdingSummaries.map((h) => {
      const tac = tacByFundName.get(h.fundName) ?? null;

      // Enrich bonds with FINRA lookup data (coupon, maturity)
      let enriched = { ...h, tac };
      if (h.assetType === "bond") {
        const bl = bondLookups.get(h.fundName);
        if (bl) {
          if (!enriched.couponRate && bl.couponRate) enriched = { ...enriched, couponRate: bl.couponRate };
          if (!enriched.maturityDate && bl.maturityDate) enriched = { ...enriched, maturityDate: bl.maturityDate };
        }
        return enriched; // bonds use their own pricing logic (FINRA)
      }

      // Unified market price from prices-at-date
      const mp = marketPrices.get(h.fundName);
      if (mp && mp.price > 0) {
        const returnCalc = h.purchasePrice > 0
          ? ((mp.price / h.purchasePrice) - 1) * 100
          : 0;
        const priceIsCLP = mp.currency === "CLP";
        const priceIsUF = mp.currency === "UF";
        let newMarketValue = h.marketValue;
        if (h.quantity > 0) {
          if (priceIsCLP) {
            newMarketValue = h.quantity * mp.price;
          } else if (priceIsUF && ufRate) {
            newMarketValue = h.quantity * mp.price * ufRate;
          } else if (usdRate) {
            newMarketValue = h.quantity * mp.price * usdRate;
          }
        }

        return {
          ...enriched,
          currentPrice: mp.price,
          marketValue: newMarketValue,
          currency: priceIsCLP ? "CLP" : enriched.currency,
          returnFromBase: Math.round(returnCalc * 100) / 100,
        };
      }

      // No market price update — convert non-CLP marketValue to CLP
      if (enriched.currency === "USD" && usdRate && enriched.marketValue > 0) {
        return { ...enriched, marketValue: enriched.marketValue * usdRate };
      }
      if (enriched.currency === "UF" && ufRate && enriched.marketValue > 0) {
        return { ...enriched, marketValue: enriched.marketValue * ufRate };
      }
      return enriched;
    });
    // Weights will be recalculated after totalValue is known (includes bonds)
    return mapped;
  }, [holdingSummaries, marketPrices, bondLookups, tacByFundName, usdRate, ufRate]);

  // Price date notification (doesn't depend on totalValue)
  useEffect(() => {
    if (enrichedSummaries.length === 0 || !onPriceDateUpdate) return;
    const dates = enrichedSummaries
      .map((h) => (h as Record<string, unknown>).lastPriceDate as string | undefined)
      .filter(Boolean) as string[];
    if (dates.length > 0) {
      dates.sort();
      onPriceDateUpdate(dates[dates.length - 1]);
    }
  }, [enrichedSummaries, onPriceDateUpdate]);

  // --- Classify holdings by asset class ---
  const isAlternativesHolding = (h: { assetType: string; assetClass: string }) =>
    h.assetClass === "alternatives";

  const isEquityHolding = (h: { assetType: string; assetClass: string }) =>
    !isAlternativesHolding(h) && (
      ["etf", "stock"].includes(h.assetType) ||
      (h.assetType === "fund" && !["fixedIncome", "cash"].includes(h.assetClass))
    );

  const isFixedIncomeFund = (h: { assetType: string; assetClass: string }) =>
    !isAlternativesHolding(h) && h.assetType === "fund" && h.assetClass === "fixedIncome";

  // --- Detect composition ---
  const hasEquity = enrichedSummaries.some(h => isEquityHolding(h));
  const hasFixedIncomeFunds = enrichedSummaries.some(h => isFixedIncomeFund(h));
  const hasAlternatives = enrichedSummaries.some(h => isAlternativesHolding(h));
  const hasBonds = enrichedSummaries.some(h => h.assetType === "bond");
  const hasStocksOrETFs = enrichedSummaries.some(h => ["etf", "stock"].includes(h.assetType));
  const hasCash = enrichedSummaries.some(h => h.assetType === "cash");

  // Helper to build EquityHolding from enriched summary
  const toEquityHolding = (h: typeof enrichedSummaries[number]): EquityHolding => ({
    fundName: h.fundName,
    assetType: h.assetType,
    assetClass: h.assetClass,
    weight: h.weight,
    purchasePrice: h.purchasePrice,
    currentPrice: h.currentPrice,
    marketValue: h.marketValue,
    currency: h.currency,
    returnPrice: h.returnFromBase,
    dividendAmount: h.estAnnualIncome || 0,
    dividendYield: h.estIncomeYield || 0,
    totalReturn: h.returnFromBase + (h.estIncomeYield || 0),
    contribution: h.weight > 0 ? (h.returnFromBase * h.weight) / 100 : 0,
    tac: h.tac,
  });

  // --- Build equity holdings (RV funds + ETFs + stocks) ---
  const equityHoldings: EquityHolding[] = useMemo(() => {
    return enrichedSummaries.filter(h => isEquityHolding(h)).map(toEquityHolding);
  }, [enrichedSummaries]);

  // --- Build fixed income fund holdings (RF fondos mutuos/FI) ---
  const fixedIncomeFundHoldings: EquityHolding[] = useMemo(() => {
    return enrichedSummaries.filter(h => isFixedIncomeFund(h)).map(toEquityHolding);
  }, [enrichedSummaries]);

  // --- Build alternatives holdings ---
  const alternativesHoldings: EquityHolding[] = useMemo(() => {
    return enrichedSummaries.filter(h => isAlternativesHolding(h)).map(toEquityHolding);
  }, [enrichedSummaries]);

  // --- Build bond holdings ---
  const bondHoldings = useBondCalculations({
    enrichedSummaries,
    previousSnapshotDate,
    snapshots,
    bondPrices,
    ufRate,
    ufRateInitial,
    usdRate,
  });

  // Cash holdings
  const cashValue = enrichedSummaries
    .filter(h => h.assetType === "cash")
    .reduce((s, h) => s + h.marketValue, 0);

  // Total value: use recalculated bond values (duration-adjusted + UF converted)
  const nonBondValue = enrichedSummaries.filter(h => h.assetType !== "bond").reduce((s, h) => s + h.marketValue, 0);
  const bondValue = bondHoldings.reduce((s, h) => s + h.marketValue, 0);
  const totalValue = nonBondValue + bondValue;

  // Recalculate weights and contributions using full portfolio totalValue
  // (weights must use total portfolio as denominator, not just non-bond or just bond)
  const finalEquityHoldings = useMemo(() => {
    if (totalValue <= 0) return equityHoldings;
    return equityHoldings.map(h => {
      const w = Math.round((h.marketValue / totalValue) * 10000) / 100;
      return { ...h, weight: w, contribution: (h.totalReturn * w) / 100 };
    });
  }, [equityHoldings, totalValue]);

  const finalFixedIncomeFundHoldings = useMemo(() => {
    if (totalValue <= 0) return fixedIncomeFundHoldings;
    return fixedIncomeFundHoldings.map(h => {
      const w = Math.round((h.marketValue / totalValue) * 10000) / 100;
      return { ...h, weight: w, contribution: (h.totalReturn * w) / 100 };
    });
  }, [fixedIncomeFundHoldings, totalValue]);

  const finalAlternativesHoldings = useMemo(() => {
    if (totalValue <= 0) return alternativesHoldings;
    return alternativesHoldings.map(h => {
      const w = Math.round((h.marketValue / totalValue) * 10000) / 100;
      return { ...h, weight: w, contribution: (h.totalReturn * w) / 100 };
    });
  }, [alternativesHoldings, totalValue]);

  const finalBondHoldings = useMemo(() => {
    if (totalValue <= 0) return bondHoldings;
    return bondHoldings.map(h => {
      const w = Math.round((h.marketValue / totalValue) * 10000) / 100;
      return { ...h, weight: w, contribution: (h.totalReturn * w) / 100 };
    });
  }, [bondHoldings, totalValue]);

  // Portfolio-level return
  const equityContrib = finalEquityHoldings.reduce((s, h) => s + h.contribution, 0);
  const fiFundContrib = finalFixedIncomeFundHoldings.reduce((s, h) => s + h.contribution, 0);
  const altContrib = finalAlternativesHoldings.reduce((s, h) => s + h.contribution, 0);
  const bondContrib = finalBondHoldings.reduce((s, h) => s + h.contribution, 0);
  const portfolioReturn = equityContrib + fiFundContrib + altContrib + bondContrib;

  // Notify parent of total value (after bond recalculation)
  useEffect(() => {
    if (totalValue > 0 && onCurrentValueUpdate) onCurrentValueUpdate(totalValue);
  }, [totalValue, onCurrentValueUpdate]);

  // Expose computed holding returns to parent (for PerformanceAttribution)
  useEffect(() => {
    if (!onHoldingReturnsReady) return;
    onHoldingReturnsReady({ equityHoldings: finalEquityHoldings, fixedIncomeFundHoldings: finalFixedIncomeFundHoldings, alternativesHoldings: finalAlternativesHoldings, bondHoldings: finalBondHoldings, cashValue, totalValue, portfolioReturn });
  }, [finalEquityHoldings, finalFixedIncomeFundHoldings, finalAlternativesHoldings, finalBondHoldings, onHoldingReturnsReady, cashValue, totalValue, portfolioReturn]);

  if (holdingSummaries.length === 0) return null;

  return (
    <div className="bg-white rounded-lg border border-gb-border shadow-sm mb-6">
      {/* Header */}
      <div className="px-6 py-4 border-b border-gb-border flex items-center justify-between">
        <div className="flex items-center gap-2">
          <BarChart3 className="w-4 h-4 text-blue-600" />
          <h2 className="text-base font-semibold text-gb-black">
            Rentabilidad por Activo
          </h2>
          {loadingPrices ? (
            <Loader className="w-4 h-4 text-blue-500 animate-spin ml-2" />
          ) : (
            <span className={`ml-2 text-sm font-semibold ${portfolioReturn >= 0 ? "text-green-600" : "text-red-600"}`}>
              Portafolio: {formatPercent(portfolioReturn)}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1 bg-slate-100 rounded-lg p-0.5">
          <button
            onClick={() => setReturnMode("cartola")}
            className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
              returnMode === "cartola"
                ? "bg-white text-gb-black shadow-sm"
                : "text-gb-gray hover:text-gb-black"
            }`}
          >
            Desde Cartola
          </button>
          <button
            onClick={() => setReturnMode("compra")}
            className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
              returnMode === "compra"
                ? "bg-white text-gb-black shadow-sm"
                : "text-gb-gray hover:text-gb-black"
            }`}
          >
            Desde Compra
          </button>
        </div>
      </div>

      {/* Summary cards */}
      <div className="px-6 py-3 grid grid-cols-4 gap-3 border-b border-gb-border bg-slate-50/50">
        <SummaryCard label="Valor Total" value={`$${formatNumber(totalValue, 0)}`} />
        <SummaryCard
          label="Retorno Total"
          value={formatPercent(portfolioReturn)}
          color={portfolioReturn >= 0 ? "text-green-600" : "text-red-600"}
        />
      </div>

      {/* Sections */}
      <div className="py-4">
        {hasEquity && (
          <EquitySection
            holdings={finalEquityHoldings}
            totalPortfolioValue={totalValue}
            showDividends={hasStocksOrETFs}
          />
        )}

        {hasFixedIncomeFunds && (
          <EquitySection
            holdings={finalFixedIncomeFundHoldings}
            totalPortfolioValue={totalValue}
            showDividends={false}
            title="Renta Fija (Fondos)"
            sectionColor="green"
          />
        )}

        {hasAlternatives && (
          <EquitySection
            holdings={finalAlternativesHoldings}
            totalPortfolioValue={totalValue}
            showDividends={false}
            title="Alternativos"
            sectionColor="orange"
          />
        )}

        {hasBonds && (
          <FixedIncomeSection
            holdings={finalBondHoldings}
            totalPortfolioValue={totalValue}
          />
        )}

        {hasCash && cashValue > 0 && (
          <div className="mb-4 px-4">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-1 h-5 bg-gray-400 rounded" />
              <h3 className="text-sm font-semibold text-gb-black">Cash / Money Market</h3>
            </div>
            <div className="bg-slate-50 rounded-lg px-4 py-3 flex justify-between items-center">
              <span className="text-sm text-gb-gray">Cash Balance</span>
              <span className="text-sm font-semibold text-gb-black">
                ${formatNumber(cashValue, 0)}
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function SummaryCard({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="bg-white rounded-lg border border-gb-border px-3 py-2">
      <div className="text-[10px] text-gb-gray uppercase tracking-wide">{label}</div>
      <div className={`text-lg font-semibold ${color || "text-gb-black"}`}>{value}</div>
    </div>
  );
}
