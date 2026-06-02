"use client";

import React from "react";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";

interface Props {
  allocation: Record<string, { actual: number; target: number; delta: number }>;
  totalValueCLP: number;
}

const ROLES = ["rv", "rf", "alt", "cash"] as const;

const ROLE_LABELS: Record<string, string> = {
  rv: "Renta Variable",
  rf: "Renta Fija",
  alt: "Alternativos",
  cash: "Caja",
};

const ROLE_COLORS: Record<string, string> = {
  rv: "#3b82f6",
  rf: "#10b981",
  alt: "#8b5cf6",
  cash: "#94a3b8",
};

function deltaColor(delta: number): string {
  const abs = Math.abs(delta);
  if (abs <= 3) return "text-green-600 bg-green-50";
  if (abs <= 10) return "text-amber-600 bg-amber-50";
  return "text-red-600 bg-red-50";
}

function formatCLP(value: number): string {
  if (value >= 1e9) return `$${(value / 1e9).toFixed(1)}B`;
  if (value >= 1e6) return `$${(value / 1e6).toFixed(0)}M`;
  return `$${(value / 1e3).toFixed(0)}K`;
}

export default function MacroAllocationV2({ allocation, totalValueCLP }: Props) {
  const actualData = ROLES.map((r) => ({
    name: ROLE_LABELS[r],
    value: Math.max(allocation[r]?.actual || 0, 0.1),
    color: ROLE_COLORS[r],
  }));

  const targetData = ROLES.map((r) => ({
    name: ROLE_LABELS[r],
    value: Math.max(allocation[r]?.target || 0, 0.1),
    color: ROLE_COLORS[r],
  }));

  return (
    <div className="bg-white rounded-lg border border-gb-border shadow-sm mb-6">
      <div className="px-6 py-4 border-b border-gb-border">
        <h2 className="text-base font-semibold text-gb-black">
          Asset Allocation vs Modelo
        </h2>
      </div>
      <div className="px-6 py-5 grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Left: Comparison bars */}
        <div className="space-y-4">
          {ROLES.map((role) => {
            const alloc = allocation[role];
            if (!alloc) return null;
            const maxPct = Math.max(alloc.actual, alloc.target, 1);
            return (
              <div key={role}>
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-2">
                    <div
                      className="w-3 h-3 rounded-sm"
                      style={{ backgroundColor: ROLE_COLORS[role] }}
                    />
                    <span className="text-sm font-medium text-gb-black">
                      {ROLE_LABELS[role]}
                    </span>
                  </div>
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${deltaColor(alloc.delta)}`}>
                    {alloc.delta > 0 ? "+" : ""}{alloc.delta.toFixed(1)}pp
                  </span>
                </div>
                {/* Actual bar */}
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-[10px] text-gb-gray w-12">Actual</span>
                  <div className="flex-1 h-4 bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{
                        width: `${Math.min((alloc.actual / Math.max(maxPct, 1)) * 100, 100)}%`,
                        backgroundColor: ROLE_COLORS[role],
                      }}
                    />
                  </div>
                  <span className="text-xs font-mono font-semibold text-gb-black w-12 text-right">
                    {alloc.actual.toFixed(1)}%
                  </span>
                </div>
                {/* Target bar (ghost) */}
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-gb-gray w-12">Modelo</span>
                  <div className="flex-1 h-4 bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-500 opacity-30"
                      style={{
                        width: `${Math.min((alloc.target / Math.max(maxPct, 1)) * 100, 100)}%`,
                        backgroundColor: ROLE_COLORS[role],
                      }}
                    />
                  </div>
                  <span className="text-xs font-mono text-gb-gray w-12 text-right">
                    {alloc.target.toFixed(1)}%
                  </span>
                </div>
              </div>
            );
          })}
        </div>

        {/* Right: Two donut charts */}
        <div className="flex items-center justify-center gap-6">
          {/* Actual donut */}
          <div className="text-center">
            <p className="text-xs font-semibold text-gb-gray mb-2 uppercase tracking-wide">Tu Cartera</p>
            <ResponsiveContainer width={160} height={160}>
              <PieChart>
                <Pie
                  data={actualData}
                  dataKey="value"
                  innerRadius={40}
                  outerRadius={70}
                  paddingAngle={2}
                  strokeWidth={0}
                >
                  {actualData.map((d, i) => (
                    <Cell key={i} fill={d.color} />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(value, name) => [`${((value as number) ?? 0).toFixed(1)}%`, name as string]}
                />
              </PieChart>
            </ResponsiveContainer>
            <p className="text-xs text-gb-gray mt-1">{formatCLP(totalValueCLP)}</p>
          </div>

          {/* Target donut */}
          <div className="text-center">
            <p className="text-xs font-semibold text-gb-gray mb-2 uppercase tracking-wide">Modelo</p>
            <ResponsiveContainer width={160} height={160}>
              <PieChart>
                <Pie
                  data={targetData}
                  dataKey="value"
                  innerRadius={40}
                  outerRadius={70}
                  paddingAngle={2}
                  strokeWidth={0}
                >
                  {targetData.map((d, i) => (
                    <Cell key={i} fill={d.color} opacity={0.5} />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(value, name) => [`${((value as number) ?? 0).toFixed(1)}%`, name as string]}
                />
              </PieChart>
            </ResponsiveContainer>
            <p className="text-xs text-gb-gray mt-1">Objetivo</p>
          </div>
        </div>
      </div>

      {/* Warning banner for extreme deviations */}
      {(() => {
        const rvDelta = allocation.rv?.delta || 0;
        if (Math.abs(rvDelta) > 20) {
          return (
            <div className="px-6 py-3 bg-amber-50 border-t border-amber-200 rounded-b-lg">
              <p className="text-xs text-amber-800">
                La cartera esta fuertemente {rvDelta > 0 ? "concentrada" : "subponderada"} en Renta Variable
                ({allocation.rv?.actual.toFixed(0)}% vs {allocation.rv?.target.toFixed(0)}% modelo).
              </p>
            </div>
          );
        }
        return null;
      })()}

      {/* Legend */}
      <div className="px-6 py-3 border-t border-gb-border flex flex-wrap gap-4">
        {ROLES.map((role) => (
          <div key={role} className="flex items-center gap-1.5">
            <div className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: ROLE_COLORS[role] }} />
            <span className="text-[11px] text-gb-gray">{ROLE_LABELS[role]}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
