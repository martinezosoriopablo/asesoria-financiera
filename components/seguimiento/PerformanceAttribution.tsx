"use client";

import React from "react";
import {
  TrendingUp,
  TrendingDown,
  PieChart,
  Target,
  GitCompare,
  ChevronDown,
  ChevronUp,
  ChevronLeft,
  ChevronRight,
  Loader,
} from "lucide-react";
import { formatNumber, formatCurrency, formatPercent, formatDate } from "@/lib/format";
import type { Snapshot } from "./SeguimientoPage";
import type { HoldingReturnsData } from "./HoldingReturnsPanel";
import {
  usePerformanceCalculations,
  INSTRUMENT_COLORS,
  type AssetClassWithBreakdown,
  type PositionAttr,
} from "./hooks/usePerformanceCalculations";

interface BenchmarkAllocation {
  equity_percent?: number;
  fixed_income_percent?: number;
  alternatives_percent?: number;
  cash_percent?: number;
}

interface Props {
  snapshots: Snapshot[];
  recommendation?: BenchmarkAllocation | null;
  previousPortfolio?: Snapshot | null;
  totalReturn?: number;
  holdingReturnsData?: HoldingReturnsData | null;
}

export default function PerformanceAttribution(props: Props) {
  const {
    monthOptions,
    selectedMonthIdx,
    setSelectedMonthIdx,
    selectedMonth,
    canPrevMonth,
    canNextMonth,
    expandedSection,
    toggleSection,
    firstSnapshot,
    assetClassAttribution,
    instrumentBreakdown,
    positionAttribution,
    activePositionData,
    isMonthLoading,
    benchmarkAttribution,
    portfolioComparison,
    holdingReturnsData,
  } = usePerformanceCalculations(props);

  // Early return if no data
  if (!assetClassAttribution && !instrumentBreakdown && !positionAttribution && !benchmarkAttribution && !portfolioComparison) {
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
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold text-gb-black flex items-center gap-2">
              <PieChart className="w-5 h-5 text-blue-500" />
              Atribución de Rendimiento
            </h2>
            <p className="text-xs text-gb-gray mt-1">
              Análisis de contribución al rendimiento del portafolio
            </p>
          </div>
          {monthOptions.length > 1 && (
            <div className="flex items-center gap-2">
              <button
                onClick={() => setSelectedMonthIdx((i) => Math.max(0, i - 1))}
                disabled={!canPrevMonth}
                className="p-1 rounded hover:bg-gb-light disabled:opacity-30 transition-colors"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="text-sm font-medium text-gb-black min-w-[200px] text-center">
                {selectedMonth.label}
              </span>
              <button
                onClick={() => setSelectedMonthIdx((i) => Math.min(monthOptions.length - 1, i + 1))}
                disabled={!canNextMonth}
                className="p-1 rounded hover:bg-gb-light disabled:opacity-30 transition-colors"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* 1. Attribution by Asset Class */}
      {(instrumentBreakdown || (!holdingReturnsData && assetClassAttribution)) && (
        <AssetClassSection
          instrumentBreakdown={instrumentBreakdown}
          assetClassAttribution={assetClassAttribution}
          holdingReturnsData={holdingReturnsData}
          expandedSection={expandedSection}
          toggleSection={toggleSection}
        />
      )}

      {/* 2. Attribution by Position */}
      <PositionSection
        selectedMonth={selectedMonth}
        positionAttribution={positionAttribution}
        activePositionData={activePositionData}
        isMonthLoading={isMonthLoading}
        firstSnapshot={firstSnapshot}
        expandedSection={expandedSection}
        toggleSection={toggleSection}
      />

      {/* 3. Benchmark Comparison — hidden when viewing a specific month */}
      {selectedMonth.isAccumulated && benchmarkAttribution && (
        <BenchmarkSection
          benchmarkAttribution={benchmarkAttribution}
          expandedSection={expandedSection}
          toggleSection={toggleSection}
        />
      )}

      {/* 4. Previous Portfolio Comparison — hidden when viewing a specific month */}
      {selectedMonth.isAccumulated && portfolioComparison && (
        <ComparisonSection
          portfolioComparison={portfolioComparison}
          expandedSection={expandedSection}
          toggleSection={toggleSection}
        />
      )}
    </div>
  );
}

// ============================================
// SUB-COMPONENTS
// ============================================

function AssetClassSection({
  instrumentBreakdown,
  assetClassAttribution,
  holdingReturnsData,
  expandedSection,
  toggleSection,
}: {
  instrumentBreakdown: AssetClassWithBreakdown[] | null;
  assetClassAttribution: ReturnType<typeof usePerformanceCalculations>["assetClassAttribution"];
  holdingReturnsData: HoldingReturnsData | null | undefined;
  expandedSection: string | null;
  toggleSection: (s: string) => void;
}) {
  return (
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
                                  .map((seg) => {
                                    const absTotal = cls.breakdown.reduce((s, b) => s + Math.abs(b.contribution), 0);
                                    const segPct = hasContribution && absTotal > 0
                                      ? (Math.abs(seg.contribution) / absTotal) * 100
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
  );
}

function PositionSection({
  selectedMonth,
  positionAttribution,
  activePositionData,
  isMonthLoading,
  firstSnapshot,
  expandedSection,
  toggleSection,
}: {
  selectedMonth: { isAccumulated: boolean };
  positionAttribution: PositionAttr[] | null;
  activePositionData: PositionAttr[] | null;
  isMonthLoading: boolean;
  firstSnapshot: { snapshot_date: string } | undefined;
  expandedSection: string | null;
  toggleSection: (s: string) => void;
}) {
  const displayPositions = selectedMonth.isAccumulated ? positionAttribution : activePositionData;
  const showSection = isMonthLoading || (displayPositions && displayPositions.length > 0);
  if (!showSection) return null;

  return (
    <div className="border-b border-gb-border">
      <button
        onClick={() => toggleSection("positions")}
        className="w-full px-6 py-4 flex items-center justify-between hover:bg-slate-50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-green-500" />
          <span className="font-medium text-sm text-gb-black">Por Posición Individual</span>
          {selectedMonth.isAccumulated && firstSnapshot && (
            <span className="text-xs text-gb-gray ml-1">
              (desde {formatDate(firstSnapshot.snapshot_date)})
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          {displayPositions && displayPositions.length > 0 && (() => {
            const totalContrib = displayPositions.reduce((s, p) => s + p.contribution, 0);
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
          {isMonthLoading ? (
            <div className="flex items-center justify-center py-8 gap-2">
              <Loader className="w-4 h-4 animate-spin text-gb-gray" />
              <span className="text-sm text-gb-gray">Cargando precios...</span>
            </div>
          ) : displayPositions && displayPositions.length > 0 ? (() => {
            const maxAbs = Math.max(...displayPositions.map(p => Math.abs(p.contribution)), 0.01);
            const hasNegative = displayPositions.some(p => p.contribution < 0);
            const scale = (val: number) => Math.max((Math.abs(val) / maxAbs) * (hasNegative ? 45 : 85), 3);
            const zeroOffset = hasNegative ? 50 : 0;

            return (
              <div className="space-y-3">
                {displayPositions.map((pos) => {
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
                  <span className={`text-sm font-bold ${displayPositions.reduce((s, p) => s + p.contribution, 0) >= 0 ? "text-green-600" : "text-red-600"}`}>
                    {formatPercent(displayPositions.reduce((s, p) => s + p.contribution, 0))}
                  </span>
                </div>
              </div>
            );
          })() : (
            <p className="text-sm text-gb-gray text-center py-8">
              No hay datos suficientes para este período
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function BenchmarkSection({
  benchmarkAttribution,
  expandedSection,
  toggleSection,
}: {
  benchmarkAttribution: NonNullable<ReturnType<typeof usePerformanceCalculations>["benchmarkAttribution"]>;
  expandedSection: string | null;
  toggleSection: (s: string) => void;
}) {
  return (
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
          <div className="grid grid-cols-2 gap-4">
            <div className="p-3 rounded-lg border border-gb-border text-center">
              <p className="text-xs text-gb-gray font-medium mb-1">Efecto Asignación</p>
              <p className={`text-lg font-bold ${benchmarkAttribution.allocationEffect >= 0 ? "text-green-600" : "text-red-600"}`}>
                {formatPercent(benchmarkAttribution.allocationEffect)}
              </p>
              <p className="text-xs text-gb-gray mt-1">Decisiones de peso por clase</p>
            </div>
            <div className="p-3 rounded-lg border border-gb-border text-center">
              <p className="text-xs text-gb-gray font-medium mb-1">Residual</p>
              <p className={`text-lg font-bold ${benchmarkAttribution.residual >= 0 ? "text-green-600" : "text-red-600"}`}>
                {formatPercent(benchmarkAttribution.residual)}
              </p>
              <p className="text-xs text-gb-gray mt-1">Selección + interacción</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ComparisonSection({
  portfolioComparison,
  expandedSection,
  toggleSection,
}: {
  portfolioComparison: NonNullable<ReturnType<typeof usePerformanceCalculations>["portfolioComparison"]>;
  expandedSection: string | null;
  toggleSection: (s: string) => void;
}) {
  return (
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
  );
}
