"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import Link from "next/link";
import { useAdvisor } from "@/lib/hooks/useAdvisor";
import { formatNumber, formatCurrency, formatDate } from "@/lib/format";
import EvolucionChart from "./EvolucionChart";
import SnapshotsTable from "./SnapshotsTable";
import AddSnapshotModal from "./AddSnapshotModal";
import ReviewSnapshotModal from "./ReviewSnapshotModal";
import PerformanceAttribution from "./PerformanceAttribution";
import RentabilidadPorActivo from "./RentabilidadPorActivo";
import RetornosComparados from "./RetornosComparados";
import ComparacionBar from "./ComparacionBar";
import HoldingReturnsPanel, { type HoldingReturnsData } from "./HoldingReturnsPanel";

import BenchmarkConfig from "./BenchmarkConfig";
import BaselineComparison from "./BaselineComparison";
import RecommendationHistory from "./RecommendationHistory";
import ClientMonthlyClosing from "./ClientMonthlyClosing";
import PortfolioBreakdownPies from "./PortfolioBreakdownPies";
import CompositionBoxes from "./CompositionBoxes";
import RebalancingTable from "./RebalancingTable";
import SeguimientoSummaryCards from "./SeguimientoSummaryCards";
import MonthlyReportSection from "./MonthlyReportSection";
import SendSeguimientoModal from "./SendSeguimientoModal";
import type { SeguimientoEmailData } from "@/lib/seguimiento-email";
import { getBenchmarkFromScore } from "@/lib/risk/benchmarks";
import { useExchangeRates } from "./hooks/useExchangeRates";
import { useHistoricalSeries } from "./hooks/useHistoricalSeries";
import { useBenchmarkConfig } from "./hooks/useBenchmarkConfig";
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
  Scale,
  Mail,
} from "lucide-react";

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
  benchmarkConfig?: Array<{ ticker: string; weight: number; spread?: number }> | null;
}

interface Props {
  clientId: string;
  portalMode?: boolean;
}

