"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useAdvisor } from "@/lib/hooks/useAdvisor";
import { getBenchmarkFromScore } from "@/lib/risk/benchmarks";
import type { HoldingReturnsData } from "../HoldingReturnsPanel";

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

interface Client {
  id: string;
  nombre: string;
  apellido: string;
  email: string;
  puntaje_riesgo?: number;
  perfil_riesgo?: string;
  display_currency?: string;
  cartera_recomendada?: {
    equity_percent?: number;
    fixed_income_percent?: number;
    alternatives_percent?: number;
    cash_percent?: number;
  };
}

interface Metrics {
  totalReturn: number;
  annualizedReturn: number;
  isAnnualized: boolean;
  volatility: number;
  maxDrawdown: number;
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
  benchmarkConfig?: Array<{ ticker: string; weight: number; spread?: number }> | null;
}

interface UseSeguimientoDataProps {
  clientId: string;
  portalMode: boolean;
}

export function useSeguimientoData({ clientId, portalMode }: UseSeguimientoDataProps) {
  const advisorHook = useAdvisor();
  const authLoading = portalMode ? false : advisorHook.loading;
  const [data, setData] = useState<SeguimientoData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [period, setPeriod] = useState("ALL");
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingSnapshot, setEditingSnapshot] = useState<Snapshot | null>(null);
  const [fillingPrices, setFillingPrices] = useState(false);
  const [fillResult, setFillResult] = useState<string | null>(null);
  const [fillDetails, setFillDetails] = useState<Array<{ name: string; securityId?: string | null; source: string; sourceId: string | null }> | null>(null);

  const [executions, setExecutions] = useState<Array<{
    id: string; ticker: string; nombre: string; asset_class: string;
    action: string; target_percent: number | null; actual_percent: number | null;
    amount: number | null; units: number | null; notes: string | null;
    executed_at: string; created_at: string;
  }>>([]);
  const [livePortfolioValue, setLivePortfolioValue] = useState<number | null>(null);
  const [livePriceDate, setLivePriceDate] = useState<string | null>(null);
  const [holdingReturnsData, setHoldingReturnsData] = useState<HoldingReturnsData | null>(null);
  const [compositionBaseMode, setCompositionBaseMode] = useState<"inicio" | "fecha">("inicio");
  const [compositionBaseDate, setCompositionBaseDate] = useState<string>("");
  const [displayCurrency, setDisplayCurrency] = useState<string>("CLP");

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
      const url = portalMode
        ? "/api/portal/seguimiento?period=ALL"
        : `/api/clients/${clientId}/seguimiento?period=ALL`;
      const res = await fetch(url);
      const result = await res.json();

      if (result.success) {
        setData(result.data);
        if (result.data?.client?.display_currency) {
          setDisplayCurrency(result.data.client.display_currency);
        }
      } else {
        setError(result.error || "Error al cargar datos");
      }
    } catch (err) {
      console.error("Error fetching seguimiento:", err);
      setError("Error de conexión");
    } finally {
      setLoading(false);
    }
  }, [clientId, portalMode]);

  useEffect(() => {
    fetchData();
    if (!portalMode) fetchExecutions();
  }, [fetchData, fetchExecutions]);

  const triggerBackfill = useCallback(async () => {
    try {
      await fetch("/api/prices/backfill", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId }),
      });
    } catch {
      // Backfill is best-effort
    }
  }, [clientId]);

  const handleSnapshotAdded = () => {
    setShowAddModal(false);
    fetchData();
  };

  const handleSnapshotUpdated = () => {
    setEditingSnapshot(null);
    fetchData();
  };

  const handleFillPrices = async (silent = false) => {
    if (fillingPrices) return;
    setFillingPrices(true);
    if (!silent) {
      setFillResult(null);
      setFillDetails(null);
    }
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
        if (matched === 0 && matches.length > 0) {
          msg = `Error: Ningún holding tiene fuente de precios. Sube precios manuales o verifica los nombres de fondos.`;
        } else if (result.result.filled === 0 && matched > 0) {
          msg = `Sin días nuevos para llenar (precios ya están al día)`;
        }
        if (!silent || (matched === 0 && matches.length > 0)) {
          setFillResult(msg);
          setFillDetails(matches);
        }
        fetchData();
      } else {
        if (!silent) setFillResult(`Error: ${result.error}`);
      }
    } catch {
      if (!silent) setFillResult("Error de conexión");
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
    if (snap?.is_baseline) return;

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

  // Filter snapshots for chart display based on selected period
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

  // Use cartera_recomendada if available, otherwise derive from puntaje_riesgo
  const recommendation = useMemo(() => {
    const rawRecommendation = data?.recommendation;
    if (rawRecommendation) return rawRecommendation;
    if (data?.client?.puntaje_riesgo) {
      const bm = getBenchmarkFromScore(data.client.puntaje_riesgo, true, "global");
      return {
        equity_percent: bm.weights.equities,
        fixed_income_percent: bm.weights.fixedIncome,
        alternatives_percent: bm.weights.alternatives,
        cash_percent: bm.weights.cash,
      };
    }
    return null;
  }, [data?.recommendation, data?.client?.puntaje_riesgo]);

  return {
    // Auth
    authLoading,
    // Data
    data,
    loading,
    error,
    fetchData,
    // Period
    period,
    setPeriod,
    chartSnapshots,
    // Modals
    showAddModal,
    setShowAddModal,
    editingSnapshot,
    setEditingSnapshot,
    // Fill prices
    fillingPrices,
    fillResult,
    setFillResult,
    fillDetails,
    setFillDetails,
    handleFillPrices,
    // Snapshots
    handleSnapshotAdded,
    handleSnapshotUpdated,
    handleDeleteSnapshot,
    handleSetBaseline,
    handleDeleteAllSnapshots,
    // Executions
    executions,
    fetchExecutions,
    // Live values
    livePortfolioValue,
    setLivePortfolioValue,
    livePriceDate,
    setLivePriceDate,
    // Holding returns
    holdingReturnsData,
    setHoldingReturnsData,
    // Composition
    compositionBaseMode,
    setCompositionBaseMode,
    compositionBaseDate,
    setCompositionBaseDate,
    // Display
    displayCurrency,
    setDisplayCurrency,
    // Derived
    recommendation,
    triggerBackfill,
  };
}
