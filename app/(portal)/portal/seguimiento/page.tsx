"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import { formatCurrency } from "@/lib/format";
import EvolucionChart from "@/components/seguimiento/EvolucionChart";
import PerformanceAttribution from "@/components/seguimiento/PerformanceAttribution";
import RentabilidadPorActivo from "@/components/seguimiento/RentabilidadPorActivo";
import RetornosComparados from "@/components/seguimiento/RetornosComparados";
import HoldingReturnsPanel, { type HoldingReturnsData } from "@/components/seguimiento/HoldingReturnsPanel";
import PortfolioBreakdownPies from "@/components/seguimiento/PortfolioBreakdownPies";
import RadiografiaCartola from "@/components/seguimiento/RadiografiaCartola";
import PortalTopbar from "@/components/portal/PortalTopbar";
import type { BenchmarkComponent } from "@/lib/prices/types";
import { detectSerieCode } from "@/lib/fund-utils";
import {
  Loader,
  AlertTriangle,
} from "lucide-react";

// ---------- Interfaces (same as SeguimientoPage) ----------

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

interface Snapshot {
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
  benchmarkConfig?: BenchmarkComponent[] | null;
}

// ---------- Component ----------

export default function PortalSeguimientoPage() {
  const [data, setData] = useState<SeguimientoData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [period, setPeriod] = useState("ALL");
  const [clientInfo, setClientInfo] = useState<{ nombre: string; email: string } | null>(null);

  // Historical price series
  const [historicalSeries, setHistoricalSeries] = useState<Array<{ fecha: string; total: number; [key: string]: string | number }>>([]);
  const [fundsMeta, setFundsMeta] = useState<Array<{ fundName: string; run: string; serie: string; tac: number | null; moneda: string; quantity: number }>>([]);
  const [loadingHistorical, setLoadingHistorical] = useState(false);
  const [holdingReturnsData, setHoldingReturnsData] = useState<HoldingReturnsData | null>(null);
  const [exchangeRates, setExchangeRates] = useState<{ uf: number; usd: number } | null>(null);
  const [benchmarkConfig, setBenchmarkConfig] = useState<BenchmarkComponent[] | null>(null);
  const [benchmarkReturns, setBenchmarkReturns] = useState<Record<string, number> | null>(null);
  const [benchmarkLabel, setBenchmarkLabel] = useState("UF +2%");

  // Fetch portal /me for topbar
  useEffect(() => {
    fetch("/api/portal/me")
      .then((res) => res.json())
      .then((d) => {
        if (d.client)
          setClientInfo({
            nombre: `${d.client.nombre} ${d.client.apellido}`,
            email: d.client.email,
          });
      })
      .catch(() => {});
  }, []);

  // Fetch seguimiento data
  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/portal/seguimiento?period=ALL");
      const result = await res.json();
      if (result.success) {
        setData(result.data);
        if (result.data?.benchmarkConfig) {
          setBenchmarkConfig(result.data.benchmarkConfig);
        }
      } else {
        setError(result.error || "Error al cargar datos");
      }
    } catch {
      setError("Error de conexion");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Fetch exchange rates
  useEffect(() => {
    fetch("/api/exchange-rates")
      .then((res) => res.json())
      .then((d) => {
        if (d.success) setExchangeRates({ uf: d.uf, usd: d.usd });
      })
      .catch(() => {});
  }, []);

  // Fetch benchmark returns when config and snapshots available
  useEffect(() => {
    if (!data || !benchmarkConfig || data.snapshots.length < 2) return;

    const cartolaSnaps = data.snapshots.filter(
      (s) => s.source === "statement" || s.source === "manual" || s.source === "excel"
    );
    if (cartolaSnaps.length < 1) return;

    const firstDate = cartolaSnaps[0].snapshot_date;
    const today = new Date().toISOString().split("T")[0];

    fetch("/api/prices/benchmark-returns", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        benchmark: benchmarkConfig,
        fromDate: firstDate,
        toDate: today,
      }),
    })
      .then((r) => r.json())
      .then((d) => {
        if (d.success) {
          setBenchmarkReturns(d.data.returns);
          setBenchmarkLabel(d.data.label);
        }
      })
      .catch(() => {});
  }, [data, benchmarkConfig]);

  // Derived values
  const snapshots = useMemo(() => data?.snapshots || [], [data]);

  const latestSnapshot = useMemo(() => {
    if (!snapshots.length) return null;
    return snapshots[snapshots.length - 1];
  }, [snapshots]);

  // Filter snapshots by period (for chart display)
  const filteredSnapshots = useMemo(() => {
    if (period === "ALL") return snapshots;
    const now = new Date();
    const start = new Date();
    switch (period) {
      case "1M": start.setMonth(now.getMonth() - 1); break;
      case "3M": start.setMonth(now.getMonth() - 3); break;
      case "6M": start.setMonth(now.getMonth() - 6); break;
      case "1Y": start.setFullYear(now.getFullYear() - 1); break;
    }
    const startStr = start.toISOString().split("T")[0];
    return snapshots.filter((s) => s.snapshot_date >= startStr);
  }, [snapshots, period]);

  // Fetch historical prices when snapshot data is available
  useEffect(() => {
    if (!latestSnapshot?.holdings || (latestSnapshot.holdings as unknown[]).length === 0) return;
    setLoadingHistorical(true);

    const holdings = latestSnapshot.holdings as Array<Record<string, unknown>>;

    const chileanHoldings: Array<{ fundName: string; run: number; serie: string; quantity: number; currency: string; cartolaPrice: number }> = [];
    const byNameHoldings: Array<{ fundName: string; serie: string; quantity: number; currency: string; cartolaPrice: number }> = [];
    const intlHoldings: Array<{ fundName: string; securityId: string; quantity: number; marketValue: number; currency: string }> = [];

    for (const h of holdings) {
      const name = (h.fundName || h.nombre || h.name || "") as string;
      const secId = ((h.securityId || h.security_id || "") as string).trim();
      const qty = Number(h.quantity || h.cantidad || 0);
      const mv = Number(h.marketValue || h.valor || 0);
      const curr = (h.currency || h.moneda || "CLP") as string;
      const serie = (h.serie || detectSerieCode(name) || "") as string;
      const cartolaPrice = mv && qty ? mv / qty : 0;

      // Check for numeric RUN (Chilean fund)
      if (/^\d{3,6}$/.test(secId) && qty > 0) {
        chileanHoldings.push({
          fundName: name,
          run: parseInt(secId, 10),
          serie,
          quantity: qty,
          currency: curr,
          cartolaPrice,
        });
      } else if (
        secId &&
        (/^CFI/.test(secId.toUpperCase()) ||
          /^[A-Z]{3,10}CL$/.test(secId.toUpperCase()) ||
          secId.includes(".SN") ||
          /^[A-Z]{1,5}$/.test(secId) ||
          /^[A-Z0-9]{9}$/i.test(secId))
      ) {
        intlHoldings.push({
          fundName: name,
          securityId: secId,
          quantity: qty,
          marketValue: mv,
          currency: curr,
        });
      } else if (name.length > 3 && qty > 0) {
        byNameHoldings.push({
          fundName: name,
          serie,
          quantity: qty,
          currency: curr,
          cartolaPrice,
        });
      }
    }

    if (chileanHoldings.length === 0 && intlHoldings.length === 0 && byNameHoldings.length === 0) {
      setLoadingHistorical(false);
      return;
    }

    // Go back 1 year + buffer
    const oneYearAgo = new Date();
    oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
    oneYearAgo.setDate(oneYearAgo.getDate() - 7);
    const fromDate = oneYearAgo.toISOString().split("T")[0];

    fetch("/api/portfolio/historical-prices", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        holdings: chileanHoldings,
        holdingsByName: byNameHoldings.length > 0 ? byNameHoldings : undefined,
        internationalHoldings: intlHoldings.length > 0 ? intlHoldings : undefined,
        fromDate,
      }),
    })
      .then((res) => res.json())
      .then((result) => {
        if (result.success && result.series) {
          setHistoricalSeries(result.series);
          if (result.funds) setFundsMeta(result.funds);
        }
      })
      .catch((err) => console.error("Error fetching historical prices:", err))
      .finally(() => setLoadingHistorical(false));
  }, [latestSnapshot]);

  // ---------- Render ----------

  const periods = ["1M", "3M", "6M", "1Y", "ALL"];

  if (loading) {
    return (
      <div className="min-h-screen bg-gb-light">
        {clientInfo && <PortalTopbar clientName={clientInfo.nombre} clientEmail={clientInfo.email} />}
        <div className="flex items-center justify-center py-20">
          <Loader className="w-6 h-6 text-gb-gray animate-spin" />
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-gb-light">
        {clientInfo && <PortalTopbar clientName={clientInfo.nombre} clientEmail={clientInfo.email} />}
        <div className="max-w-5xl mx-auto px-6 py-8">
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-red-500" />
            <p className="text-sm text-red-700">{error || "Error al cargar datos"}</p>
          </div>
        </div>
      </div>
    );
  }

  const { metrics, client } = data;
  const clientName = `${client.nombre} ${client.apellido}`.trim();

  // Extract holdings from latest snapshot for RadiografiaCartola
  const latestHoldings = useMemo(() => {
    if (!latestSnapshot?.holdings) return [];
    return (latestSnapshot.holdings as Array<{
      fundName?: string;
      securityId?: string;
      serie?: string;
      marketValue?: number;
      marketValueCLP?: number;
      quantity?: number;
      assetClass?: string;
      currency?: string;
      market?: string;
      marketPrice?: number;
      unitCost?: number;
      costBasis?: number;
    }>).map((h) => ({
      fundName: h.fundName || "",
      securityId: h.securityId,
      serie: h.serie,
      marketValue: h.marketValueCLP || h.marketValue || 0,
      quantity: h.quantity,
      assetClass: h.assetClass,
      currency: h.currency,
      market: h.market,
    }));
  }, [latestSnapshot]);

  // PortfolioBreakdownPies holdings
  const breakdownHoldings = useMemo(() => {
    if (holdingReturnsData) {
      const all = [
        ...holdingReturnsData.equityHoldings,
        ...holdingReturnsData.fixedIncomeFundHoldings,
        ...holdingReturnsData.alternativesHoldings,
      ].map((h) => ({
        fundName: h.fundName,
        marketValue: h.marketValue,
        assetClass: h.assetClass,
        currency: h.currency,
      }));
      if (holdingReturnsData.cashValue > 0) {
        all.push({ fundName: "Caja", marketValue: holdingReturnsData.cashValue, assetClass: "cash", currency: "CLP" });
      }
      return all;
    }
    if (!latestSnapshot?.holdings) return [];
    return (latestSnapshot.holdings as Array<{
      fundName?: string; nombre?: string;
      marketValue?: number; valor?: number; marketValueCLP?: number;
      assetClass?: string; asset_class?: string;
      currency?: string; moneda?: string;
    }>).map((h) => ({
      fundName: (h.fundName || h.nombre || "") as string,
      marketValue: Number(h.marketValueCLP || h.marketValue || h.valor || 0),
      assetClass: (h.assetClass || h.asset_class || "other") as string,
      currency: (h.currency || h.moneda || "CLP") as string,
    }));
  }, [holdingReturnsData, latestSnapshot]);

  return (
    <div className="min-h-screen bg-gb-light">
      <PortalTopbar
        clientName={clientInfo?.nombre || clientName}
        clientEmail={clientInfo?.email || client.email}
      />

      <main className="max-w-5xl mx-auto px-6 py-8">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-2xl font-semibold text-gb-black">Seguimiento</h1>
          <p className="text-sm text-gb-gray mt-1">Analisis detallado de tu portafolio</p>
        </div>

        {/* Period selector */}
        <div className="flex gap-1 mb-6">
          {periods.map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                period === p
                  ? "bg-gb-primary text-white"
                  : "bg-white text-gb-gray border border-gb-border hover:bg-gray-50"
              }`}
            >
              {p}
            </button>
          ))}
        </div>

        {/* Metrics cards */}
        {metrics && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
            <div className="bg-white rounded-lg border border-gb-border p-4">
              <p className="text-xs text-gb-gray mb-1">Retorno Total</p>
              <p className={`text-xl font-bold ${metrics.totalReturn >= 0 ? "text-gb-success" : "text-gb-danger"}`}>
                {metrics.totalReturn >= 0 ? "+" : ""}{metrics.totalReturn.toFixed(2)}%
              </p>
              {metrics.isAnnualized && (
                <p className="text-[10px] text-gb-gray mt-1">
                  Anualizado: {metrics.annualizedReturn >= 0 ? "+" : ""}{metrics.annualizedReturn.toFixed(2)}%
                </p>
              )}
            </div>
            <div className="bg-white rounded-lg border border-gb-border p-4">
              <p className="text-xs text-gb-gray mb-1">Valor Actual</p>
              <p className="text-xl font-bold text-gb-black">{formatCurrency(metrics.currentValue)}</p>
            </div>
            <div className="bg-white rounded-lg border border-gb-border p-4">
              <p className="text-xs text-gb-gray mb-1">Valor Inicial</p>
              <p className="text-xl font-bold text-gb-black">{formatCurrency(metrics.initialValue)}</p>
            </div>
            <div className="bg-white rounded-lg border border-gb-border p-4">
              <p className="text-xs text-gb-gray mb-1">Ganancia/Perdida</p>
              <p className={`text-xl font-bold ${(metrics.unrealizedGainLoss ?? 0) >= 0 ? "text-gb-success" : "text-gb-danger"}`}>
                {formatCurrency(metrics.unrealizedGainLoss ?? (metrics.currentValue - metrics.initialValue))}
              </p>
            </div>
          </div>
        )}

        {/* Evolution chart */}
        {filteredSnapshots.length >= 1 && (
          <div className="bg-white rounded-lg border border-gb-border p-6 mb-6">
            <h2 className="text-sm font-semibold text-gb-black mb-4">Evolucion del Portafolio</h2>
            <EvolucionChart
              snapshots={filteredSnapshots}
              historicalSeries={historicalSeries}
              loadingHistorical={loadingHistorical}
              period={period}
            />
          </div>
        )}

        {/* Portfolio breakdown pies */}
        {breakdownHoldings.length > 0 && (
          <PortfolioBreakdownPies holdings={breakdownHoldings} />
        )}

        {/* Holding Returns Panel */}
        {snapshots.length > 0 && (
          <HoldingReturnsPanel
            snapshots={snapshots}
            clientId={client.id}
            onHoldingReturnsReady={setHoldingReturnsData}
            fundsMeta={fundsMeta}
            usdRate={exchangeRates?.usd}
            ufRate={exchangeRates?.uf}
          />
        )}

        {/* Performance Attribution */}
        {(snapshots.length >= 2 || holdingReturnsData) && (
          <PerformanceAttribution
            snapshots={snapshots}
            recommendation={data.recommendation}
            previousPortfolio={snapshots.find((s) => s.is_baseline) || null}
            totalReturn={metrics?.totalReturn}
            holdingReturnsData={holdingReturnsData}
          />
        )}

        {/* Rentabilidad por Activo */}
        {holdingReturnsData && (
          <RentabilidadPorActivo
            holdingReturnsData={holdingReturnsData}
            snapshots={snapshots}
          />
        )}

        {/* Retornos Comparados */}
        {(snapshots.length >= 2 || historicalSeries.length > 1) && (
          <RetornosComparados
            snapshots={snapshots.filter((s) => s.source !== "api-prices")}
            historicalSeries={historicalSeries}
            benchmarkLabel={benchmarkLabel}
            benchmarkReturns={benchmarkReturns || undefined}
            benchmarkMonthlyReturn={!benchmarkReturns ? 0.5 : undefined}
          />
        )}

        {/* Radiografia (read-only) */}
        {latestHoldings.length > 0 && (
          <RadiografiaCartola
            holdings={latestHoldings}
            clientName={clientName}
            clientId={client.id}
            fundsMeta={fundsMeta}
            cartolaDate={latestSnapshot?.snapshot_date}
            perfilRiesgo={client.perfil_riesgo}
            readOnly
            radiografiaEndpoint="/api/portal/radiografia"
          />
        )}
      </main>
    </div>
  );
}
