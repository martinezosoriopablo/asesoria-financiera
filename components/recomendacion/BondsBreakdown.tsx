"use client";

import React, { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";

interface BondItem {
  name: string;
  securityId: string;
  couponRate: number;
  maturityDate: string;
  creditRating: string | null;
  bondType: "government" | "corporate" | "em_sovereign";
  marketValueUSD: number;
  marketValueCLP: number;
  weightPct: number;
}

interface Props {
  bonds: BondItem[];
}

const TYPE_LABELS: Record<string, string> = {
  government: "Gobierno / Treasuries",
  corporate: "Corporativos",
  em_sovereign: "Soberanos Emergentes",
};

const TYPE_COLORS: Record<string, string> = {
  government: "#3b82f6",
  corporate: "#14b8a6",
  em_sovereign: "#f59e0b",
};

function formatUSD(value: number): string {
  if (value >= 1e6) return `$${(value / 1e6).toFixed(1)}M`;
  if (value >= 1e3) return `$${(value / 1e3).toFixed(0)}K`;
  return `$${value.toFixed(0)}`;
}

export default function BondsBreakdown({ bonds }: Props) {
  const [expandedTypes, setExpandedTypes] = useState<Set<string>>(new Set());

  if (bonds.length === 0) return null;

  const toggle = (type: string) => {
    setExpandedTypes((prev) => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next;
    });
  };

  // Group by bond type
  const typeMap = new Map<string, BondItem[]>();
  for (const b of bonds) {
    if (!typeMap.has(b.bondType)) typeMap.set(b.bondType, []);
    typeMap.get(b.bondType)!.push(b);
  }

  const typeGroups = (["government", "corporate", "em_sovereign"] as const)
    .filter((t) => typeMap.has(t))
    .map((type) => {
      const items = typeMap.get(type)!.sort((a, b) => b.marketValueUSD - a.marketValueUSD);
      return {
        type,
        items,
        totalWeight: items.reduce((s, i) => s + i.weightPct, 0),
        totalValueUSD: items.reduce((s, i) => s + i.marketValueUSD, 0),
      };
    });

  return (
    <div className="bg-white rounded-lg border border-gb-border shadow-sm mb-6">
      <div className="px-6 py-4 border-b border-gb-border">
        <h2 className="text-base font-semibold text-gb-black">Renta Fija Directa</h2>
        <p className="text-xs text-gb-gray mt-0.5">{bonds.length} bonos</p>
      </div>

      {/* Summary bar */}
      <div className="px-6 py-3 flex gap-1 h-6">
        {typeGroups.map(({ type, totalWeight }) => (
          <div
            key={type}
            className="h-full rounded-sm transition-all"
            style={{
              width: `${totalWeight}%`,
              backgroundColor: TYPE_COLORS[type],
              minWidth: totalWeight > 0 ? 8 : 0,
            }}
            title={`${TYPE_LABELS[type]}: ${totalWeight.toFixed(1)}%`}
          />
        ))}
      </div>

      <div className="divide-y divide-gb-border">
        {typeGroups.map(({ type, items, totalWeight, totalValueUSD }) => {
          const isExpanded = expandedTypes.has(type);
          return (
            <div key={type}>
              <button
                onClick={() => toggle(type)}
                className="w-full px-6 py-3 flex items-center justify-between hover:bg-slate-50 transition-colors"
              >
                <div className="flex items-center gap-2">
                  {isExpanded
                    ? <ChevronDown className="w-4 h-4 text-gb-gray" />
                    : <ChevronRight className="w-4 h-4 text-gb-gray" />}
                  <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: TYPE_COLORS[type] }} />
                  <span className="text-sm font-medium text-gb-black">{TYPE_LABELS[type]}</span>
                  <span className="text-xs text-gb-gray">({items.length})</span>
                </div>
                <div className="flex items-center gap-4">
                  <span className="text-xs font-mono text-gb-gray">{totalWeight.toFixed(1)}%</span>
                  <span className="text-sm font-mono text-gb-black">{formatUSD(totalValueUSD)}</span>
                </div>
              </button>
              {isExpanded && (
                <div className="px-6 pb-3">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-xs text-gb-gray border-b border-slate-100">
                        <th className="text-left py-1.5 font-medium">Emisor</th>
                        <th className="text-right py-1.5 font-medium">Cupon</th>
                        <th className="text-right py-1.5 font-medium">Vencimiento</th>
                        <th className="text-center py-1.5 font-medium">Rating</th>
                        <th className="text-right py-1.5 font-medium">Valor USD</th>
                        <th className="text-right py-1.5 font-medium">Peso</th>
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((b, i) => (
                        <tr key={i} className="border-t border-slate-50 hover:bg-slate-50">
                          <td className="py-2 text-gb-black">{b.name}</td>
                          <td className="py-2 text-right font-mono">{b.couponRate.toFixed(2)}%</td>
                          <td className="py-2 text-right font-mono text-xs">{b.maturityDate}</td>
                          <td className="py-2 text-center">
                            {b.creditRating ? (
                              <span className="text-xs px-1.5 py-0.5 rounded bg-slate-100 text-gb-black font-mono">
                                {b.creditRating}
                              </span>
                            ) : (
                              <span className="text-xs text-gb-gray">—</span>
                            )}
                          </td>
                          <td className="py-2 text-right font-mono">{formatUSD(b.marketValueUSD)}</td>
                          <td className="py-2 text-right font-mono font-semibold">{b.weightPct.toFixed(1)}%</td>
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
