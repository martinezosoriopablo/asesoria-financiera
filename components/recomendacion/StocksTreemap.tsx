// components/recomendacion/StocksTreemap.tsx
"use client";

import React, { useState } from "react";
import { Treemap, ResponsiveContainer, Tooltip } from "recharts";
import { ChevronDown, ChevronRight } from "lucide-react";

interface StockItem {
  ticker: string;
  name: string;
  sector: string;
  industry: string;
  country: string;
  marketValueUSD: number;
  marketValueCLP: number;
  weightPct: number;
  categoryId: string;
  confidence: string;
}

interface SectorBreakdownItem {
  sector: string;
  sleeveVista: string | null;
  deltaPp: number;
  sleevePct: number | null;
  actualPct: number;
}

interface Props {
  stocks: StockItem[];
  sectorBreakdown: SectorBreakdownItem[];
}

// Lowercase keys — all lookups go through sectorColor() helper
const SECTOR_COLORS: Record<string, string> = {
  technology: "#3b82f6",
  healthcare: "#10b981",
  "financial services": "#f59e0b",
  "consumer cyclical": "#ef4444",
  "consumer defensive": "#8b5cf6",
  energy: "#f97316",
  industrials: "#6366f1",
  "communication services": "#ec4899",
  utilities: "#14b8a6",
  "real estate": "#a855f7",
  "basic materials": "#78716c",
  "sin clasificar": "#d1d5db",
};

function sectorColor(sector: string): string {
  return SECTOR_COLORS[sector.toLowerCase()] || "#94a3b8";
}

function deviationColor(deltaPp: number): string {
  if (Math.abs(deltaPp) <= 3) return "#22c55e";
  if (Math.abs(deltaPp) <= 10) return "#f59e0b";
  return "#ef4444";
}

function formatUSD(value: number): string {
  if (value >= 1e6) return `$${(value / 1e6).toFixed(1)}M`;
  if (value >= 1e3) return `$${(value / 1e3).toFixed(0)}K`;
  return `$${value.toFixed(0)}`;
}

// Custom treemap content renderer
function CustomTreemapContent(props: any) {
  const { x, y, width, height, name, ticker, weightPct, color, fill } = props;
  const rectColor = color || fill || "#94a3b8";
  if (width < 40 || height < 25) return null;
  return (
    <g>
      <rect x={x} y={y} width={width} height={height} fill={rectColor} rx={4} stroke="#fff" strokeWidth={2} />
      {width > 50 && height > 35 && (
        <>
          <text x={x + 6} y={y + 16} fontSize={12} fontWeight="bold" fill="#fff">
            {ticker || name}
          </text>
          {height > 50 && (
            <text x={x + 6} y={y + 32} fontSize={10} fill="rgba(255,255,255,0.8)">
              {weightPct?.toFixed(1)}%
            </text>
          )}
        </>
      )}
    </g>
  );
}

