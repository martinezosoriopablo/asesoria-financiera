"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import Link from "next/link";
import { useAdvisor } from "@/lib/hooks/useAdvisor";
import { formatNumber, formatCurrency, formatPercent, formatDate } from "@/lib/format";
import EvolucionChart from "./EvolucionChart";
import SnapshotsTable from "./SnapshotsTable";
import AddSnapshotModal from "./AddSnapshotModal";
import ReviewSnapshotModal from "./ReviewSnapshotModal";
import PerformanceAttribution from "./PerformanceAttribution";
import ComparacionBar from "./ComparacionBar";
import HoldingReturnsPanel from "./HoldingReturnsPanel";

import BaselineComparison from "./BaselineComparison";
import RecommendationHistory from "./RecommendationHistory";
import RadiografiaCartola from "./RadiografiaCartola";
import { getBenchmarkFromScore } from "@/lib/risk/benchmarks";
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
  puntaje_riesgo?: number;
  perfil_riesgo?: string;
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

  const [lastPriceUpdate, setLastPriceUpdate] = useState<string | null>(null);
  const [autoFillTriggered, setAutoFillTriggered] = useState(false);
  const [historicalSeries, setHistoricalSeries] = useState<Array<{ fecha: string; total: number; [key: string]: string | number }>>([]);
  const [fundsMeta, setFundsMeta] = useState<Array<{ fundName: string; run: string; serie: string; tac: number | null; moneda: string; quantity: number; lastPriceDate?: string | null; stale?: boolean }>>([]);
  const [loadingHistorical, setLoadingHistorical] = useState(false);
  const [livePortfolioValue, setLivePortfolioValue] = useState<number | null>(null);
  const [livePriceDate, setLivePriceDate] = useState<string | null>(null);
  const [deflatorData, setDeflatorData] = useState<{ uf: Map<string, number>; usd: Map<string, number> } | null>(null);
  const [backfillStatus, setBackfillStatus] = useState<string | null>(null);
  const [exchangeRates, setExchangeRates] = useState<{ uf: number; usd: number } | null>(null);

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
        // Track the most recent api-prices snapshot date for staleness indicator
        const apiPriceSnaps = (result.data.snapshots || []).filter(
          (s: Snapshot) => s.source === "api-prices"
        );
        if (apiPriceSnaps.length > 0) {
          const latest = apiPriceSnaps[apiPriceSnaps.length - 1];
          setLastPriceUpdate(latest.created_at || latest.snapshot_date);
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
  }, [clientId]);

  useEffect(() => {
    fetchData();
    fetchExecutions();
    // Fetch current exchange rates for UF/USD display
    fetch("/api/exchange-rates")
      .then(r => r.json())
      .then(d => { if (d.success) setExchangeRates({ uf: d.uf, usd: d.usd }); })
      .catch(() => { /* fallback handled */ });
  }, [fetchData, fetchExecutions]);

  // Auto-fill prices if snapshots exist but prices are stale (>24h since last api-prices snapshot)
  useEffect(() => {
    if (autoFillTriggered || !data || fillingPrices) return;
    const snaps = data.snapshots || [];
    if (snaps.length === 0) return;

    const cartolaSnaps = snaps.filter(
      (s) => s.source === "statement" || s.source === "manual" || s.source === "excel"
    );
    if (cartolaSnaps.length === 0) return;

    const apiPriceSnaps = snaps.filter((s) => s.source === "api-prices");
    const latestCartola = cartolaSnaps[cartolaSnaps.length - 1];

    // Check if fill-prices needs to run:
    // 1) No api-prices snapshots at all (never filled)
    // 2) Latest api-prices is older than latest cartola (new cartola uploaded)
    // 3) Latest api-prices is >24h old and there are business days to fill
    let shouldAutoFill = false;

    if (apiPriceSnaps.length === 0) {
      shouldAutoFill = true;
    } else {
      const latestApiPrice = apiPriceSnaps[apiPriceSnaps.length - 1];
      const latestApiDate = new Date(latestApiPrice.snapshot_date);
      const latestCartolaDate = new Date(latestCartola.snapshot_date);
      const now = new Date();
      const hoursSinceUpdate = (now.getTime() - new Date(latestApiPrice.created_at || latestApiPrice.snapshot_date).getTime()) / (1000 * 60 * 60);

      if (latestCartolaDate > latestApiDate) {
        shouldAutoFill = true;
      } else if (hoursSinceUpdate > 24) {
        // Check if there are business days to fill (today vs latest api-prices date)
        const daysSinceLastPrice = (now.getTime() - latestApiDate.getTime()) / (1000 * 60 * 60 * 24);
        if (daysSinceLastPrice > 1) {
          shouldAutoFill = true;
        }
      }
    }

    if (shouldAutoFill) {
      setAutoFillTriggered(true);
      // Trigger fill-prices silently in the background (no banner unless critical error)
      handleFillPrices(true);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, autoFillTriggered, fillingPrices]);

  // Fetch historical price series for the evolution chart
  useEffect(() => {
    if (!data || data.snapshots.length === 0) return;

    // Find holdings with RUN+serie from the latest cartola snapshot
    const cartolaSnaps = data.snapshots.filter(
      (s) => s.source === "statement" || s.source === "manual" || s.source === "excel"
    );
    if (cartolaSnaps.length === 0) return;

    const latestCartola = cartolaSnaps[cartolaSnaps.length - 1];
    const holdings = latestCartola.holdings as Array<{
      fundName?: string; securityId?: string; serie?: string;
      quantity?: number; currency?: string;
      marketPrice?: number; marketValue?: number;
    }> | null;
    if (!holdings || holdings.length === 0) return;

    const holdingsWithRun = holdings
      .filter((h) => {
        const id = h.securityId || "";
        return /^\d{3,6}$/.test(id.trim()) && h.serie && (h.quantity || 0) > 0;
      })
      .map((h) => ({
        fundName: h.fundName || "",
        run: parseInt((h.securityId || "").trim(), 10),
        serie: h.serie || "",
        quantity: h.quantity || 0,
        currency: h.currency || "CLP",
        // Always use CLP-based price (marketValue/quantity) for currency detection in the API.
        // marketPrice can be in USD for USD-denominated funds, which breaks the ratio check.
        cartolaPrice: (h.quantity && h.quantity > 0 ? (h.marketValue || 0) / h.quantity : 0) || h.marketPrice || 0,
      }));

    if (holdingsWithRun.length === 0) return;

    // Go back 1 year from today for historical data (rent 1Y, 6M, etc.)
    const oneYearAgo = new Date();
    oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
    oneYearAgo.setDate(oneYearAgo.getDate() - 7); // extra week buffer
    const fromDate = oneYearAgo.toISOString().split("T")[0];

    const fetchHistorical = async () => {
      setLoadingHistorical(true);
      try {
        const res = await fetch("/api/portfolio/historical-prices", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ holdings: holdingsWithRun, fromDate }),
        });
        if (res.ok) {
          const result = await res.json();
          if (result.success && result.series) {
            setHistoricalSeries(result.series);
            if (result.funds) setFundsMeta(result.funds);

            // If series is too short (< 30 points), trigger CMF backfill to get more data
            if (result.series.length < 30) {
              const uniqueRuns = [...new Set(holdingsWithRun.map((h) => h.run))];
              if (uniqueRuns.length > 0) {
                setBackfillStatus(`Descargando histórico CMF para ${uniqueRuns.length} fondos...`);
                fetch("/api/portfolio/backfill-cmf", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ runs: uniqueRuns, snapshotDate: fromDate }),
                })
                  .then((r) => r.json())
                  .then((r) => {
                    if (r.success && r.totalImported > 0) {
                      setBackfillStatus(`${r.totalImported} precios importados, actualizando gráfico...`);
                      // Re-fetch historical after backfill
                      fetch("/api/portfolio/historical-prices", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ holdings: holdingsWithRun, fromDate }),
                      })
                        .then((r2) => r2.json())
                        .then((r2) => {
                          if (r2.success && r2.series) {
                            setHistoricalSeries(r2.series);
                            if (r2.funds) setFundsMeta(r2.funds);
                          }
                          setBackfillStatus(null);
                        })
                        .catch(() => setBackfillStatus(null));
                    } else {
                      setBackfillStatus(r.error ? `Error CMF: ${r.error}` : null);
                      setTimeout(() => setBackfillStatus(null), 5000);
                    }
                  })
                  .catch((err) => {
                    console.warn("[backfill-cmf] Error:", err);
                    setBackfillStatus(null);
                  });
              }
            }
          }
        }
      } catch (err) {
        console.error("Error fetching historical prices:", err);
      } finally {
        setLoadingHistorical(false);
      }
    };

    fetchHistorical();
  }, [data]);

  // Fetch UF and dólar historical data via our proxy (avoids CORS issues)
  useEffect(() => {
    const fetchDeflators = async () => {
      const currentYear = new Date().getFullYear();
      const years = [currentYear - 1, currentYear];
      const ufMap = new Map<string, number>();
      const usdMap = new Map<string, number>();

      await Promise.all(
        years.flatMap((year) => [
          fetch(`/api/exchange-rates/historical?indicator=uf&year=${year}`)
            .then((r) => r.json())
            .then((d) => {
              for (const e of (d.serie || []) as Array<{ fecha: string; valor: number }>) {
                ufMap.set(e.fecha, e.valor);
              }
            })
            .catch(() => {}),
          fetch(`/api/exchange-rates/historical?indicator=dolar&year=${year}`)
            .then((r) => r.json())
            .then((d) => {
              for (const e of (d.serie || []) as Array<{ fecha: string; valor: number }>) {
                usdMap.set(e.fecha, e.valor);
              }
            })
            .catch(() => {}),
        ])
      );

      if (ufMap.size > 0 || usdMap.size > 0) {
        setDeflatorData({ uf: ufMap, usd: usdMap });
      }
    };

    fetchDeflators();
  }, []);

  // Helper: find closest value <= date in a deflator map
  const findDeflatorValue = useCallback((map: Map<string, number> | undefined, date: string): number | null => {
    if (!map || map.size === 0) return null;
    const exact = map.get(date);
    if (exact) return exact;
    // Find nearest earlier date (maps aren't sorted, scan all)
    let bestDate = "";
    let bestVal: number | null = null;
    for (const [d, v] of map) {
      if (d <= date && d > bestDate) { bestDate = d; bestVal = v; }
    }
    return bestVal;
  }, []);

  // Calculate period returns from historical series (nominal + real + USD)
  type PeriodReturn = { nominal: number; real: number | null; usd: number | null };
  const periodReturns = useMemo(() => {
    if (historicalSeries.length < 2) return null;

    const latest = historicalSeries[historicalSeries.length - 1];
    const latestValue = latest.total as number;
    const latestDateStr = (latest.fecha as string).split("T")[0];
    // Parse as local date to avoid timezone shift (e.g. 2026-04-21 UTC -> Apr 20 in Chile)
    const [ly, lm, ld] = latestDateStr.split("-").map(Number);
    const latestDate = new Date(ly, lm - 1, ld);

    const getReturnForPeriod = (targetStr: string): PeriodReturn | null => {
      const point = historicalSeries.find((p) => (p.fecha as string) >= targetStr);
      if (!point || point === latest) return null;

      // If the closest point is more than 10 days after the target date,
      // the series doesn't have enough data for this period — skip it
      // rather than showing the same return for all periods
      const pointDate = new Date(point.fecha as string);
      const targetDate = new Date(targetStr);
      const daysDiff = (pointDate.getTime() - targetDate.getTime()) / 86400000;
      if (daysDiff > 10) return null;

      const startValue = point.total as number;
      if (startValue <= 0) return null;
      const nominal = ((latestValue / startValue) - 1) * 100;
      const startDateStr = point.fecha as string;

      let real: number | null = null;
      let usd: number | null = null;

      if (deflatorData) {
        const ufStart = findDeflatorValue(deflatorData.uf, startDateStr);
        const ufEnd = findDeflatorValue(deflatorData.uf, latestDateStr);
        if (ufStart && ufEnd && ufStart > 0) {
          real = ((1 + nominal / 100) / (ufEnd / ufStart) - 1) * 100;
        }

        const usdStart = findDeflatorValue(deflatorData.usd, startDateStr);
        const usdEnd = findDeflatorValue(deflatorData.usd, latestDateStr);
        if (usdStart && usdEnd && usdStart > 0) {
          usd = ((1 + nominal / 100) / (usdEnd / usdStart) - 1) * 100;
        }
      }

      return { nominal, real, usd };
    };

    const toLocalDateStr = (d: Date) => {
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, "0");
      const day = String(d.getDate()).padStart(2, "0");
      return `${y}-${m}-${day}`;
    };
    const getForMonths = (months: number) => {
      const targetDate = new Date(latestDate);
      targetDate.setMonth(targetDate.getMonth() - months);
      return getReturnForPeriod(toLocalDateStr(targetDate));
    };

    return {
      "1M": getForMonths(1),
      "3M": getForMonths(3),
      "6M": getForMonths(6),
      "1Y": getForMonths(12),
      "YTD": getReturnForPeriod(`${latestDate.getFullYear()}-01-01`),
    };
  }, [historicalSeries, deflatorData, findDeflatorValue]);

  // TAC ponderado del portafolio
  const weightedTAC = useMemo(() => {
    if (fundsMeta.length === 0 || historicalSeries.length === 0) return null;

    const latest = historicalSeries[historicalSeries.length - 1];
    const totalValue = latest.total;
    if (totalValue <= 0) return null;

    let tacSum = 0;
    let coveredValue = 0;

    for (const fund of fundsMeta) {
      if (fund.tac === null || fund.tac === undefined) continue;
      const fundValue = (latest[fund.fundName] as number) || 0;
      if (fundValue > 0) {
        tacSum += fund.tac * fundValue;
        coveredValue += fundValue;
      }
    }

    if (coveredValue <= 0) return null;
    return {
      weighted: tacSum / coveredValue,
      annualCost: Math.round(totalValue * (tacSum / coveredValue) / 100),
      coverage: coveredValue / totalValue,
    };
  }, [fundsMeta, historicalSeries]);

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
        // Warn clearly if no holdings matched any price source
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

  const { client, snapshots, metrics } = data;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50">
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
            <div className="flex items-center gap-2">
              <button
                onClick={() => handleFillPrices(false)}
                disabled={fillingPrices || snapshots.length === 0}
                className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium border border-amber-300 text-amber-700 bg-amber-50 rounded-md hover:bg-amber-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed relative group"
                title="Fuentes: CMF > Fintual API > Yahoo > Manual. Interpola precios entre cartolas."
              >
                <TrendingUp className={`w-4 h-4 ${fillingPrices ? "animate-pulse" : ""}`} />
                {fillingPrices ? "Llenando..." : "Llenar Precios"}
              </button>
              {lastPriceUpdate && (
                <span className={`text-xs ${
                  (() => {
                    const hours = (Date.now() - new Date(lastPriceUpdate).getTime()) / (1000 * 60 * 60);
                    if (hours < 24) return "text-green-600";
                    if (hours < 72) return "text-amber-600";
                    return "text-red-500";
                  })()
                }`} title={`Última actualización de precios: ${new Date(lastPriceUpdate).toLocaleString("es-CL")}`}>
                  {(() => {
                    const hours = Math.floor((Date.now() - new Date(lastPriceUpdate).getTime()) / (1000 * 60 * 60));
                    if (hours < 1) return "Precios actualizados";
                    if (hours < 24) return `Precios: hace ${hours}h`;
                    const days = Math.floor(hours / 24);
                    return `Precios: hace ${days}d`;
                  })()}
                </span>
              )}
            </div>
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
          <div className="mb-6 space-y-3">
            {/* Row 1: Valor Inicial + Valor Actual (big cards) + TAC */}
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {/* Valor Inicial (cartola) */}
              <div className="bg-white rounded-lg border border-gb-border p-5 shadow-sm">
                <p className="text-xs text-gb-gray font-medium uppercase mb-1">Valor Cartola</p>
                <p className="text-2xl font-bold text-gb-black">
                  {formatCurrency(metrics.initialValue)}
                </p>
                <p className="text-xs text-gb-gray mt-1">
                  {exchangeRates && (
                    <span>UF {(metrics.initialValue / exchangeRates.uf).toLocaleString("es-CL", { maximumFractionDigits: 1 })} · USD {(metrics.initialValue / exchangeRates.usd).toLocaleString("es-CL", { maximumFractionDigits: 0 })}</span>
                  )}
                  {snapshots.length > 0 && (
                    <span>{exchangeRates ? " · " : ""}<Calendar className="w-3 h-3 inline mr-1" />{formatDate(snapshots.find(s => s.source === "statement" || s.source === "manual" || s.source === "excel")?.snapshot_date || snapshots[0].snapshot_date)}</span>
                  )}
                </p>
              </div>

              {/* Valor Actual */}
              <div className="bg-white rounded-lg border-2 border-blue-200 p-5 shadow-sm">
                <p className="text-xs text-blue-600 font-medium uppercase mb-1">Valor Actual</p>
                <p className="text-2xl font-bold text-gb-black">
                  {formatCurrency(livePortfolioValue ?? metrics.currentValue)}
                </p>
                <p className="text-xs text-gb-gray mt-1">
                  {exchangeRates && (
                    <span>UF {((livePortfolioValue ?? metrics.currentValue) / exchangeRates.uf).toLocaleString("es-CL", { maximumFractionDigits: 1 })} · USD {((livePortfolioValue ?? metrics.currentValue) / exchangeRates.usd).toLocaleString("es-CL", { maximumFractionDigits: 0 })}</span>
                  )}
                  {(livePriceDate || historicalSeries.length > 0 || snapshots.length > 0) && (
                    <span>{exchangeRates ? " · " : ""}<Calendar className="w-3 h-3 inline mr-1" />{formatDate(
                      livePriceDate
                      || (historicalSeries.length > 0 ? historicalSeries[historicalSeries.length - 1].fecha as string : null)
                      || snapshots[snapshots.length - 1].snapshot_date
                    )}</span>
                  )}
                </p>
              </div>

              {/* TAC ponderado */}
              <div className="bg-white rounded-lg border border-gb-border p-5 shadow-sm col-span-2 md:col-span-1">
                <p className="text-xs text-gb-gray font-medium uppercase mb-1">TAC Ponderado</p>
                {weightedTAC ? (
                  <>
                    <p className="text-2xl font-bold text-gb-black">
                      {formatNumber(weightedTAC.weighted, 2)}%
                    </p>
                    <p className="text-xs text-gb-gray mt-1">
                      ${formatNumber(weightedTAC.annualCost, 0)}/año{exchangeRates ? ` (UF ${(weightedTAC.annualCost / exchangeRates.uf).toLocaleString("es-CL", { maximumFractionDigits: 1 })})` : ""}
                    </p>
                  </>
                ) : (
                  <p className="text-2xl font-bold text-gb-gray">-</p>
                )}
              </div>
            </div>

            {/* Row 2: Rentabilidades (compact) — nominal / real / USD */}
            <div className="grid grid-cols-5 gap-2">
              {(["1M", "3M", "6M", "1Y", "YTD"] as const).map((p) => {
                const ret = periodReturns?.[p] ?? null;
                const renderVal = (v: number | null | undefined, label: string, bold?: boolean) => {
                  if (v === null || v === undefined) return null;
                  return (
                    <p className={`${bold ? "text-sm font-bold" : "text-[10px] font-medium"} ${v >= 0 ? "text-green-600" : "text-red-600"}`}>
                      {!bold && <span className="text-gb-gray mr-0.5">{label}</span>}
                      {v >= 0 ? "+" : ""}{formatNumber(v, 1)}%
                    </p>
                  );
                };
                return (
                  <div key={p} className="bg-white rounded-lg border border-gb-border px-3 py-2 shadow-sm text-center">
                    <p className="text-[10px] text-gb-gray font-medium uppercase mb-0.5">{p}</p>
                    {ret !== null ? (
                      <>
                        {renderVal(ret.nominal, "", true)}
                        {renderVal(ret.real, "UF ")}
                        {renderVal(ret.usd, "USD ")}
                      </>
                    ) : (
                      <p className="text-sm font-bold text-gb-gray">-</p>
                    )}
                  </div>
                );
              })}
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

        {/* Holding Returns Panel */}
        {snapshots.length > 0 && (
          <HoldingReturnsPanel snapshots={snapshots} clientId={clientId} onCurrentValueUpdate={setLivePortfolioValue} onPriceDateUpdate={setLivePriceDate} fundsMeta={fundsMeta} usdRate={exchangeRates?.usd} />
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
                snapshots={chartSnapshots}
                historicalSeries={historicalSeries}
                loadingHistorical={loadingHistorical}
                period={period}
              />
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

        {/* Radiografía del Portafolio - X-ray de costos y alternativas */}
        {snapshots.length > 0 && snapshots[snapshots.length - 1].holdings && (
          <div className="mb-6">
            <RadiografiaCartola
              holdings={(snapshots[snapshots.length - 1].holdings as Array<{ fundName: string; securityId?: string | null; serie?: string | null; quantity?: number; marketPrice?: number; marketValue: number; assetClass?: string; currency?: string }>)}
              clientName={data?.client ? `${data.client.nombre} ${data.client.apellido}` : undefined}
              clientId={clientId}
              fundsMeta={fundsMeta}
              cartolaDate={snapshots.find(s => s.source === "statement" || s.source === "manual" || s.source === "excel")?.snapshot_date || snapshots[0].snapshot_date}
              currentValue={historicalSeries.length > 0 ? historicalSeries[historicalSeries.length - 1].total as number : undefined}
              currentValueDate={historicalSeries.length > 0 ? historicalSeries[historicalSeries.length - 1].fecha as string : undefined}
            />
          </div>
        )}

        {/* Holding Returns Panel — moved to composition section */}

        {/* Performance Attribution */}
        {snapshots.length >= 2 && (
          <PerformanceAttribution
            snapshots={snapshots}
            recommendation={recommendation}
            previousPortfolio={snapshots.find(s => s.is_baseline) || null}
            totalReturn={metrics?.totalReturn}
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
