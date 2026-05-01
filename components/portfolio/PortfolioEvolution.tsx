// components/portfolio/PortfolioEvolution.tsx
// Componente para mostrar la evolución y métricas del portfolio

"use client";

import React, { useState, useEffect } from "react";
import {
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Area,
  AreaChart,
} from "recharts";
import {
  TrendingUp,
  Activity,
  BarChart3,
  DollarSign,
  Percent,
  AlertTriangle,
  RefreshCw,
  Plus,
  Upload,
  FileSpreadsheet,
} from "lucide-react";
import * as XLSX from "xlsx";

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
  twr_cumulative?: number;
  twr_period?: number;
  total_cuotas?: number;
  deposits?: number;
  withdrawals?: number;
  net_cash_flow?: number;
}

interface Metrics {
  totalReturn: number;
  annualizedReturn: number;
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
      holdings?: Record<string, unknown>[];
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
  const [fillingPrices, setFillingPrices] = useState(false);
  const [chartMode, setChartMode] = useState<"return" | "value">("return");
  const [showDividendModal, setShowDividendModal] = useState(false);
  const [dividendDate, setDividendDate] = useState("");
  const [dividendAmount, setDividendAmount] = useState("");
  const [dividendNote, setDividendNote] = useState("");
  const [savingDividend, setSavingDividend] = useState(false);
  const [priceCoverage, setPriceCoverage] = useState<{
    totalHoldings: number;
    withPrices: number;
    frozenPercent: number;
    unpricedHoldings: Array<{ name: string; securityId?: string | null; weight: number }>;
    manualHoldings?: Array<{ name: string; securityId: string; weight: number; lastDate: string }>;
  } | null>(null);
  const [showManualPriceModal, setShowManualPriceModal] = useState(false);
  // manualCsv removed — now using form-only mode
  const [manualPriceNote, setManualPriceNote] = useState("");
  const [uploadingPrices, setUploadingPrices] = useState(false);
  const [uploadResult, setUploadResult] = useState<{ success: boolean; message: string; errors?: string[] } | null>(null);
  const [selectedFund, setSelectedFund] = useState<{ name: string; securityId: string } | null>(null);
  const [priceRows, setPriceRows] = useState<Array<{ date: string; price: string }>>([{ date: "", price: "" }]);
  const [loadingExisting, setLoadingExisting] = useState(false);

  useEffect(() => {
    loadSnapshots();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId, period]);

  // Check price coverage for this client (which holdings have prices, which are frozen)
  const loadCoverage = async () => {
    try {
      const res = await fetch(`/api/portfolio/fill-prices/coverage?clientId=${clientId}`);
      const data = await res.json();
      if (data.success && data.coverage) {
        setPriceCoverage(data.coverage);
      }
    } catch { /* silent */ }
  };

