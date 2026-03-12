"use client";

import React, { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import AdvisorHeader from "@/components/shared/AdvisorHeader";
import { useAdvisor } from "@/lib/hooks/useAdvisor";
import EvolucionChart from "./EvolucionChart";
import SnapshotsTable from "./SnapshotsTable";
import AddSnapshotModal from "./AddSnapshotModal";
import ReviewSnapshotModal from "./ReviewSnapshotModal";
import PerformanceAttribution from "./PerformanceAttribution";
import ComparacionBar from "./ComparacionBar";
import {
  ArrowLeft,
  Loader,
  Plus,
  TrendingUp,
  Calendar,
  RefreshCw,
  AlertTriangle,
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

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/clients/${clientId}/seguimiento?period=${period}`);
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
  }, [clientId, period]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleSnapshotAdded = () => {
    setShowAddModal(false);
    fetchData();
  };

  const handleSnapshotUpdated = () => {
    setEditingSnapshot(null);
    fetchData();
  };

  const handleDeleteSnapshot = async (snapshotId: string) => {
    if (!confirm("¿Eliminar este snapshot?")) return;

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

  // Formato chileno: puntos para miles, comas para decimales
  const formatNumber = (value: number, decimals: number = 0): string => {
    const fixed = Math.abs(value).toFixed(decimals);
    const [intPart, decPart] = fixed.split(".");
    const withThousands = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
    const formatted = decPart ? `${withThousands},${decPart}` : withThousands;
    return value < 0 ? `-${formatted}` : formatted;
  };

  const formatCurrency = (value: number) => {
    return `$${formatNumber(value, 0)}`;
  };

  const formatPercent = (value: number) => {
    const sign = value >= 0 ? "+" : "";
    return `${sign}${formatNumber(value, 2)}%`;
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString("es-CL", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  };

  if (authLoading || loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 flex items-center justify-center">
        <Loader className="w-8 h-8 text-blue-600 animate-spin" />
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
              onClick={() => setShowAddModal(true)}
              className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
            >
              <Plus className="w-4 h-4" />
              Agregar Cartola
            </button>
          </div>
        </div>

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

            {/* Snapshots count */}
            <div className="bg-white rounded-lg border border-gb-border p-4 shadow-sm">
              <p className="text-xs text-gb-gray font-medium uppercase mb-1">Registros</p>
              <p className="text-2xl font-bold text-gb-black">{snapshots.length}</p>
              <p className="text-xs text-gb-gray mt-1">Snapshots guardados</p>
            </div>
          </div>
        )}

        {/* Evolution chart */}
        {snapshots.length > 0 && (
          <div className="bg-white rounded-lg border border-gb-border shadow-sm mb-6">
            <div className="px-6 py-4 border-b border-gb-border flex items-center justify-between">
              <h2 className="text-base font-semibold text-gb-black">Evolución del Valor</h2>
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
              <EvolucionChart snapshots={snapshots} />
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

        {/* Performance Attribution */}
        {snapshots.length >= 2 && (
          <PerformanceAttribution
            snapshots={snapshots}
            recommendation={recommendation}
            previousPortfolio={null}
          />
        )}

        {/* Snapshots table */}
        <div className="bg-white rounded-lg border border-gb-border shadow-sm">
          <div className="px-6 py-4 border-b border-gb-border">
            <h2 className="text-base font-semibold text-gb-black">Historial de Snapshots</h2>
          </div>
          <SnapshotsTable
            snapshots={snapshots}
            onEdit={setEditingSnapshot}
            onDelete={handleDeleteSnapshot}
          />
        </div>

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