export default function StocksTreemap({ stocks, sectorBreakdown }: Props) {
  const [expandedSectors, setExpandedSectors] = useState<Set<string>>(new Set());

  if (stocks.length === 0) return null;

  const toggleSector = (sector: string) => {
    setExpandedSectors((prev) => {
      const next = new Set(prev);
      if (next.has(sector)) next.delete(sector);
      else next.add(sector);
      return next;
    });
  };

  // Build treemap data
  const sectorMap = new Map<string, typeof stocks>();
  for (const s of stocks) {
    const sector = s.sector || "Sin clasificar";
    if (!sectorMap.has(sector)) sectorMap.set(sector, []);
    sectorMap.get(sector)!.push(s);
  }

  const treemapData = Array.from(sectorMap.entries()).map(([sector, items]) => ({
    name: sector,
    children: items.map((s) => ({
      name: s.name,
      ticker: s.ticker,
      size: s.weightPct,
      weightPct: s.weightPct,
      color: sectorColor(sector),
    })),
  }));

  // Flat data for recharts Treemap (doesn't nest well — flatten with sector color)
  const flatData = stocks.map((s) => ({
    name: s.name,
    ticker: s.ticker,
    size: Math.max(s.weightPct, 0.1),
    weightPct: s.weightPct,
    color: sectorColor(s.sector),
    fill: sectorColor(s.sector),
  }));

  // Sector totals for table
  const sectorTotals = Array.from(sectorMap.entries())
    .map(([sector, items]) => ({
      sector,
      items: items.sort((a, b) => b.weightPct - a.weightPct),
      totalWeight: items.reduce((s, i) => s + i.weightPct, 0),
      totalValueUSD: items.reduce((s, i) => s + i.marketValueUSD, 0),
      sectorInfo: sectorBreakdown.find((sb) => sb.sector === sector),
    }))
    .sort((a, b) => b.totalWeight - a.totalWeight);

  return (
    <div className="bg-white rounded-lg border border-gb-border shadow-sm mb-6">
      <div className="px-6 py-4 border-b border-gb-border">
        <h2 className="text-base font-semibold text-gb-black">
          Acciones por Sector
        </h2>
        <p className="text-xs text-gb-gray mt-0.5">
          {stocks.length} acciones directas · Tamano proporcional al peso en cartera
        </p>
      </div>

      {/* Treemap */}
      <div className="px-6 py-4">
        <ResponsiveContainer width="100%" height={280}>
          <Treemap
            data={flatData}
            dataKey="size"
            aspectRatio={4 / 3}
            content={<CustomTreemapContent />}
          >
            <Tooltip
              content={({ payload }) => {
                if (!payload || !payload[0]) return null;
                const d = payload[0].payload;
                return (
                  <div className="bg-white border border-gb-border rounded-lg shadow-lg p-3 text-sm">
                    <p className="font-semibold text-gb-black">{d.ticker} — {d.name}</p>
                    <p className="text-gb-gray">{d.weightPct?.toFixed(1)}% del portafolio</p>
                  </div>
                );
              }}
            />
          </Treemap>
        </ResponsiveContainer>

        {/* Sector legend */}
        <div className="flex flex-wrap gap-3 mt-3">
          {sectorTotals.map(({ sector }) => (
            <div key={sector} className="flex items-center gap-1.5">
              <div
                className="w-2.5 h-2.5 rounded-sm"
                style={{ backgroundColor: sectorColor(sector) }}
              />
              <span className="text-[11px] text-gb-gray">{sector}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Detail table grouped by sector */}
      <div className="border-t border-gb-border divide-y divide-gb-border">
        {sectorTotals.map(({ sector, items, totalWeight, totalValueUSD, sectorInfo }) => {
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
                  <div
                    className="w-3 h-3 rounded-sm"
                    style={{ backgroundColor: sectorColor(sector) }}
                  />
                  <span className="text-sm font-medium text-gb-black">{sector}</span>
                  <span className="text-xs text-gb-gray">
                    ({items.length} posicion{items.length !== 1 ? "es" : ""})
                  </span>
                  {sectorInfo && sectorInfo.sleevePct != null && (
                    <span
                      className="text-xs font-semibold px-2 py-0.5 rounded-full"
                      style={{ color: deviationColor(sectorInfo.deltaPp), backgroundColor: `${deviationColor(sectorInfo.deltaPp)}15` }}
                    >
                      {sectorInfo.deltaPp > 0 ? "+" : ""}{sectorInfo.deltaPp.toFixed(1)}pp
                    </span>
                  )}
                  {sectorInfo?.sleeveVista && sectorInfo.sleeveVista !== "N" && (
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
                      sectorInfo.sleeveVista === "OW" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"
                    }`}>
                      {sectorInfo.sleeveVista === "OW" ? "Overweight" : "Underweight"}
                    </span>
                  )}
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
                        <th className="text-left py-1.5 font-medium">Ticker</th>
                        <th className="text-left py-1.5 font-medium">Nombre</th>
                        <th className="text-left py-1.5 font-medium">Industry</th>
                        <th className="text-right py-1.5 font-medium">Valor USD</th>
                        <th className="text-right py-1.5 font-medium">Peso</th>
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((s) => (
                        <tr key={s.ticker} className="border-t border-slate-50 hover:bg-slate-50">
                          <td className="py-2 font-mono font-semibold text-gb-black">{s.ticker}</td>
                          <td className="py-2 text-gb-black truncate max-w-[200px]">{s.name}</td>
                          <td className="py-2 text-gb-gray text-xs">{s.industry || "—"}</td>
                          <td className="py-2 text-right font-mono">{formatUSD(s.marketValueUSD)}</td>
                          <td className="py-2 text-right font-mono font-semibold">{s.weightPct.toFixed(1)}%</td>
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