  const loadSnapshots = async () => {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/portfolio/snapshots?clientId=${clientId}&period=${period}`);
      const data = await res.json();

      if (data.success) {
        setSnapshots(data.data.snapshots);
        setMetrics(data.data.metrics);
        // Always refresh coverage info when we have snapshots
        if (data.data.snapshots?.length > 0) {
          loadCoverage();
        }
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
        // Auto-fill prices: wait for completion then refresh chart
        if (data.shouldFillPrices) {
          setFillingPrices(true);
          try {
            await fetch("/api/portfolio/fill-prices", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ clientId }),
            });
          } catch {
            /* silent — snapshots still saved */
          } finally {
            setFillingPrices(false);
          }
        }
        await loadSnapshots(); // This also refreshes coverage
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

  const saveDividend = async () => {
    if (!dividendDate || !dividendAmount) return;
    setSavingDividend(true);
    try {
      const res = await fetch("/api/portfolio/dividends", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientId,
          date: dividendDate,
          amount: parseFloat(dividendAmount),
          note: dividendNote || undefined,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setShowDividendModal(false);
        setDividendDate("");
        setDividendAmount("");
        setDividendNote("");
        await loadSnapshots();
      } else {
        setError(data.error || "Error al guardar dividendo");
      }
    } catch {
      setError("Error al guardar dividendo");
    } finally {
      setSavingDividend(false);
    }
  };

  const loadExistingPrices = async (securityId: string) => {
    setLoadingExisting(true);
    try {
      const res = await fetch(`/api/portfolio/manual-prices?securityId=${securityId}`);
      const data = await res.json();
      if (data.success && data.data && data.data.length > 0) {
        const existing = data.data.map((r: { price_date: string; price: number }) => ({
          date: r.price_date,
          price: String(r.price),
        }));
        setPriceRows([...existing, { date: "", price: "" }]);
      } else {
        setPriceRows([{ date: "", price: "" }]);
      }
    } catch {
      setPriceRows([{ date: "", price: "" }]);
    } finally {
      setLoadingExisting(false);
    }
  };

  const handleExcelUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const data = new Uint8Array(evt.target?.result as ArrayBuffer);
        const wb = XLSX.read(data, { type: "array", cellDates: true });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: "" });

        if (rows.length === 0) {
          setUploadResult({ success: false, message: "El archivo está vacío" });
          return;
        }

        // Detect date and price columns by header name
        const keys = Object.keys(rows[0]);
        const dateCol = keys.find(k => /fecha|date|dia/i.test(k)) || keys[0];
        const priceCol = keys.find(k => /precio|price|valor|cuota|nav/i.test(k)) || keys[1];

        if (!dateCol || !priceCol) {
          setUploadResult({ success: false, message: "No se encontraron columnas de fecha y precio" });
          return;
        }

        const parsed: Array<{ date: string; price: string }> = [];
        for (const row of rows) {
          const rawDate = row[dateCol];
          const rawPrice = row[priceCol];

          // Parse date
          let dateStr = "";
          if (rawDate instanceof Date) {
            dateStr = rawDate.toISOString().slice(0, 10);
          } else if (typeof rawDate === "number") {
            // Excel serial date
            const d = XLSX.SSF.parse_date_code(rawDate);
            dateStr = `${d.y}-${String(d.m).padStart(2, "0")}-${String(d.d).padStart(2, "0")}`;
          } else if (typeof rawDate === "string" && rawDate.trim()) {
            // Try common formats: DD-MM-YYYY, DD/MM/YYYY, YYYY-MM-DD
            const s = rawDate.trim();
            const dmyMatch = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
            const ymdMatch = s.match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})$/);
            if (ymdMatch) {
              dateStr = `${ymdMatch[1]}-${ymdMatch[2].padStart(2, "0")}-${ymdMatch[3].padStart(2, "0")}`;
            } else if (dmyMatch) {
              dateStr = `${dmyMatch[3]}-${dmyMatch[2].padStart(2, "0")}-${dmyMatch[1].padStart(2, "0")}`;
            }
          }

          // Parse price
          let priceStr = "";
          if (typeof rawPrice === "number") {
            priceStr = rawPrice.toString();
          } else if (typeof rawPrice === "string") {
            priceStr = rawPrice.replace(/[^\d.,-]/g, "").replace(",", ".");
          }

          if (dateStr && priceStr) {
            parsed.push({ date: dateStr, price: priceStr });
          }
        }

        if (parsed.length === 0) {
          setUploadResult({ success: false, message: "No se pudieron parsear filas válidas del archivo" });
          return;
        }

        setPriceRows(parsed);
        setUploadResult({ success: true, message: `${parsed.length} filas importadas del Excel` });
      } catch {
        setUploadResult({ success: false, message: "Error al leer el archivo Excel" });
      }
    };
    reader.readAsArrayBuffer(file);
    // Reset input so same file can be re-selected
    e.target.value = "";
  };

  const buildCsvFromForm = (): string => {
    if (!selectedFund) return "";
    const lines: string[] = [];
    for (const row of priceRows) {
      if (row.date && row.price) {
        lines.push(`${row.date},${row.price}`);
      }
    }
    return lines.join("\n");
  };

  const uploadManualPrices = async () => {
    const csvToSend = buildCsvFromForm();
    if (!csvToSend.trim()) return;
    setUploadingPrices(true);
    setUploadResult(null);
    try {
      const res = await fetch("/api/portfolio/manual-prices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          csv: csvToSend,
          securityId: selectedFund?.securityId || undefined,
          note: manualPriceNote || undefined,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setUploadResult({ success: true, message: data.message });
        setManualPriceNote("");
        setPriceRows([{ date: "", price: "" }]);
        // Re-fill prices with the new manual data
        setFillingPrices(true);
        try {
          await fetch("/api/portfolio/fill-prices", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ clientId }),
          });
        } catch { /* silent */ }
        setFillingPrices(false);
        await loadSnapshots(); // This also refreshes coverage
      } else {
        setUploadResult({
          success: false,
          message: data.error || "Error al subir precios",
          errors: data.validationErrors,
        });
      }
    } catch {
      setUploadResult({ success: false, message: "Error de conexión" });
    } finally {
      setUploadingPrices(false);
    }
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("es-CL", {
      style: "currency",
      currency: "CLP",
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
    returnPct: s.cumulative_return ?? 0,
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

            <button
              onClick={() => setShowManualPriceModal(true)}
              className="flex items-center gap-2 px-3 py-1.5 bg-white/10 hover:bg-white/20 text-white text-sm font-medium rounded-lg transition-colors"
              title="Subir precios manuales para fondos sin precio automático"
            >
              <Upload className="w-4 h-4" />
              Precios
            </button>

            <button
              onClick={() => setShowDividendModal(true)}
              className="flex items-center gap-2 px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white text-sm font-medium rounded-lg transition-colors"
              title="Registrar dividendo recibido"
            >
              <DollarSign className="w-4 h-4" />
              Dividendo
            </button>

            {portfolioData?.composition && (
              <button
                onClick={createSnapshot}
                disabled={creatingSnapshot || fillingPrices}
                className="flex items-center gap-2 px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
              >
                {fillingPrices ? (
                  <RefreshCw className="w-4 h-4 animate-spin" />
                ) : (
                  <Plus className="w-4 h-4" />
                )}
                {fillingPrices ? "Llenando precios..." : creatingSnapshot ? "Guardando..." : "Guardar Snapshot"}
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

      {/* Price coverage warning */}
      {priceCoverage && priceCoverage.unpricedHoldings.length > 0 && (
        <div className="px-6 py-3 bg-amber-50 border-b border-amber-200">
          <p className="text-sm text-amber-800 flex items-center gap-2 font-medium">
            <AlertTriangle className="w-4 h-4 flex-shrink-0" />
            {priceCoverage.withPrices}/{priceCoverage.totalHoldings} fondos con precios dinámicos
            ({priceCoverage.frozenPercent.toFixed(1)}% del portfolio con precio congelado)
          </p>
          <div className="mt-1 ml-6 space-y-0.5">
            {priceCoverage.unpricedHoldings.map((h, i) => (
              <p key={i} className="text-xs text-amber-700">
                {h.name} {h.securityId ? `(${h.securityId})` : ""} — {h.weight.toFixed(1)}% del portfolio
              </p>
            ))}
          </div>
          <div className="flex items-center gap-3 mt-2 ml-6">
            <p className="text-xs text-amber-600">
              Estos fondos usan el precio de la última cartola.
            </p>
            <button
              onClick={() => setShowManualPriceModal(true)}
              className="text-xs font-medium text-amber-800 underline hover:text-amber-900"
            >
              Subir precios manualmente
            </button>
          </div>
        </div>
      )}

      {/* Manual price funds info */}
      {priceCoverage && priceCoverage.manualHoldings && priceCoverage.manualHoldings.length > 0 && (
        <div className="px-6 py-3 bg-blue-50 border-b border-blue-200">
          <p className="text-sm text-blue-800 flex items-center gap-2 font-medium">
            <Upload className="w-4 h-4 flex-shrink-0" />
            {priceCoverage.manualHoldings.length} fondo{priceCoverage.manualHoldings.length > 1 ? "s" : ""} con precios manuales
          </p>
          <div className="mt-1 ml-6 space-y-0.5">
            {priceCoverage.manualHoldings.map((h, i) => (
              <p key={i} className="text-xs text-blue-700">
                {h.name} ({h.securityId}) — último dato: <span className="font-semibold">{new Date(h.lastDate + "T12:00:00").toLocaleDateString("es-CL", { day: "2-digit", month: "short", year: "numeric" })}</span>
                {" "}— {h.weight.toFixed(1)}% del portfolio
              </p>
            ))}
          </div>
          <button
            onClick={() => setShowManualPriceModal(true)}
            className="mt-1.5 ml-6 text-xs font-medium text-blue-800 underline hover:text-blue-900"
          >
            Actualizar precios
          </button>
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
              disabled={creatingSnapshot || fillingPrices}
              className="mt-4 px-4 py-2 bg-gb-accent text-white font-medium rounded-lg hover:bg-gb-accent/90 transition-colors"
            >
              {fillingPrices ? "Llenando precios..." : creatingSnapshot ? "Guardando..." : "Crear Primer Snapshot"}
            </button>
          )}
        </div>
      )}

      {/* Content with data */}
      {!loading && snapshots.length > 0 && metrics && (
        <>
          {/* Metrics cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-6 bg-gb-light/30">
            {/* Rentabilidad acumulada */}
            <div className="bg-white rounded-lg p-4 border border-gb-border">
              <div className="flex items-center gap-2 text-gb-gray mb-1">
                <Percent className="w-4 h-4" />
                <span className="text-xs font-medium uppercase">Rentabilidad</span>
              </div>
              <p className={`text-xl font-bold ${
                (metrics.totalReturn || 0) >= 0 ? "text-green-600" : "text-red-600"
              }`}>
                {formatPercent(metrics.totalReturn || 0)}
              </p>
              <p className="text-xs text-gb-gray mt-1">
                {metrics.periodDays} días
              </p>
            </div>

            {/* Retorno Anualizado */}
            <div className="bg-white rounded-lg p-4 border border-gb-border">
              <div className="flex items-center gap-2 text-gb-gray mb-1">
                <TrendingUp className="w-4 h-4" />
                <span className="text-xs font-medium uppercase">Retorno Anualizado</span>
              </div>
              <p className={`text-xl font-bold ${
                (metrics.annualizedReturn || 0) >= 0 ? "text-green-600" : "text-red-600"
              }`}>
                {formatPercent(metrics.annualizedReturn || 0)}
              </p>
              <p className="text-xs text-gb-gray mt-1">
                Anualizado
              </p>
            </div>

            {/* Current Value */}
            <div className="bg-white rounded-lg p-4 border border-gb-border">
              <div className="flex items-center gap-2 text-gb-gray mb-1">
                <DollarSign className="w-4 h-4" />
                <span className="text-xs font-medium uppercase">Valor Actual</span>
              </div>
              <p className="text-xl font-bold text-gb-black">
                {formatCurrency(metrics.currentValue)}
              </p>
              {(metrics.netCashFlow !== undefined && metrics.netCashFlow !== 0) && (
                <p className="text-xs text-gb-gray mt-1">
                  Flujos netos: {formatCurrency(metrics.netCashFlow)}
                </p>
              )}
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
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-gb-black">
                {chartMode === "return" ? "Rentabilidad (%)" : "Evolución del Valor"}
              </h3>
              <div className="flex items-center gap-1 bg-gb-light rounded-lg p-0.5">
                <button
                  onClick={() => setChartMode("return")}
                  className={`px-3 py-1 text-xs font-medium rounded transition-colors ${
                    chartMode === "return" ? "bg-white text-gb-black shadow-sm" : "text-gb-gray hover:text-gb-black"
                  }`}
                >
                  Rentabilidad
                </button>
                <button
                  onClick={() => setChartMode("value")}
                  className={`px-3 py-1 text-xs font-medium rounded transition-colors ${
                    chartMode === "value" ? "bg-white text-gb-black shadow-sm" : "text-gb-gray hover:text-gb-black"
                  }`}
                >
                  Valor
                </button>
              </div>
            </div>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData}>
                  <defs>
                    <linearGradient id="colorReturn" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#16a34a" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#16a34a" stopOpacity={0} />
                    </linearGradient>
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
                    tickFormatter={chartMode === "return"
                      ? (v) => `${v >= 0 ? "+" : ""}${v.toFixed(1)}%`
                      : (v) => `$${(v / 1000).toFixed(0)}k`
                    }
                    tick={{ fontSize: 11, fill: "#666" }}
                    tickLine={false}
                    axisLine={false}
                  />
                  {chartMode === "return" && (
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "white",
                        border: "1px solid #e5e5e5",
                        borderRadius: "8px",
                        fontSize: "12px",
                      }}
                      formatter={(value: number | undefined) => [formatPercent(value ?? 0), "Rentabilidad"]}
                      labelFormatter={(label) => `Fecha: ${label}`}
                    />
                  )}
                  {chartMode === "value" && (
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
                  )}
                  <Area
                    type="monotone"
                    dataKey={chartMode === "return" ? "returnPct" : "value"}
                    stroke={chartMode === "return" ? "#16a34a" : "#2563eb"}
                    strokeWidth={2}
                    fillOpacity={1}
                    fill={chartMode === "return" ? "url(#colorReturn)" : "url(#colorValue)"}
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
                <p className="text-xs text-gb-gray uppercase font-medium mb-1">Periodo</p>
                <p className="text-lg font-bold text-gb-black">
                  {metrics.periodDays}d
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

      {/* Modal de Dividendos */}
      {showDividendModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-md mx-4">
            <h3 className="text-lg font-semibold text-gb-black mb-1">Registrar Dividendo</h3>
            <p className="text-sm text-gb-gray mb-4">
              Los dividendos se suman al valor del portfolio sin afectar las cuotas,
              reflejando correctamente la rentabilidad real.
            </p>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gb-black mb-1">Fecha</label>
                <input
                  type="date"
                  value={dividendDate}
                  onChange={(e) => setDividendDate(e.target.value)}
                  className="w-full px-3 py-2 border border-gb-border rounded-lg text-sm focus:ring-2 focus:ring-gb-accent focus:border-gb-accent"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gb-black mb-1">Monto (CLP)</label>
                <input
                  type="number"
                  step="0.01"
                  value={dividendAmount}
                  onChange={(e) => setDividendAmount(e.target.value)}
                  placeholder="Ej: 250.00"
                  className="w-full px-3 py-2 border border-gb-border rounded-lg text-sm focus:ring-2 focus:ring-gb-accent focus:border-gb-accent"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gb-black mb-1">Nota (opcional)</label>
                <input
                  type="text"
                  value={dividendNote}
                  onChange={(e) => setDividendNote(e.target.value)}
                  placeholder="Ej: Dividendo JPMorgan Q4 2025"
                  className="w-full px-3 py-2 border border-gb-border rounded-lg text-sm focus:ring-2 focus:ring-gb-accent focus:border-gb-accent"
                />
              </div>
            </div>

            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => setShowDividendModal(false)}
                className="px-4 py-2 text-sm font-medium text-gb-gray hover:text-gb-black transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={saveDividend}
                disabled={savingDividend || !dividendDate || !dividendAmount}
                className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
              >
                {savingDividend ? "Guardando..." : "Guardar Dividendo"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Precios Manuales */}
      {showManualPriceModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-lg mx-4 max-h-[80vh] overflow-y-auto">
            <h3 className="text-lg font-semibold text-gb-black mb-1">Subir Precios Manuales</h3>
            <p className="text-sm text-gb-gray mb-3">
              Ingresa precios NAV para fondos sin precio automático.
            </p>

            {/* Fund selector */}
            <div>
              <label className="block text-sm font-medium text-gb-black mb-1">Fondo</label>
              {priceCoverage && (priceCoverage.unpricedHoldings.length > 0 || (priceCoverage.manualHoldings && priceCoverage.manualHoldings.length > 0)) ? (
                <select
                  value={selectedFund?.securityId || ""}
                  onChange={(e) => {
                    const allFunds = [
                      ...priceCoverage.unpricedHoldings,
                      ...(priceCoverage.manualHoldings || []),
                    ];
                    const h = allFunds.find(x => x.securityId === e.target.value);
                    setSelectedFund(h ? { name: h.name, securityId: h.securityId || "" } : null);
                    if (h?.securityId && priceCoverage.manualHoldings?.some(m => m.securityId === h.securityId)) {
                      loadExistingPrices(h.securityId);
                    } else {
                      setPriceRows([{ date: "", price: "" }]);
                    }
                  }}
                  className="w-full px-3 py-2 border border-gb-border rounded-lg text-sm focus:ring-2 focus:ring-gb-accent"
                >
                  <option value="">Seleccionar fondo...</option>
                  {priceCoverage.unpricedHoldings.length > 0 && (
                    <optgroup label="Sin precios">
                      {priceCoverage.unpricedHoldings.map((h, i) => (
                        <option key={`u-${i}`} value={h.securityId || ""}>
                          {h.name.substring(0, 55)}{h.securityId ? ` (${h.securityId})` : ""}
                        </option>
                      ))}
                    </optgroup>
                  )}
                  {priceCoverage.manualHoldings && priceCoverage.manualHoldings.length > 0 && (
                    <optgroup label="Precios manuales">
                      {priceCoverage.manualHoldings.map((h, i) => (
                        <option key={`m-${i}`} value={h.securityId}>
                          {h.name.substring(0, 45)} — último: {h.lastDate}
                        </option>
                      ))}
                    </optgroup>
                  )}
                </select>
              ) : (
                <input
                  type="text"
                  value={selectedFund?.securityId || ""}
                  onChange={(e) => setSelectedFund({ name: "", securityId: e.target.value })}
                  placeholder="CUSIP o ISIN (ej: L51224282)"
                  className="w-full px-3 py-2 border border-gb-border rounded-lg text-sm focus:ring-2 focus:ring-gb-accent"
                />
              )}
            </div>

            {/* Excel import + Price rows table */}
            {selectedFund && (
              <div className="mt-4">
                {loadingExisting && (
                  <div className="flex items-center gap-2 mb-3 text-sm text-gb-gray">
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    Cargando precios existentes...
                  </div>
                )}
                <div className="flex items-center gap-3 mb-3">
                  <label className="flex items-center gap-2 px-3 py-1.5 bg-green-50 hover:bg-green-100 text-green-700 text-sm font-medium rounded-lg border border-green-200 cursor-pointer transition-colors">
                    <FileSpreadsheet className="w-4 h-4" />
                    Importar Excel
                    <input
                      type="file"
                      accept=".xlsx,.xls,.csv"
                      onChange={handleExcelUpload}
                      className="hidden"
                    />
                  </label>
                  <span className="text-xs text-gb-gray">
                    Columnas: fecha, valor cuota
                  </span>
                </div>
                <div className="border border-gb-border rounded-lg overflow-hidden">
                  <div className="grid grid-cols-[1fr_1fr_32px] gap-0 bg-gb-light px-3 py-1.5">
                    <span className="text-xs font-medium text-gb-gray">Fecha</span>
                    <span className="text-xs font-medium text-gb-gray">Valor Cuota</span>
                    <span></span>
                  </div>
                  {priceRows.map((row, i) => (
                    <div key={i} className="grid grid-cols-[1fr_1fr_32px] gap-2 px-3 py-1.5 border-t border-gb-border">
                      <input
                        type="date"
                        value={row.date}
                        onChange={(e) => {
                          const updated = [...priceRows];
                          updated[i] = { ...updated[i], date: e.target.value };
                          setPriceRows(updated);
                        }}
                        className="px-2 py-1 border border-gb-border rounded text-sm focus:ring-1 focus:ring-gb-accent"
                      />
                      <input
                        type="number"
                        step="0.01"
                        value={row.price}
                        onChange={(e) => {
                          const updated = [...priceRows];
                          updated[i] = { ...updated[i], price: e.target.value };
                          setPriceRows(updated);
                        }}
                        placeholder="1674.94"
                        className="px-2 py-1 border border-gb-border rounded text-sm focus:ring-1 focus:ring-gb-accent"
                      />
                      <button
                        onClick={() => priceRows.length > 1 && setPriceRows(priceRows.filter((_, j) => j !== i))}
                        className={`text-sm ${priceRows.length > 1 ? "text-red-400 hover:text-red-600" : "text-gb-border cursor-default"}`}
                        title="Eliminar fila"
                      >
                        &times;
                      </button>
                    </div>
                  ))}
                </div>
                <button
                  onClick={() => setPriceRows([...priceRows, { date: "", price: "" }])}
                  className="mt-2 text-xs text-gb-accent hover:text-gb-accent/80 font-medium"
                >
                  + Agregar fila
                </button>
              </div>
            )}

            {uploadResult && (
              <div className={`mt-3 p-3 rounded-lg text-sm ${
                uploadResult.success ? "bg-green-50 text-green-800" : "bg-red-50 text-red-800"
              }`}>
                <p className="font-medium">{uploadResult.message}</p>
                {uploadResult.errors && uploadResult.errors.length > 0 && (
                  <ul className="mt-1 space-y-0.5 text-xs">
                    {uploadResult.errors.map((e, i) => (
                      <li key={i}>{e}</li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            <div className="flex justify-end gap-3 mt-4">
              <button
                onClick={() => { setShowManualPriceModal(false); setUploadResult(null); setSelectedFund(null); setPriceRows([{ date: "", price: "" }]); }}
                className="px-4 py-2 text-sm font-medium text-gb-gray hover:text-gb-black transition-colors"
              >
                Cerrar
              </button>
              <button
                onClick={uploadManualPrices}
                disabled={uploadingPrices || !selectedFund || priceRows.every(r => !r.date || !r.price)}
                className="px-4 py-2 bg-gb-accent hover:bg-gb-accent/90 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
              >
                {uploadingPrices ? "Subiendo..." : "Guardar Precios"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
