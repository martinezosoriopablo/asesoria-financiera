// components/portfolio/PortfolioEvolution.tsx
// Componente para mostrar la evolución y métricas del portfolio

"use client";

import React, { useState, useEffect } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Area,
  AreaChart,
  Legend,
} from "recharts";
import {
  TrendingUp,
  TrendingDown,
  Activity,
  BarChart3,
  Calendar,
  DollarSign,
  Percent,
  AlertTriangle,
  RefreshCw,
  Download,
  Plus,
} from "lucide-react";

interface Snapshot {
  id: string;
  snapshot_date: string;
  total_value: number;
  total_cost_basis: number | null;
  unrealized_gain_loss: number | null;
  equity_percent: number;
  fixed_income_percent: number;
  alternatives_percent: number;
  cash_percent: number;
  daily_return: number;
  cumulative_return: number;
}

interface Metrics {
  totalReturn: number;
  annualizedReturn: number;
  volatility: number;
  maxDrawdown: number;
  sharpeRatio: number;
  currentValue: number;
  initialValue: number;
  unrealizedGainLoss: number | null;
  dataPoints: number;
  periodDays: number;
  composition: {
    equity: number;
    fixedIncome: number;
    alternatives: number;
    cash: number;
  };
}

interface PortfolioEvolutionProps {
  clientId: string;
  clientName: string;
  portfolioData?: {
    composition?: {
      totalValue?: number;
      byAssetClass?: {
        Equity?: { value: number; percent: number };
        "Fixed Income"?: { value: number; percent: number };
      };
      holdings?: any[];
    };
    statement?: {
      endingValue?: number;
    };
  };
  onSnapshotCreated?: () => void;
}

const PERIODS = [
  { key: "1M", label: "1 Mes" },
  { key: "3M", label: "3 Meses" },
  { key: "6M", label: "6 Meses" },
  { key: "1Y", label: "1 Año" },
  { key: "YTD", label: "YTD" },
  { key: "ALL", label: "Todo" },
];

