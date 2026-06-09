"use client";

import React, { useCallback } from "react";
import Link from "next/link";
import { formatNumber, formatCurrency } from "@/lib/format";
import EvolucionChart from "./EvolucionChart";

import AddSnapshotModal from "./AddSnapshotModal";
import ReviewSnapshotModal from "./ReviewSnapshotModal";
import PerformanceAttribution from "./PerformanceAttribution";
import RentabilidadPorActivo from "./RentabilidadPorActivo";
import RetornosComparados from "./RetornosComparados";
import ComparacionBar from "./ComparacionBar";
import HoldingReturnsPanel from "./HoldingReturnsPanel";

import BenchmarkConfig from "./BenchmarkConfig";
import BaselineComparison from "./BaselineComparison";
import RecommendationHistory from "./RecommendationHistory";
import ClientMonthlyClosing from "./ClientMonthlyClosing";
import PortfolioBreakdownPies from "./PortfolioBreakdownPies";
import CompositionBoxes from "./CompositionBoxes";
import CartolaHistory from "./CartolaHistory";
import RebalancingTable from "./RebalancingTable";
import SeguimientoSummaryCards from "./SeguimientoSummaryCards";
import SeguimientoHeader from "./SeguimientoHeader";
import MonthlyReportSection from "./MonthlyReportSection";
import SendSeguimientoModal from "./SendSeguimientoModal";
import { useExchangeRates } from "./hooks/useExchangeRates";
import { useHistoricalSeries } from "./hooks/useHistoricalSeries";
import { useBenchmarkConfig } from "./hooks/useBenchmarkConfig";
import { useSeguimientoData } from "./hooks/useSeguimientoData";
import { useSeguimientoEmail } from "./hooks/useSeguimientoEmail";
import {
  Loader,
  AlertTriangle,
} from "lucide-react";

// Re-export Snapshot type — canonical definition is in useSeguimientoData hook
export type { Snapshot } from "./hooks/useSeguimientoData";

interface Props {
  clientId: string;
  portalMode?: boolean;
}

