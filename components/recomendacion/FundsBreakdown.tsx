"use client";

import React, { useState } from "react";
import { Treemap, ResponsiveContainer, Tooltip } from "recharts";
import { ChevronDown, ChevronRight } from "lucide-react";

interface FundItem {
  fundName?: string;
  ticker?: string;
  name?: string;
  securityId?: string;
  categoryId: string;
  categoryLabel: string;
  marketValueCLP: number;
  weightPct: number;
  confidence?: string;
}

interface Props {
  items: FundItem[];
  title: string;
  subtitle: string;
}

const CATEGORY_COLORS: Record<string, string> = {
  rv_usa_large_cap: "#3b82f6",
  rv_desarrollados_ex_us: "#60a5fa",
  rv_emergentes: "#f59e0b",
  rv_chile: "#ef4444",
  rf_ust_belly: "#10b981",
  rf_ust_short: "#34d399",
  rf_ig_corp: "#14b8a6",
  rf_tips: "#06b6d4",
  rf_high_yield: "#f97316",
  rf_em_sovereign: "#eab308",
  rf_chile: "#a3e635",
  alt_gold: "#fbbf24",
  alt_reits: "#a855f7",
  cash_tbills: "#94a3b8",
};

function formatCLP(value: number): string {
  if (value >= 1e9) return `$${(value / 1e9).toFixed(1)}B`;
  if (value >= 1e6) return `$${(value / 1e6).toFixed(0)}M`;
  if (value >= 1e3) return `$${(value / 1e3).toFixed(0)}K`;
  return `$${value.toFixed(0)}`;
}

function CustomContent(props: any) {
  const { x, y, width, height, displayName, weightPct, color } = props;
  if (width < 40 || height < 25) return null;
  return (
    <g>
      <rect x={x} y={y} width={width} height={height} fill={color} rx={4} stroke="#fff" strokeWidth={2} />
      {width > 60 && height > 35 && (
        <>
          <text x={x + 6} y={y + 16} fontSize={11} fontWeight="bold" fill="#fff">
            {displayName?.length > 20 ? displayName.slice(0, 18) + "..." : displayName}
          </text>
          {height > 50 && (
            <text x={x + 6} y={y + 30} fontSize={10} fill="rgba(255,255,255,0.8)">
              {weightPct?.toFixed(1)}%
            </text>
          )}
        </>
      )}
    </g>
  );
}

export default function FundsBreakdown({ items, title, subtitle }: Props) {
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());

  if (items.length === 0) return null;

  const toggle = (cat: string) => {
    setExpandedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });
  };

  // Group by category
  const catMap = new Map<string, { label: string; items: FundItem[] }>();
  for (const item of items) {
    if (!catMap.has(item.categoryId)) {
      catMap.set(item.categoryId, { label: item.categoryLabel, items: [] });
    }
    catMap.get(item.categoryId)!.items.push(item);
  }

  const catTotals = Array.from(catMap.entries())
    .map(([catId, { label, items: catItems }]) => ({
      catId,
      label,
      items: catItems.sort((a, b) => b.weightPct - a.weightPct),
      totalWeight: catItems.reduce((s, i) => s + i.weightPct, 0),
      totalValueCLP: catItems.reduce((s, i) => s + i.marketValueCLP, 0),
    }))
    .sort((a, b) => b.totalWeight - a.totalWeight);

  const flatData = items.map((f) => ({
    name: f.fundName || f.name || f.ticker || "?",
    displayName: f.ticker || f.fundName || f.name || "?",
    size: Math.max(f.weightPct, 0.1),
    weightPct: f.weightPct,
    color: CATEGORY_COLORS[f.categoryId] || "#94a3b8",
  }));

  return (
    <div className="bg-white rounded-lg border border-gb-border shadow-sm mb-6">
      <div className="px-6 py-4 border-b border-gb-border">
        <h2 className="text-base font-semibold text-gb-black">{title}</h2>
        <p className="text-xs text-gb-gray mt-0.5">{subtitle}</p>
      </div>

      {/* Treemap */}
      <div className="px-6 py-4">
        <ResponsiveContainer width="100%" height={220}>
          <Treemap data={flatData} dataKey="size" content={<CustomContent />}>
            <Tooltip
              content={({ payload }) => {
                if (!payload || !payload[0]) return null;
                const d = payload[0].payload;
                return (
                  <div className="bg-white border border-gb-border rounded-lg shadow-lg p-3 text-sm">
                    <p className="font-semibold text-gb-black">{d.name}</p>
                    <p className="text-gb-gray">{d.weightPct?.toFixed(1)}% del portafolio</p>
                  </div>
                );
              }}
            />
          </Treemap>
        </ResponsiveContainer>
      </div>

      {/* Detail table grouped by category */}
      <div className="border-t border-gb-border divide-y divide-gb-border">
        {catTotals.map(({ catId, label, items: catItems, totalWeight, totalValueCLP }) => {
          const isExpanded = expandedCategories.has(catId);
          return (
            <div key={catId}>
              <button
                onClick={() => toggle(catId)}
                className="w-full px-6 py-3 flex items-center justify-between hover:bg-slate-50 transition-colors"
              >
                <div className="flex items-center gap-2">
                  {isExpanded
                    ? <ChevronDown className="w-4 h-4 text-gb-gray" />
                    : <ChevronRight className="w-4 h-4 text-gb-gray" />}
                  <div
                    className="w-3 h-3 rounded-sm"
                    style={{ backgroundColor: CATEGORY_COLORS[catId] || "#94a3b8" }}
                  />
                  <span className="text-sm font-medium text-gb-black">{label}</span>
                  <span className="text-xs text-gb-gray">({catItems.length})</span>
                </div>
                <div className="flex items-center gap-4">
                  <span className="text-xs font-mono text-gb-gray">{totalWeight.toFixed(1)}%</span>
                  <span className="text-sm font-mono text-gb-black">{formatCLP(totalValueCLP)}</span>
                </div>
              </button>
              {isExpanded && (
                <div className="px-6 pb-3">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-xs text-gb-gray border-b border-slate-100">
                        <th className="text-left py-1.5 font-medium">Nombre</th>
                        <th className="text-right py-1.5 font-medium">Valor CLP</th>
                        <th className="text-right py-1.5 font-medium">Peso</th>
                      </tr>
                    </thead>
                    <tbody>
                      {catItems.map((f, i) => (
                        <tr key={i} className="border-t border-slate-50 hover:bg-slate-50">
                          <td className="py-2 text-gb-black">
                            {f.ticker && <span className="font-mono font-semibold mr-2">{f.ticker}</span>}
                            {f.fundName || f.name}
                          </td>
                          <td className="py-2 text-right font-mono">{formatCLP(f.marketValueCLP)}</td>
                          <td className="py-2 text-right font-mono font-semibold">{f.weightPct.toFixed(1)}%</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
