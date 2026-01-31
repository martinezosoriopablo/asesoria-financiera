// components/market/ProviderCard.tsx

"use client";

import React from "react";
import { TrendingUp, TrendingDown, DollarSign, BarChart3, Eye } from "lucide-react";

interface ProviderStats {
  provider: string;
  count: number;
  avgCost: number;
  minCost: number;
  maxCost: number;
  avgReturn1y: number;
  maxReturn1y: number;
  minReturn1y: number;
  avgReturn3y: number;
}

interface ProviderCardProps {
  stats: ProviderStats;
  marketAverage: {
    avgCost: number;
    avgReturn1y: number;
  };
  onClick?: () => void;
}

export function ProviderCard({ stats, marketAverage, onClick }: ProviderCardProps) {
  const costDiff = stats.avgCost - marketAverage.avgCost;
  const returnDiff = stats.avgReturn1y - marketAverage.avgReturn1y;

  const isCostBetter = costDiff < 0; // Menor costo es mejor
  const isReturnBetter = returnDiff > 0; // Mayor retorno es mejor

  return (
    <div
      className="bg-white rounded-xl shadow-md hover:shadow-xl transition-all duration-300 p-6 cursor-pointer border-2 border-transparent hover:border-blue-300"
      onClick={onClick}
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div className="flex-1">
          <h3 className="text-lg font-bold text-slate-900 mb-1">{stats.provider}</h3>
          <p className="text-sm text-slate-600">
            {stats.count} fondo{stats.count !== 1 ? "s" : ""}
          </p>
        </div>
        <button className="p-2 hover:bg-slate-100 rounded-lg transition-colors">
          <Eye className="w-5 h-5 text-slate-400" />
        </button>
      </div>

      <div className="h-px bg-slate-200 mb-4"></div>

      {/* Costos */}
      <div className="mb-4">
        <div className="flex items-center gap-2 mb-2">
          <DollarSign className="w-4 h-4 text-slate-600" />
          <span className="text-xs font-medium text-slate-600 uppercase">TER Promedio</span>
        </div>
        <div className="flex items-baseline gap-2">
          <span className="text-3xl font-bold text-slate-900">
            {(stats.avgCost * 100).toFixed(2)}%
          </span>
          <div
            className={`flex items-center gap-1 text-xs font-semibold px-2 py-1 rounded ${
              isCostBetter
                ? "bg-green-100 text-green-700"
                : "bg-red-100 text-red-700"
            }`}
          >
            {isCostBetter ? (
              <TrendingDown className="w-3 h-3" />
            ) : (
              <TrendingUp className="w-3 h-3" />
            )}
            {isCostBetter ? "-" : "+"}
            {Math.abs(costDiff * 100).toFixed(2)}%
          </div>
        </div>
        <div className="mt-1 text-xs text-slate-500">
          Rango: {(stats.minCost * 100).toFixed(2)}% - {(stats.maxCost * 100).toFixed(2)}%
        </div>
      </div>

      {/* Rentabilidad */}
      <div className="mb-4">
        <div className="flex items-center gap-2 mb-2">
          <BarChart3 className="w-4 h-4 text-slate-600" />
          <span className="text-xs font-medium text-slate-600 uppercase">
            Rentabilidad 1 Año
          </span>
        </div>
        <div className="flex items-baseline gap-2">
          <span className="text-3xl font-bold text-slate-900">
            {(stats.avgReturn1y * 100).toFixed(1)}%
          </span>
          <div
            className={`flex items-center gap-1 text-xs font-semibold px-2 py-1 rounded ${
              isReturnBetter
                ? "bg-green-100 text-green-700"
                : "bg-red-100 text-red-700"
            }`}
          >
            {isReturnBetter ? (
              <TrendingUp className="w-3 h-3" />
            ) : (
              <TrendingDown className="w-3 h-3" />
            )}
            {returnDiff > 0 ? "+" : ""}
            {(returnDiff * 100).toFixed(1)}%
          </div>
        </div>
        <div className="mt-1 text-xs text-slate-500">
          Mejor: {(stats.maxReturn1y * 100).toFixed(1)}%
        </div>
      </div>

      {/* Rentabilidad 3 años */}
      {stats.avgReturn3y !== 0 && (
        <div className="pt-3 border-t border-slate-100">
          <div className="flex items-center justify-between text-xs">
            <span className="text-slate-600">Rent. 3 años promedio</span>
            <span className="font-bold text-slate-900">
              {(stats.avgReturn3y * 100).toFixed(1)}% anual
            </span>
          </div>
        </div>
      )}

      {/* Footer */}
      <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between">
        <span className="text-xs text-slate-500">vs. Promedio del Mercado</span>
        <div className="flex gap-2">
          {isCostBetter && (
            <span className="text-xs px-2 py-1 bg-green-50 text-green-700 rounded font-medium">
              ✓ Costo
            </span>
          )}
          {isReturnBetter && (
            <span className="text-xs px-2 py-1 bg-green-50 text-green-700 rounded font-medium">
              ✓ Retorno
            </span>
          )}
          {!isCostBetter && !isReturnBetter && (
            <span className="text-xs px-2 py-1 bg-slate-50 text-slate-600 rounded">
              Promedio
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
