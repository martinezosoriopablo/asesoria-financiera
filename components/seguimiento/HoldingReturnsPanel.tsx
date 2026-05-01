"use client";

import React, { useState, useMemo, useEffect } from "react";
import {
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
  Legend,
} from "recharts";
import { TrendingUp, TrendingDown, BarChart3, Loader } from "lucide-react";
import { formatNumber, formatPercent } from "@/lib/format";
import type { Snapshot } from "./SeguimientoPage";

interface HoldingData {
  fundName: string;
  securityId?: string | null;
  serie?: string;
  quantity?: number;
  marketPrice?: number;
  unitCost?: number;
  costBasis?: number;
  marketValue: number;
  marketValueCLP?: number;
  assetClass?: string;
  currency?: string;
  returnFromBase?: number;
  weight?: number;
}

interface FundMeta {
  fundName: string;
  run: string;
  serie: string;
  tac: number | null;
  quantity: number;
}

interface Props {
  snapshots: Snapshot[];
  clientId?: string;
  onCurrentValueUpdate?: (totalValue: number) => void;
  onPriceDateUpdate?: (date: string) => void;
  fundsMeta?: FundMeta[];
}

// Colors for the chart lines
const CHART_COLORS = [
  "#2563eb", "#dc2626", "#16a34a", "#ca8a04", "#9333ea",
  "#0891b2", "#e11d48", "#65a30d", "#c026d3", "#ea580c",
  "#4f46e5", "#059669",
];

interface FintualPrice {
  fundName: string;
  fintualId: string | null;
  fintualName: string | null;
  serieName: string | null;
  currentPrice: number | null;
  lastPriceDate: string | null;
  currency: string;
}

