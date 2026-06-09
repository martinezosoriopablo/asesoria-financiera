"use client";

import React, { useState, useMemo, useEffect } from "react";
import { BarChart3, Loader } from "lucide-react";
import { formatNumber, formatPercent } from "@/lib/format";
import EquitySection, { type EquityHolding } from "./EquitySection";
import FixedIncomeSection, { type BondHoldingRow } from "./FixedIncomeSection";
import type { Snapshot } from "./SeguimientoPage";
import { useBondCalculations } from "./hooks/useBondCalculations";
import { useHoldingSummaries } from "./hooks/useHoldingSummaries";

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

  const { holdingSummaries, enrichedSummaries, previousSnapshotDate, bondPrices, loadingPrices } = useHoldingSummaries({
    snapshots,
    returnMode,
    fundsMeta,
    usdRate,
    ufRate,
    pricesAtDateEndpoint,
  });

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