export default function SeguimientoPage({ clientId, portalMode = false }: Props) {
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
  const [showAllSnapshots, setShowAllSnapshots] = useState(false);
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
  // Benchmark config, returns, baseline series — extracted to useBenchmarkConfig hook
  const {
    benchmarkConfig, setBenchmarkConfig,
    benchmarkReturns, benchmarkLabel,
    baselineSeries, loadingBaseline,
    baselineMonthlyReturns, baselineAccReturn,
  } = useBenchmarkConfig({
    snapshots: data?.snapshots,
    clientId,
    initialBenchmarkConfig: data?.benchmarkConfig || null,
  });
  const [displayCurrency, setDisplayCurrency] = useState<string>("CLP");
  const [showSendModal, setShowSendModal] = useState(false);
  const [clientEmail, setClientEmail] = useState("");
  const [narrativeText, setNarrativeText] = useState<string | null>(null);
  const [loadingNarrative, setLoadingNarrative] = useState(false);

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


  // Exchange rates: current, historical deflators, cartola/current rates
  const {
    exchangeRates,
    deflatorData,
    cartolaExchangeRates,
    currentExchangeRates,
    findDeflatorValue,
    findDeflatorValueNext,
  } = useExchangeRates({
    snapshots: data?.snapshots || [],
    livePriceDate,
  });

  // Historical price series, period returns, and weighted TAC
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
    snapshots: data?.snapshots,
    portalMode,
    deflatorData,
    findDeflatorValue,
  });

  // Convert CLP value to display currency
  const convertFromCLP = useCallback((clpValue: number, rates: { uf: number; usd: number } | null): string => {
    if (!rates || displayCurrency === "CLP") return formatCurrency(clpValue);
    if (displayCurrency === "USD") return `USD ${formatNumber(clpValue / rates.usd, 0)}`;
    if (displayCurrency === "UF") return `UF ${formatNumber(clpValue / rates.uf, 1)}`;
    return formatCurrency(clpValue);
  }, [displayCurrency]);


  const assembleSeguimientoData = useCallback((): SeguimientoEmailData | null => {
    const metrics = data?.metrics;
    if (!data || !metrics) return null;
    const rates = (currentExchangeRates || exchangeRates);
    if (!rates) return null;

    const latestValue = livePortfolioValue ?? metrics.currentValue;
    const initialValue = metrics.initialValue;

    let comp: SeguimientoEmailData["composition"];
    if (holdingReturnsData) {
      const hr = holdingReturnsData;
      const eqFinal = hr.equityHoldings?.reduce((s: number, h: { marketValue: number }) => s + h.marketValue, 0) || 0;
      const fiFinal = (hr.fixedIncomeFundHoldings?.reduce((s: number, h: { marketValue: number }) => s + h.marketValue, 0) || 0) +
                      (hr.bondHoldings?.reduce((s: number, h: { marketValue: number }) => s + h.marketValue, 0) || 0);
      const altFinal = hr.alternativesHoldings?.reduce((s: number, h: { marketValue: number }) => s + h.marketValue, 0) || 0;
      const cashFinal = hr.cashValue || 0;

      const eqInitial = initialValue * (metrics.composition.equity / 100);
      const fiInitial = initialValue * (metrics.composition.fixedIncome / 100);
      const altInitial = initialValue * (metrics.composition.alternatives / 100);
      const cashInitial = initialValue * (metrics.composition.cash / 100);

      comp = {
        equity: { initial: eqInitial, final: eqFinal, returnPct: eqInitial > 0 ? ((eqFinal / eqInitial) - 1) * 100 : 0 },
        fixedIncome: { initial: fiInitial, final: fiFinal, returnPct: fiInitial > 0 ? ((fiFinal / fiInitial) - 1) * 100 : 0 },
        alternatives: { initial: altInitial, final: altFinal, returnPct: altInitial > 0 ? ((altFinal / altInitial) - 1) * 100 : 0 },
        cash: { initial: cashInitial, final: cashFinal, returnPct: 0 },
      };
    } else {
      comp = {
        equity: { initial: initialValue * metrics.composition.equity / 100, final: latestValue * metrics.composition.equity / 100, returnPct: 0 },
        fixedIncome: { initial: initialValue * metrics.composition.fixedIncome / 100, final: latestValue * metrics.composition.fixedIncome / 100, returnPct: 0 },
        alternatives: { initial: initialValue * metrics.composition.alternatives / 100, final: latestValue * metrics.composition.alternatives / 100, returnPct: 0 },
        cash: { initial: initialValue * metrics.composition.cash / 100, final: latestValue * metrics.composition.cash / 100, returnPct: 0 },
      };
    }

    const pr: SeguimientoEmailData["periodReturns"] = {};
    for (const p of ["1M", "3M", "6M", "1Y", "YTD"]) {
      const ret = periodReturns?.[p as keyof typeof periodReturns] as { nominal: number; real: number | null; usd: number | null } | null;
      pr[p] = ret ? { nominal: ret.nominal, real: ret.real ?? null, usd: ret.usd ?? null } : { nominal: null, real: null, usd: null };
    }

    const distByType: Array<{ label: string; pct: number }> = [];
    const distByCurrency: Array<{ label: string; pct: number }> = [];
    if (holdingReturnsData) {
      const typeMap = new Map<string, number>();
      const currMap = new Map<string, number>();
      const allH = [
        ...(holdingReturnsData.equityHoldings || []),
        ...(holdingReturnsData.fixedIncomeFundHoldings || []),
        ...(holdingReturnsData.bondHoldings || []),
        ...(holdingReturnsData.alternativesHoldings || []),
      ];
      for (const h of allH) {
        const type = (h as { assetType?: string }).assetType || "Otro";
        typeMap.set(type, (typeMap.get(type) || 0) + (h.weight || 0));
        const curr = (h as { currency?: string }).currency || "CLP";
        currMap.set(curr, (currMap.get(curr) || 0) + (h.weight || 0));
      }
      if (holdingReturnsData.cashValue && holdingReturnsData.totalValue) {
        const cashPct = (holdingReturnsData.cashValue / holdingReturnsData.totalValue) * 100;
        typeMap.set("Caja", (typeMap.get("Caja") || 0) + cashPct);
        currMap.set("CLP", (currMap.get("CLP") || 0) + cashPct);
      }
      for (const [label, pct] of [...typeMap.entries()].sort((a, b) => b[1] - a[1])) distByType.push({ label, pct });
      for (const [label, pct] of [...currMap.entries()].sort((a, b) => b[1] - a[1])) distByCurrency.push({ label, pct });
    }

    let bmComp: SeguimientoEmailData["benchmarkComparison"] = null;
    if (benchmarkReturns && periodReturns) {
      const periods: Record<string, { portfolio: number | null; benchmark: number | null; diff: number | null }> = {};
      for (const p of ["1M", "3M", "6M", "1Y", "YTD"]) {
        const pRet = (periodReturns as Record<string, { nominal: number } | null>)?.[p]?.nominal ?? null;
        const bRet = (benchmarkReturns as Record<string, number>)?.[p] ?? null;
        if (pRet !== null || bRet !== null) {
          periods[p] = {
            portfolio: pRet,
            benchmark: bRet,
            diff: pRet !== null && bRet !== null ? pRet - bRet : null,
          };
        }
      }
      if (Object.keys(periods).length > 0) {
        bmComp = { label: benchmarkLabel, periods };
      }
    }

    const holdingRetList: SeguimientoEmailData["holdingReturns"] = [];
    if (holdingReturnsData) {
      const allHoldings = [
        ...(holdingReturnsData.equityHoldings || []).map((h: { fundName: string; totalReturn?: number; assetType?: string }) => ({ name: h.fundName, assetType: h.assetType || "Accion", returnPct: h.totalReturn ?? 0 })),
        ...(holdingReturnsData.fixedIncomeFundHoldings || []).map((h: { fundName: string; totalReturn?: number; assetType?: string }) => ({ name: h.fundName, assetType: h.assetType || "Fondo", returnPct: h.totalReturn ?? 0 })),
        ...(holdingReturnsData.bondHoldings || []).map((h: { fundName: string; totalReturn?: number }) => ({ name: h.fundName, assetType: "Bono", returnPct: h.totalReturn ?? 0 })),
        ...(holdingReturnsData.alternativesHoldings || []).map((h: { fundName: string; totalReturn?: number; assetType?: string }) => ({ name: h.fundName, assetType: h.assetType || "Alternativo", returnPct: h.totalReturn ?? 0 })),
      ];
      allHoldings.sort((a, b) => b.returnPct - a.returnPct);
      holdingRetList.push(...allHoldings.slice(0, 20));
    }

    const attrList: SeguimientoEmailData["attribution"] = [];
    if (holdingReturnsData) {
      const allH = [
        ...(holdingReturnsData.equityHoldings || []),
        ...(holdingReturnsData.fixedIncomeFundHoldings || []),
        ...(holdingReturnsData.bondHoldings || []),
        ...(holdingReturnsData.alternativesHoldings || []),
      ];
      for (const h of allH) {
        attrList.push({
          name: h.fundName,
          instrumentType: (h as { assetType?: string }).assetType || "Otro",
          contributionPp: h.contribution ?? 0,
        });
      }
      // Keep top positive + top negative contributions (not just first 15 by desc)
      attrList.sort((a, b) => b.contributionPp - a.contributionPp);
      const positives = attrList.filter(a => a.contributionPp >= 0);
      const negatives = attrList.filter(a => a.contributionPp < 0);
      const maxPerSide = 10;
      attrList.length = 0;
      attrList.push(...positives.slice(0, maxPerSide), ...negatives.slice(0, maxPerSide));
    }

    // Build narrative: use saved narrativeText, or generate programmatic fallback
    let narrative = narrativeText;
    if (!narrative) {
      const parts: string[] = [];
      const clientFirst = data.client.nombre;
      const ytdRet = pr["YTD"]?.nominal;
      const oneMRet = pr["1M"]?.nominal;
      const totalRet = ytdRet ?? oneMRet ?? accumulatedReturn ?? metrics.totalReturn;
      if (totalRet !== null && totalRet !== undefined) {
        const sign = totalRet >= 0 ? "positivo" : "negativo";
        parts.push(`El portafolio de ${clientFirst} ha tenido un desempeno ${sign} con una rentabilidad de ${totalRet >= 0 ? "+" : ""}${totalRet.toFixed(1)}% en el periodo.`);
      }
      if (comp.equity.returnPct !== 0 || comp.fixedIncome.returnPct !== 0) {
        const eqDir = comp.equity.returnPct >= 0 ? "subio" : "bajo";
        const fiDir = comp.fixedIncome.returnPct >= 0 ? "subio" : "bajo";
        parts.push(`La renta variable ${eqDir} ${comp.equity.returnPct >= 0 ? "+" : ""}${comp.equity.returnPct.toFixed(1)}% y la renta fija ${fiDir} ${comp.fixedIncome.returnPct >= 0 ? "+" : ""}${comp.fixedIncome.returnPct.toFixed(1)}%.`);
      }
      if (holdingRetList.length > 0) {
        const best = holdingRetList[0];
        const worst = holdingRetList[holdingRetList.length - 1];
        parts.push(`La posicion de mayor rendimiento fue ${best.name} (${best.returnPct >= 0 ? "+" : ""}${best.returnPct.toFixed(1)}%) y la de menor rendimiento fue ${worst.name} (${worst.returnPct >= 0 ? "+" : ""}${worst.returnPct.toFixed(1)}%).`);
      }
      narrative = parts.length > 0 ? parts.join("\n\n") : `Reporte de seguimiento del portafolio de ${clientFirst} generado el ${new Date().toLocaleDateString("es-CL")}.`;
    }

    return {
      clientName: `${data.client.nombre} ${data.client.apellido}`,
      reportDate: new Date().toLocaleDateString("es-CL"),
      perfilCliente: data.client.perfil_riesgo || "moderado",
      totalValueCLP: latestValue,
      displayCurrency: displayCurrency,
      exchangeRates: rates,
      composition: comp,
      periodReturns: pr,
      distribution: { byAssetType: distByType, byCurrency: distByCurrency },
      benchmarkComparison: bmComp,
      holdingReturns: holdingRetList,
      attribution: attrList,
      narrative,
      platformUrl: typeof window !== "undefined" ? `${window.location.origin}/clients/${clientId}/seguimiento` : "",
    };
  }, [data, holdingReturnsData, periodReturns, benchmarkReturns, benchmarkLabel, currentExchangeRates, exchangeRates, livePortfolioValue, displayCurrency, narrativeText, clientId]);

  const openSendModal = useCallback(async () => {
    if (!clientEmail) {
      try {
        const res = await fetch(`/api/clients/${clientId}`);
        const d = await res.json();
        if (d.success && d.data?.client?.email) {
          setClientEmail(d.data.client.email);
        }
      } catch { /* ignore */ }
    }

    if (!narrativeText && !loadingNarrative) {
      setLoadingNarrative(true);
      // Try current month first, then previous month (ClientMonthlyClosing uses prev month)
      const now = new Date();
      const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
      const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const prevMonth = `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, "0")}`;

      for (const month of [prevMonth, currentMonth]) {
        try {
          const res = await fetch(`/api/client-closings?clientId=${clientId}&month=${month}`);
          const d = await res.json();
          if (d.success && d.closing?.content) {
            setNarrativeText(d.closing.content);
            break;
          }
        } catch { /* ignore */ }
      }

      setLoadingNarrative(false);
    }

    setShowSendModal(true);
  }, [clientId, clientEmail, narrativeText, loadingNarrative]);


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

  const { client, snapshots, metrics } = data;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50">
      <div className="max-w-6xl mx-auto px-5 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            {!portalMode && (
              <Link
                href={`/clients/${clientId}`}
                className="inline-flex items-center gap-1 text-sm text-gb-gray hover:text-gb-black mb-2"
              >
                <ArrowLeft className="w-4 h-4" />
                {client.nombre} {client.apellido}
              </Link>
            )}
            <h1 className="text-2xl font-semibold text-gb-black">
              Seguimiento{portalMode ? "" : " de Cartolas"}
            </h1>
          </div>
          {!portalMode && (
            <div className="flex gap-2">
              <Link
                href={`/recomendacion/${clientId}`}
                className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium border border-slate-200 text-slate-600 rounded-md hover:bg-slate-50 transition-colors"
              >
                <Scale className="w-4 h-4" />
                Ver Radiografia
              </Link>
              <button
                onClick={fetchData}
                disabled={loading}
                className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium border border-slate-200 text-slate-600 rounded-md hover:bg-slate-50 transition-colors"
              >
                <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
                Actualizar
              </button>
              <button
                onClick={openSendModal}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-gb-primary rounded-md hover:bg-gb-primary/90 transition-colors"
              >
                <Mail className="w-3.5 h-3.5" />
                Enviar Reporte
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
              </div>
              <button
                onClick={() => setShowAddModal(true)}
                className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
              >
                <Plus className="w-4 h-4" />
                Agregar Cartola
              </button>
            </div>
          )}
        </div>

        {/* Fill prices result banner */}
        {!portalMode && fillResult && (
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
        {!portalMode && fillDetails && fillDetails.length > 0 && (
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
          <SeguimientoSummaryCards
            metrics={metrics}
            cartolaExchangeRates={cartolaExchangeRates}
            currentExchangeRates={currentExchangeRates}
            exchangeRates={exchangeRates}
            livePortfolioValue={livePortfolioValue}
            livePriceDate={livePriceDate}
            historicalSeries={historicalSeries}
            snapshots={snapshots}
            displayCurrency={displayCurrency}
            setDisplayCurrency={setDisplayCurrency}
            weightedTAC={weightedTAC}
            baselineAccReturn={baselineAccReturn}
            convertFromCLP={convertFromCLP}
            periodReturns={periodReturns}
          />
        )}

        {/* Composition breakdown with initial → final + sub-breakdown */}
        {holdingReturnsData && snapshots.length > 0 && (
          <CompositionBoxes
            holdingReturnsData={holdingReturnsData}
            snapshots={snapshots}
            compositionBaseMode={compositionBaseMode}
            compositionBaseDate={compositionBaseDate}
            onBaseModeChange={setCompositionBaseMode}
            onBaseDateChange={setCompositionBaseDate}
            convertFromCLP={convertFromCLP}
            cartolaExchangeRates={cartolaExchangeRates}
            currentExchangeRates={currentExchangeRates}
            exchangeRates={exchangeRates}
          />
        )}

        {/* Holding Returns Panel */}
        {snapshots.length > 0 && (
          <HoldingReturnsPanel snapshots={snapshots} clientId={clientId} onCurrentValueUpdate={setLivePortfolioValue} onPriceDateUpdate={setLivePriceDate} onHoldingReturnsReady={setHoldingReturnsData} fundsMeta={fundsMeta} usdRate={(currentExchangeRates || exchangeRates)?.usd} ufRate={(currentExchangeRates || exchangeRates)?.uf} ufRateInitial={deflatorData ? findDeflatorValue(deflatorData.uf, snapshots[0]?.snapshot_date) ?? undefined : undefined} />
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
                baselineSeries={baselineSeries || undefined}
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

        {/* Per-holding rebalancing table + execution history */}
        {!portalMode && (
          <RebalancingTable
            recommendation={recommendation}
            latestSnapshotHoldings={snapshots.length > 0 ? (snapshots[snapshots.length - 1].holdings as any) : null}
            clientId={clientId}
            executions={executions}
            onExecutionSaved={fetchExecutions}
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
          // Prefer holdingReturnsData (CLP-converted marketValues) for correct proportions.
          // Fall back to snapshot holdings using marketValueCLP when available.
          if (holdingReturnsData) {
            const all: Array<{ fundName: string; marketValue: number; assetClass?: string; currency?: string }> = [
              ...holdingReturnsData.equityHoldings.map(h => ({ fundName: h.fundName, marketValue: h.marketValue, assetClass: h.assetClass || "equity", currency: h.currency })),
              ...holdingReturnsData.fixedIncomeFundHoldings.map(h => ({ fundName: h.fundName, marketValue: h.marketValue, assetClass: h.assetClass || "fixedIncome", currency: h.currency })),
              ...holdingReturnsData.alternativesHoldings.map(h => ({ fundName: h.fundName, marketValue: h.marketValue, assetClass: h.assetClass || "alternatives", currency: h.currency })),
              ...holdingReturnsData.bondHoldings.map(h => ({ fundName: h.fundName, marketValue: h.marketValue, assetClass: "fixedIncome", currency: h.currency || "USD" })),
            ];
            if (holdingReturnsData.cashValue > 0) {
              all.push({ fundName: "Caja", marketValue: holdingReturnsData.cashValue, assetClass: "cash", currency: "CLP" });
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
        {holdingReturnsData && (
          <RentabilidadPorActivo
            holdingReturnsData={holdingReturnsData}
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
              snapshots={data.snapshots.filter((s) => s.source !== "api-prices")}
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
        {(snapshots.length >= 2 || holdingReturnsData) && (
          <PerformanceAttribution
            snapshots={snapshots}
            recommendation={recommendation}
            previousPortfolio={snapshots.find(s => s.is_baseline) || null}
            totalReturn={accumulatedReturn ?? metrics?.totalReturn}
            holdingReturnsData={holdingReturnsData}
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

        {/* Cartolas ingresadas */}
        {!portalMode && (() => {
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
        {!portalMode && snapshots.length === 0 && (
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
      {!portalMode && showAddModal && (
        <AddSnapshotModal
          clientId={clientId}
          onClose={() => setShowAddModal(false)}
          onSuccess={handleSnapshotAdded}
        />
      )}

      {/* Edit snapshot modal */}
      {!portalMode && editingSnapshot && (
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
      {!portalMode && showSendModal && (() => {
        const emailData = assembleSeguimientoData();
        if (!emailData) return null;
        return (
          <SendSeguimientoModal
            isOpen={showSendModal}
            onClose={() => setShowSendModal(false)}
            clientId={clientId}
            clientEmail={clientEmail}
            seguimientoData={emailData}
          />
        );
      })()}
    </div>
  );
}
