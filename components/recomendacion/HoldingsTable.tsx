"use client";

import React, { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";

interface CategoryData {
  categoria: string;
  categoriaLabel: string;
  role: "rv" | "rf" | "alt" | "cash";
  targetPct: number;
  actualPct: number;
  deltaPp: number;
  currentHoldings: Array<{
    fundName: string;
    securityId: string | null;
    marketValueCLP: number;
    weightPct: number;
    custodian: string;
    custodianType: string;
    classificationConfidence: "high" | "medium" | "low";
  }>;
}

interface SectorItem {
  sector: string;
  holdings: Array<{
    fundName: string;
    ticker: string;
    marketValueUSD: number;
    weightInSector: number;
  }>;
}

interface StockProfile {
  ticker: string;
  name: string;
  sector: string;
  industry: string;
  marketCap: number;
  country: string;
}

interface Props {
  categories: CategoryData[];
  stockProfiles: Record<string, StockProfile>;
  sectorBreakdown: SectorItem[];
}

function confidenceBadge(c: string) {
  switch (c) {
    case "high": return <span className="text-xs px-1.5 py-0.5 rounded bg-green-100 text-green-700">Alta</span>;
    case "medium": return <span className="text-xs px-1.5 py-0.5 rounded bg-amber-100 text-amber-700">Media</span>;
    default: return <span className="text-xs px-1.5 py-0.5 rounded bg-red-100 text-red-700">Baja</span>;
  }
}

function formatCLP(value: number): string {
  if (value >= 1e6) return `$${(value / 1e6).toFixed(1)}M`;
  if (value >= 1e3) return `$${(value / 1e3).toFixed(0)}K`;
  return `$${value.toFixed(0)}`;
}

export default function HoldingsTable({ categories, stockProfiles, sectorBreakdown }: Props) {
  const [expandedSectors, setExpandedSectors] = useState<Set<string>>(new Set());

  const toggleSector = (sector: string) => {
    setExpandedSectors((prev) => {
      const next = new Set(prev);
      if (next.has(sector)) next.delete(sector);
      else next.add(sector);
      return next;
    });
  };

  const allHoldings = categories.flatMap((c) =>
    c.currentHoldings.map((h) => ({
      ...h,
      categoryLabel: c.categoriaLabel,
      role: c.role,
    }))
  );

  const bySector = new Map<string, typeof allHoldings>();
  for (const h of allHoldings) {
    const sid = h.securityId?.toUpperCase() || "";
    const profile = stockProfiles[sid];
    const sector = profile?.sector || h.categoryLabel;
    if (!bySector.has(sector)) bySector.set(sector, []);
    bySector.get(sector)!.push(h);
  }

  const sortedSectors = Array.from(bySector.entries())
    .map(([sector, holdings]) => ({
      sector,
      holdings: holdings.sort((a, b) => b.marketValueCLP - a.marketValueCLP),
      totalValue: holdings.reduce((s, h) => s + h.marketValueCLP, 0),
    }))
    .sort((a, b) => b.totalValue - a.totalValue);

  return (
    <div className="bg-white rounded-lg border border-gb-border shadow-sm mb-6">
      <div className="px-6 py-4 border-b border-gb-border">
        <h2 className="text-base font-semibold text-gb-black">
          Posiciones por Sector
        </h2>
      </div>
      <div className="divide-y divide-gb-border">
        {sortedSectors.map(({ sector, holdings, totalValue }) => {
          const isExpanded = expandedSectors.has(sector);
          return (
            <div key={sector}>
              <button
                onClick={() => toggleSector(sector)}
                className="w-full px-6 py-3 flex items-center justify-between hover:bg-slate-50 transition-colors"
              >
                <div className="flex items-center gap-2">
                  {isExpanded
                    ? <ChevronDown className="w-4 h-4 text-gb-gray" />
                    : <ChevronRight className="w-4 h-4 text-gb-gray" />}
                  <span className="text-sm font-medium text-gb-black">{sector}</span>
                  <span className="text-xs text-gb-gray">
                    ({holdings.length} posicion{holdings.length !== 1 ? "es" : ""})
                  </span>
                </div>
                <span className="text-sm font-mono text-gb-black">
                  {formatCLP(totalValue)}
                </span>
              </button>

              {isExpanded && (
                <div className="px-6 pb-3">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-xs text-gb-gray">
                        <th className="text-left py-1 font-medium">Ticker</th>
                        <th className="text-left py-1 font-medium">Nombre</th>
                        <th className="text-right py-1 font-medium">Valor CLP</th>
                        <th className="text-right py-1 font-medium">Peso</th>
                        <th className="text-center py-1 font-medium">Confianza</th>
                        <th className="text-left py-1 font-medium">Custodio</th>
                      </tr>
                    </thead>
                    <tbody>
                      {holdings.map((h, i) => (
                        <tr key={i} className="border-t border-slate-100">
                          <td className="py-2 font-mono text-gb-black">
                            {h.securityId || "—"}
                          </td>
                          <td className="py-2 text-gb-black truncate max-w-[200px]">
                            {h.fundName}
                          </td>
                          <td className="py-2 text-right font-mono">
                            {formatCLP(h.marketValueCLP)}
                          </td>
                          <td className="py-2 text-right font-mono">
                            {h.weightPct.toFixed(1)}%
                          </td>
                          <td className="py-2 text-center">
                            {confidenceBadge(h.classificationConfidence)}
                          </td>
                          <td className="py-2 text-gb-gray text-xs">
                            {h.custodian}
                          </td>
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
