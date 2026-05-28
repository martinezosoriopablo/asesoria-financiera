"use client";

import React, { useState, useMemo } from "react";
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
import { BarChart3, ChevronLeft, ChevronRight } from "lucide-react";
import { formatNumber } from "@/lib/format";
import type { Snapshot } from "./SeguimientoPage";

interface Holding {
  fundName: string;
  marketValue: number;
  marketValueCLP?: number;
  assetClass?: string;
}

interface Props {
  snapshots: Snapshot[];
}

const ASSET_COLORS: Record<string, string> = {
  equity: "#22c55e",
  rentavariable: "#22c55e",
  fixedincome: "#3b82f6",
  rentafija: "#3b82f6",
  alternatives: "#a855f7",
  alternativos: "#a855f7",
  cash: "#94a3b8",
  efectivo: "#94a3b8",
  balanced: "#f59e0b",
  balanceado: "#f59e0b",
};

function getColor(assetClass?: string): string {
  const key = (assetClass || "").toLowerCase().replace(/\s+/g, "");
  return ASSET_COLORS[key] || "#22c55e";
}

function clpVal(h: Holding): number {
  return (h.marketValueCLP || 0) > 0 ? h.marketValueCLP! : h.marketValue ?? 0;
}

/** Get available month boundaries from snapshots */
function getSnapshotPairs(snapshots: Snapshot[]): Array<{
  label: string;
  monthKey: string;
  startIdx: number;
  endIdx: number;
}> {
  if (snapshots.length < 2) return [];

  const sorted = [...snapshots].sort(
    (a, b) => new Date(a.snapshot_date).getTime() - new Date(b.snapshot_date).getTime()
  );

  // Group snapshots by YYYY-MM
  const byMonth = new Map<string, number[]>();
  sorted.forEach((s, i) => {
    const d = new Date(s.snapshot_date);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    if (!byMonth.has(key)) byMonth.set(key, []);
    byMonth.get(key)!.push(i);
  });

  const monthKeys = Array.from(byMonth.keys()).sort();
  const pairs: Array<{ label: string; monthKey: string; startIdx: number; endIdx: number }> = [];

  if (monthKeys.length >= 2) {
    // Multiple months: compare last snapshot of each consecutive month
    for (let i = 1; i < monthKeys.length; i++) {
      const prevIndices = byMonth.get(monthKeys[i - 1])!;
      const currIndices = byMonth.get(monthKeys[i])!;
      const startIdx = prevIndices[prevIndices.length - 1];
      const endIdx = currIndices[currIndices.length - 1];

      const d = new Date(sorted[endIdx].snapshot_date);
      const label = d.toLocaleDateString("es-CL", { month: "long", year: "numeric" });

      pairs.push({
        label: label.charAt(0).toUpperCase() + label.slice(1),
        monthKey: monthKeys[i],
        startIdx,
        endIdx,
      });
    }
  } else {
    // All snapshots in the same month: compare consecutive snapshots
    for (let i = 1; i < sorted.length; i++) {
      const startDate = new Date(sorted[i - 1].snapshot_date);
      const endDate = new Date(sorted[i].snapshot_date);
      const label = `${startDate.toLocaleDateString("es-CL", { day: "numeric", month: "short" })} → ${endDate.toLocaleDateString("es-CL", { day: "numeric", month: "short" })}`;

      pairs.push({
        label,
        monthKey: `_snap_${i}`,
        startIdx: i - 1,
        endIdx: i,
      });
    }
  }

  // Always add "Total" comparing first to last
  if (sorted.length >= 2) {
    const first = new Date(sorted[0].snapshot_date);
    const last = new Date(sorted[sorted.length - 1].snapshot_date);
    pairs.push({
      label: `Acumulado (${first.toLocaleDateString("es-CL", { month: "short", year: "2-digit" })} — ${last.toLocaleDateString("es-CL", { month: "short", year: "2-digit" })})`,
      monthKey: "_total",
      startIdx: 0,
      endIdx: sorted.length - 1,
    });
  }

  return pairs;
}

export default function RentabilidadPorActivo({ snapshots }: Props) {
  // Only use snapshots that have holdings data (cartola/manual, not api-prices)
  const sorted = useMemo(
    () =>
      [...snapshots]
        .filter((s) => Array.isArray(s.holdings) && (s.holdings as unknown[]).length > 0)
        .sort(
          (a, b) => new Date(a.snapshot_date).getTime() - new Date(b.snapshot_date).getTime()
        ),
    [snapshots]
  );

  const monthPairs = useMemo(() => getSnapshotPairs(sorted), [sorted]);
  const [selectedIdx, setSelectedIdx] = useState(() =>
    // Default to last real month (before "Acumulado")
    Math.max(0, monthPairs.length - 2)
  );

  const chartData = useMemo(() => {
    if (monthPairs.length === 0) return [];

    const pair = monthPairs[Math.min(selectedIdx, monthPairs.length - 1)];
    const startSnap = sorted[pair.startIdx];
    const endSnap = sorted[pair.endIdx];

    const startHoldings = (startSnap.holdings as Holding[]) || [];
    const endHoldings = (endSnap.holdings as Holding[]) || [];

    // Build map of holdings
    const map = new Map<string, { name: string; startVal: number; endVal: number; assetClass?: string }>();

    for (const h of startHoldings) {
      map.set(h.fundName, {
        name: h.fundName,
        startVal: clpVal(h),
        endVal: 0,
        assetClass: h.assetClass,
      });
    }
    for (const h of endHoldings) {
      const existing = map.get(h.fundName);
      if (existing) {
        existing.endVal = clpVal(h);
        if (!existing.assetClass) existing.assetClass = h.assetClass;
      } else {
        map.set(h.fundName, {
          name: h.fundName,
          startVal: 0,
          endVal: clpVal(h),
          assetClass: h.assetClass,
        });
      }
    }

    // Calculate returns & add portfolio total
    const items = Array.from(map.values())
      .filter((h) => h.startVal > 0) // Only holdings that existed at start
      .map((h) => ({
        name: h.name.length > 30 ? h.name.slice(0, 28) + "…" : h.name,
        fullName: h.name,
        returnPct: ((h.endVal - h.startVal) / h.startVal) * 100,
        assetClass: h.assetClass,
        color: getColor(h.assetClass),
      }));

    // Add portfolio total
    const totalStart = startSnap.total_value;
    const totalEnd = endSnap.total_value;
    if (totalStart > 0) {
      items.push({
        name: "PORTAFOLIO TOTAL",
        fullName: "Portafolio Total",
        returnPct: ((totalEnd - totalStart) / totalStart) * 100,
        assetClass: undefined,
        color: "#1e293b",
      });
    }

    // Sort by return descending
    items.sort((a, b) => b.returnPct - a.returnPct);

    return items;
  }, [sorted, monthPairs, selectedIdx]);

  if (monthPairs.length === 0 || chartData.length === 0) return null;

  const currentPair = monthPairs[Math.min(selectedIdx, monthPairs.length - 1)];
  const canPrev = selectedIdx > 0;
  const canNext = selectedIdx < monthPairs.length - 1;

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
          <span className="text-sm font-medium text-gb-black min-w-[160px] text-center">
            {currentPair.label}
          </span>
          <button
            onClick={() => setSelectedIdx((i) => Math.min(monthPairs.length - 1, i + 1))}
            disabled={!canNext}
            className="p-1 rounded hover:bg-gb-light disabled:opacity-30 transition-colors"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

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
    </div>
  );
}
