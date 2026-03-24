"use client";

import React from "react";
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
import type { Snapshot } from "./SeguimientoPage";

interface Props {
  snapshots: Snapshot[];
}

export default function EvolucionChart({ snapshots }: Props) {

  const chartData = snapshots.map((s) => ({
    date: formatDateShort(s.snapshot_date),
    fullDate: s.snapshot_date,
    value: s.total_value,
    return: s.cumulative_return,
  }));

  if (snapshots.length === 0) {
    return (
      <div className="h-64 flex items-center justify-center text-gb-gray">
        No hay datos para mostrar
      </div>
    );
  }

  return (
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
            tickFormatter={(v) => `$${formatNumber(v / 1000, 0)}k`}
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
            formatter={(value: number | undefined) => [formatCurrency(value ?? 0), "Valor"]}
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
  );
}
