"use client";

import React, { useMemo } from "react";
import {
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Area,
  AreaChart,
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
  loadingHistorical?: boolean;
}

export default function EvolucionChart({ snapshots, historicalSeries, loadingHistorical }: Props) {
  // Use historical series if available, otherwise fall back to snapshots
  const chartData = useMemo(() => {
    if (historicalSeries && historicalSeries.length > 0) {
      return historicalSeries.map((p) => ({
        date: formatDateShort(p.fecha),
        fullDate: p.fecha,
        value: p.total,
      }));
    }

    return snapshots.map((s) => ({
      date: formatDateShort(s.snapshot_date),
      fullDate: s.snapshot_date,
      value: s.total_value,
    }));
  }, [snapshots, historicalSeries]);

  // Tight Y-axis domain based on min/max with 5% padding
  const valueDomain = useMemo(() => {
    if (chartData.length === 0) return [0, 0];
    const values = chartData.map((d) => d.value);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = max - min;
    const padding = range > 0 ? range * 0.1 : max * 0.05;
    return [Math.floor((min - padding) / 1000) * 1000, Math.ceil((max + padding) / 1000) * 1000];
  }, [chartData]);

  if (loadingHistorical) {
    return (
      <div className="h-64 flex items-center justify-center gap-2 text-gb-gray">
        <Loader className="w-4 h-4 animate-spin" />
        Cargando serie historica...
      </div>
    );
  }

  if (chartData.length === 0) {
    return (
      <div className="h-64 flex items-center justify-center text-gb-gray">
        No hay datos para mostrar
      </div>
    );
  }

  return (
    <div>
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chartData}>
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
              formatter={(value: number | undefined) =>
                [formatCurrency(value ?? 0), "Valor Portafolio"]
              }
              labelFormatter={(label) => `Fecha: ${label}`}
            />
            <Area
              type="monotone"
              dataKey="value"
              stroke="#2563eb"
              strokeWidth={2}
              fillOpacity={1}
              fill="url(#colorValueSeguimiento)"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
