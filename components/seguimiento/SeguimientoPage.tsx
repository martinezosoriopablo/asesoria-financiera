"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import Link from "next/link";
import AdvisorHeader from "@/components/shared/AdvisorHeader";
import { useAdvisor } from "@/lib/hooks/useAdvisor";
import { formatNumber, formatCurrency, formatPercent, formatDate } from "@/lib/format";
import EvolucionChart from "./EvolucionChart";
import SnapshotsTable from "./SnapshotsTable";
import AddSnapshotModal from "./AddSnapshotModal";
import ReviewSnapshotModal from "./ReviewSnapshotModal";
import PerformanceAttribution from "./PerformanceAttribution";
import ComparacionBar from "./ComparacionBar";
import HoldingReturnsPanel from "./HoldingReturnsPanel";
import HoldingDiagnosticPanel from "./HoldingDiagnosticPanel";
import BaselineComparison from "./BaselineComparison";
import RecommendationHistory from "./RecommendationHistory";
import {
  ArrowLeft,
  Loader,
  Plus,
  TrendingUp,
  Calendar,
  RefreshCw,
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  FileText,
  Trash2,
  CheckCircle2,
} from "lucide-react";

interface Client {
  id: string;
  nombre: string;
  apellido: string;
  email: string;
  cartera_recomendada?: {
    equity_percent?: number;
    fixed_income_percent?: number;
    alternatives_percent?: number;
    cash_percent?: number;
  };
}

export interface Snapshot {
  id: string;
  client_id: string;
  snapshot_date: string;
  total_value: number;
  total_cost_basis: number | null;
  unrealized_gain_loss: number | null;
  equity_percent: number;
  fixed_income_percent: number;
  alternatives_percent: number;
  cash_percent: number;
  equity_value: number;
  fixed_income_value: number;
  alternatives_value: number;
  cash_value: number;
  holdings: unknown[] | null;
  daily_return: number;
  cumulative_return: number;
  deposits?: number;
  withdrawals?: number;
  net_cash_flow?: number;
  twr_period?: number;
  twr_cumulative?: number;
  total_cuotas?: number;
  cuotas_change?: number;
  source: string;
  is_baseline?: boolean;
  created_at: string;
}

interface Metrics {
  totalReturn: number;
  annualizedReturn: number;
  twr: number;
  twrAnnualized: number;
  volatility: number;
  maxDrawdown: number;
  sharpeRatio: number;
  currentValue: number;
  initialValue: number;
  unrealizedGainLoss: number | null;
  dataPoints: number;
  periodDays: number;
  totalDeposits?: number;
  totalWithdrawals?: number;
  netCashFlow?: number;
  composition: {
    equity: number;
    fixedIncome: number;
    alternatives: number;
    cash: number;
  };
}

interface SeguimientoData {
  snapshots: Snapshot[];
  metrics: Metrics | null;
  recommendation: Client["cartera_recomendada"] | null;
  client: Client;
}

interface Props {
  clientId: string;
}

