"use client";

import React, { useState, useMemo, useEffect } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
import { BarChart3, ChevronLeft, ChevronRight, Loader } from "lucide-react";
import { formatNumber } from "@/lib/format";
import type { Snapshot } from "./SeguimientoPage";
import type { HoldingReturnsData } from "./HoldingReturnsPanel";

interface Holding {
  fundName: string;
  securityId?: string;
  serie?: string;
  marketValue: number;
  marketValueCLP?: number;
  marketPrice?: number;
  quantity?: number;
  assetClass?: string;
  currency?: string;
  market?: string;
}

interface Props {
  holdingReturnsData: HoldingReturnsData | null;
  snapshots: Snapshot[];
}

interface ChartItem {
  name: string;
  fullName: string;
  returnPct: number;
  assetClass?: string;
  color: string;
}

const ASSET_COLORS: Record<string, string> = {
  equity: "#22c55e",
  fixedincome: "#3b82f6",
  alternatives: "#a855f7",
  cash: "#94a3b8",
  balanced: "#f59e0b",
};

function getColor(assetClass?: string): string {
  const key = (assetClass || "").toLowerCase().replace(/[\s_]+/g, "");
  return ASSET_COLORS[key] || "#22c55e";
}

interface MonthOption {
  key: string; // "2026-05" or "_acumulado"
  label: string;
  isAccumulated: boolean;
}

