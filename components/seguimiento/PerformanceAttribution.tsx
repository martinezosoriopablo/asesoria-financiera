"use client";

import React, { useState, useMemo } from "react";
import {
  TrendingUp,
  TrendingDown,
  PieChart,
  Target,
  GitCompare,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { formatNumber, formatCurrency, formatPercent, formatDate } from "@/lib/format";
import { inferInstrumentType } from "@/lib/instrument-type";
import type { Snapshot } from "./SeguimientoPage";
import type { HoldingReturnsData } from "./HoldingReturnsPanel";

interface Holding {
  fundName: string;
  securityId?: string;
  marketValue: number;
  marketValueCLP?: number;
  costBasis?: number;
  unrealizedGainLoss?: number;
  assetClass?: string;
  currency?: string;
}

/** Normalize assetClass from various formats to canonical keys */
const normalizeAC = (ac: string | undefined): string => {
  const lower = (ac || "").toLowerCase().replace(/\s+/g, "");
  if (lower === "equity" || lower === "rentavariable") return "equity";
  if (lower === "fixedincome" || lower === "rentafija") return "fixedIncome";
  if (lower === "alternatives" || lower === "alternativos") return "alternatives";
  if (lower === "cash" || lower === "efectivo") return "cash";
  if (lower === "balanced" || lower === "balanceado") return "balanced";
  return lower || "equity";
};

const INSTRUMENT_COLORS: Record<string, { label: string; color: string; negColor: string }> = {
  etf:   { label: "ETFs",     color: "#3b82f6", negColor: "#93c5fd" },
  stock: { label: "Acciones", color: "#10b981", negColor: "#6ee7b7" },
  fund:  { label: "Fondos",   color: "#f59e0b", negColor: "#fcd34d" },
  bond:  { label: "Bonos",    color: "#8b5cf6", negColor: "#c4b5fd" },
  cash:  { label: "Cash",     color: "#94a3b8", negColor: "#cbd5e1" },
};

interface InstrumentBreakdown {
  type: string;
  label: string;
  color: string;
  negColor: string;
  contribution: number;
}

interface AssetClassWithBreakdown {
  name: string;
  key: string;
  color: string;
  totalContribution: number;
  classReturn: number;
  breakdown: InstrumentBreakdown[];
}

interface BenchmarkAllocation {
  equity_percent?: number;
  fixed_income_percent?: number;
  alternatives_percent?: number;
  cash_percent?: number;
}

interface Props {
  snapshots: Snapshot[];
  recommendation?: BenchmarkAllocation | null;
  previousPortfolio?: Snapshot | null; // Portfolio inicial o anterior para comparar
  totalReturn?: number;
  holdingReturnsData?: HoldingReturnsData | null;
}

/**
 * Calcula retornos reales por clase de activo a partir de los snapshots.
 * Si no hay datos suficientes, usa estimaciones conservadoras como fallback.
 */
function calculateAssetClassReturns(
  first: Snapshot,
  last: Snapshot,
  daysDiff: number
): Record<string, number> {
  const classes = [
    { key: "equity", initVal: first.equity_value, endVal: last.equity_value },
    { key: "fixedIncome", initVal: first.fixed_income_value, endVal: last.fixed_income_value },
    { key: "alternatives", initVal: first.alternatives_value, endVal: last.alternatives_value },
    { key: "cash", initVal: first.cash_value, endVal: last.cash_value },
  ];

  const yearsElapsed = daysDiff / 365;
  const result: Record<string, number> = {};

  for (const cls of classes) {
    if (cls.initVal > 0 && yearsElapsed > 0) {
      const totalReturn = ((cls.endVal - cls.initVal) / cls.initVal);
      // Annualize ONLY if >= 365 days, otherwise show simple return
      result[cls.key] = daysDiff >= 365
        ? (Math.pow(1 + totalReturn, 1 / yearsElapsed) - 1) * 100
        : totalReturn * 100;
    } else if (cls.initVal > 0) {
      result[cls.key] = ((cls.endVal - cls.initVal) / cls.initVal) * 100;
    } else {
      // Fallback for classes with no initial value
      result[cls.key] = 0;
    }
  }

  return result;
}

export default function PerformanceAttribution({
  snapshots,
  recommendation,
  previousPortfolio,
  totalReturn: totalReturnProp,
  holdingReturnsData,
}: Props) {
  const [expandedSection, setExpandedSection] = useState<string | null>("assetClass");

  // Use only snapshots that have asset class values (cartola snapshots, not fill-prices intermediates)
  const snapshotsWithAssetData = useMemo(() =>
    snapshots.filter(s => (s.equity_value > 0 || s.fixed_income_value > 0 || s.alternatives_value > 0 || s.cash_value > 0)),
    [snapshots]
  );

  // Get first and last snapshots with asset data for attribution
  const firstSnapshot = snapshotsWithAssetData[0] || snapshots[0];
  const lastSnapshot = snapshotsWithAssetData[snapshotsWithAssetData.length - 1] || snapshots[snapshots.length - 1];

  // ============================================
  // 1. ATTRIBUTION BY ASSET CLASS
  // ============================================
  const assetClassAttribution = useMemo(() => {
    if (!firstSnapshot || !lastSnapshot || snapshotsWithAssetData.length < 2) return null;

    const initialValue = firstSnapshot.total_value;
    const finalValue = lastSnapshot.total_value;
    // Use total return from metrics when available for consistency with top-level cards
    const totalReturn = totalReturnProp != null ? totalReturnProp : ((finalValue - initialValue) / initialValue) * 100;

    // Calculate contribution from each asset class
    // Contribution = (Weight * Return) for each class
    const classes = [
      {
        name: "Renta Variable",
        key: "equity",
        color: "#3b82f6",
        initialValue: firstSnapshot.equity_value,
        finalValue: lastSnapshot.equity_value,
        initialPercent: firstSnapshot.equity_percent,
        finalPercent: lastSnapshot.equity_percent,
      },
      {
        name: "Renta Fija",
        key: "fixedIncome",
        color: "#22c55e",
        initialValue: firstSnapshot.fixed_income_value,
        finalValue: lastSnapshot.fixed_income_value,
        initialPercent: firstSnapshot.fixed_income_percent,
        finalPercent: lastSnapshot.fixed_income_percent,
      },
      {
        name: "Alternativos",
        key: "alternatives",
        color: "#a855f7",
        initialValue: firstSnapshot.alternatives_value,
        finalValue: lastSnapshot.alternatives_value,
        initialPercent: firstSnapshot.alternatives_percent,
        finalPercent: lastSnapshot.alternatives_percent,
      },
      {
        name: "Cash",
        key: "cash",
        color: "#6b7280",
        initialValue: firstSnapshot.cash_value,
        finalValue: lastSnapshot.cash_value,
        initialPercent: firstSnapshot.cash_percent,
        finalPercent: lastSnapshot.cash_percent,
      },
    ];

    const contributions = classes.map((cls) => {
      const classReturn = cls.initialValue > 0
        ? ((cls.finalValue - cls.initialValue) / cls.initialValue) * 100
        : 0;
      const avgWeight = ((cls.initialPercent || 0) + (cls.finalPercent || 0)) / 2 / 100;
      const contribution = classReturn * avgWeight;

      return {
        ...cls,
        return: classReturn,
        contribution,
        valueChange: cls.finalValue - cls.initialValue,
      };
    });

    return {
      contributions,
      totalReturn,
      initialValue,
      finalValue,
    };
  }, [snapshotsWithAssetData, firstSnapshot, lastSnapshot, totalReturnProp]);

  // ============================================
  // 1b. INSTRUMENT TYPE BREAKDOWN within each asset class
  // Uses holdingReturnsData (from HoldingReturnsPanel) when available,
  // which has real bond returns via FINRA prices + devengo calculation.
  // Falls back to snapshot-based calculation otherwise.
  // ============================================
  const instrumentBreakdown = useMemo((): AssetClassWithBreakdown[] | null => {
    const classKeyMap: Record<string, string> = {
      equity: "Renta Variable",
      fixedIncome: "Renta Fija",
      alternatives: "Alternativos",
      cash: "Cash",
    };
    const classColorMap: Record<string, string> = {
      equity: "#3b82f6",
      fixedIncome: "#22c55e",
      alternatives: "#a855f7",
      cash: "#6b7280",
    };

    // === PRIMARY: Use holdingReturnsData from HoldingReturnsPanel ===
    if (holdingReturnsData) {
      const { equityHoldings, fixedIncomeFundHoldings = [], alternativesHoldings = [], bondHoldings, cashValue, totalValue } = holdingReturnsData;
      if (equityHoldings.length === 0 && fixedIncomeFundHoldings.length === 0 && alternativesHoldings.length === 0 && bondHoldings.length === 0) return null;

      const result: AssetClassWithBreakdown[] = [];

      // Equity: group by instrument type (fund, etf, stock)
      if (equityHoldings.length > 0) {
        const byType = new Map<string, { contribution: number; totalReturn: number; weight: number }>();
        for (const h of equityHoldings) {
          const t = h.assetType || "fund";
          const existing = byType.get(t) || { contribution: 0, totalReturn: 0, weight: 0 };
          existing.contribution += h.contribution;
          existing.weight += h.weight;
          byType.set(t, existing);
        }

        const breakdown: InstrumentBreakdown[] = [];
        for (const [instType, data] of byType) {
          const meta = INSTRUMENT_COLORS[instType] || INSTRUMENT_COLORS.fund;
          breakdown.push({
            type: instType,
            label: meta.label,
            color: meta.color,
            negColor: meta.negColor,
            contribution: data.contribution,
          });
        }
        breakdown.sort((a, b) => b.contribution - a.contribution);

        const totalContribution = breakdown.reduce((s, b) => s + b.contribution, 0);
        const totalWeight = equityHoldings.reduce((s, h) => s + h.weight, 0);
        const classReturn = totalWeight > 0 ? (totalContribution / totalWeight) * 100 : 0;

        result.push({
          name: classKeyMap.equity,
          key: "equity",
          color: classColorMap.equity,
          totalContribution,
          classReturn,
          breakdown,
        });
      }

      // Fixed Income: RF funds + bonds
      if (fixedIncomeFundHoldings.length > 0 || bondHoldings.length > 0) {
        const breakdown: InstrumentBreakdown[] = [];

        // RF funds contribution
        const fundContrib = fixedIncomeFundHoldings.reduce((s, h) => s + h.contribution, 0);
        if (fixedIncomeFundHoldings.length > 0) {
          const fundMeta = INSTRUMENT_COLORS.fund;
          breakdown.push({
            type: "fund",
            label: fundMeta.label,
            color: fundMeta.color,
            negColor: fundMeta.negColor,
            contribution: fundContrib,
          });
        }

        // Bonds contribution
        const bondContrib = bondHoldings.reduce((s, h) => s + h.contribution, 0);
        if (bondHoldings.length > 0) {
          const bondMeta = INSTRUMENT_COLORS.bond;
          breakdown.push({
            type: "bond",
            label: bondMeta.label,
            color: bondMeta.color,
            negColor: bondMeta.negColor,
            contribution: bondContrib,
          });
        }

        breakdown.sort((a, b) => b.contribution - a.contribution);

        const totalContribution = fundContrib + bondContrib;
        const totalWeight = fixedIncomeFundHoldings.reduce((s, h) => s + h.weight, 0)
          + bondHoldings.reduce((s, h) => s + h.weight, 0);
        const classReturn = totalWeight > 0 ? (totalContribution / totalWeight) * 100 : 0;

        result.push({
          name: classKeyMap.fixedIncome,
          key: "fixedIncome",
          color: classColorMap.fixedIncome,
          totalContribution,
          classReturn,
          breakdown,
        });
      }

      // Alternatives
      if (alternativesHoldings && alternativesHoldings.length > 0) {
        const byType = new Map<string, { contribution: number; weight: number }>();
        for (const h of alternativesHoldings) {
          const t = h.assetType || "fund";
          const existing = byType.get(t) || { contribution: 0, weight: 0 };
          existing.contribution += h.contribution;
          existing.weight += h.weight;
          byType.set(t, existing);
        }

        const breakdown: InstrumentBreakdown[] = [];
        for (const [instType, data] of byType) {
          const meta = INSTRUMENT_COLORS[instType] || INSTRUMENT_COLORS.fund;
          breakdown.push({
            type: instType,
            label: meta.label,
            color: meta.color,
            negColor: meta.negColor,
            contribution: data.contribution,
          });
        }
        breakdown.sort((a, b) => b.contribution - a.contribution);

        const totalContribution = breakdown.reduce((s, b) => s + b.contribution, 0);
        const totalWeight = alternativesHoldings.reduce((s, h) => s + h.weight, 0);
        const classReturn = totalWeight > 0 ? (totalContribution / totalWeight) * 100 : 0;

        result.push({
          name: classKeyMap.alternatives,
          key: "alternatives",
          color: classColorMap.alternatives,
          totalContribution,
          classReturn,
          breakdown,
        });
      }

      // Cash
      if (cashValue > 0 && totalValue > 0) {
        const cashWeight = (cashValue / totalValue) * 100;
        const meta = INSTRUMENT_COLORS.cash;
        result.push({
          name: classKeyMap.cash,
          key: "cash",
          color: classColorMap.cash,
          totalContribution: 0,
          classReturn: 0,
          breakdown: [{
            type: "cash",
            label: meta.label,
            color: meta.color,
            negColor: meta.negColor,
            contribution: 0,
          }],
        });
      }

      result.sort((a, b) => b.totalContribution - a.totalContribution);
      return result.length > 0 ? result : null;
    }

    // === FALLBACK: Calculate from snapshot holdings ===
    if (!firstSnapshot || !lastSnapshot || snapshotsWithAssetData.length < 2) return null;

    const initialHoldings = (firstSnapshot.holdings as Holding[]) || [];
    const finalHoldings = (lastSnapshot.holdings as Holding[]) || [];
    if (initialHoldings.length === 0 && finalHoldings.length === 0) return null;

    const portfolioInitialValue = firstSnapshot.total_value;
    if (portfolioInitialValue <= 0) return null;

    const clpValue = (h: Holding) => (h.marketValueCLP || 0) > 0 ? h.marketValueCLP! : (h.marketValue ?? 0);

    const groups = new Map<string, Map<string, { startValue: number; endValue: number }>>();
    const getGroup = (ac: string, it: string) => {
      if (!groups.has(ac)) groups.set(ac, new Map());
      const acMap = groups.get(ac)!;
      if (!acMap.has(it)) acMap.set(it, { startValue: 0, endValue: 0 });
      return acMap.get(it)!;
    };

    for (const h of initialHoldings) {
      const ac = normalizeAC(h.assetClass);
      const it = inferInstrumentType(h as Parameters<typeof inferInstrumentType>[0]);
      getGroup(ac, it).startValue += clpValue(h);
    }
    for (const h of finalHoldings) {
      const ac = normalizeAC(h.assetClass);
      const it = inferInstrumentType(h as Parameters<typeof inferInstrumentType>[0]);
      getGroup(ac, it).endValue += clpValue(h);
    }

    const classOrder = ["equity", "fixedIncome", "alternatives", "cash"];
    const result: AssetClassWithBreakdown[] = [];

    for (const classKey of classOrder) {
      const acMap = groups.get(classKey);
      if (!acMap) continue;

      const breakdown: InstrumentBreakdown[] = [];
      let classTotalStart = 0;
      let classTotalEnd = 0;

      for (const [instType, vals] of acMap) {
        const contribution = ((vals.endValue - vals.startValue) / portfolioInitialValue) * 100;
        const meta = INSTRUMENT_COLORS[instType] || INSTRUMENT_COLORS.fund;
        breakdown.push({ type: instType, label: meta.label, color: meta.color, negColor: meta.negColor, contribution });
        classTotalStart += vals.startValue;
        classTotalEnd += vals.endValue;
      }

      breakdown.sort((a, b) => b.contribution - a.contribution);
      const totalContribution = breakdown.reduce((s, b) => s + b.contribution, 0);
      const classReturn = classTotalStart > 0 ? ((classTotalEnd - classTotalStart) / classTotalStart) * 100 : 0;

      if (Math.abs(totalContribution) > 0.01 || classTotalStart > 0) {
        result.push({
          name: classKeyMap[classKey] || classKey,
          key: classKey,
          color: classColorMap[classKey] || "#6b7280",
          totalContribution,
          classReturn,
          breakdown,
        });
      }
    }

    return result.length > 0 ? result : null;
  }, [holdingReturnsData, firstSnapshot, lastSnapshot, snapshotsWithAssetData]);

  // ============================================
  // 2. ATTRIBUTION BY INDIVIDUAL POSITION
  // Uses holdingReturnsData (live prices) when available,
  // falls back to snapshot-based calculation otherwise.
  // ============================================
  const positionAttribution = useMemo(() => {
    // === PRIMARY: Use holdingReturnsData (has real returns from live prices) ===
    // Contribution = (finalValueCLP - initialValueCLP) / portfolioInitialValue * 100
    // This captures both price changes AND FX impact in CLP terms.
    if (holdingReturnsData) {
      const { equityHoldings, fixedIncomeFundHoldings = [], alternativesHoldings = [], bondHoldings, totalValue } = holdingReturnsData;

      // Build initial CLP values from the first snapshot's holdings
      // marketValueCLP is set at save time (toCLP conversion). If missing, derive from
      // the holding's share of raw marketValue within its asset class × class CLP value.
      const initialCLPByName = new Map<string, number>();
      const portfolioInitialValue = firstSnapshot?.total_value || 0;
      if (firstSnapshot?.holdings && portfolioInitialValue > 0) {
        const holdings = firstSnapshot.holdings as Array<Holding & { weight?: number }>;

        // First pass: try marketValueCLP (saved since ReviewSnapshotModal toCLP)
        let totalCLPFromHoldings = 0;
        const rawEntries: Array<{ name: string; clp: number; hasCLP: boolean }> = [];

        for (const h of holdings) {
          if (!h.fundName) continue;
          const hasCLP = (h.marketValueCLP || 0) > 0;
          const clp = hasCLP ? h.marketValueCLP! : 0;
          rawEntries.push({ name: h.fundName, clp, hasCLP });
          totalCLPFromHoldings += clp;
        }

        // If most holdings have marketValueCLP, use it directly
        const withCLP = rawEntries.filter(e => e.hasCLP).length;
        if (withCLP > rawEntries.length / 2) {
          // Scale to match total_value (handles rounding)
          const scale = totalCLPFromHoldings > 0 ? portfolioInitialValue / totalCLPFromHoldings : 1;
          for (const e of rawEntries) {
            if (!e.hasCLP) continue;
            const scaled = e.clp * scale;
            initialCLPByName.set(e.name, (initialCLPByName.get(e.name) || 0) + scaled);
          }
        } else {
          // Fallback: derive CLP from raw marketValue share × total_value
          const totalRaw = holdings.reduce((s, h) => s + Math.abs(h.marketValue ?? 0), 0);
          if (totalRaw > 0) {
            for (const h of holdings) {
              if (!h.fundName) continue;
              const share = Math.abs(h.marketValue ?? 0) / totalRaw;
              const clp = share * portfolioInitialValue;
              initialCLPByName.set(h.fundName, (initialCLPByName.get(h.fundName) || 0) + clp);
            }
          }
        }
      }

      const positions: Array<{
        name: string;
        initialValue: number;
        finalValue: number;
        return: number;
        contribution: number;
        weight: number;
        assetClass?: string;
      }> = [];

      for (const h of [...equityHoldings, ...fixedIncomeFundHoldings, ...alternativesHoldings]) {
        const initCLP = initialCLPByName.get(h.fundName) || 0;
        const valueDelta = h.marketValue - initCLP;
        const contribution = portfolioInitialValue > 0
          ? (valueDelta / portfolioInitialValue) * 100
          : (h.contribution ?? 0);
        const posReturn = initCLP > 0 ? (valueDelta / initCLP) * 100 : (h.totalReturn ?? 0);

        positions.push({
          name: h.fundName,
          initialValue: initCLP,
          finalValue: h.marketValue,
          return: posReturn,
          contribution,
          weight: h.weight ?? (totalValue > 0 ? (h.marketValue / totalValue) * 100 : 0),
          assetClass: h.assetClass,
        });
      }

      for (const b of bondHoldings) {
        const initCLP = initialCLPByName.get(b.fundName) || 0;
        const valueDelta = b.marketValue - initCLP;
        const contribution = portfolioInitialValue > 0
          ? (valueDelta / portfolioInitialValue) * 100
          : (b.contribution ?? 0);
        const posReturn = initCLP > 0 ? (valueDelta / initCLP) * 100 : (b.totalReturn ?? 0);

        positions.push({
          name: b.fundName,
          initialValue: initCLP,
          finalValue: b.marketValue,
          return: posReturn,
          contribution,
          weight: b.weight ?? (totalValue > 0 ? (b.marketValue / totalValue) * 100 : 0),
          assetClass: "fixedIncome",
        });
      }

      if (positions.length === 0) return null;
      positions.sort((a, b) => b.contribution - a.contribution);
      return positions;
    }

    // === FALLBACK: Snapshot-based calculation (requires 2+ snapshots) ===
    if (!firstSnapshot || !lastSnapshot) return null;

    const initialHoldings = (firstSnapshot.holdings as Holding[]) || [];
    const finalHoldings = (lastSnapshot.holdings as Holding[]) || [];

    if (initialHoldings.length === 0 && finalHoldings.length === 0) return null;

    const holdingsMap = new Map<string, {
      name: string;
      initialValue: number;
      finalValue: number;
      return: number;
      contribution: number;
      assetClass?: string;
    }>();

    const clpValue = (h: Holding) => (h.marketValueCLP || 0) > 0 ? h.marketValueCLP! : (h.marketValue ?? 0);

    initialHoldings.forEach((h) => {
      holdingsMap.set(h.fundName, {
        name: h.fundName,
        initialValue: clpValue(h),
        finalValue: 0,
        return: 0,
        contribution: 0,
        assetClass: h.assetClass,
      });
    });

    finalHoldings.forEach((h) => {
      const existing = holdingsMap.get(h.fundName);
      if (existing) {
        existing.finalValue = clpValue(h);
      } else {
        holdingsMap.set(h.fundName, {
          name: h.fundName,
          initialValue: 0,
          finalValue: clpValue(h),
          return: 0,
          contribution: 0,
          assetClass: h.assetClass,
        });
      }
    });

    const totalInitialValue = firstSnapshot.total_value;
    const positions = Array.from(holdingsMap.values()).map((pos) => {
      const posReturn = pos.initialValue > 0
        ? ((pos.finalValue - pos.initialValue) / pos.initialValue) * 100
        : (pos.finalValue > 0 ? 100 : 0);
      const weight = pos.initialValue / totalInitialValue;
      const contribution = posReturn * weight;

      return {
        ...pos,
        return: posReturn,
        contribution,
        weight: weight * 100,
      };
    });

    positions.sort((a, b) => b.contribution - a.contribution);
    return positions;
  }, [holdingReturnsData, firstSnapshot, lastSnapshot]);

  // ============================================
  // 3. BENCHMARK COMPARISON (Allocation + Selection Effect)
  // ============================================
  const benchmarkAttribution = useMemo(() => {
    if (!recommendation || !firstSnapshot || !lastSnapshot || snapshotsWithAssetData.length < 2) return null;

    const portfolioReturn = ((lastSnapshot.total_value - firstSnapshot.total_value) / firstSnapshot.total_value) * 100;

    // Calculate actual returns per asset class from real data
    const daysDiff =
      (new Date(lastSnapshot.snapshot_date).getTime() -
        new Date(firstSnapshot.snapshot_date).getTime()) /
      (1000 * 60 * 60 * 24);
    const realReturns = calculateAssetClassReturns(firstSnapshot, lastSnapshot, daysDiff);

    // Benchmark return: what we would have gotten with recommended allocation + actual class returns
    const benchmarkReturn =
      (recommendation.equity_percent || 0) * realReturns.equity / 100 +
      (recommendation.fixed_income_percent || 0) * realReturns.fixedIncome / 100 +
      (recommendation.alternatives_percent || 0) * realReturns.alternatives / 100 +
      (recommendation.cash_percent || 0) * realReturns.cash / 100;

    // Calculate effects for each asset class
    const classes = [
      { name: "Renta Variable", key: "equity", recWeight: recommendation.equity_percent || 0, actualWeight: lastSnapshot.equity_percent },
      { name: "Renta Fija", key: "fixedIncome", recWeight: recommendation.fixed_income_percent || 0, actualWeight: lastSnapshot.fixed_income_percent },
      { name: "Alternativos", key: "alternatives", recWeight: recommendation.alternatives_percent || 0, actualWeight: lastSnapshot.alternatives_percent },
      { name: "Cash", key: "cash", recWeight: recommendation.cash_percent || 0, actualWeight: lastSnapshot.cash_percent },
    ];

    let totalAllocationEffect = 0;
    let totalSelectionEffect = 0;

    const effects = classes.map((cls) => {
      const classReturn = realReturns[cls.key] || 0;
      const weightDiff = (cls.actualWeight - cls.recWeight) / 100;

      // Allocation effect: (Actual Weight - Benchmark Weight) * Benchmark Class Return
      const allocationEffect = weightDiff * classReturn;

      // Selection effect: actual class return vs benchmark class return, weighted by actual weight
      const actualClassReturn = cls.actualWeight > 0 ?
        (assetClassAttribution?.contributions.find(c => c.key === cls.key)?.return || classReturn) : 0;
      const selectionEffect = (actualClassReturn - classReturn) * (cls.actualWeight / 100);

      totalAllocationEffect += allocationEffect;
      totalSelectionEffect += selectionEffect;

      return {
        ...cls,
        allocationEffect,
        selectionEffect,
        totalEffect: allocationEffect + selectionEffect,
      };
    });

    const activeReturn = portfolioReturn - benchmarkReturn;

    return {
      portfolioReturn,
      benchmarkReturn,
      activeReturn,
      allocationEffect: totalAllocationEffect,
      selectionEffect: totalSelectionEffect,
      interactionEffect: activeReturn - totalAllocationEffect - totalSelectionEffect,
      effects,
    };
  }, [recommendation, firstSnapshot, lastSnapshot, snapshotsWithAssetData, assetClassAttribution]);

  // ============================================
  // 4. PREVIOUS PORTFOLIO COMPARISON
  // ============================================
  const portfolioComparison = useMemo(() => {
    const baselineSnapshot = previousPortfolio || firstSnapshot;
    if (!baselineSnapshot || !lastSnapshot || baselineSnapshot.id === lastSnapshot.id) return null;

    const classes = [
      { name: "Renta Variable", color: "#3b82f6", baseValue: baselineSnapshot.equity_value, currentValue: lastSnapshot.equity_value, basePercent: baselineSnapshot.equity_percent, currentPercent: lastSnapshot.equity_percent },
      { name: "Renta Fija", color: "#22c55e", baseValue: baselineSnapshot.fixed_income_value, currentValue: lastSnapshot.fixed_income_value, basePercent: baselineSnapshot.fixed_income_percent, currentPercent: lastSnapshot.fixed_income_percent },
      { name: "Alternativos", color: "#a855f7", baseValue: baselineSnapshot.alternatives_value, currentValue: lastSnapshot.alternatives_value, basePercent: baselineSnapshot.alternatives_percent, currentPercent: lastSnapshot.alternatives_percent },
      { name: "Cash", color: "#6b7280", baseValue: baselineSnapshot.cash_value, currentValue: lastSnapshot.cash_value, basePercent: baselineSnapshot.cash_percent, currentPercent: lastSnapshot.cash_percent },
    ];

    const comparison = classes.map((cls) => ({
      ...cls,
      valueChange: cls.currentValue - cls.baseValue,
      percentChange: cls.currentPercent - cls.basePercent,
      returnPct: cls.baseValue > 0 ? ((cls.currentValue - cls.baseValue) / cls.baseValue) * 100 : 0,
    }));

    return {
      baselineDate: baselineSnapshot.snapshot_date,
      currentDate: lastSnapshot.snapshot_date,
      baselineTotal: baselineSnapshot.total_value,
      currentTotal: lastSnapshot.total_value,
      totalChange: lastSnapshot.total_value - baselineSnapshot.total_value,
      totalReturnPct: ((lastSnapshot.total_value - baselineSnapshot.total_value) / baselineSnapshot.total_value) * 100,
      comparison,
    };
  }, [previousPortfolio, firstSnapshot, lastSnapshot]);

  const toggleSection = (section: string) => {
    setExpandedSection(expandedSection === section ? null : section);
  };

  if (snapshots.length < 2 && !holdingReturnsData) {
    return (
      <div className="bg-white rounded-lg border border-gb-border shadow-sm p-6">
        <h2 className="text-base font-semibold text-gb-black mb-4 flex items-center gap-2">
          <PieChart className="w-5 h-5 text-blue-500" />
          Atribución de Rendimiento
        </h2>
        <p className="text-sm text-gb-gray text-center py-8">
          Se necesitan al menos 2 snapshots para calcular la atribución de rendimiento.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg border border-gb-border shadow-sm">
      <div className="px-6 py-4 border-b border-gb-border">
        <h2 className="text-base font-semibold text-gb-black flex items-center gap-2">
          <PieChart className="w-5 h-5 text-blue-500" />
          Atribución de Rendimiento
        </h2>
        <p className="text-xs text-gb-gray mt-1">
          Análisis de contribución al rendimiento del portafolio
        </p>
      </div>

      {/* 1. Attribution by Asset Class — prefer instrumentBreakdown, fallback only when no holdingReturnsData */}
      {(instrumentBreakdown || (!holdingReturnsData && assetClassAttribution)) && (
        <div className="border-b border-gb-border">
          <button
            onClick={() => toggleSection("assetClass")}
            className="w-full px-6 py-4 flex items-center justify-between hover:bg-slate-50 transition-colors"
          >
            <div className="flex items-center gap-2">
              <PieChart className="w-4 h-4 text-blue-500" />
              <span className="font-medium text-sm text-gb-black">Por Clase de Activo</span>
            </div>
            <div className="flex items-center gap-3">
              {(() => {
                const displayReturn = instrumentBreakdown?.reduce((s, c) => s + c.totalContribution, 0)
                  ?? assetClassAttribution?.totalReturn
                  ?? 0;
                return (
                  <span className={`text-sm font-semibold ${displayReturn >= 0 ? "text-green-600" : "text-red-600"}`}>
                    {formatPercent(displayReturn)}
                  </span>
                );
              })()}
              {expandedSection === "assetClass" ? (
                <ChevronUp className="w-4 h-4 text-gb-gray" />
              ) : (
                <ChevronDown className="w-4 h-4 text-gb-gray" />
              )}
            </div>
          </button>

          {expandedSection === "assetClass" && (
            <div className="px-6 pb-6">
              {instrumentBreakdown ? (
                <>
                  {/* Legend — only show instrument type colors when there are multiple types */}
                  {instrumentBreakdown.some(cls => cls.breakdown.length > 1) && (
                    <div className="flex flex-wrap gap-3 mb-4">
                      {Object.entries(INSTRUMENT_COLORS).map(([key, meta]) => (
                        <div key={key} className="flex items-center gap-1.5 text-xs text-gb-gray">
                          <div className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: meta.color }} />
                          {meta.label}
                        </div>
                      ))}
                    </div>
                  )}

                  {(() => {
                    const maxAbs = Math.max(
                      ...instrumentBreakdown.map(c => Math.abs(c.totalContribution)),
                      0.01
                    );
                    const hasNegative = instrumentBreakdown.some(c => c.totalContribution < 0);
                    const scale = (val: number) => Math.max((Math.abs(val) / maxAbs) * (hasNegative ? 50 : 90), 3);
                    const zeroOffset = hasNegative ? 50 : 0;

                    return (
                      <div className="space-y-3">
                        {instrumentBreakdown.map((cls) => {
                          const hasContribution = Math.abs(cls.totalContribution) > 0.005;
                          const barWidth = hasContribution ? scale(cls.totalContribution) : 3;
                          const isNeg = cls.totalContribution < 0;
                          const isSmallBar = barWidth < 25;

                          return (
                            <div key={cls.key}>
                              <div className="flex items-baseline justify-between mb-1">
                                <span className="text-sm font-semibold text-gb-black">{cls.name}</span>
                                <span className={`text-sm font-bold ${cls.totalContribution >= 0 ? "text-green-600" : "text-red-600"}`}>
                                  {cls.totalContribution >= 0 ? "+" : ""}{formatNumber(cls.totalContribution, 2)}%
                                </span>
                              </div>
                              <div className="flex items-center gap-2">
                                {/* Bar */}
                                <div className="relative h-7 flex-1">
                                  {hasNegative && (
                                    <div
                                      className="absolute top-0 bottom-0 w-px bg-slate-400"
                                      style={{ left: `${zeroOffset}%` }}
                                    />
                                  )}
                                  <div
                                    className={`absolute top-0 h-full flex rounded ${!hasContribution ? "opacity-40" : ""}`}
                                    style={
                                      isNeg
                                        ? { right: `${100 - zeroOffset}%`, width: `${barWidth}%`, flexDirection: "row-reverse" }
                                        : { left: `${zeroOffset}%`, width: `${barWidth}%` }
                                    }
                                  >
                                    {cls.breakdown
                                      .filter(b => hasContribution ? (isNeg ? b.contribution < 0 : b.contribution > 0) : true)
                                      .map((seg) => {
                                        const segPct = hasContribution && cls.totalContribution !== 0
                                          ? (Math.abs(seg.contribution) / Math.abs(cls.totalContribution)) * 100
                                          : 100 / Math.max(cls.breakdown.length, 1);
                                        return (
                                          <div
                                            key={seg.type}
                                            className="h-full flex items-center justify-center overflow-hidden"
                                            style={{
                                              width: `${segPct}%`,
                                              backgroundColor: (isNeg && hasContribution) ? seg.negColor : seg.color,
                                              minWidth: "2px",
                                            }}
                                            title={`${seg.label}: ${seg.contribution >= 0 ? "+" : ""}${formatNumber(seg.contribution, 2)}%`}
                                          >
                                            {!isSmallBar && segPct > 15 && (
                                              <span className="text-[10px] font-medium text-white truncate px-1">
                                                {seg.label} {formatNumber(Math.abs(seg.contribution), 1)}
                                              </span>
                                            )}
                                          </div>
                                        );
                                      })}
                                  </div>
                                </div>
                                {/* External label when bar is too small */}
                                {isSmallBar && (
                                  <span className="text-[11px] text-gb-gray whitespace-nowrap shrink-0">
                                    {cls.breakdown.map(s => s.label).join(", ")}
                                  </span>
                                )}
                              </div>
                              <div className="flex flex-wrap gap-x-4 gap-y-0.5 mt-1">
                                {cls.breakdown.map((seg) => (
                                    <span key={seg.type} className="text-[11px] text-gb-gray">
                                      <span className="inline-block w-2 h-2 rounded-sm mr-1" style={{ backgroundColor: seg.color }} />
                                      {seg.label}: <span className={seg.contribution >= 0 ? "text-green-600" : "text-red-600"}>
                                        {seg.contribution >= 0 ? "+" : ""}{formatNumber(seg.contribution, 2)}%
                                      </span>
                                    </span>
                                  ))}
                              </div>
                            </div>
                          );
                        })}

                        <div className="border-t-2 border-gb-black pt-2 mt-2 flex justify-between">
                          <span className="text-sm font-bold text-gb-black">Retorno Total Cartera</span>
                          <span className={`text-sm font-bold ${(instrumentBreakdown?.reduce((s, c) => s + c.totalContribution, 0) ?? assetClassAttribution?.totalReturn ?? 0) >= 0 ? "text-green-600" : "text-red-600"}`}>
                            {formatPercent(instrumentBreakdown?.reduce((s, c) => s + c.totalContribution, 0) ?? assetClassAttribution?.totalReturn ?? 0)}
                          </span>
                        </div>
                      </div>
                    );
                  })()}
                </>
              ) : (!holdingReturnsData && assetClassAttribution) ? (
                /* Fallback: same horizontal bar style using asset class data (only when no live prices) */
                (() => {
                  const contributions = assetClassAttribution.contributions;
                  const maxAbs = Math.max(...contributions.map(c => Math.abs(c.contribution)), 0.01);
                  const hasNegative = contributions.some(c => c.contribution < 0);
                  const scale = (val: number) => Math.max((Math.abs(val) / maxAbs) * (hasNegative ? 50 : 90), 3);
                  const zeroOffset = hasNegative ? 50 : 0;

                  return (
                    <div className="space-y-3">
                      {contributions.map((cls) => {
                        const hasContribution = Math.abs(cls.contribution) > 0.005;
                        const barWidth = hasContribution ? scale(cls.contribution) : 3;
                        const isNeg = cls.contribution < 0;

                        return (
                          <div key={cls.key}>
                            <div className="flex items-baseline justify-between mb-1">
                              <div className="flex items-center gap-2">
                                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: cls.color }} />
                                <span className="text-sm font-semibold text-gb-black">{cls.name}</span>
                              </div>
                              <div className="flex items-center gap-3">
                                <span className="text-xs text-gb-gray">
                                  Retorno: {formatPercent(cls.return)}
                                </span>
                                <span className={`text-sm font-bold ${cls.contribution >= 0 ? "text-green-600" : "text-red-600"}`}>
                                  {cls.contribution >= 0 ? "+" : ""}{formatNumber(cls.contribution, 2)}%
                                </span>
                              </div>
                            </div>
                            <div className="relative h-7 flex-1">
                              {hasNegative && (
                                <div
                                  className="absolute top-0 bottom-0 w-px bg-slate-400"
                                  style={{ left: `${zeroOffset}%` }}
                                />
                              )}
                              <div
                                className={`absolute top-0 h-full rounded ${!hasContribution ? "opacity-40" : ""}`}
                                style={{
                                  backgroundColor: cls.color,
                                  ...(isNeg
                                    ? { right: `${100 - zeroOffset}%`, width: `${barWidth}%` }
                                    : { left: `${zeroOffset}%`, width: `${barWidth}%` }),
                                }}
                              />
                            </div>
                          </div>
                        );
                      })}

                      <div className="border-t-2 border-gb-black pt-2 mt-2 flex justify-between">
                        <span className="text-sm font-bold text-gb-black">Retorno Total Cartera</span>
                        <span className={`text-sm font-bold ${assetClassAttribution.totalReturn >= 0 ? "text-green-600" : "text-red-600"}`}>
                          {formatPercent(assetClassAttribution.totalReturn)}
                        </span>
                      </div>
                    </div>
                  );
                })()
              ) : null}
            </div>
          )}
        </div>
      )}

      {/* 2. Attribution by Position */}
      {positionAttribution && positionAttribution.length > 0 && (
        <div className="border-b border-gb-border">
          <button
            onClick={() => toggleSection("positions")}
            className="w-full px-6 py-4 flex items-center justify-between hover:bg-slate-50 transition-colors"
          >
            <div className="flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-green-500" />
              <span className="font-medium text-sm text-gb-black">Por Posición Individual</span>
              {firstSnapshot && (
                <span className="text-xs text-gb-gray ml-1">
                  (desde {formatDate(firstSnapshot.snapshot_date)})
                </span>
              )}
            </div>
            <div className="flex items-center gap-3">
              {(() => {
                const totalContrib = positionAttribution.reduce((s, p) => s + p.contribution, 0);
                return (
                  <span className={`text-sm font-semibold ${totalContrib >= 0 ? "text-green-600" : "text-red-600"}`}>
                    {formatPercent(totalContrib)}
                  </span>
                );
              })()}
              {expandedSection === "positions" ? (
                <ChevronUp className="w-4 h-4 text-gb-gray" />
              ) : (
                <ChevronDown className="w-4 h-4 text-gb-gray" />
              )}
            </div>
          </button>

          {expandedSection === "positions" && (
            <div className="px-6 pb-6">
              {(() => {
                const maxAbs = Math.max(...positionAttribution.map(p => Math.abs(p.contribution)), 0.01);
                const hasNegative = positionAttribution.some(p => p.contribution < 0);
                const scale = (val: number) => Math.max((Math.abs(val) / maxAbs) * (hasNegative ? 45 : 85), 3);
                const zeroOffset = hasNegative ? 50 : 0;

                return (
                  <div className="space-y-3">
                    {positionAttribution.map((pos) => {
                      const barWidth = scale(pos.contribution);
                      const isNeg = pos.contribution < 0;

                      return (
                        <div key={pos.name}>
                          <div className="flex items-baseline justify-between mb-1">
                            <span className="text-sm font-medium text-gb-black truncate max-w-[60%]" title={pos.name}>
                              {pos.name}
                            </span>
                            <div className="flex items-center gap-3 shrink-0">
                              <span className="text-xs text-gb-gray">
                                Peso: {formatNumber(pos.weight, 1)}%
                              </span>
                              <span className={`text-sm font-bold ${pos.contribution >= 0 ? "text-green-600" : "text-red-600"}`}>
                                {pos.contribution >= 0 ? "+" : ""}{formatNumber(pos.contribution, 2)}%
                              </span>
                            </div>
                          </div>
                          <div className="relative h-6 flex-1 bg-slate-100 rounded">
                            {hasNegative && (
                              <div
                                className="absolute top-0 bottom-0 w-px bg-slate-400"
                                style={{ left: `${zeroOffset}%` }}
                              />
                            )}
                            <div
                              className="absolute top-0 h-full rounded"
                              style={{
                                backgroundColor: isNeg ? "#ef4444" : "#22c55e",
                                ...(isNeg
                                  ? { right: `${100 - zeroOffset}%`, width: `${barWidth}%` }
                                  : { left: `${zeroOffset}%`, width: `${barWidth}%` }),
                              }}
                            />
                          </div>
                          <div className="flex justify-between mt-0.5">
                            <span className="text-[11px] text-gb-gray">
                              {pos.assetClass === "fixedIncome" ? "RF" : pos.assetClass === "equity" ? "RV" : pos.assetClass === "alternatives" ? "Alt" : pos.assetClass || ""}
                            </span>
                            <span className={`text-[11px] text-gb-gray`}>
                              Retorno: {pos.return >= 0 ? "+" : ""}{formatNumber(pos.return, 2)}%
                            </span>
                          </div>
                        </div>
                      );
                    })}

                    <div className="border-t-2 border-gb-black pt-2 mt-2 flex justify-between">
                      <span className="text-sm font-bold text-gb-black">Contribución Total</span>
                      <span className={`text-sm font-bold ${positionAttribution.reduce((s, p) => s + p.contribution, 0) >= 0 ? "text-green-600" : "text-red-600"}`}>
                        {formatPercent(positionAttribution.reduce((s, p) => s + p.contribution, 0))}
                      </span>
                    </div>
                  </div>
                );
              })()}
            </div>
          )}
        </div>
      )}

      {/* 3. Benchmark Comparison */}
      {benchmarkAttribution && (
        <div className="border-b border-gb-border">
          <button
            onClick={() => toggleSection("benchmark")}
            className="w-full px-6 py-4 flex items-center justify-between hover:bg-slate-50 transition-colors"
          >
            <div className="flex items-center gap-2">
              <Target className="w-4 h-4 text-purple-500" />
              <span className="font-medium text-sm text-gb-black">vs Benchmark (Recomendación)</span>
            </div>
            <div className="flex items-center gap-3">
              <span className={`text-sm font-semibold ${benchmarkAttribution.activeReturn >= 0 ? "text-green-600" : "text-red-600"}`}>
                {formatPercent(benchmarkAttribution.activeReturn)} alpha
              </span>
              {expandedSection === "benchmark" ? (
                <ChevronUp className="w-4 h-4 text-gb-gray" />
              ) : (
                <ChevronDown className="w-4 h-4 text-gb-gray" />
              )}
            </div>
          </button>

          {expandedSection === "benchmark" && (
            <div className="px-6 pb-6">
              {/* Summary */}
              <div className="grid grid-cols-3 gap-4 mb-6">
                <div className="p-4 rounded-lg bg-blue-50 text-center">
                  <p className="text-xs text-blue-700 font-medium mb-1">Retorno Portfolio</p>
                  <p className={`text-xl font-bold ${benchmarkAttribution.portfolioReturn >= 0 ? "text-green-600" : "text-red-600"}`}>
                    {formatPercent(benchmarkAttribution.portfolioReturn)}
                  </p>
                </div>
                <div className="p-4 rounded-lg bg-purple-50 text-center">
                  <p className="text-xs text-purple-700 font-medium mb-1">Retorno Benchmark</p>
                  <p className="text-xl font-bold text-purple-700">
                    {formatPercent(benchmarkAttribution.benchmarkReturn, false)}
                  </p>
                </div>
                <div className="p-4 rounded-lg bg-amber-50 text-center">
                  <p className="text-xs text-amber-700 font-medium mb-1">Alpha (Exceso)</p>
                  <p className={`text-xl font-bold ${benchmarkAttribution.activeReturn >= 0 ? "text-green-600" : "text-red-600"}`}>
                    {formatPercent(benchmarkAttribution.activeReturn)}
                  </p>
                </div>
              </div>

              {/* Effect breakdown */}
              <div className="grid grid-cols-3 gap-4">
                <div className="p-3 rounded-lg border border-gb-border text-center">
                  <p className="text-xs text-gb-gray font-medium mb-1">Efecto Asignación</p>
                  <p className={`text-lg font-bold ${benchmarkAttribution.allocationEffect >= 0 ? "text-green-600" : "text-red-600"}`}>
                    {formatPercent(benchmarkAttribution.allocationEffect)}
                  </p>
                  <p className="text-xs text-gb-gray mt-1">Decisiones de peso por clase</p>
                </div>
                <div className="p-3 rounded-lg border border-gb-border text-center">
                  <p className="text-xs text-gb-gray font-medium mb-1">Efecto Selección</p>
                  <p className={`text-lg font-bold ${benchmarkAttribution.selectionEffect >= 0 ? "text-green-600" : "text-red-600"}`}>
                    {formatPercent(benchmarkAttribution.selectionEffect)}
                  </p>
                  <p className="text-xs text-gb-gray mt-1">Selección de instrumentos</p>
                </div>
                <div className="p-3 rounded-lg border border-gb-border text-center">
                  <p className="text-xs text-gb-gray font-medium mb-1">Efecto Interacción</p>
                  <p className={`text-lg font-bold ${benchmarkAttribution.interactionEffect >= 0 ? "text-green-600" : "text-red-600"}`}>
                    {formatPercent(benchmarkAttribution.interactionEffect)}
                  </p>
                  <p className="text-xs text-gb-gray mt-1">Timing y otros</p>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* 4. Previous Portfolio Comparison */}
      {portfolioComparison && (
        <div>
          <button
            onClick={() => toggleSection("comparison")}
            className="w-full px-6 py-4 flex items-center justify-between hover:bg-slate-50 transition-colors"
          >
            <div className="flex items-center gap-2">
              <GitCompare className="w-4 h-4 text-amber-500" />
              <span className="font-medium text-sm text-gb-black">
                Comparación con Portfolio Inicial
              </span>
            </div>
            <div className="flex items-center gap-3">
              <span className={`text-sm font-semibold ${portfolioComparison.totalReturnPct >= 0 ? "text-green-600" : "text-red-600"}`}>
                {formatPercent(portfolioComparison.totalReturnPct)}
              </span>
              {expandedSection === "comparison" ? (
                <ChevronUp className="w-4 h-4 text-gb-gray" />
              ) : (
                <ChevronDown className="w-4 h-4 text-gb-gray" />
              )}
            </div>
          </button>

          {expandedSection === "comparison" && (
            <div className="px-6 pb-6">
              {/* Period info */}
              <div className="flex items-center justify-between mb-4 p-3 bg-slate-50 rounded-lg">
                <div>
                  <p className="text-xs text-gb-gray">Desde</p>
                  <p className="text-sm font-medium">{formatDate(portfolioComparison.baselineDate)}</p>
                  <p className="text-sm text-gb-black">{formatCurrency(portfolioComparison.baselineTotal)}</p>
                </div>
                <div className="text-center">
                  <div className={`text-lg font-bold ${portfolioComparison.totalChange >= 0 ? "text-green-600" : "text-red-600"}`}>
                    {portfolioComparison.totalChange >= 0 ? <TrendingUp className="w-5 h-5 inline" /> : <TrendingDown className="w-5 h-5 inline" />}
                    {formatCurrency(portfolioComparison.totalChange)}
                  </div>
                  <p className={`text-sm font-medium ${portfolioComparison.totalReturnPct >= 0 ? "text-green-600" : "text-red-600"}`}>
                    {formatPercent(portfolioComparison.totalReturnPct)}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-gb-gray">Hasta</p>
                  <p className="text-sm font-medium">{formatDate(portfolioComparison.currentDate)}</p>
                  <p className="text-sm text-gb-black">{formatCurrency(portfolioComparison.currentTotal)}</p>
                </div>
              </div>

              {/* By asset class */}
              <div className="space-y-3">
                {portfolioComparison.comparison.map((cls) => (
                  <div key={cls.name} className="p-3 rounded-lg border border-gb-border">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-full" style={{ backgroundColor: cls.color }} />
                        <span className="text-sm font-medium text-gb-black">{cls.name}</span>
                      </div>
                      <span className={`text-sm font-bold ${cls.returnPct >= 0 ? "text-green-600" : "text-red-600"}`}>
                        {formatPercent(cls.returnPct)}
                      </span>
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-xs">
                      <div>
                        <p className="text-gb-gray">Inicial</p>
                        <p className="font-medium">{formatCurrency(cls.baseValue)}</p>
                        <p className="text-gb-gray">{formatNumber(cls.basePercent, 1)}%</p>
                      </div>
                      <div className="text-center">
                        <p className="text-gb-gray">Cambio</p>
                        <p className={`font-medium ${cls.valueChange >= 0 ? "text-green-600" : "text-red-600"}`}>
                          {cls.valueChange >= 0 ? "+" : ""}{formatCurrency(cls.valueChange)}
                        </p>
                        <p className={`${cls.percentChange >= 0 ? "text-green-600" : "text-red-600"}`}>
                          {cls.percentChange >= 0 ? "+" : ""}{formatNumber(cls.percentChange, 1)}pp
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-gb-gray">Actual</p>
                        <p className="font-medium">{formatCurrency(cls.currentValue)}</p>
                        <p className="text-gb-gray">{formatNumber(cls.currentPercent, 1)}%</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