export default function SeguimientoPage({ clientId }: Props) {
  const { advisor, loading: authLoading } = useAdvisor();
  const [data, setData] = useState<SeguimientoData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [period, setPeriod] = useState("ALL");
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingSnapshot, setEditingSnapshot] = useState<Snapshot | null>(null);
  const [fillingPrices, setFillingPrices] = useState(false);
  const [fillResult, setFillResult] = useState<string | null>(null);
  const [fillDetails, setFillDetails] = useState<Array<{ name: string; securityId?: string | null; source: string; sourceId: string | null }> | null>(null);
  const [showAllSnapshots, setShowAllSnapshots] = useState(false);
  const [executions, setExecutions] = useState<Array<{
    id: string; ticker: string; nombre: string; asset_class: string;
    action: string; target_percent: number | null; actual_percent: number | null;
    amount: number | null; units: number | null; notes: string | null;
    executed_at: string; created_at: string;
  }>>([]);
  const [savingExecution, setSavingExecution] = useState(false);
  const [showExecutions, setShowExecutions] = useState(false);

  const fetchExecutions = useCallback(async () => {
    try {
      const res = await fetch(`/api/clients/${clientId}/rebalance-executions`);
      const result = await res.json();
      if (result.executions) setExecutions(result.executions);
    } catch (err) {
      console.error("Error fetching executions:", err);
    }
  }, [clientId]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      // Always fetch ALL data — period filtering is done client-side for the chart
      const res = await fetch(`/api/clients/${clientId}/seguimiento?period=ALL`);
      const result = await res.json();

      if (result.success) {
        setData(result.data);
      } else {
        setError(result.error || "Error al cargar datos");
      }
    } catch (err) {
      console.error("Error fetching seguimiento:", err);
      setError("Error de conexión");
    } finally {
      setLoading(false);
    }
  }, [clientId]);

  useEffect(() => {
    fetchData();
    fetchExecutions();
  }, [fetchData, fetchExecutions]);

  const handleSnapshotAdded = () => {
    setShowAddModal(false);
    fetchData();
  };

  const handleSnapshotUpdated = () => {
    setEditingSnapshot(null);
    fetchData();
  };

  const handleFillPrices = async () => {
    if (fillingPrices) return;
    setFillingPrices(true);
    setFillResult(null);
    setFillDetails(null);
    try {
      const res = await fetch("/api/portfolio/fill-prices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId }),
      });
      const result = await res.json();
      if (result.success) {
        const matches = result.result.holdingMatches || [];
        const matched = matches.filter((m: { source: string }) => m.source !== "none").length;
        const errors = result.result.errors || [];
        const warnings = result.result.warnings || [];
        let msg = `${result.result.filled} snapshots creados (${matched}/${matches.length} holdings con precios)`;
        if (errors.length > 0) msg += ` — ${errors.length} errores`;
        if (warnings.length > 0) console.log(`Fill-prices: ${warnings.length} price warnings (normal)`, warnings.slice(0, 5));
        setFillResult(msg);
        setFillDetails(matches);
        fetchData();
      } else {
        setFillResult(`Error: ${result.error}`);
      }
    } catch {
      setFillResult("Error de conexión");
    } finally {
      setFillingPrices(false);
    }
  };

  const handleDeleteSnapshot = async (snapshotId: string) => {
    if (!confirm("¿Eliminar este snapshot y sus snapshots interpolados?")) return;

    try {
      const res = await fetch(`/api/portfolio/snapshots/${snapshotId}`, {
        method: "DELETE",
      });
      const result = await res.json();

      if (result.success) {
        fetchData();
      } else {
        alert("Error al eliminar: " + result.error);
      }
    } catch (err) {
      console.error("Error deleting snapshot:", err);
      alert("Error al eliminar snapshot");
    }
  };

  const handleSetBaseline = async (snapshotId: string) => {
    const snap = data?.snapshots.find(s => s.id === snapshotId);
    if (snap?.is_baseline) return; // Already baseline

    try {
      const res = await fetch(`/api/portfolio/snapshots/${snapshotId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_baseline: true }),
      });
      const result = await res.json();
      if (result.success) {
        fetchData();
      }
    } catch {
      // silent
    }
  };

  const handleDeleteAllSnapshots = async () => {
    if (!confirm("¿Eliminar TODOS los snapshots de este cliente? Esta acción no se puede deshacer.")) return;

    try {
      const res = await fetch(`/api/clients/${clientId}/snapshots`, {
        method: "DELETE",
      });
      const result = await res.json();

      if (result.success) {
        fetchData();
      } else {
        alert("Error: " + result.error);
      }
    } catch (err) {
      console.error("Error deleting all snapshots:", err);
      alert("Error al eliminar snapshots");
    }
  };

  // Filter snapshots for chart display based on selected period (must be before early returns)
  const chartSnapshots = useMemo(() => {
    const snaps = data?.snapshots || [];
    if (period === "ALL" || snaps.length === 0) return snaps;
    const now = new Date();
    const startDate = new Date();
    switch (period) {
      case "1M": startDate.setMonth(now.getMonth() - 1); break;
      case "3M": startDate.setMonth(now.getMonth() - 3); break;
      case "6M": startDate.setMonth(now.getMonth() - 6); break;
      case "1Y": startDate.setFullYear(now.getFullYear() - 1); break;
      default: return snaps;
    }
    const startStr = startDate.toISOString().split("T")[0];
    return snaps.filter(s => s.snapshot_date >= startStr);
  }, [data?.snapshots, period]);

  if (authLoading || loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50">
        <div className="h-14 bg-white border-b border-gb-border" />
        <div className="max-w-6xl mx-auto px-5 py-8 animate-pulse">
          {/* Header skeleton */}
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
          {/* Metric cards skeleton */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="bg-white rounded-lg border border-gb-border p-4 shadow-sm">
                <div className="h-3 w-20 bg-slate-200 rounded mb-2" />
                <div className="h-8 w-32 bg-slate-200 rounded mb-1" />
                <div className="h-3 w-24 bg-slate-200 rounded" />
              </div>
            ))}
          </div>
          {/* Chart skeleton */}
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
          {/* Table skeleton */}
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

  if (error || !data) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50">
        {advisor && (
          <AdvisorHeader
            advisorName={advisor.name}
            advisorEmail={advisor.email}
            advisorPhoto={advisor.photo}
            advisorLogo={advisor.logo}
            companyName={advisor.companyName}
            isAdmin={advisor.isAdmin}
          />
        )}
        <div className="max-w-6xl mx-auto px-5 py-8">
          <div className="text-center py-12">
            <AlertTriangle className="w-12 h-12 text-amber-500 mx-auto mb-4" />
            <p className="text-gb-gray">{error || "No se encontraron datos"}</p>
            <Link href={`/clients/${clientId}`} className="text-sm text-gb-accent hover:underline mt-2 inline-block">
              Volver al cliente
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const { client, snapshots, metrics, recommendation } = data;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50">
      {advisor && (
        <AdvisorHeader
          advisorName={advisor.name}
          advisorEmail={advisor.email}
          advisorPhoto={advisor.photo}
          advisorLogo={advisor.logo}
          companyName={advisor.companyName}
          isAdmin={advisor.isAdmin}
        />
      )}

      <div className="max-w-6xl mx-auto px-5 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <Link
              href={`/clients/${clientId}`}
              className="inline-flex items-center gap-1 text-sm text-gb-gray hover:text-gb-black mb-2"
            >
              <ArrowLeft className="w-4 h-4" />
              {client.nombre} {client.apellido}
            </Link>
            <h1 className="text-2xl font-semibold text-gb-black">
              Seguimiento de Cartolas
            </h1>
          </div>
          <div className="flex gap-2">
            <button
              onClick={fetchData}
              disabled={loading}
              className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium border border-slate-200 text-slate-600 rounded-md hover:bg-slate-50 transition-colors"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
              Actualizar
            </button>
            <button
              onClick={handleFillPrices}
              disabled={fillingPrices || snapshots.length === 0}
              className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium border border-amber-300 text-amber-700 bg-amber-50 rounded-md hover:bg-amber-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed relative group"
              title="Fuentes: Fintual API > CMF/AAFM > Manual. Interpola precios entre cartolas."
            >
              <TrendingUp className={`w-4 h-4 ${fillingPrices ? "animate-pulse" : ""}`} />
              {fillingPrices ? "Llenando..." : "Llenar Precios"}
            </button>
            <button
              onClick={() => setShowAddModal(true)}
              className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
            >
              <Plus className="w-4 h-4" />
              Agregar Cartola
            </button>
          </div>
        </div>

        {/* Fill prices result banner */}
        {fillResult && (
          <div
            className={`mb-4 px-4 py-3 rounded-lg text-sm flex items-center justify-between ${
              fillResult.startsWith("Error")
                ? "bg-red-50 border border-red-200 text-red-700"
                : "bg-green-50 border border-green-200 text-green-700"
            }`}
          >
            <span>{fillResult}</span>
            <button
              onClick={() => { setFillResult(null); setFillDetails(null); }}
              className="text-current opacity-60 hover:opacity-100 ml-4"
            >
              &times;
            </button>
          </div>
        )}

        {/* Fill prices holding match details */}
        {fillDetails && fillDetails.length > 0 && (
          <div className="mb-4 bg-white border border-gb-border rounded-lg p-4 text-xs">
            <p className="font-semibold text-gb-black mb-2">Detalle de matching de holdings:</p>
            <div className="grid gap-1">
              {fillDetails.map((h, i) => (
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
              onClick={() => setFillDetails(null)}
              className="mt-2 text-gb-gray hover:text-gb-black text-xs underline"
            >
              Ocultar detalle
            </button>
          </div>
        )}

        {/* Summary cards */}
        {metrics && (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
            {/* Current value */}
            <div className="bg-white rounded-lg border border-gb-border p-4 shadow-sm">
              <p className="text-xs text-gb-gray font-medium uppercase mb-1">Valor Total</p>
              <p className="text-2xl font-bold text-gb-black">
                {formatCurrency(metrics.currentValue)}
              </p>
              {snapshots.length > 0 && (
                <p className="text-xs text-gb-gray mt-1">
                  <Calendar className="w-3 h-3 inline mr-1" />
                  {formatDate(snapshots[snapshots.length - 1].snapshot_date)}
                </p>
              )}
            </div>

            {/* Period return - TWR */}
            <div className="bg-white rounded-lg border border-gb-border p-4 shadow-sm">
              <p className="text-xs text-gb-gray font-medium uppercase mb-1">TWR</p>
              <p className={`text-2xl font-bold ${(metrics.twr || metrics.totalReturn) >= 0 ? "text-green-600" : "text-red-600"}`}>
                {formatPercent(metrics.twr || metrics.totalReturn)}
              </p>
              <p className="text-xs text-gb-gray mt-1">
                {metrics.periodDays > 0 ? `${metrics.periodDays} días` : "Sin período"}
                {metrics.netCashFlow && metrics.netCashFlow !== 0 && (
                  <span className="ml-1">
                    (Flujo: {metrics.netCashFlow >= 0 ? "+" : ""}{formatCurrency(metrics.netCashFlow)})
                  </span>
                )}
              </p>
            </div>

            {/* Volatility */}
            <div className="bg-white rounded-lg border border-gb-border p-4 shadow-sm">
              <p className="text-xs text-gb-gray font-medium uppercase mb-1">Volatilidad</p>
              <p className="text-2xl font-bold text-gb-black">
                {formatNumber(metrics.volatility, 1)}%
              </p>
              <p className="text-xs text-gb-gray mt-1">Anualizada</p>
            </div>

            {/* Cash Flows */}
            <div className="bg-white rounded-lg border border-gb-border p-4 shadow-sm">
              <p className="text-xs text-gb-gray font-medium uppercase mb-1">Flujos de Caja</p>
              {metrics.totalDeposits || metrics.totalWithdrawals ? (
                <div>
                  {metrics.totalDeposits ? (
                    <p className="text-sm font-semibold text-green-600">
                      + {formatCurrency(metrics.totalDeposits)}
                    </p>
                  ) : null}
                  {metrics.totalWithdrawals ? (
                    <p className="text-sm font-semibold text-red-600">
                      - {formatCurrency(metrics.totalWithdrawals)}
                    </p>
                  ) : null}
                </div>
              ) : (
                <p className="text-2xl font-bold text-gb-black">-</p>
              )}
              <p className="text-xs text-gb-gray mt-1">{snapshots.length} snapshots</p>
            </div>
          </div>
        )}

        {/* Composition breakdown with values */}
        {metrics && snapshots.length > 0 && (() => {
          const latest = snapshots[snapshots.length - 1];
          return (
            <div className="grid grid-cols-4 gap-3 mb-6">
              <div className="bg-blue-50 rounded-lg border border-blue-200 p-3">
                <p className="text-xs text-blue-600 font-medium">Renta Variable</p>
                <p className="text-lg font-bold text-blue-800">{formatCurrency(latest.equity_value || 0)}</p>
                <p className="text-xs text-blue-600">{formatNumber(latest.equity_percent || 0, 1)}%</p>
              </div>
              <div className="bg-green-50 rounded-lg border border-green-200 p-3">
                <p className="text-xs text-green-600 font-medium">Renta Fija</p>
                <p className="text-lg font-bold text-green-800">{formatCurrency(latest.fixed_income_value || 0)}</p>
                <p className="text-xs text-green-600">{formatNumber(latest.fixed_income_percent || 0, 1)}%</p>
              </div>
              <div className="bg-orange-50 rounded-lg border border-orange-200 p-3">
                <p className="text-xs text-orange-600 font-medium">Alternativos</p>
                <p className="text-lg font-bold text-orange-800">{formatCurrency(latest.alternatives_value || 0)}</p>
                <p className="text-xs text-orange-600">{formatNumber(latest.alternatives_percent || 0, 1)}%</p>
              </div>
              <div className="bg-slate-50 rounded-lg border border-slate-200 p-3">
                <p className="text-xs text-slate-600 font-medium">Caja</p>
                <p className="text-lg font-bold text-slate-800">{formatCurrency(latest.cash_value || 0)}</p>
                <p className="text-xs text-slate-600">{formatNumber(latest.cash_percent || 0, 1)}%</p>
              </div>
            </div>
          );
        })()}

        {/* Evolution chart */}
        {snapshots.length > 0 && (
          <div className="bg-white rounded-lg border border-gb-border shadow-sm mb-6">
            <div className="px-6 py-4 border-b border-gb-border flex items-center justify-between">
              <h2 className="text-base font-semibold text-gb-black">Evolución del Portafolio</h2>
              <div className="flex gap-1">
                {["1M", "3M", "6M", "1Y", "ALL"].map((p) => (
                  <button
                    key={p}
                    onClick={() => setPeriod(p)}
                    className={`px-3 py-1 text-xs font-medium rounded transition-colors ${
                      period === p
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
              <EvolucionChart snapshots={chartSnapshots} />
            </div>
          </div>
        )}

        {/* Comparison with recommendation */}
        {recommendation && metrics?.composition && (
          <div className="mb-6">
            <ComparacionBar
              recommendation={recommendation}
              actual={metrics.composition}
              totalValue={metrics.currentValue}
            />
          </div>
        )}

        {/* Per-holding rebalancing table */}
        {(() => {
          const rec = recommendation as { cartera?: Array<{ ticker: string; nombre: string; clase: string; porcentaje: number }> } | null;
          const latestSnap = snapshots.length > 0 ? snapshots[snapshots.length - 1] : null;
          const cartera = rec?.cartera;

          if (!cartera || cartera.length === 0 || !latestSnap?.holdings) return null;

          const holdings = latestSnap.holdings as Array<{
            securityId?: string; fundName?: string; name?: string; nombre?: string;
            assetClass?: string; tipo?: string; marketValue?: number; marketValueCLP?: number;
            valor?: number; percentOfPortfolio?: number;
          }>;

          // Build rebalancing rows
          const rows: Array<{
            nombre: string; ticker: string; clase: string;
            actualPct: number; recomPct: number; diffPct: number;
            action: "comprar" | "vender" | "mantener";
          }> = [];

          // Match recommended positions to actual
          cartera.forEach(pos => {
            const match = holdings.find(h =>
              h.securityId === pos.ticker ||
              (h.fundName || h.name || h.nombre || "").toLowerCase().includes(pos.nombre.toLowerCase().substring(0, 10))
            );
            const actualPct = match?.percentOfPortfolio || 0;
            const diffPct = pos.porcentaje - actualPct;
            rows.push({
              nombre: pos.nombre,
              ticker: pos.ticker,
              clase: pos.clase,
              actualPct,
              recomPct: pos.porcentaje,
              diffPct,
              action: Math.abs(diffPct) < 1 ? "mantener" : diffPct > 0 ? "comprar" : "vender",
            });
          });

          // Holdings in actual but not recommended (sell)
          holdings.forEach(h => {
            const pct = h.percentOfPortfolio || 0;
            if (pct < 0.5) return;
            const name = h.fundName || h.name || h.nombre || "";
            const inRec = cartera.some(pos =>
              pos.ticker === h.securityId ||
              name.toLowerCase().includes(pos.nombre.toLowerCase().substring(0, 10))
            );
            if (!inRec) {
              rows.push({
                nombre: name || "Desconocido",
                ticker: h.securityId || "—",
                clase: h.assetClass || h.tipo || "—",
                actualPct: pct,
                recomPct: 0,
                diffPct: -pct,
                action: "vender",
              });
            }
          });

          if (rows.length === 0) return null;

          const sortedRows = rows.sort((a, b) => Math.abs(b.diffPct) - Math.abs(a.diffPct));

          return (
            <div className="mb-6">
              <div className="bg-white rounded-lg border border-blue-200 shadow-sm">
                <div className="px-6 py-4 border-b border-blue-200 bg-blue-50 flex items-center justify-between">
                  <h2 className="text-base font-semibold text-gb-black flex items-center gap-2">
                    <RefreshCw className="w-4 h-4 text-blue-500" />
                    Rebalanceo por Instrumento
                  </h2>
                  <div className="flex items-center gap-3 text-xs">
                    <span className="flex items-center gap-1">
                      <span className="w-2 h-2 rounded-full bg-green-500" />
                      {rows.filter(r => r.action === "comprar").length} comprar
                    </span>
                    <span className="flex items-center gap-1">
                      <span className="w-2 h-2 rounded-full bg-red-500" />
                      {rows.filter(r => r.action === "vender").length} vender
                    </span>
                    <span className="flex items-center gap-1">
                      <span className="w-2 h-2 rounded-full bg-gray-400" />
                      {rows.filter(r => r.action === "mantener").length} mantener
                    </span>
                  </div>
                </div>
                <div className="p-4 overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-200">
                        <th className="text-left py-2 px-3 text-gb-gray font-medium">Instrumento</th>
                        <th className="text-left py-2 px-3 text-gb-gray font-medium">Clase</th>
                        <th className="text-right py-2 px-3 text-gb-gray font-medium">Actual %</th>
                        <th className="text-right py-2 px-3 text-gb-gray font-medium">Recom. %</th>
                        <th className="text-right py-2 px-3 text-gb-gray font-medium">Diferencia</th>
                        <th className="text-center py-2 px-3 text-gb-gray font-medium">Accion</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sortedRows.map((row, idx) => (
                        <tr key={idx} className="border-b border-gray-100 hover:bg-gray-50">
                          <td className="py-2.5 px-3">
                            <div className="font-medium text-gb-black text-xs">{row.nombre}</div>
                            <div className="text-xs text-gb-gray">{row.ticker}</div>
                          </td>
                          <td className="py-2.5 px-3">
                            <span className={`text-xs px-2 py-0.5 rounded-full ${
                              row.clase === "Renta Variable" || row.clase === "Equity" ? "bg-blue-100 text-blue-700" :
                              row.clase === "Renta Fija" || row.clase === "Fixed Income" ? "bg-emerald-100 text-emerald-700" :
                              "bg-amber-100 text-amber-700"
                            }`}>
                              {row.clase === "Renta Variable" || row.clase === "Equity" ? "RV" :
                               row.clase === "Renta Fija" || row.clase === "Fixed Income" ? "RF" : "ALT"}
                            </span>
                          </td>
                          <td className="py-2.5 px-3 text-right font-medium text-gb-black">
                            {row.actualPct.toFixed(1)}%
                          </td>
                          <td className="py-2.5 px-3 text-right font-medium text-gb-black">
                            {row.recomPct.toFixed(1)}%
                          </td>
                          <td className={`py-2.5 px-3 text-right font-bold ${
                            row.diffPct > 0 ? "text-green-600" : row.diffPct < 0 ? "text-red-600" : "text-gb-gray"
                          }`}>
                            {row.diffPct > 0 ? "+" : ""}{row.diffPct.toFixed(1)}pp
                          </td>
                          <td className="py-2.5 px-3 text-center">
                            <span className={`text-xs px-2 py-1 rounded-full font-medium ${
                              row.action === "comprar" ? "bg-green-100 text-green-700" :
                              row.action === "vender" ? "bg-red-100 text-red-700" :
                              "bg-gray-100 text-gray-600"
                            }`}>
                              {row.action === "comprar" ? "Comprar" : row.action === "vender" ? "Vender" : "Mantener"}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {/* Register execution button */}
                <div className="px-6 py-3 border-t border-blue-200 bg-blue-50/50 flex items-center justify-between">
                  <p className="text-xs text-gb-gray">
                    {executions.length > 0
                      ? `${executions.length} operaciones registradas`
                      : "Registra las operaciones ejecutadas para tracking"}
                  </p>
                  <button
                    disabled={savingExecution}
                    onClick={async () => {
                      setSavingExecution(true);
                      try {
                        const execBatch = sortedRows
                          .filter(r => r.action !== "mantener")
                          .map(r => ({
                            ticker: r.ticker,
                            nombre: r.nombre,
                            asset_class: r.clase,
                            action: r.action === "comprar" ? "buy" : "sell",
                            target_percent: r.recomPct,
                            actual_percent: r.actualPct,
                          }));
                        if (execBatch.length === 0) return;
                        const res = await fetch(`/api/clients/${clientId}/rebalance-executions`, {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ executions: execBatch }),
                        });
                        if (res.ok) {
                          fetchExecutions();
                        }
                      } catch (err) {
                        console.error("Error saving execution:", err);
                      } finally {
                        setSavingExecution(false);
                      }
                    }}
                    className="flex items-center gap-2 px-3 py-1.5 bg-blue-600 text-white text-xs font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    {savingExecution ? "Guardando..." : "Registrar ejecucion"}
                  </button>
                </div>
              </div>
            </div>
          );
        })()}

        {/* Execution history */}
        {executions.length > 0 && (
          <div className="mb-6">
            <div className="bg-white rounded-lg border border-gb-border shadow-sm">
              <button
                onClick={() => setShowExecutions(!showExecutions)}
                className="w-full px-6 py-4 flex items-center justify-between hover:bg-gray-50 transition-colors"
              >
                <h2 className="text-base font-semibold text-gb-black flex items-center gap-2">
                  <FileText className="w-4 h-4 text-green-500" />
                  Historial de Ejecuciones ({executions.length})
                </h2>
                {showExecutions ? <ChevronDown className="w-4 h-4 text-gb-gray" /> : <ChevronRight className="w-4 h-4 text-gb-gray" />}
              </button>
              {showExecutions && (
                <div className="px-4 pb-4 overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-200">
                        <th className="text-left py-2 px-3 text-gb-gray font-medium text-xs">Fecha</th>
                        <th className="text-left py-2 px-3 text-gb-gray font-medium text-xs">Instrumento</th>
                        <th className="text-center py-2 px-3 text-gb-gray font-medium text-xs">Accion</th>
                        <th className="text-right py-2 px-3 text-gb-gray font-medium text-xs">Actual</th>
                        <th className="text-right py-2 px-3 text-gb-gray font-medium text-xs">Objetivo</th>
                      </tr>
                    </thead>
                    <tbody>
                      {executions.map(ex => (
                        <tr key={ex.id} className="border-b border-gray-100">
                          <td className="py-2 px-3 text-xs text-gb-gray">
                            {new Date(ex.executed_at).toLocaleDateString("es-CL", { day: "numeric", month: "short" })}
                          </td>
                          <td className="py-2 px-3">
                            <div className="text-xs font-medium text-gb-black">{ex.nombre}</div>
                            <div className="text-xs text-gb-gray">{ex.ticker}</div>
                          </td>
                          <td className="py-2 px-3 text-center">
                            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                              ex.action === "buy" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"
                            }`}>
                              {ex.action === "buy" ? "Compra" : "Venta"}
                            </span>
                          </td>
                          <td className="py-2 px-3 text-right text-xs">{ex.actual_percent?.toFixed(1)}%</td>
                          <td className="py-2 px-3 text-right text-xs">{ex.target_percent?.toFixed(1)}%</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Baseline vs Current comparison */}
        {(() => {
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
        <div className="mb-6">
          <RecommendationHistory clientId={clientId} />
        </div>

        {/* Holding Diagnostic Panel - latest snapshot */}
        {snapshots.length > 0 && snapshots[snapshots.length - 1].holdings && (
          <HoldingDiagnosticPanel
            snapshot={snapshots[snapshots.length - 1] as Parameters<typeof HoldingDiagnosticPanel>[0]["snapshot"]}
            onUpdate={fetchData}
          />
        )}

        {/* Holding Returns Panel */}
        {snapshots.length > 0 && (
          <HoldingReturnsPanel snapshots={snapshots} clientId={clientId} />
        )}

        {/* Performance Attribution */}
        {snapshots.length >= 2 && (
          <PerformanceAttribution
            snapshots={snapshots}
            recommendation={recommendation}
            previousPortfolio={snapshots.find(s => s.is_baseline) || null}
            twr={metrics?.twr || metrics?.totalReturn}
          />
        )}

        {/* Cartolas ingresadas (always visible) */}
        {(() => {
          const cartolas = snapshots.filter(
            (s) => s.source === "statement" || s.source === "manual" || s.source === "excel"
          );
          const apiSnapshots = snapshots.filter(
            (s) => s.source !== "statement" && s.source !== "manual" && s.source !== "excel"
          );

          return (
            <>
              {cartolas.length > 0 && (
                <div className="bg-white rounded-lg border border-gb-border shadow-sm mb-6">
                  <div className="px-6 py-4 border-b border-gb-border flex items-center gap-2">
                    <FileText className="w-4 h-4 text-blue-600" />
                    <h2 className="text-base font-semibold text-gb-black">
                      Cartolas Ingresadas
                    </h2>
                    <span className="text-xs text-gb-gray ml-1">({cartolas.length})</span>
                  </div>
                  <SnapshotsTable
                    snapshots={cartolas}
                    onEdit={setEditingSnapshot}
                    onDelete={handleDeleteSnapshot}
                    onSetBaseline={handleSetBaseline}
                  />
                </div>
              )}

              {/* Full snapshot history (collapsible) */}
              {apiSnapshots.length > 0 && (
                <div className="bg-white rounded-lg border border-gb-border shadow-sm">
                  <div className="flex items-center justify-between">
                    <button
                      onClick={() => setShowAllSnapshots(!showAllSnapshots)}
                      className="flex-1 px-6 py-4 border-b border-gb-border flex items-center justify-between hover:bg-slate-50 transition-colors"
                    >
                      <div className="flex items-center gap-2">
                        {showAllSnapshots ? (
                          <ChevronDown className="w-4 h-4 text-gb-gray" />
                        ) : (
                          <ChevronRight className="w-4 h-4 text-gb-gray" />
                        )}
                        <h2 className="text-base font-semibold text-gb-black">
                          Historial Completo de Snapshots
                        </h2>
                        <span className="text-xs text-gb-gray">
                          ({snapshots.length} total — {apiSnapshots.length} interpolados)
                        </span>
                      </div>
                    </button>
                    <button
                      onClick={handleDeleteAllSnapshots}
                      className="px-4 py-4 border-b border-gb-border text-xs text-red-500 hover:text-red-700 hover:bg-red-50 transition-colors flex items-center gap-1"
                      title="Eliminar todos los snapshots"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      Limpiar todo
                    </button>
                  </div>
                  {showAllSnapshots && (
                    <SnapshotsTable
                      snapshots={snapshots}
                      onEdit={setEditingSnapshot}
                      onDelete={handleDeleteSnapshot}
                    />
                  )}
                </div>
              )}
            </>
          );
        })()}

        {/* Empty state */}
        {snapshots.length === 0 && (
          <div className="text-center py-12 bg-white rounded-lg border border-gb-border">
            <TrendingUp className="w-12 h-12 text-gb-gray mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-gb-black mb-2">Sin historial de cartolas</h3>
            <p className="text-sm text-gb-gray mb-4">
              Agrega la primera cartola para comenzar a trackear la evolución del portafolio.
            </p>
            <button
              onClick={() => setShowAddModal(true)}
              className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white font-medium rounded-md hover:bg-blue-700 transition-colors"
            >
              <Plus className="w-4 h-4" />
              Agregar Primera Cartola
            </button>
          </div>
        )}
      </div>

      {/* Add snapshot modal */}
      {showAddModal && (
        <AddSnapshotModal
          clientId={clientId}
          onClose={() => setShowAddModal(false)}
          onSuccess={handleSnapshotAdded}
        />
      )}

      {/* Edit snapshot modal */}
      {editingSnapshot && (
        <ReviewSnapshotModal
          clientId={clientId}
          parsedData={{
            holdings: (editingSnapshot.holdings as Array<{
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
            id: editingSnapshot.id,
            snapshot_date: editingSnapshot.snapshot_date,
            total_value: editingSnapshot.total_value,
            holdings: (editingSnapshot.holdings as Array<{
              fundName: string;
              quantity?: number;
              marketPrice?: number;
              marketValue: number;
              assetClass?: string;
              currency?: string;
            }>) || [],
          }}
          onClose={() => setEditingSnapshot(null)}
          onSuccess={handleSnapshotUpdated}
        />
      )}
    </div>
  );
}