export default function RentabilidadPorActivo({ holdingReturnsData, snapshots }: Props) {
  // Cartola snapshots with holdings, sorted by date
  const cartolas = useMemo(() =>
    snapshots
      .filter(s => Array.isArray(s.holdings) && (s.holdings as unknown[]).length > 0)
      .filter(s => s.source === "statement" || s.source === "manual" || s.source === "excel")
      .sort((a, b) => a.snapshot_date.localeCompare(b.snapshot_date)),
    [snapshots]
  );

  // Build month options: from first cartola month through current month
  const monthOptions = useMemo((): MonthOption[] => {
    if (cartolas.length === 0) return [{ key: "_acumulado", label: "Acumulado", isAccumulated: true }];

    const firstDate = new Date(cartolas[0].snapshot_date);
    const firstYM = `${firstDate.getFullYear()}-${String(firstDate.getMonth() + 1).padStart(2, "0")}`;

    const now = new Date();
    const currentYM = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

    // Generate all months from first cartola to current
    const options: MonthOption[] = [];
    let [y, m] = firstYM.split("-").map(Number);
    const [endY, endM] = currentYM.split("-").map(Number);

    while (y < endY || (y === endY && m <= endM)) {
      const ym = `${y}-${String(m).padStart(2, "0")}`;
      const d = new Date(y, m - 1, 1);
      const label = d.toLocaleDateString("es-CL", { month: "long", year: "numeric" });
      options.push({
        key: ym,
        label: label.charAt(0).toUpperCase() + label.slice(1),
        isAccumulated: false,
      });
      m++;
      if (m > 12) { m = 1; y++; }
    }

    // Add "Acumulado" at the end
    const firstLabel = firstDate.toLocaleDateString("es-CL", { month: "short", year: "2-digit" });
    options.push({
      key: "_acumulado",
      label: `Acumulado (desde ${firstLabel})`,
      isAccumulated: true,
    });

    return options;
  }, [cartolas]);

  // Default to last month option (Acumulado)
  const [selectedIdx, setSelectedIdx] = useState(() => Math.max(0, monthOptions.length - 1));
  const selected = monthOptions[Math.min(selectedIdx, monthOptions.length - 1)];

  // State for API-fetched past month data
  const [pastMonthData, setPastMonthData] = useState<ChartItem[] | null>(null);
  const [loadingPast, setLoadingPast] = useState(false);

  // Find the cartola closest to a date (on or before, fallback to nearest after)
  const findCartolaNearest = (dateStr: string): Snapshot | null => {
    let bestBefore: Snapshot | null = null;
    let bestAfter: Snapshot | null = null;
    for (const s of cartolas) {
      if (s.snapshot_date <= dateStr) bestBefore = s;
      else if (!bestAfter) bestAfter = s;
    }
    return bestBefore ?? bestAfter;
  };

  // Acumulado + current month data (computed client-side from holdingReturnsData)
  const localChartData = useMemo((): ChartItem[] | null => {
    if (!holdingReturnsData) return null;

    // === ACUMULADO ===
    if (selected.isAccumulated) {
      const { equityHoldings, fixedIncomeFundHoldings = [], bondHoldings, portfolioReturn } = holdingReturnsData;
      const items: ChartItem[] = [];

      for (const h of equityHoldings) {
        items.push({
          name: h.fundName.length > 30 ? h.fundName.slice(0, 28) + "…" : h.fundName,
          fullName: h.fundName,
          returnPct: h.totalReturn ?? h.returnPrice ?? 0,
          assetClass: h.assetClass,
          color: getColor(h.assetClass),
        });
      }
      for (const h of fixedIncomeFundHoldings) {
        items.push({
          name: h.fundName.length > 30 ? h.fundName.slice(0, 28) + "…" : h.fundName,
          fullName: h.fundName,
          returnPct: h.totalReturn ?? h.returnPrice ?? 0,
          assetClass: "fixedIncome",
          color: getColor("fixedIncome"),
        });
      }
      for (const b of bondHoldings) {
        items.push({
          name: b.fundName.length > 30 ? b.fundName.slice(0, 28) + "…" : b.fundName,
          fullName: b.fundName,
          returnPct: b.totalReturn ?? 0,
          assetClass: "fixedIncome",
          color: getColor("fixedIncome"),
        });
      }

      if (items.length === 0) return [];

      items.push({
        name: "PORTAFOLIO TOTAL",
        fullName: "Portafolio Total",
        returnPct: portfolioReturn,
        assetClass: undefined,
        color: "#1e293b",
      });

      items.sort((a, b) => b.returnPct - a.returnPct);
      return items;
    }

    // === CURRENT MONTH ===
    const now = new Date();
    const [y, m] = selected.key.split("-").map(Number);
    const isCurrentMonth = y === now.getFullYear() && m === now.getMonth() + 1;

    if (isCurrentMonth) {
      // Use baseline snapshot → live prices from holdingReturnsData
      const monthStart = `${y}-${String(m).padStart(2, "0")}-01`;
      const baselineSnap = findCartolaNearest(monthStart);
      if (!baselineSnap?.holdings) return null; // will trigger API fetch

      const startMap = new Map<string, { value: number }>();
      for (const h of baselineSnap.holdings as Holding[]) {
        const val = (h.marketValueCLP || 0) > 0 ? h.marketValueCLP! : h.marketValue ?? 0;
        if (val > 0) startMap.set(h.fundName, { value: val });
      }

      const { equityHoldings, fixedIncomeFundHoldings = [], bondHoldings, totalValue } = holdingReturnsData;
      const items: ChartItem[] = [];

      const processHolding = (fundName: string, currentValue: number, assetClass?: string) => {
        const startEntry = startMap.get(fundName);
        if (!startEntry || startEntry.value <= 0 || currentValue <= 0) return;
        const ret = ((currentValue / startEntry.value) - 1) * 100;
        items.push({
          name: fundName.length > 30 ? fundName.slice(0, 28) + "…" : fundName,
          fullName: fundName,
          returnPct: ret,
          assetClass,
          color: getColor(assetClass),
        });
      };

      for (const h of equityHoldings) processHolding(h.fundName, h.marketValue, h.assetClass);
      for (const h of fixedIncomeFundHoldings) processHolding(h.fundName, h.marketValue, "fixedIncome");
      for (const b of bondHoldings) processHolding(b.fundName, b.marketValue, "fixedIncome");

      if (items.length === 0) return null; // fallback to API fetch

      if (baselineSnap.total_value > 0 && totalValue > 0) {
        items.push({
          name: "PORTAFOLIO TOTAL",
          fullName: "Portafolio Total",
          returnPct: ((totalValue / baselineSnap.total_value) - 1) * 100,
          assetClass: undefined,
          color: "#1e293b",
        });
      }

      items.sort((a, b) => b.returnPct - a.returnPct);
      return items;
    }

    // Past month → return null to trigger API fetch
    return null;
  }, [holdingReturnsData, selected, cartolas]);

  // Fetch month data from API when localChartData is null and not accumulated
  useEffect(() => {
    if (localChartData !== null || selected.isAccumulated || !holdingReturnsData) {
      setPastMonthData(null);
      return;
    }

    const [y, m] = selected.key.split("-").map(Number);

    // Find the cartola whose holdings we'll use (nearest to this month)
    const monthEnd = `${y}-${String(m).padStart(2, "0")}-${new Date(y, m, 0).getDate()}`;
    const snap = findCartolaNearest(monthEnd);
    if (!snap?.holdings) {
      setPastMonthData([]);
      return;
    }

    const holdings = snap.holdings as Holding[];
    const startDate = `${y}-${String(m).padStart(2, "0")}-01`;
    // For current month, use today as endDate instead of month end
    const now = new Date();
    const isCurrentMonth = y === now.getFullYear() && m === now.getMonth() + 1;
    const endDate = isCurrentMonth ? now.toISOString().split("T")[0] : monthEnd;

    setLoadingPast(true);
    setPastMonthData(null);

    fetch("/api/portfolio/prices-at-date", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        holdings: holdings.map(h => ({
          fundName: h.fundName,
          securityId: h.securityId || null,
          serie: h.serie || null,
          assetClass: h.assetClass,
          currency: h.currency || null,
          market: h.market || null,
        })),
        startDate,
        endDate,
      }),
    })
      .then(res => res.json())
      .then(data => {
        if (!data.success || !data.results) {
          setPastMonthData([]);
          return;
        }

        const items: ChartItem[] = [];
        let totalStartValue = 0;
        let totalEndValue = 0;

        for (const r of data.results as Array<{
          fundName: string;
          assetClass?: string;
          startPrice: number | null;
          endPrice: number | null;
          returnPct: number | null;
        }>) {
          if (r.returnPct === null) continue;

          // Find matching holding for quantity
          const h = holdings.find(hh => hh.fundName === r.fundName);
          const qty = h?.quantity || 1;

          if (r.startPrice) totalStartValue += r.startPrice * qty;
          if (r.endPrice) totalEndValue += r.endPrice * qty;

          items.push({
            name: r.fundName.length > 30 ? r.fundName.slice(0, 28) + "…" : r.fundName,
            fullName: r.fundName,
            returnPct: r.returnPct,
            assetClass: r.assetClass,
            color: getColor(r.assetClass),
          });
        }

        if (items.length > 0 && totalStartValue > 0 && totalEndValue > 0) {
          items.push({
            name: "PORTAFOLIO TOTAL",
            fullName: "Portafolio Total",
            returnPct: ((totalEndValue / totalStartValue) - 1) * 100,
            assetClass: undefined,
            color: "#1e293b",
          });
        }

        items.sort((a, b) => b.returnPct - a.returnPct);
        setPastMonthData(items);
      })
      .catch((err) => {
        console.warn("[RentabilidadPorActivo] API error:", err);
        setPastMonthData([]);
      })
      .finally(() => setLoadingPast(false));
  }, [selected, localChartData, holdingReturnsData, cartolas]);

  if (!holdingReturnsData) return null;

  const chartData = localChartData ?? pastMonthData ?? [];
  const isLoading = loadingPast && !localChartData && !pastMonthData;

  const canPrev = selectedIdx > 0;
  const canNext = selectedIdx < monthOptions.length - 1;

  return (
    <div className="bg-white rounded-lg border border-gb-border shadow-sm p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-base font-semibold text-gb-black flex items-center gap-2">
          <BarChart3 className="w-5 h-5 text-green-500" />
          Rentabilidad por Activo
        </h3>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setSelectedIdx((i) => Math.max(0, i - 1))}
            disabled={!canPrev}
            className="p-1 rounded hover:bg-gb-light disabled:opacity-30 transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="text-sm font-medium text-gb-black min-w-[200px] text-center">
            {selected.label}
          </span>
          <button
            onClick={() => setSelectedIdx((i) => Math.min(monthOptions.length - 1, i + 1))}
            disabled={!canNext}
            className="p-1 rounded hover:bg-gb-light disabled:opacity-30 transition-colors"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-8 gap-2">
          <Loader className="w-4 h-4 animate-spin text-gb-gray" />
          <span className="text-sm text-gb-gray">Cargando precios...</span>
        </div>
      ) : chartData.length === 0 ? (
        <p className="text-sm text-gb-gray text-center py-8">
          No hay datos suficientes para este período
        </p>
      ) : (
        <div style={{ height: Math.max(300, chartData.length * 32 + 40) }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} layout="vertical" margin={{ top: 5, right: 60, bottom: 5, left: 10 }}>
              <CartesianGrid strokeDasharray="3 3" horizontal={false} />
              <XAxis
                type="number"
                tickFormatter={(v: number) => `${v.toFixed(1)}%`}
                fontSize={11}
              />
              <YAxis
                type="category"
                dataKey="name"
                width={200}
                tick={{ fontSize: 11 }}
              />
              <Tooltip
                formatter={(value: number | undefined) => [`${formatNumber(value ?? 0, 2)}%`, "Rentabilidad"]}
                labelFormatter={(label: string) => {
                  const item = chartData.find((d) => d.name === label);
                  return item?.fullName || label;
                }}
              />
              <Bar dataKey="returnPct" radius={[0, 4, 4, 0]}>
                {chartData.map((entry, i) => (
                  <Cell key={i} fill={entry.returnPct >= 0 ? entry.color : "#ef4444"} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
