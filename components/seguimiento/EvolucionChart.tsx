"use client";

import React, { useMemo } from "react";
import {
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Area,
  Line,
  ComposedChart,
  Legend,
} from "recharts";
import { formatNumber, formatCurrency, formatDateShort } from "@/lib/format";
import { Loader } from "lucide-react";
import type { Snapshot } from "./SeguimientoPage";

interface HistoricalPoint {
  fecha: string;
  total: number;
  [key: string]: string | number;
}

interface Props {
  snapshots: Snapshot[];
  historicalSeries?: HistoricalPoint[];
  baselineSeries?: HistoricalPoint[];
  benchmarkSeries?: HistoricalPoint[];
  loadingHistorical?: boolean;
  period?: string;
}

export default function EvolucionChart({ snapshots, historicalSeries, baselineSeries, benchmarkSeries, loadingHistorical, period }: Props) {
  // Use historical series if available, otherwise fall back to snapshots
  const chartData = useMemo(() => {
    let raw: Array<{ date: string; fullDate: string; value: number }>;

    if (historicalSeries && historicalSeries.length > 0) {
      raw = historicalSeries.map((p) => ({
        date: formatDateShort(p.fecha),
        fullDate: p.fecha,
        value: p.total,
      }));
    } else {
      raw = snapshots.map((s) => ({
        date: formatDateShort(s.snapshot_date),
        fullDate: s.snapshot_date,
        value: s.total_value,
      }));
    }

    // Apply period filter
    if (period && period !== "ALL" && raw.length > 0) {
      const now = new Date();
      const startDate = new Date();
      switch (period) {
        case "1M": startDate.setMonth(now.getMonth() - 1); break;
        case "3M": startDate.setMonth(now.getMonth() - 3); break;
        case "6M": startDate.setMonth(now.getMonth() - 6); break;
        case "1Y": startDate.setFullYear(now.getFullYear() - 1); break;
      }
      const startStr = startDate.toISOString().split("T")[0];
      raw = raw.filter(d => d.fullDate >= startStr);
    }

    return raw;
  }, [snapshots, historicalSeries, period]);

  // Merge main series with baseline and benchmark by date
  const mergedData = useMemo(() => {
    const dateMap = new Map<string, { date: string; fullDate: string; value?: number; baseline?: number; benchmark?: number }>();

    for (const point of chartData) {
      dateMap.set(point.fullDate, { date: point.date, fullDate: point.fullDate, value: point.value });
    }

    if (baselineSeries) {
      for (const point of baselineSeries) {
        const existing = dateMap.get(point.fecha);
        if (existing) {
          existing.baseline = point.total;
        } else {
          dateMap.set(point.fecha, { date: formatDateShort(point.fecha), fullDate: point.fecha, baseline: point.total });
        }
      }
    }

    if (benchmarkSeries) {
      for (const point of benchmarkSeries) {
        const existing = dateMap.get(point.fecha);
        if (existing) {
          existing.benchmark = point.total;
        } else {
          dateMap.set(point.fecha, { date: formatDateShort(point.fecha), fullDate: point.fecha, benchmark: point.total });
        }
      }
    }

    return Array.from(dateMap.values()).sort((a, b) => a.fullDate.localeCompare(b.fullDate));
  }, [chartData, baselineSeries, benchmarkSeries]);

  const hasBaseline = baselineSeries && baselineSeries.length > 0;
  const hasBenchmark = benchmarkSeries && benchmarkSeries.length > 0;

  // Tight Y-axis domain based on min/max with 5% padding across all series
  const valueDomain = useMemo(() => {
    if (mergedData.length === 0) return [0, 0];
    const allValues = mergedData.flatMap((d) =>
      [d.value, d.baseline, d.benchmark].filter((v): v is number => v != null)
    );
    if (allValues.length === 0) return [0, 0];
    const min = Math.min(...allValues);
    const max = Math.max(...allValues);
    const range = max - min;
    const padding = range > 0 ? range * 0.1 : max * 0.05;
    return [Math.floor((min - padding) / 1000) * 1000, Math.ceil((max + padding) / 1000) * 1000];
  }, [mergedData]);

  if (loadingHistorical) {
    return (
      <div className="h-64 flex items-center justify-center gap-2 text-gb-gray">
        <Loader className="w-4 h-4 animate-spin" />
        Cargando serie historica...
      </div>
    );
  }

  if (mergedData.length === 0) {
    return (
      <div className="h-64 flex items-center justify-center text-gb-gray">
        No hay datos para mostrar
      </div>
    );
  }

  return (
    <div>
      <div style={{ width: "100%", height: 256 }}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={mergedData}>
            <defs>
              <linearGradient id="colorValueSeguimiento" x1="0" y1="0" x2="0" y2="1">
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
              domain={valueDomain}
              tickFormatter={(v) => `$${formatNumber(v / 1000000, 1)}M`}
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
              formatter={(value: number | undefined, name: string | undefined) => {
                const labels: Record<string, string> = {
                  value: "Portafolio Actual",
                  baseline: "Portfolio Inicial",
                  benchmark: "Benchmark",
                };
                return [formatCurrency(value ?? 0), labels[name ?? ""] || name || ""];
              }}
              labelFormatter={(label) => `Fecha: ${label}`}
            />
            {(hasBaseline || hasBenchmark) && (
              <Legend verticalAlign="top" height={30} />
            )}
            <Area
              type="monotone"
              dataKey="value"
              stroke="#2563eb"
              strokeWidth={2}
              fillOpacity={1}
              fill="url(#colorValueSeguimiento)"
              name="Portafolio Actual"
            />
            {hasBaseline && (
              <Line
                type="monotone"
                dataKey="baseline"
                stroke="#f97316"
                strokeWidth={1.5}
                dot={false}
                name="Portfolio Inicial"
                strokeDasharray="4 2"
              />
            )}
            {hasBenchmark && (
              <Line
                type="monotone"
                dataKey="benchmark"
                stroke="#eab308"
                strokeWidth={1.5}
                dot={false}
                name="Benchmark"
                strokeDasharray="6 3"
              />
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
