"use client";

import React, { useState, useMemo, useEffect } from "react";
import { BarChart3, Loader } from "lucide-react";
import { formatNumber, formatPercent } from "@/lib/format";
import { calcBondPeriodReturn } from "@/lib/bonds/period-return";
import { calcYieldToMaturity } from "@/lib/bonds/yield";
import EquitySection, { type EquityHolding } from "./EquitySection";
import FixedIncomeSection, { type BondHoldingRow } from "./FixedIncomeSection";
import type { Snapshot } from "./SeguimientoPage";

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
  returnFromBase?: number;
  weight?: number;
  // Bond-specific
  couponRate?: number | null;
  maturityDate?: string | null;
  creditRating?: string | null;
}

/**
 * Infer assetType from assetClass + holding fields when assetType is missing.
 * Many older snapshots have assetClass but no assetType.
 */
function inferAssetType(h: HoldingData): string {
  if (h.assetType) return h.assetType;

  const cls = (h.assetClass || "").toLowerCase();

  // Bond detection: assetClass or bond-specific fields
  if (
    cls === "fixedincome" || cls === "fixed income" || cls === "renta fija" ||
    /fixed|bond|bono/i.test(cls) ||
    (h.couponRate && h.couponRate > 0) ||
    (h.maturityDate && h.maturityDate.length > 0)
  ) {
    return "bond";
  }

  // Cash detection
  if (/cash|efect|money\s*market|liquidez/i.test(cls)) {
    return "cash";
  }

  // Equity: distinguish fund vs ETF/stock
  // Funds have numeric securityId (RUN), stocks/ETFs have ticker-like securityId
  if (/equity|renta\s*variable/i.test(cls) || !cls || cls === "equity") {
    const secId = (h.securityId || "").trim();
    // If securityId is purely numeric → Chilean fund (RUN)
    if (/^\d+$/.test(secId) || !secId) return "fund";
    // If securityId looks like a ticker (letters, possibly with dots/slashes) → stock or ETF
    return "stock"; // Will be shown as stock; could refine further
  }

  return "fund";
}

interface FundMeta {
  fundName: string;
  run: string;
  serie: string;
  tac: number | null;
  quantity: number;
}

interface FintualPrice {
  fundName: string;
  fintualId: string | null;
  fintualName: string | null;
  serieName: string | null;
  currentPrice: number | null;
  lastPriceDate: string | null;
  currency: string;
}

interface Props {
  snapshots: Snapshot[];
  clientId?: string;
  onCurrentValueUpdate?: (totalValue: number) => void;
  onPriceDateUpdate?: (date: string) => void;
  fundsMeta?: FundMeta[];
  usdRate?: number;
}