export default function HoldingReturnsPanel({ snapshots, clientId, onCurrentValueUpdate, onPriceDateUpdate, fundsMeta }: Props) {
  const [selectedHoldings, setSelectedHoldings] = useState<Set<string>>(new Set());
  const showChart = false; // Chart removed per user request
  const [fintualPrices, setFintualPrices] = useState<Map<string, FintualPrice>>(new Map());
  const [loadingPrices, setLoadingPrices] = useState(false);
  const [historicalSeries, setHistoricalSeries] = useState<Array<Record<string, string | number>>>([]);
  const [loadingHistorical, setLoadingHistorical] = useState(false);

  // Extract unique holdings and their returns over time from snapshots
  const { holdingSummaries, chartData, latestRawHoldings } = useMemo(() => {
    // Get the latest snapshot with holdings that has return data
    const snapshotsWithHoldings = snapshots
      .filter((s) => s.holdings && Array.isArray(s.holdings) && s.holdings.length > 0)
      .sort((a, b) => a.snapshot_date.localeCompare(b.snapshot_date));

    if (snapshotsWithHoldings.length === 0) {
      return { holdingSummaries: [], chartData: [] };
    }

    // Collect all unique holding names
    const holdingNames = new Set<string>();
    for (const snap of snapshotsWithHoldings) {
      for (const h of snap.holdings as HoldingData[]) {
        if (h.fundName) holdingNames.add(h.fundName);
      }
    }

    // For each holding, find the purchase price from the FIRST cartola where it appears
    // Cartolas are sorted chronologically, so first match = original purchase price
    const cartolas = snapshotsWithHoldings.filter(
      (s) => s.source === "statement" || s.source === "manual" || s.source === "excel"
    );
    const basePrices = new Map<string, number>();
    const purchaseDates = new Map<string, string>();

    // Helper: extract unit price from a holding using all available fields
    const extractUnitPrice = (h: HoldingData): number => {
      // 1. Explicit marketPrice (cuota vigente, precio de mercado)
      const mp = Number(h.marketPrice);
      if (mp > 0 && isFinite(mp)) return mp;
      // 2. unitCost (costo unitario)
      const uc = Number(h.unitCost);
      if (uc > 0 && isFinite(uc)) return uc;
      // 3. Derived from marketValue / quantity
      const qty = Number(h.quantity);
      const mv = Number(h.marketValue);
      if (qty > 0 && mv > 0) return mv / qty;
      // 4. Derived from marketValueCLP / quantity (when currency conversion applied)
      const mvCLP = Number(h.marketValueCLP);
      if (qty > 0 && mvCLP > 0) return mvCLP / qty;
      // 5. Derived from costBasis / quantity
      const cb = Number(h.costBasis);
      if (qty > 0 && cb > 0) return cb / qty;
      return 0;
    };

    for (const cartola of cartolas) {
      if (!cartola.holdings) continue;
      for (const h of cartola.holdings as HoldingData[]) {
        // Only set if we haven't seen this holding before (first appearance = purchase)
        if (h.fundName && !basePrices.has(h.fundName)) {
          const price = extractUnitPrice(h);
          if (price > 0) {
            basePrices.set(h.fundName, price);
            purchaseDates.set(h.fundName, cartola.snapshot_date);
          }
        }
      }
    }

    // Build summary from latest snapshot — prefer api-prices snapshot for current prices
    // (cartola snapshots have frozen prices from upload date, api-prices have live prices)
    const apiPricesSnaps = snapshotsWithHoldings.filter(s => s.source === "api-prices");
    const latestSnap = apiPricesSnaps.length > 0
      ? apiPricesSnaps[apiPricesSnaps.length - 1]
      : snapshotsWithHoldings[snapshotsWithHoldings.length - 1];
    const latestHoldings = latestSnap.holdings as HoldingData[];
    const latestTotal = latestSnap.total_value || latestHoldings.reduce((s, h) => s + (h.marketValue || 0), 0);

    const summaries = latestHoldings
      .filter((h) => h.fundName && h.marketValue > 0)
      .map((h) => {
        const currentPrice = extractUnitPrice(h);
        const purchasePrice = basePrices.get(h.fundName) || currentPrice;
        const returnCalc = purchasePrice > 0 ? ((currentPrice / purchasePrice) - 1) * 100 : 0;

        return {
          fundName: h.fundName,
          marketValue: h.marketValue,
          currentPrice,
          purchasePrice,
          purchaseDate: purchaseDates.get(h.fundName) || null,
          quantity: h.quantity || 0,
          weight: h.weight || (latestTotal > 0 ? Math.round((h.marketValue / latestTotal) * 10000) / 100 : 0),
          // Use stored returnFromBase if available, otherwise calculate from prices
          returnFromBase: h.returnFromBase ?? Math.round(returnCalc * 100) / 100,
          assetClass: h.assetClass || "equity",
          currency: h.currency || "CLP",
        };
      })
      .sort((a, b) => (b.weight || 0) - (a.weight || 0));

    // Build chart data: date → { date, holding1Return, holding2Return, ... }
    const data: Array<Record<string, string | number>> = [];

    for (const snap of snapshotsWithHoldings) {
      const holdings = snap.holdings as HoldingData[];
      if (!holdings) continue;

      const snapTotal = snap.total_value || holdings.reduce((s, h) => s + (h.marketValue || 0), 0);

      const point: Record<string, string | number> = {
        date: new Date(snap.snapshot_date).toLocaleDateString("es-CL", {
          day: "2-digit",
          month: "short",
        }),
        fullDate: snap.snapshot_date,
      };

      // Calculate portfolio return as weighted sum
      let portfolioReturn = 0;
      let totalWeight = 0;

      for (const h of holdings) {
        if (h.fundName && h.returnFromBase !== undefined && h.returnFromBase !== null) {
          point[h.fundName] = Math.round(h.returnFromBase * 100) / 100;
          const w = h.weight || (snapTotal > 0 ? (h.marketValue / snapTotal) * 100 : 0);
          if (w > 0) {
            portfolioReturn += (h.returnFromBase * w) / 100;
            totalWeight += w;
          }
        }
      }

      if (totalWeight > 0) {
        point["Portafolio"] = Math.round(portfolioReturn * 100) / 100;
      }

      data.push(point);
    }

    return { holdingSummaries: summaries, chartData: data, latestRawHoldings: latestHoldings };
  }, [snapshots]);

  // Fetch current prices from Fintual API
  useEffect(() => {
    if (holdingSummaries.length === 0) return;

    const fetchPrices = async () => {
      setLoadingPrices(true);
      try {
        const holdingsToFetch = holdingSummaries.map((h) => {
          const raw = (latestRawHoldings as HoldingData[])?.find(
            (sh) => sh.fundName === h.fundName
          );
          return {
            fundName: h.fundName,
            securityId: raw?.securityId || null,
            serie: raw?.serie || null,
            currency: h.currency || "CLP",
            cartolaPrice: h.purchasePrice || 0,
          };
        });

        const res = await fetch("/api/portfolio/current-prices", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ holdings: holdingsToFetch, clientId }),
        });

        if (res.ok) {
          const data = await res.json();
          if (data.success && data.prices) {
            const priceMap = new Map<string, FintualPrice>();
            for (const p of data.prices) {
              priceMap.set(p.fundName, p);
            }
            setFintualPrices(priceMap);
          }
        }
      } catch (err) {
        console.error("Error fetching Fintual prices:", err);
      } finally {
        setLoadingPrices(false);
      }
    };

    fetchPrices();
  }, [holdingSummaries, latestRawHoldings, clientId]);

  // Fetch historical price series for the chart (cuotas × valor_cuota per date)
  useEffect(() => {
    if (holdingSummaries.length === 0) return;

    const holdingsWithRun = holdingSummaries.map((h) => {
      const raw = (latestRawHoldings as HoldingData[])?.find(
        (sh) => sh.fundName === h.fundName
      );
      const secId = raw?.securityId || "";
      const isRun = /^\d{3,6}$/.test(secId.trim());
      return {
        fundName: h.fundName,
        run: isRun ? parseInt(secId.trim(), 10) : 0,
        serie: raw?.serie || "",
        quantity: h.quantity,
        currency: h.currency || "CLP",
      };
    }).filter((h) => h.run > 0 && h.serie);

    if (holdingsWithRun.length === 0) return;

    // Use the earliest purchase date as fromDate
    const dates = holdingSummaries
      .map((h) => h.purchaseDate)
      .filter(Boolean) as string[];
    const fromDate = dates.length > 0
      ? dates.sort()[0]
      : undefined;

    const fetchHistorical = async () => {
      setLoadingHistorical(true);
      try {
        const res = await fetch("/api/portfolio/historical-prices", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ holdings: holdingsWithRun, fromDate }),
        });
        if (res.ok) {
          const data = await res.json();
          if (data.success && data.series) {
            setHistoricalSeries(data.series);
          }
        }
      } catch (err) {
        console.error("Error fetching historical prices:", err);
      } finally {
        setLoadingHistorical(false);
      }
    };

    fetchHistorical();
  }, [holdingSummaries, latestRawHoldings]);

  // Build TAC map from fundsMeta (match by RUN+serie from raw holdings)
  const tacByFundName = useMemo(() => {
    const map = new Map<string, number | null>();
    if (!fundsMeta || fundsMeta.length === 0 || !latestRawHoldings) return map;

    for (const raw of latestRawHoldings as HoldingData[]) {
      const secId = (raw.securityId || "").trim();
      const serie = (raw.serie || "").trim();
      if (!secId || !serie) continue;
      const meta = fundsMeta.find((m) => m.run === secId && m.serie.toUpperCase() === serie.toUpperCase());
      if (meta && raw.fundName) map.set(raw.fundName, meta.tac);
    }
    return map;
  }, [fundsMeta, latestRawHoldings]);

  // Merge Fintual prices into summaries
  const enrichedSummaries = useMemo(() => {
    const base = holdingSummaries.map((h) => ({
      ...h,
      tac: tacByFundName.get(h.fundName) ?? null as number | null,
    }));

    if (fintualPrices.size === 0) return base;

    return base.map((h) => {
      const fp = fintualPrices.get(h.fundName);
      if (!fp || !fp.currentPrice || fp.currentPrice <= 0) return h;

      const fintualCurrentPrice = fp.currentPrice;

      const returnCalc = h.purchasePrice > 0
        ? ((fintualCurrentPrice / h.purchasePrice) - 1) * 100
        : 0;

      // For USD funds, keep the original CLP market value from the snapshot
      // For CLP funds, recalculate with the updated price
      const holdingIsUSD = h.currency === "USD";
      const newMarketValue = holdingIsUSD
        ? h.marketValue
        : (h.quantity > 0 ? h.quantity * fintualCurrentPrice : h.marketValue);

      return {
        ...h,
        currentPrice: fintualCurrentPrice,
        marketValue: newMarketValue,
        returnFromBase: Math.round(returnCalc * 100) / 100,
        fintualName: fp.fintualName,
        serieName: fp.serieName,
        lastPriceDate: fp.lastPriceDate,
      };
    });
  }, [holdingSummaries, fintualPrices, tacByFundName]);

  // Notify parent of updated total value and price date
  useEffect(() => {
    if (enrichedSummaries.length === 0) return;
    const total = enrichedSummaries.reduce((sum, h) => sum + (h.marketValue || 0), 0);
    if (total > 0 && onCurrentValueUpdate) onCurrentValueUpdate(total);

    // Report the most recent price date from enriched data
    if (onPriceDateUpdate) {
      const dates = enrichedSummaries
        .map((h) => (h as Record<string, unknown>).lastPriceDate as string | undefined)
        .filter(Boolean) as string[];
      if (dates.length > 0) {
        dates.sort();
        onPriceDateUpdate(dates[dates.length - 1]);
      }
    }
  }, [enrichedSummaries, onCurrentValueUpdate, onPriceDateUpdate]);

  if (holdingSummaries.length === 0) {
    return null;
  }

  const toggleHolding = (name: string) => {
    setSelectedHoldings((prev) => {
      const next = new Set(prev);
      if (next.has(name)) {
        next.delete(name);
      } else {
        next.add(name);
      }
      return next;
    });
  };

  const selectAll = () => {
    setSelectedHoldings(new Set(enrichedSummaries.map((h) => h.fundName)));
  };

  const clearAll = () => {
    setSelectedHoldings(new Set());
  };

  // Build chart data from historical prices (cuotas × valor_cuota)
  const valueChartData = useMemo(() => {
    if (historicalSeries.length === 0) return [];

    return historicalSeries.map((point) => {
      const fecha = point.fecha as string;
      const formatted = new Date(fecha + "T12:00:00Z").toLocaleDateString("es-CL", {
        day: "2-digit",
        month: "short",
      });
      return {
        ...point,
        date: formatted,
        fullDate: fecha,
      };
    });
  }, [historicalSeries]);

  // Holdings to show in chart (selected ones)
  const chartHoldings = enrichedSummaries
    .filter((h) => selectedHoldings.has(h.fundName))
    .map((h, i) => ({
      name: h.fundName,
      color: CHART_COLORS[i % CHART_COLORS.length],
    }));

  // Calculate portfolio-level return from weighted holding returns
  const portfolioReturn = enrichedSummaries.reduce((sum, h) => {
    if (h.returnFromBase !== null && h.weight > 0) {
      return sum + (h.returnFromBase * h.weight) / 100;
    }
    return sum;
  }, 0);

  return (
    <div className="bg-white rounded-lg border border-gb-border shadow-sm mb-6">
      <div className="px-6 py-4 border-b border-gb-border flex items-center justify-between">
        <div className="flex items-center gap-2">
          <BarChart3 className="w-4 h-4 text-blue-600" />
          <h2 className="text-base font-semibold text-gb-black">
            Rentabilidad por Activo
          </h2>
          <span className="text-xs text-gb-gray ml-1">(desde inicio de cartola)</span>
          {loadingPrices ? (
            <Loader className="w-4 h-4 text-blue-500 animate-spin ml-2" />
          ) : (
            <span className={`ml-2 text-sm font-semibold ${portfolioReturn >= 0 ? "text-green-600" : "text-red-600"}`}>
              Portafolio: {formatPercent(portfolioReturn)}
            </span>
          )}
        </div>
      </div>

      {/* Holdings table */}
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-gb-border bg-slate-50">
              {showChart && (
                <th className="px-3 py-2 text-center text-xs font-semibold text-gb-gray w-8">
                  <input
                    type="checkbox"
                    checked={selectedHoldings.size === enrichedSummaries.length}
                    onChange={() => selectedHoldings.size === enrichedSummaries.length ? clearAll() : selectAll()}
                    className="rounded border-gray-300"
                  />
                </th>
              )}
              <th className="px-3 py-2 text-left text-xs font-semibold text-gb-gray uppercase">
                Activo
              </th>
              <th className="px-3 py-2 text-right text-xs font-semibold text-gb-gray uppercase">
                Peso
              </th>
              <th className="px-3 py-2 text-right text-xs font-semibold text-gb-gray uppercase">
                P. Compra
              </th>
              <th className="px-3 py-2 text-right text-xs font-semibold text-gb-gray uppercase">
                P. Actual
              </th>
              <th className="px-3 py-2 text-right text-xs font-semibold text-gb-gray uppercase">
                Valor
              </th>
              <th className="px-3 py-2 text-right text-xs font-semibold text-gb-gray uppercase">
                Rentab.
              </th>
              <th className="px-3 py-2 text-right text-xs font-semibold text-gb-gray uppercase">
                Contrib.
              </th>
              <th className="px-3 py-2 text-right text-xs font-semibold text-gb-gray uppercase">
                TAC
              </th>
              <th className="px-3 py-2 text-center text-xs font-semibold text-gb-gray uppercase">
                Clase
              </th>
            </tr>
          </thead>
          <tbody>
            {enrichedSummaries.map((h, i) => {
              const contribution = h.returnFromBase !== null && h.weight > 0
                ? (h.returnFromBase * h.weight) / 100
                : null;

              return (
                <tr
                  key={h.fundName}
                  className="border-b border-gb-border hover:bg-blue-50 transition-colors"
                >
                  {showChart && (
                    <td className="px-3 py-2 text-center">
                      <input
                        type="checkbox"
                        checked={selectedHoldings.has(h.fundName)}
                        onChange={() => toggleHolding(h.fundName)}
                        className="rounded border-gray-300"
                        style={selectedHoldings.has(h.fundName) ? {
                          accentColor: CHART_COLORS[i % CHART_COLORS.length]
                        } : undefined}
                      />
                    </td>
                  )}
                  <td className="px-3 py-2">
                    <span className="text-[11px] leading-tight font-medium text-gb-black block max-w-[280px]">
                      {h.fundName}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <div
                        className="h-1.5 rounded-full bg-blue-500"
                        style={{ width: `${Math.min(h.weight, 100) * 0.4}px` }}
                      />
                      <span className="text-xs font-medium text-gb-black">
                        {formatNumber(h.weight, 1)}%
                      </span>
                    </div>
                  </td>
                  <td className="px-3 py-2 text-right">
                    <span
                      className="text-xs text-gb-gray cursor-help"
                      title={h.purchaseDate ? `Cartola del ${new Date(h.purchaseDate).toLocaleDateString("es-CL")}` : "Precio de primera cartola"}
                    >
                      {h.currency === "USD" ? "US$" : "$"}{formatNumber(h.purchasePrice, h.purchasePrice < 100 ? 2 : 0)}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right">
                    <span
                      className={`text-xs font-medium ${
                        h.currentPrice > h.purchasePrice ? "text-green-700" :
                        h.currentPrice < h.purchasePrice ? "text-red-700" : "text-gb-black"
                      }`}
                      title={
                        (h as Record<string, unknown>).fintualName
                          ? `Fintual: ${(h as Record<string, unknown>).fintualName}${(h as Record<string, unknown>).serieName ? ` (${(h as Record<string, unknown>).serieName})` : ""}${(h as Record<string, unknown>).lastPriceDate ? `\nFecha: ${(h as Record<string, unknown>).lastPriceDate}` : ""}`
                          : "Precio de última cartola"
                      }
                    >
                      {h.currency === "USD" ? "US$" : "$"}{formatNumber(h.currentPrice, h.currentPrice < 100 ? 2 : 0)}
                      {!!(h as Record<string, unknown>).fintualName && (
                        <span className="text-green-500 ml-0.5">*</span>
                      )}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right">
                    <span className="text-sm font-medium text-gb-black">
                      ${formatNumber(h.marketValue, 0)}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right">
                    {h.returnFromBase !== null ? (
                      <span
                        className={`inline-flex items-center gap-0.5 text-sm font-semibold ${
                          h.returnFromBase >= 0 ? "text-green-600" : "text-red-600"
                        }`}
                      >
                        {h.returnFromBase >= 0 ? (
                          <TrendingUp className="w-3 h-3" />
                        ) : (
                          <TrendingDown className="w-3 h-3" />
                        )}
                        {formatPercent(h.returnFromBase)}
                      </span>
                    ) : (
                      <span className="text-xs text-gb-gray">-</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right">
                    {contribution !== null ? (
                      <span className={`text-xs font-medium ${contribution >= 0 ? "text-green-600" : "text-red-600"}`}>
                        {formatPercent(contribution)}
                      </span>
                    ) : (
                      <span className="text-xs text-gb-gray">-</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right">
                    {h.tac !== null && h.tac !== undefined ? (
                      <span className="text-xs font-medium text-gb-black">{formatNumber(h.tac, 2)}%</span>
                    ) : (
                      <span className="text-xs text-gb-gray">-</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-center">
                    <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${
                      /equity/i.test(h.assetClass || "") ? "bg-blue-100 text-blue-700" :
                      /fixed|renta\s*fija/i.test(h.assetClass || "") ? "bg-green-100 text-green-700" :
                      /altern/i.test(h.assetClass || "") ? "bg-purple-100 text-purple-700" :
                      /cash|efect/i.test(h.assetClass || "") ? "bg-gray-100 text-gray-700" :
                      "bg-slate-100 text-slate-600"
                    }`}>
                      {/equity/i.test(h.assetClass || "") ? "RV" :
                       /fixed|renta\s*fija/i.test(h.assetClass || "") ? "RF" :
                       /altern/i.test(h.assetClass || "") ? "Alt" :
                       /cash|efect/i.test(h.assetClass || "") ? "Cash" :
                       /balanced|balance/i.test(h.assetClass || "") ? "Bal" : h.assetClass || "-"}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Chart - valor del portafolio en el tiempo */}
      {showChart && (
        <div className="px-6 py-4 border-t border-gb-border">
          {loadingHistorical ? (
            <div className="flex items-center justify-center gap-2 py-8">
              <Loader className="w-4 h-4 text-blue-500 animate-spin" />
              <span className="text-sm text-gb-gray">Cargando serie historica...</span>
            </div>
          ) : valueChartData.length < 2 ? (
            <p className="text-sm text-gb-gray text-center py-8">
              No hay datos historicos de precios para graficar
            </p>
          ) : selectedHoldings.size === 0 ? (
            <p className="text-sm text-gb-gray text-center py-8">
              Selecciona activos de la tabla para ver su evolucion en el grafico
            </p>
          ) : (
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={valueChartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e5e5" />
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 10, fill: "#666" }}
                    tickLine={false}
                  />
                  <YAxis
                    tickFormatter={(v) => `$${formatNumber(v, 0)}`}
                    tick={{ fontSize: 10, fill: "#666" }}
                    tickLine={false}
                    axisLine={false}
                    width={80}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "white",
                      border: "1px solid #e5e5e5",
                      borderRadius: "8px",
                      fontSize: "11px",
                    }}
                    formatter={(value: number | undefined) => [`$${formatNumber(value ?? 0, 0)}`, ""]}
                    labelFormatter={(label) => `${label}`}
                  />
                  <Legend
                    wrapperStyle={{ fontSize: "11px" }}
                  />
                  {/* Total portfolio line */}
                  <Line
                    type="monotone"
                    dataKey="total"
                    stroke="#111827"
                    strokeWidth={2.5}
                    strokeDasharray="5 5"
                    dot={false}
                    name="Total Portafolio"
                  />
                  {chartHoldings.map((h) => (
                    <Line
                      key={h.name}
                      type="monotone"
                      dataKey={h.name}
                      stroke={h.color}
                      strokeWidth={1.5}
                      dot={false}
                      name={h.name.length > 25 ? h.name.substring(0, 25) + "..." : h.name}
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