export default function PortfolioEvolution({
  clientId,
  clientName,
  portfolioData,
  onSnapshotCreated,
}: PortfolioEvolutionProps) {
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [period, setPeriod] = useState("1Y");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [creatingSnapshot, setCreatingSnapshot] = useState(false);

  useEffect(() => {
    loadSnapshots();
  }, [clientId, period]);

  const loadSnapshots = async () => {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/portfolio/snapshots?clientId=${clientId}&period=${period}`);
      const data = await res.json();

      if (data.success) {
        setSnapshots(data.data.snapshots);
        setMetrics(data.data.metrics);
      } else {
        setError(data.error);
      }
    } catch (err) {
      setError("Error al cargar datos");
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const createSnapshot = async () => {
    if (!portfolioData?.composition) {
      setError("No hay datos de portfolio para crear snapshot");
      return;
    }

    setCreatingSnapshot(true);

    try {
      const totalValue = portfolioData.composition.totalValue ||
                         portfolioData.statement?.endingValue || 0;

      const byAsset = portfolioData.composition.byAssetClass;

      const res = await fetch("/api/portfolio/snapshots", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientId,
          totalValue,
          composition: {
            equity: byAsset?.Equity || { value: 0, percent: 0 },
            fixedIncome: byAsset?.["Fixed Income"] || { value: 0, percent: 0 },
            alternatives: { value: 0, percent: 0 },
            cash: { value: 0, percent: 0 },
          },
          holdings: portfolioData.composition.holdings || [],
          source: "manual",
        }),
      });

      const data = await res.json();

      if (data.success) {
        await loadSnapshots();
        onSnapshotCreated?.();
      } else {
        setError(data.error);
      }
    } catch (err) {
      setError("Error al crear snapshot");
      console.error(err);
    } finally {
      setCreatingSnapshot(false);
    }
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("es-CL", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  };

  const formatPercent = (value: number) => {
    const sign = value >= 0 ? "+" : "";
    return `${sign}${value.toFixed(2)}%`;
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString("es-CL", {
      day: "2-digit",
      month: "short",
    });
  };

  // Preparar datos para el gráfico
  const chartData = snapshots.map((s) => ({
    date: formatDate(s.snapshot_date),
    fullDate: s.snapshot_date,
    value: s.total_value,
    return: s.cumulative_return,
  }));

  return (
    <div className="bg-white rounded-xl border border-gb-border shadow-sm overflow-hidden">
      {/* Header */}
      <div className="px-6 py-4 border-b border-gb-border bg-gradient-to-r from-gb-black to-gb-dark">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center">
              <Activity className="w-5 h-5 text-green-400" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-white">Evolución del Portfolio</h2>
              <p className="text-sm text-white/70">{clientName}</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={loadSnapshots}
              disabled={loading}
              className="p-2 text-white/70 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
              title="Actualizar"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
            </button>

            {portfolioData?.composition && (
              <button
                onClick={createSnapshot}
                disabled={creatingSnapshot}
                className="flex items-center gap-2 px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
              >
                <Plus className="w-4 h-4" />
                {creatingSnapshot ? "Guardando..." : "Guardar Snapshot"}
              </button>
            )}
          </div>
        </div>

        {/* Period selector */}
        <div className="flex gap-1 mt-4">
          {PERIODS.map((p) => (
            <button
              key={p.key}
              onClick={() => setPeriod(p.key)}
              className={`px-3 py-1 text-xs font-medium rounded transition-colors ${
                period === p.key
                  ? "bg-white text-gb-black"
                  : "text-white/70 hover:text-white hover:bg-white/10"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="px-6 py-3 bg-red-50 border-b border-red-200">
          <p className="text-sm text-red-700 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4" />
            {error}
          </p>
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="px-6 py-12 flex items-center justify-center">
          <RefreshCw className="w-8 h-8 text-gb-gray animate-spin" />
        </div>
      )}

      {/* No data */}
      {!loading && snapshots.length === 0 && (
        <div className="px-6 py-12 text-center">
          <BarChart3 className="w-12 h-12 text-gb-gray mx-auto mb-3" />
          <p className="text-gb-gray font-medium">No hay datos históricos</p>
          <p className="text-sm text-gb-gray mt-1">
            Guarda snapshots periódicamente para ver la evolución
          </p>
          {portfolioData?.composition && (
            <button
              onClick={createSnapshot}
              disabled={creatingSnapshot}
              className="mt-4 px-4 py-2 bg-gb-accent text-white font-medium rounded-lg hover:bg-gb-accent/90 transition-colors"
            >
              Crear Primer Snapshot
            </button>
          )}
        </div>
      )}

      {/* Content with data */}
      {!loading && snapshots.length > 0 && metrics && (
        <>
          {/* Metrics cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-6 bg-gb-light/30">
            {/* Current Value */}
            <div className="bg-white rounded-lg p-4 border border-gb-border">
              <div className="flex items-center gap-2 text-gb-gray mb-1">
                <DollarSign className="w-4 h-4" />
                <span className="text-xs font-medium uppercase">Valor Actual</span>
              </div>
              <p className="text-xl font-bold text-gb-black">
                {formatCurrency(metrics.currentValue)}
              </p>
              {metrics.unrealizedGainLoss !== null && (
                <p className={`text-xs mt-1 ${
                  metrics.unrealizedGainLoss >= 0 ? "text-green-600" : "text-red-600"
                }`}>
                  {formatCurrency(metrics.unrealizedGainLoss)} no realizado
                </p>
              )}
            </div>

            {/* Total Return */}
            <div className="bg-white rounded-lg p-4 border border-gb-border">
              <div className="flex items-center gap-2 text-gb-gray mb-1">
                <Percent className="w-4 h-4" />
                <span className="text-xs font-medium uppercase">Retorno Total</span>
              </div>
              <p className={`text-xl font-bold ${
                metrics.totalReturn >= 0 ? "text-green-600" : "text-red-600"
              }`}>
                {formatPercent(metrics.totalReturn)}
              </p>
              <p className="text-xs text-gb-gray mt-1">
                {metrics.periodDays} días
              </p>
            </div>

            {/* Annualized Return */}
            <div className="bg-white rounded-lg p-4 border border-gb-border">
              <div className="flex items-center gap-2 text-gb-gray mb-1">
                <TrendingUp className="w-4 h-4" />
                <span className="text-xs font-medium uppercase">Retorno Anual</span>
              </div>
              <p className={`text-xl font-bold ${
                metrics.annualizedReturn >= 0 ? "text-green-600" : "text-red-600"
              }`}>
                {formatPercent(metrics.annualizedReturn)}
              </p>
              <p className="text-xs text-gb-gray mt-1">
                Anualizado
              </p>
            </div>

            {/* Volatility */}
            <div className="bg-white rounded-lg p-4 border border-gb-border">
              <div className="flex items-center gap-2 text-gb-gray mb-1">
                <Activity className="w-4 h-4" />
                <span className="text-xs font-medium uppercase">Volatilidad</span>
              </div>
              <p className="text-xl font-bold text-gb-black">
                {metrics.volatility.toFixed(1)}%
              </p>
              <p className="text-xs text-gb-gray mt-1">
                Anualizada
              </p>
            </div>
          </div>

          {/* Chart */}
          <div className="p-6">
            <h3 className="text-sm font-semibold text-gb-black mb-4">Evolución del Valor</h3>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData}>
                  <defs>
                    <linearGradient id="colorValue" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#2563eb" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#2563eb" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e5e5" />
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 11, fill: "#666" }}
                    tickLine={false}
                  />
                  <YAxis
                    tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`}
                    tick={{ fontSize: 11, fill: "#666" }}
                    tickLine={false}
                    axisLine={false}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "white",
                      border: "1px solid #e5e5e5",
                      borderRadius: "8px",
                      fontSize: "12px",
                    }}
                    formatter={(value: number | undefined) => [formatCurrency(value ?? 0), "Valor"]}
                    labelFormatter={(label) => `Fecha: ${label}`}
                  />
                  <Area
                    type="monotone"
                    dataKey="value"
                    stroke="#2563eb"
                    strokeWidth={2}
                    fillOpacity={1}
                    fill="url(#colorValue)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Additional metrics */}
          <div className="px-6 pb-6">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="text-center p-3 bg-gb-light/50 rounded-lg">
                <p className="text-xs text-gb-gray uppercase font-medium mb-1">Max Drawdown</p>
                <p className="text-lg font-bold text-red-600">
                  -{metrics.maxDrawdown.toFixed(1)}%
                </p>
              </div>
              <div className="text-center p-3 bg-gb-light/50 rounded-lg">
                <p className="text-xs text-gb-gray uppercase font-medium mb-1">Sharpe Ratio</p>
                <p className={`text-lg font-bold ${
                  metrics.sharpeRatio >= 1 ? "text-green-600" : metrics.sharpeRatio >= 0 ? "text-amber-600" : "text-red-600"
                }`}>
                  {metrics.sharpeRatio.toFixed(2)}
                </p>
              </div>
              <div className="text-center p-3 bg-gb-light/50 rounded-lg">
                <p className="text-xs text-gb-gray uppercase font-medium mb-1">Data Points</p>
                <p className="text-lg font-bold text-gb-black">
                  {metrics.dataPoints}
                </p>
              </div>
              <div className="text-center p-3 bg-gb-light/50 rounded-lg">
                <p className="text-xs text-gb-gray uppercase font-medium mb-1">Valor Inicial</p>
                <p className="text-lg font-bold text-gb-black">
                  {formatCurrency(metrics.initialValue)}
                </p>
              </div>
            </div>
          </div>

          {/* Composition */}
          {metrics.composition && (
            <div className="px-6 pb-6 border-t border-gb-border pt-4">
              <h3 className="text-sm font-semibold text-gb-black mb-3">Composición Actual</h3>
              <div className="flex gap-2">
                <div className="flex-1 bg-blue-50 rounded-lg p-3 text-center">
                  <p className="text-xs text-blue-700 font-medium">Renta Variable</p>
                  <p className="text-lg font-bold text-blue-900">{metrics.composition.equity?.toFixed(1) || 0}%</p>
                </div>
                <div className="flex-1 bg-green-50 rounded-lg p-3 text-center">
                  <p className="text-xs text-green-700 font-medium">Renta Fija</p>
                  <p className="text-lg font-bold text-green-900">{metrics.composition.fixedIncome?.toFixed(1) || 0}%</p>
                </div>
                <div className="flex-1 bg-purple-50 rounded-lg p-3 text-center">
                  <p className="text-xs text-purple-700 font-medium">Alternativos</p>
                  <p className="text-lg font-bold text-purple-900">{metrics.composition.alternatives?.toFixed(1) || 0}%</p>
                </div>
                <div className="flex-1 bg-gray-50 rounded-lg p-3 text-center">
                  <p className="text-xs text-gray-700 font-medium">Cash</p>
                  <p className="text-lg font-bold text-gray-900">{metrics.composition.cash?.toFixed(1) || 0}%</p>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