export default function HoldingReturnsPanel({ snapshots, clientId, onCurrentValueUpdate, onPriceDateUpdate, fundsMeta, usdRate }: Props) {
  const [fintualPrices, setFintualPrices] = useState<Map<string, FintualPrice>>(new Map());
  const [loadingPrices, setLoadingPrices] = useState(false);

  // Extract unique holdings and their returns over time from snapshots
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

    // For each holding, find the purchase price from the FIRST cartola
    const basePrices = new Map<string, number>();
    const purchaseDates = new Map<string, string>();

    const extractUnitPrice = (h: HoldingData): number => {
      const mp = Number(h.marketPrice);
      if (mp > 0 && isFinite(mp)) return mp;
      const uc = Number(h.unitCost);
      if (uc > 0 && isFinite(uc)) return uc;
      const qty = Number(h.quantity);
      const mv = Number(h.marketValue);
      if (qty > 0 && mv > 0) return mv / qty;
      const mvCLP = Number(h.marketValueCLP);
      if (qty > 0 && mvCLP > 0) return mvCLP / qty;
      const cb = Number(h.costBasis);
      if (qty > 0 && cb > 0) return cb / qty;
      return 0;
    };

    for (const cartola of cartolas) {
      if (!cartola.holdings) continue;
      for (const h of cartola.holdings as HoldingData[]) {
        if (h.fundName && !basePrices.has(h.fundName)) {
          const price = extractUnitPrice(h);
          if (price > 0) {
            basePrices.set(h.fundName, price);
            purchaseDates.set(h.fundName, cartola.snapshot_date);
          }
        }
      }
    }

    // Build summary from latest snapshot
    const apiPricesSnaps = snapshotsWithHoldings.filter(s => s.source === "api-prices");
    const latestSnap = apiPricesSnaps.length > 0
      ? apiPricesSnaps[apiPricesSnaps.length - 1]
      : snapshotsWithHoldings[snapshotsWithHoldings.length - 1];
    const latestHoldings = latestSnap.holdings as HoldingData[];
    const latestTotal = latestSnap.total_value || latestHoldings.reduce((s, h) => s + (h.marketValue || 0), 0);

    function buildSummaries() {
      return latestHoldings
        .filter((h) => h.fundName && h.marketValue > 0)
        .map((h) => {
          const currentPrice = extractUnitPrice(h);
          const purchasePrice = basePrices.get(h.fundName) || currentPrice;
          const returnCalc = purchasePrice > 0 ? ((currentPrice / purchasePrice) - 1) * 100 : 0;

          return {
            fundName: h.fundName,
            marketValue: h.marketValue,
            currentPrice,
            purchasePrice,
            purchaseDate: purchaseDates.get(h.fundName) || null,
            quantity: h.quantity || 0,
            weight: h.weight || (latestTotal > 0 ? Math.round((h.marketValue / latestTotal) * 10000) / 100 : 0),
            returnFromBase: h.returnFromBase ?? Math.round(returnCalc * 100) / 100,
            assetClass: h.assetClass || "equity",
            assetType: inferAssetType(h),
            currency: h.currency || "CLP",
            // Bond fields
            couponRate: h.couponRate || null,
            maturityDate: h.maturityDate || null,
            creditRating: h.creditRating || null,
            unitCost: h.unitCost || null,
            costBasis: h.costBasis || null,
            securityId: h.securityId || null,
            serie: h.serie || null,
          };
        })
        .sort((a, b) => (b.weight || 0) - (a.weight || 0));
    }

    return {
      holdingSummaries: buildSummaries(),
      latestRawHoldings: latestHoldings,
      previousSnapshotDate: prevSnapDate,
    };
  }, [snapshots]);

  // Fetch current prices from Fintual API (for funds only)
  useEffect(() => {
    if (holdingSummaries.length === 0) return;
    const fundsOnly = holdingSummaries.filter(h => h.assetType === "fund");
    if (fundsOnly.length === 0) return;

    const fetchPrices = async () => {
      setLoadingPrices(true);
      try {
        const holdingsToFetch = fundsOnly.map((h) => {
          const raw = (latestRawHoldings as HoldingData[])?.find((sh) => sh.fundName === h.fundName);
          return {
            fundName: h.fundName,
            securityId: raw?.securityId || null,
            serie: raw?.serie || null,
            currency: h.currency || "CLP",
            cartolaPrice: h.purchasePrice || 0,
          };
        });

        const res = await fetch("/api/portfolio/current-prices", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ holdings: holdingsToFetch, clientId }),
        });

        if (res.ok) {
          const data = await res.json();
          if (data.success && data.prices) {
            const priceMap = new Map<string, FintualPrice>();
            for (const p of data.prices) {
              priceMap.set(p.fundName, p);
            }
            setFintualPrices(priceMap);
          }
        }
      } catch (err) {
        console.error("Error fetching Fintual prices:", err);
      } finally {
        setLoadingPrices(false);
      }
    };

    fetchPrices();
  }, [holdingSummaries, latestRawHoldings, clientId]);

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

  // Merge Fintual prices into summaries
  const enrichedSummaries = useMemo(() => {
    return holdingSummaries.map((h) => {
      const tac = tacByFundName.get(h.fundName) ?? null;
      const fp = fintualPrices.get(h.fundName);

      if (!fp || !fp.currentPrice || fp.currentPrice <= 0) {
        return { ...h, tac };
      }

      const fintualCurrentPrice = fp.currentPrice;
      const returnCalc = h.purchasePrice > 0
        ? ((fintualCurrentPrice / h.purchasePrice) - 1) * 100
        : 0;
      const holdingIsUSD = h.currency === "USD";
      const newMarketValue = holdingIsUSD
        ? (h.quantity > 0 && usdRate ? h.quantity * fintualCurrentPrice * usdRate : h.marketValue)
        : (h.quantity > 0 ? h.quantity * fintualCurrentPrice : h.marketValue);

      return {
        ...h,
        tac,
        currentPrice: fintualCurrentPrice,
        marketValue: newMarketValue,
        returnFromBase: Math.round(returnCalc * 100) / 100,
      };
    });
  }, [holdingSummaries, fintualPrices, tacByFundName, usdRate]);

  // Notify parent of updated total value and price date
  useEffect(() => {
    if (enrichedSummaries.length === 0) return;
    const total = enrichedSummaries.reduce((sum, h) => sum + (h.marketValue || 0), 0);
    if (total > 0 && onCurrentValueUpdate) onCurrentValueUpdate(total);

    if (onPriceDateUpdate) {
      const dates = enrichedSummaries
        .map((h) => (h as Record<string, unknown>).lastPriceDate as string | undefined)
        .filter(Boolean) as string[];
      if (dates.length > 0) {
        dates.sort();
        onPriceDateUpdate(dates[dates.length - 1]);
      }
    }
  }, [enrichedSummaries, onCurrentValueUpdate, onPriceDateUpdate]);

  // --- Detect composition ---
  const hasEquity = enrichedSummaries.some(h => ["fund", "etf", "stock"].includes(h.assetType));
  const hasBonds = enrichedSummaries.some(h => h.assetType === "bond");
  const hasStocksOrETFs = enrichedSummaries.some(h => ["etf", "stock"].includes(h.assetType));
  const hasCash = enrichedSummaries.some(h => h.assetType === "cash");

  const totalValue = enrichedSummaries.reduce((s, h) => s + h.marketValue, 0);

  // --- Build equity holdings ---
  const equityHoldings: EquityHolding[] = useMemo(() => {
    return enrichedSummaries
      .filter(h => ["fund", "etf", "stock"].includes(h.assetType))
      .map(h => ({
        fundName: h.fundName,
        assetType: h.assetType,
        weight: h.weight,
        purchasePrice: h.purchasePrice,
        currentPrice: h.currentPrice,
        marketValue: h.marketValue,
        currency: h.currency,
        returnPrice: h.returnFromBase,
        dividendAmount: 0,  // TODO: wire up after dividend fetch integration
        dividendYield: 0,
        totalReturn: h.returnFromBase,
        contribution: h.weight > 0 ? (h.returnFromBase * h.weight) / 100 : 0,
        tac: h.tac,
      }));
  }, [enrichedSummaries]);

  // --- Build bond holdings ---
  const bondHoldings: BondHoldingRow[] = useMemo(() => {
    const latestDate = snapshots
      .filter(s => s.holdings && (s.holdings as HoldingData[]).length > 0)
      .sort((a, b) => b.snapshot_date.localeCompare(a.snapshot_date))[0]?.snapshot_date;

    return enrichedSummaries
      .filter(h => h.assetType === "bond")
      .map(h => {
        const couponRatePct = h.couponRate || 0;
        const couponRateDecimal = couponRatePct / 100;
        const faceValue = h.costBasis && h.unitCost
          ? (h.costBasis / h.unitCost) * 100
          : h.marketValue;
        const freq = 2; // semi-annual default

        // Calculate period return
        let accruedInterest = 0;
        let priceDiff = 0;
        let couponsPaid = 0;
        let totalReturnPct = 0;

        if (h.maturityDate && couponRateDecimal > 0 && previousSnapshotDate) {
          const periodResult = calcBondPeriodReturn({
            faceValue,
            couponRate: couponRateDecimal,
            couponFrequency: freq,
            maturityDate: h.maturityDate,
            purchasePrice: h.unitCost || 100,
            currentPrice: h.currentPrice,
            startDate: previousSnapshotDate,
            endDate: latestDate || previousSnapshotDate,
          });
          accruedInterest = periodResult.accruedInterest;
          priceDiff = periodResult.priceDiff;
          couponsPaid = periodResult.couponsPaid;
          totalReturnPct = periodResult.totalReturnPercent;
        }

        // Calculate YTM
        let ytm = 0;
        if (h.maturityDate && couponRateDecimal > 0 && h.currentPrice > 0) {
          try {
            ytm = calcYieldToMaturity({
              faceValue,
              couponRate: couponRateDecimal,
              couponFrequency: freq,
              maturityDate: h.maturityDate,
              purchaseDate: h.purchaseDate || previousSnapshotDate || "2025-01-01",
              purchasePrice: h.unitCost || 100,
              currentPrice: h.currentPrice,
            }) * 100;
          } catch {
            ytm = 0;
          }
        }

        return {
          fundName: h.fundName,
          cusip: h.securityId || "",
          creditRating: h.creditRating || "NR",
          couponRate: couponRatePct,
          maturityDate: h.maturityDate || "",
          weight: h.weight,
          purchasePrice: h.unitCost || 100,
          marketPrice: h.currentPrice,
          ytm,
          accruedInterest,
          priceDiff,
          couponsPaid,
          totalReturn: totalReturnPct,
          contribution: h.weight > 0 ? (totalReturnPct * h.weight) / 100 : 0,
          marketValue: h.marketValue,
        };
      });
  }, [enrichedSummaries, previousSnapshotDate, snapshots]);

  // Cash holdings
  const cashValue = enrichedSummaries
    .filter(h => h.assetType === "cash")
    .reduce((s, h) => s + h.marketValue, 0);

  // Portfolio-level return
  const equityContrib = equityHoldings.reduce((s, h) => s + h.contribution, 0);
  const bondContrib = bondHoldings.reduce((s, h) => s + h.contribution, 0);
  const portfolioReturn = equityContrib + bondContrib;

  if (holdingSummaries.length === 0) return null;

  const equityValue = equityHoldings.reduce((s, h) => s + h.marketValue, 0);
  const bondValue = bondHoldings.reduce((s, h) => s + h.marketValue, 0);
  const equityPct = totalValue > 0 ? (equityValue / totalValue) * 100 : 0;
  const bondPct = totalValue > 0 ? (bondValue / totalValue) * 100 : 0;

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
      </div>

      {/* Summary cards */}
      <div className="px-6 py-3 grid grid-cols-4 gap-3 border-b border-gb-border bg-slate-50/50">
        <SummaryCard label="Valor Total" value={`$${formatNumber(totalValue, 0)}`} />
        <SummaryCard
          label="Retorno Total"
          value={formatPercent(portfolioReturn)}
          color={portfolioReturn >= 0 ? "text-green-600" : "text-red-600"}
        />
        {hasEquity && (
          <SummaryCard label="Renta Variable" value={`${formatNumber(equityPct, 1)}%`} />
        )}
        {hasBonds && (
          <SummaryCard label="Renta Fija" value={`${formatNumber(bondPct, 1)}%`} />
        )}
      </div>

      {/* Sections */}
      <div className="py-4">
        {hasEquity && (
          <EquitySection
            holdings={equityHoldings}
            totalPortfolioValue={totalValue}
            showDividends={hasStocksOrETFs}
          />
        )}

        {hasBonds && (
          <FixedIncomeSection
            holdings={bondHoldings}
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
