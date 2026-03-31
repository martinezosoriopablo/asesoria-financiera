"use client";

import React, { useState, useMemo } from "react";
import {
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Area,
  AreaChart,
} from "recharts";
import { formatNumber, formatCurrency, formatPercent, formatDateShort } from "@/lib/format";
import type { Snapshot } from "./SeguimientoPage";

interface Props {
  snapshots: Snapshot[];
}

export default function EvolucionChart({ snapshots }: Props) {
  const [mode, setMode] = useState<"return" | "value">("return");

  const chartData = useMemo(() => snapshots.map((s) => ({
    date: formatDateShort(s.snapshot_date),
    fullDate: s.snapshot_date,
    value: s.total_value,
    twr: s.twr_cumulative ?? s.cumulative_return ?? 0,
  })), [snapshots]);

  // For value mode: tight Y-axis domain based on min/max with 5% padding
  const valueDomain = useMemo(() => {
    if (chartData.length === 0) return [0, 0];
    const values = chartData.map((d) => d.value);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = max - min;
    const padding = range > 0 ? range * 0.1 : max * 0.05;
    return [Math.floor((min - padding) / 1000) * 1000, Math.ceil((max + padding) / 1000) * 1000];
  }, [chartData]);

  if (snapshots.length === 0) {
    return (
      <div className="h-64 flex items-center justify-center text-gb-gray">
        No hay datos para mostrar
      </div>
    );
  }

  const isReturn = mode === "return";

  return (
    <div>
      {/* Mode toggle */}
      <div className="flex items-center justify-end gap-1 mb-3">
        <div className="flex bg-slate-100 rounded-lg p-0.5">
          <button
            onClick={() => setMode("return")}
            className={`px-3 py-1 text-xs font-medium rounded transition-colors ${
              isReturn ? "bg-white text-gb-black shadow-sm" : "text-gb-gray hover:text-gb-black"
            }`}
          >
            Rentabilidad
          </button>
          <button
            onClick={() => setMode("value")}
            className={`px-3 py-1 text-xs font-medium rounded transition-colors ${
              !isReturn ? "bg-white text-gb-black shadow-sm" : "text-gb-gray hover:text-gb-black"
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
              <linearGradient id="colorReturnSeg" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#16a34a" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#16a34a" stopOpacity={0} />
              </linearGradient>
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
              domain={isReturn ? ["auto", "auto"] : valueDomain}
              tickFormatter={
                isReturn
                  ? (v) => `${v >= 0 ? "+" : ""}${formatNumber(v, 1)}%`
                  : (v) => `$${formatNumber(v / 1000, 0)}k`
              }
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
                isReturn
                  ? [formatPercent(value ?? 0), "Rentabilidad TWR"]
                  : [formatCurrency(value ?? 0), "Valor"]
              }
              labelFormatter={(label) => `Fecha: ${label}`}
            />
            <Area
              type="monotone"
              dataKey={isReturn ? "twr" : "value"}
              stroke={isReturn ? "#16a34a" : "#2563eb"}
              strokeWidth={2}
              fillOpacity={1}
              fill={isReturn ? "url(#colorReturnSeg)" : "url(#colorValueSeguimiento)"}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
