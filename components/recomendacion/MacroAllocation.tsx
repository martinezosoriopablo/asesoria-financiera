"use client";

import React from "react";

interface Props {
  allocation: Record<string, { actual: number; target: number; delta: number }>;
}

const ROLE_LABELS: Record<string, string> = {
  rv: "Renta Variable",
  rf: "Renta Fija",
  alt: "Alternativos",
  cash: "Caja",
};

const ROLE_COLORS: Record<string, { bar: string; bg: string }> = {
  rv: { bar: "bg-blue-500", bg: "bg-blue-100" },
  rf: { bar: "bg-emerald-500", bg: "bg-emerald-100" },
  alt: { bar: "bg-purple-500", bg: "bg-purple-100" },
  cash: { bar: "bg-slate-400", bg: "bg-slate-100" },
};

function deltaColor(delta: number): string {
  const abs = Math.abs(delta);
  if (abs <= 3) return "text-green-600";
  if (abs <= 10) return "text-amber-600";
  return "text-red-600";
}

export default function MacroAllocation({ allocation }: Props) {
  return (
    <div className="bg-white rounded-lg border border-gb-border shadow-sm mb-6">
      <div className="px-6 py-4 border-b border-gb-border">
        <h2 className="text-base font-semibold text-gb-black">
          Asset Allocation vs Modelo
        </h2>
      </div>
      <div className="px-6 py-4 space-y-4">
        {(["rv", "rf", "alt", "cash"] as const).map((role) => {
          const alloc = allocation[role];
          if (!alloc) return null;
          const colors = ROLE_COLORS[role];
          const maxPct = Math.max(alloc.actual, alloc.target, 1);

          return (
            <div key={role}>
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm font-medium text-gb-black">
                  {ROLE_LABELS[role]}
                </span>
                <span className={`text-sm font-medium ${deltaColor(alloc.delta)}`}>
                  {alloc.delta > 0 ? "+" : ""}{alloc.delta.toFixed(1)}pp
                </span>
              </div>
              <div className="flex items-center gap-3">
                <div className="flex-1">
                  <div className={`h-5 ${colors.bg} rounded-full overflow-hidden`}>
                    <div
                      className={`h-full ${colors.bar} rounded-full transition-all duration-500`}
                      style={{ width: `${Math.min((alloc.actual / Math.max(maxPct, 1)) * 100, 100)}%` }}
                    />
                  </div>
                </div>
                <div className="w-20 text-right">
                  <span className="text-sm font-semibold text-gb-black">
                    {alloc.actual.toFixed(1)}%
                  </span>
                  <span className="text-xs text-gb-gray ml-1">
                    / {alloc.target.toFixed(1)}%
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {(() => {
        const rvDelta = allocation.rv?.delta || 0;
        if (Math.abs(rvDelta) > 20) {
          return (
            <div className="px-6 py-3 bg-amber-50 border-t border-amber-200 rounded-b-lg">
              <p className="text-xs text-amber-800">
                La cartera esta fuertemente concentrada en Renta Variable
                ({allocation.rv?.actual.toFixed(0)}% vs {allocation.rv?.target.toFixed(0)}% modelo).
                El modelo sugiere diversificar hacia otros tipos de activo.
              </p>
            </div>
          );
        }
        return null;
      })()}
    </div>
  );
}