export default function SeguimientoPage({ clientId, portalMode = false }: Props) {
  const seg = useSeguimientoData({ clientId, portalMode });

  const {
    benchmarkConfig, setBenchmarkConfig,
    benchmarkReturns, benchmarkLabel,
    baselineSeries, loadingBaseline,
    baselineMonthlyReturns, baselineAccReturn,
  } = useBenchmarkConfig({
    snapshots: seg.data?.snapshots,
    clientId,
    initialBenchmarkConfig: seg.data?.benchmarkConfig || null,
  });

  const {
    exchangeRates,
    deflatorData,
    cartolaExchangeRates,
    currentExchangeRates,
    findDeflatorValue,
    findDeflatorValueNext,
  } = useExchangeRates({
    snapshots: seg.data?.snapshots || [],
    livePriceDate: seg.livePriceDate,
  });

  const {
    historicalSeries,
    fundsMeta,
    loadingHistorical,
    backfillStatus,
    setBackfillStatus,
    periodReturns,
    accumulatedReturn,
    weightedTAC,
  } = useHistoricalSeries({
    snapshots: seg.data?.snapshots,
    portalMode,
    deflatorData,
    findDeflatorValue,
  });

  const convertFromCLP = useCallback((clpValue: number, rates: { uf: number; usd: number } | null): string => {
    if (!rates || seg.displayCurrency === "CLP") return formatCurrency(clpValue);
    if (seg.displayCurrency === "USD") return `USD ${formatNumber(clpValue / rates.usd, 0)}`;
    if (seg.displayCurrency === "UF") return `UF ${formatNumber(clpValue / rates.uf, 1)}`;
    return formatCurrency(clpValue);
  }, [seg.displayCurrency]);

  const email = useSeguimientoEmail({
    clientId,
    data: seg.data,
    holdingReturnsData: seg.holdingReturnsData,
    periodReturns,
    benchmarkReturns,
    benchmarkLabel,
    currentExchangeRates,
    exchangeRates,
    livePortfolioValue: seg.livePortfolioValue,
    displayCurrency: seg.displayCurrency,
    accumulatedReturn,
  });

  // Loading state
  if (seg.authLoading || seg.loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50">
        <div className="h-14 bg-white border-b border-gb-border" />
        <div className="max-w-6xl mx-auto px-5 py-8 animate-pulse">
          <div className="flex items-center justify-between mb-6">
            <div>
              <div className="h-4 w-32 bg-slate-200 rounded mb-2" />
              <div className="h-7 w-64 bg-slate-200 rounded" />
            </div>
            <div className="flex gap-2">
              <div className="h-9 w-28 bg-slate-200 rounded-md" />
              <div className="h-9 w-32 bg-slate-200 rounded-md" />
              <div className="h-9 w-36 bg-slate-200 rounded-md" />
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="bg-white rounded-lg border border-gb-border p-4 shadow-sm">
                <div className="h-3 w-20 bg-slate-200 rounded mb-2" />
                <div className="h-8 w-32 bg-slate-200 rounded mb-1" />
                <div className="h-3 w-24 bg-slate-200 rounded" />
              </div>
            ))}
          </div>
          <div className="bg-white rounded-lg border border-gb-border shadow-sm mb-6">
            <div className="px-6 py-4 border-b border-gb-border flex items-center justify-between">
              <div className="h-5 w-40 bg-slate-200 rounded" />
              <div className="flex gap-1">
                {[1, 2, 3, 4, 5].map((i) => (
                  <div key={i} className="h-7 w-10 bg-slate-200 rounded" />
                ))}
              </div>
            </div>
            <div className="p-6">
              <div className="h-64 bg-slate-100 rounded" />
            </div>
          </div>
          <div className="bg-white rounded-lg border border-gb-border shadow-sm">
            <div className="px-6 py-4 border-b border-gb-border">
              <div className="h-5 w-48 bg-slate-200 rounded" />
            </div>
            <div className="p-6 space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-12 bg-slate-100 rounded" />
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (seg.error || !seg.data) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50">
        <div className="max-w-6xl mx-auto px-5 py-8">
          <div className="text-center py-12">
            <AlertTriangle className="w-12 h-12 text-amber-500 mx-auto mb-4" />
            <p className="text-gb-gray">{seg.error || "No se encontraron datos"}</p>
            {!portalMode && (
              <Link href={`/clients/${clientId}`} className="text-sm text-gb-accent hover:underline mt-2 inline-block">
                Volver al cliente
              </Link>
            )}
          </div>
        </div>
      </div>
    );
  }

  const { client, snapshots, metrics } = seg.data;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50">
      <div className="max-w-6xl mx-auto px-5 py-8">
        {/* Header */}
        <SeguimientoHeader
          clientId={clientId}
          clientName={`${client.nombre} ${client.apellido}`}
          portalMode={portalMode}
          loading={seg.loading}
          fillingPrices={seg.fillingPrices}
          snapshotsExist={snapshots.length > 0}
          onRefresh={seg.fetchData}
          onOpenSendModal={email.openSendModal}
          onFillPrices={() => seg.handleFillPrices(false)}
          onAddSnapshot={() => seg.setShowAddModal(true)}
        />

        {/* Fill prices result banner */}
        {!portalMode && seg.fillResult && (
          <div
            className={`mb-4 px-4 py-3 rounded-lg text-sm flex items-center justify-between ${
              seg.fillResult.startsWith("Error")
                ? "bg-red-50 border border-red-200 text-red-700"
                : "bg-green-50 border border-green-200 text-green-700"
            }`}
          >
            <span>{seg.fillResult}</span>
            <button
              onClick={() => { seg.setFillResult(null); seg.setFillDetails(null); }}
              className="text-current opacity-60 hover:opacity-100 ml-4"
            >
              &times;
            </button>
          </div>
        )}

        {/* Fill prices holding match details */}
        {!portalMode && seg.fillDetails && seg.fillDetails.length > 0 && (
          <div className="mb-4 bg-white border border-gb-border rounded-lg p-4 text-xs">
            <p className="font-semibold text-gb-black mb-2">Detalle de matching de holdings:</p>
            <div className="grid gap-1">
              {seg.fillDetails.map((h, i) => (
                <div key={i} className="flex items-center gap-2">
                  <span className={`inline-block w-2 h-2 rounded-full ${
                    h.source === "fintual" ? "bg-green-500" :
                    h.source === "yahoo" ? "bg-blue-500" :
                    h.source === "bolsa_santiago" ? "bg-yellow-500" :
                    h.source === "alphavantage" ? "bg-purple-500" : "bg-red-400"
                  }`} />
                  <span className="text-gb-black font-medium truncate max-w-[300px]">{h.name}</span>
                  {h.securityId && <span className="text-gb-gray">({h.securityId})</span>}
                  <span className="text-gb-gray">→</span>
                  <span className={`font-medium ${h.source === "none" ? "text-red-600" : "text-green-700"}`}>
                    {h.source === "none" ? "Sin fuente" : `${h.source}: ${h.sourceId}`}
                  </span>
                </div>
              ))}
            </div>
            <button
              onClick={() => seg.setFillDetails(null)}
              className="mt-2 text-gb-gray hover:text-gb-black text-xs underline"
            >
              Ocultar detalle
            </button>
          </div>
        )}

        {/* Summary cards */}
        {metrics && (
          <SeguimientoSummaryCards
            metrics={metrics}
            cartolaExchangeRates={cartolaExchangeRates}
            currentExchangeRates={currentExchangeRates}
            exchangeRates={exchangeRates}
            livePortfolioValue={seg.livePortfolioValue}
            livePriceDate={seg.livePriceDate}
            historicalSeries={historicalSeries}
            snapshots={snapshots}
            displayCurrency={seg.displayCurrency}
            setDisplayCurrency={seg.setDisplayCurrency}
            weightedTAC={weightedTAC}
            baselineAccReturn={baselineAccReturn}
            convertFromCLP={convertFromCLP}
            periodReturns={periodReturns}
          />
        )}

        {/* Composition breakdown with initial → final + sub-breakdown */}
        {seg.holdingReturnsData && snapshots.length > 0 && (
          <CompositionBoxes
            holdingReturnsData={seg.holdingReturnsData}
            snapshots={snapshots}
            compositionBaseMode={seg.compositionBaseMode}
            compositionBaseDate={seg.compositionBaseDate}
            onBaseModeChange={seg.setCompositionBaseMode}
            onBaseDateChange={seg.setCompositionBaseDate}
            convertFromCLP={convertFromCLP}
            cartolaExchangeRates={cartolaExchangeRates}
            currentExchangeRates={currentExchangeRates}
            exchangeRates={exchangeRates}
          />
        )}

        {/* Holding Returns Panel */}
        {snapshots.length > 0 && (
          <HoldingReturnsPanel snapshots={snapshots} clientId={clientId} onCurrentValueUpdate={seg.setLivePortfolioValue} onPriceDateUpdate={seg.setLivePriceDate} onHoldingReturnsReady={seg.setHoldingReturnsData} fundsMeta={fundsMeta} usdRate={(currentExchangeRates || exchangeRates)?.usd} ufRate={(currentExchangeRates || exchangeRates)?.uf} ufRateInitial={deflatorData ? findDeflatorValue(deflatorData.uf, snapshots[0]?.snapshot_date) ?? undefined : undefined} />
        )}

        {/* Evolution chart */}
        {snapshots.length > 0 && (
          <div className="bg-white rounded-lg border border-gb-border shadow-sm mb-6">
            <div className="px-6 py-4 border-b border-gb-border flex items-center justify-between">
              <h2 className="text-base font-semibold text-gb-black">Evolución del Portafolio</h2>
              <div className="flex gap-1">
                {["1M", "3M", "6M", "1Y", "ALL"].map((p) => (
                  <button
                    key={p}
                    onClick={() => seg.setPeriod(p)}
                    className={`px-3 py-1 text-xs font-medium rounded transition-colors ${
                      seg.period === p
                        ? "bg-blue-600 text-white"
                        : "text-gb-gray hover:bg-slate-100"
                    }`}
                  >
                    {p === "ALL" ? "Todo" : p}
                  </button>
                ))}
              </div>
            </div>
            <div className="p-6">
              {backfillStatus && (
                <div className="mb-3 flex items-center gap-2 px-3 py-2 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-700">
                  <Loader className="w-4 h-4 animate-spin flex-shrink-0" />
                  {backfillStatus}
                </div>
              )}
              {fundsMeta.filter(f => f.stale).length > 0 && (
                <div className="mb-3 px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-700">
                  <p className="font-medium mb-1">Fondos sin precio reciente:</p>
                  {fundsMeta.filter(f => f.stale).map(f => (
                    <p key={f.fundName} className="text-xs">
                      {f.fundName} (RUN {f.run}, serie {f.serie}) — último precio: {f.lastPriceDate || "sin datos"}
                    </p>
                  ))}
                  <p className="text-xs mt-1 text-amber-600">Esto puede afectar las rentabilidades calculadas y el gráfico.</p>
                </div>
              )}
              <EvolucionChart
                snapshots={seg.chartSnapshots}
                historicalSeries={historicalSeries}
                baselineSeries={baselineSeries || undefined}
                loadingHistorical={loadingHistorical}
                period={seg.period}
              />
            </div>
          </div>
        )}

        {/* Comparison with recommendation */}
        {seg.recommendation && metrics?.composition && (
          <div className="mb-6">
            <ComparacionBar
              recommendation={seg.recommendation}
              actual={metrics.composition}
              totalValue={metrics.currentValue}
            />
          </div>
        )}

        {/* Per-holding rebalancing table + execution history */}
        {!portalMode && (
          <RebalancingTable
            recommendation={seg.recommendation}
            latestSnapshotHoldings={snapshots.length > 0 ? (snapshots[snapshots.length - 1].holdings as any) : null}
            clientId={clientId}
            executions={seg.executions}
            onExecutionSaved={seg.fetchExecutions}
          />
        )}

        {/* Baseline vs Current comparison */}
        {!portalMode && (() => {
          const baseline = snapshots.find(s => s.is_baseline);
          const latest = snapshots.length > 0 ? snapshots[snapshots.length - 1] : null;
          if (baseline && latest && baseline.id !== latest.id) {
            return (
              <div className="mb-6">
                <BaselineComparison baseline={baseline} current={latest} />
              </div>
            );
          }
          return null;
        })()}

        {/* Recommendation version history */}
        {!portalMode && (
          <div className="mb-6">
            <RecommendationHistory clientId={clientId} />
          </div>
        )}

        {/* Explicación de Resultados — AI-generated monthly closing */}
        {!portalMode && snapshots.length > 0 && (
          <ClientMonthlyClosing
            clientId={clientId}
            month={(() => {
              const now = new Date();
              const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
              return `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, "0")}`;
            })()}
          />
        )}

        {/* Portfolio Breakdown — asset class & currency pie charts */}
        {snapshots.length > 0 && (() => {
          if (seg.holdingReturnsData) {
            const all: Array<{ fundName: string; marketValue: number; assetClass?: string; currency?: string }> = [
              ...seg.holdingReturnsData.equityHoldings.map(h => ({ fundName: h.fundName, marketValue: h.marketValue, assetClass: h.assetClass || "equity", currency: h.currency })),
              ...seg.holdingReturnsData.fixedIncomeFundHoldings.map(h => ({ fundName: h.fundName, marketValue: h.marketValue, assetClass: h.assetClass || "fixedIncome", currency: h.currency })),
              ...seg.holdingReturnsData.alternativesHoldings.map(h => ({ fundName: h.fundName, marketValue: h.marketValue, assetClass: h.assetClass || "alternatives", currency: h.currency })),
              ...seg.holdingReturnsData.bondHoldings.map(h => ({ fundName: h.fundName, marketValue: h.marketValue, assetClass: "fixedIncome", currency: h.currency || "USD" })),
            ];
            if (seg.holdingReturnsData.cashValue > 0) {
              all.push({ fundName: "Caja", marketValue: seg.holdingReturnsData.cashValue, assetClass: "cash", currency: "CLP" });
            }
            return <PortfolioBreakdownPies holdings={all} />;
          }
          const latest = snapshots[snapshots.length - 1];
          if (!latest.holdings) return null;
          const fallback = (latest.holdings as Array<{ fundName: string; marketValue: number; marketValueCLP?: number; assetClass?: string; currency?: string }>).map(h => ({
            fundName: h.fundName,
            marketValue: h.marketValueCLP || h.marketValue,
            assetClass: h.assetClass,
            currency: h.currency,
          }));
          return <PortfolioBreakdownPies holdings={fallback} />;
        })()}

        {/* Rentabilidad por Activo — returns per holding with month selector */}
        {seg.holdingReturnsData && (
          <RentabilidadPorActivo
            holdingReturnsData={seg.holdingReturnsData}
            snapshots={snapshots}
            historicalAccumulatedReturn={accumulatedReturn}
          />
        )}

        {/* Retornos Comparados — monthly portfolio vs benchmark */}
        {(snapshots.length >= 2 || historicalSeries.length > 1) && (
          <>
            {!portalMode && (
              <div className="flex items-center justify-between mb-2">
                <BenchmarkConfig clientId={clientId} onBenchmarkChange={setBenchmarkConfig} />
              </div>
            )}
            <RetornosComparados
              snapshots={seg.data.snapshots.filter((s) => s.source !== "api-prices")}
              historicalSeries={historicalSeries}
              benchmarkLabel={benchmarkLabel}
              benchmarkReturns={benchmarkReturns || undefined}
              benchmarkMonthlyReturn={!benchmarkReturns ? 0.5 : undefined}
              comparisonLabel="Portfolio Inicial"
              comparisonReturns={baselineMonthlyReturns}
            />
          </>
        )}

        {/* Performance Attribution */}
        {(snapshots.length >= 2 || seg.holdingReturnsData) && (
          <PerformanceAttribution
            snapshots={snapshots}
            recommendation={seg.recommendation}
            previousPortfolio={snapshots.find(s => s.is_baseline) || null}
            totalReturn={accumulatedReturn ?? metrics?.totalReturn}
            holdingReturnsData={seg.holdingReturnsData}
          />
        )}

        {/* Reporte Mensual de Mercados */}
        {!portalMode && (
          <MonthlyReportSection
            currentMonth={(() => {
              const latestCartola = snapshots.find(s => s.source === "statement" || s.source === "manual" || s.source === "excel");
              if (latestCartola) {
                return latestCartola.snapshot_date.slice(0, 7);
              }
              const now = new Date();
              return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
            })()}
          />
        )}

        {/* Cartolas ingresadas + empty state */}
        {!portalMode && (
          <CartolaHistory
            snapshots={snapshots}
            onEdit={seg.setEditingSnapshot}
            onDelete={seg.handleDeleteSnapshot}
            onDeleteAll={seg.handleDeleteAllSnapshots}
            onSetBaseline={seg.handleSetBaseline}
            onAddFirst={() => seg.setShowAddModal(true)}
          />
        )}
      </div>

      {/* Add snapshot modal */}
      {!portalMode && seg.showAddModal && (
        <AddSnapshotModal
          clientId={clientId}
          onClose={() => seg.setShowAddModal(false)}
          onSuccess={seg.handleSnapshotAdded}
        />
      )}

      {/* Edit snapshot modal */}
      {!portalMode && seg.editingSnapshot && (
        <ReviewSnapshotModal
          clientId={clientId}
          parsedData={{
            holdings: (seg.editingSnapshot.holdings as Array<{
              fundName: string;
              quantity?: number;
              marketPrice?: number;
              marketValue: number;
              assetClass?: string;
              currency?: string;
            }>) || [],
          }}
          editMode={true}
          existingSnapshot={{
            id: seg.editingSnapshot.id,
            snapshot_date: seg.editingSnapshot.snapshot_date,
            total_value: seg.editingSnapshot.total_value,
            holdings: (seg.editingSnapshot.holdings as Array<{
              fundName: string;
              quantity?: number;
              marketPrice?: number;
              marketValue: number;
              assetClass?: string;
              currency?: string;
            }>) || [],
          }}
          onClose={() => seg.setEditingSnapshot(null)}
          onSuccess={seg.handleSnapshotUpdated}
        />
      )}
      {!portalMode && email.showSendModal && (() => {
        const emailData = email.assembleSeguimientoData();
        if (!emailData) return null;
        return (
          <SendSeguimientoModal
            isOpen={email.showSendModal}
            onClose={() => email.setShowSendModal(false)}
            clientId={clientId}
            clientEmail={email.clientEmail}
            seguimientoData={emailData}
          />
        );
      })()}
    </div>
  );
}
