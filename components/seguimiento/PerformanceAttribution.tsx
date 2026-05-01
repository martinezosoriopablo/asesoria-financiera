"use client";

import React, { useState, useMemo } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
  Legend,
  ReferenceLine,
} from "recharts";
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
import type { Snapshot } from "./SeguimientoPage";

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
      // Annualize the return
      result[cls.key] = (Math.pow(1 + totalReturn, 1 / yearsElapsed) - 1) * 100;
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
  // 2. ATTRIBUTION BY INDIVIDUAL POSITION
  // ============================================
  const positionAttribution = useMemo(() => {
    if (!firstSnapshot || !lastSnapshot) return null;

    const initialHoldings = (firstSnapshot.holdings as Holding[]) || [];
    const finalHoldings = (lastSnapshot.holdings as Holding[]) || [];

    if (initialHoldings.length === 0 && finalHoldings.length === 0) return null;

    // Create a map of holdings by name
    const holdingsMap = new Map<string, {
      name: string;
      initialValue: number;
      finalValue: number;
      return: number;
      contribution: number;
      assetClass?: string;
    }>();

    // Use marketValueCLP when available (handles USD funds correctly)
    const clpValue = (h: Holding) => h.marketValueCLP ?? h.marketValue ?? 0;

    // Add initial holdings
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

    // Update with final holdings
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

    // Calculate returns and contributions
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

    // Sort by absolute contribution
    positions.sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution));

    return positions.slice(0, 10); // Top 10 contributors
  }, [firstSnapshot, lastSnapshot]);

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

  if (snapshots.length < 2) {
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

      {/* 1. Attribution by Asset Class */}
      {assetClassAttribution && (
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
              <span className={`text-sm font-semibold ${assetClassAttribution.totalReturn >= 0 ? "text-green-600" : "text-red-600"}`}>
                {formatPercent(assetClassAttribution.totalReturn)}
              </span>
              {expandedSection === "assetClass" ? (
                <ChevronUp className="w-4 h-4 text-gb-gray" />
              ) : (
                <ChevronDown className="w-4 h-4 text-gb-gray" />
              )}
            </div>
          </button>

          {expandedSection === "assetClass" && (
            <div className="px-6 pb-6">
              <div className="h-64 mb-4">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={assetClassAttribution.contributions}
                    layout="vertical"
                    margin={{ left: 80, right: 20 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis type="number" tickFormatter={(v) => `${formatNumber(v, 1)}%`} />
                    <YAxis type="category" dataKey="name" tick={{ fontSize: 12 }} />
                    <Tooltip
                      formatter={(value: number | undefined) => [`${formatNumber(value ?? 0, 2)}%`, "Contribución"]}
                    />
                    <ReferenceLine x={0} stroke="#000" />
                    <Bar dataKey="contribution" name="Contribución">
                      {assetClassAttribution.contributions.map((entry, index) => (
                        <Cell
                          key={`cell-${index}`}
                          fill={entry.contribution >= 0 ? "#22c55e" : "#ef4444"}
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>

              <div className="grid grid-cols-4 gap-3">
                {assetClassAttribution.contributions.map((cls) => (
                  <div key={cls.key} className="p-3 rounded-lg bg-slate-50">
                    <div className="flex items-center gap-2 mb-2">
                      <div className="w-3 h-3 rounded-full" style={{ backgroundColor: cls.color }} />
                      <span className="text-xs font-medium text-gb-black">{cls.name}</span>
                    </div>
                    <p className={`text-lg font-bold ${cls.contribution >= 0 ? "text-green-600" : "text-red-600"}`}>
                      {formatPercent(cls.contribution)}
                    </p>
                    <p className="text-xs text-gb-gray">
                      Retorno: {formatPercent(cls.return)}
                    </p>
                  </div>
                ))}
              </div>
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
            </div>
            <div className="flex items-center gap-3">
              <span className="text-xs text-gb-gray">Top {positionAttribution.length} contribuidores</span>
              {expandedSection === "positions" ? (
                <ChevronUp className="w-4 h-4 text-gb-gray" />
              ) : (
                <ChevronDown className="w-4 h-4 text-gb-gray" />
              )}
            </div>
          </button>

          {expandedSection === "positions" && (
            <div className="px-6 pb-6">
              <div className="space-y-2">
                {positionAttribution.map((pos, index) => (
                  <div
                    key={pos.name}
                    className="flex items-center justify-between p-3 rounded-lg bg-slate-50"
                  >
                    <div className="flex-1">
                      <p className="text-sm font-medium text-gb-black truncate" title={pos.name}>
                        {index + 1}. {pos.name}
                      </p>
                      <p className="text-xs text-gb-gray">
                        Peso: {formatNumber(pos.weight, 1)}% | Retorno: {formatPercent(pos.return)}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className={`text-sm font-bold ${pos.contribution >= 0 ? "text-green-600" : "text-red-600"}`}>
                        {formatPercent(pos.contribution)}
                      </p>
                      <p className="text-xs text-gb-gray">contribución</p>
                    </div>
                  </div>
                ))}
              </div>
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
