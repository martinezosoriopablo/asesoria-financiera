"use client";

import React from "react";
import { Target, AlertTriangle, CheckCircle2, ArrowRight, TrendingUp, TrendingDown } from "lucide-react";

interface Recommendation {
  equity_percent?: number;
  fixed_income_percent?: number;
  alternatives_percent?: number;
  cash_percent?: number;
}

interface Composition {
  equity: number;
  fixedIncome: number;
  alternatives: number;
  cash: number;
}

interface Props {
  recommendation: Recommendation;
  actual: Composition;
  totalValue?: number;
}

interface AssetClassConfig {
  key: keyof Composition;
  recKey: keyof Recommendation;
  label: string;
  shortLabel: string;
  color: string;
  bgColor: string;
  lightColor: string;
}

const ASSET_CLASSES: AssetClassConfig[] = [
  {
    key: "equity",
    recKey: "equity_percent",
    label: "Renta Variable",
    shortLabel: "RV",
    color: "bg-blue-500",
    bgColor: "bg-blue-100",
    lightColor: "bg-blue-200",
  },
  {
    key: "fixedIncome",
    recKey: "fixed_income_percent",
    label: "Renta Fija",
    shortLabel: "RF",
    color: "bg-green-500",
    bgColor: "bg-green-100",
    lightColor: "bg-green-200",
  },
  {
    key: "alternatives",
    recKey: "alternatives_percent",
    label: "Alternativos",
    shortLabel: "Alt",
    color: "bg-purple-500",
    bgColor: "bg-purple-100",
    lightColor: "bg-purple-200",
  },
  {
    key: "cash",
    recKey: "cash_percent",
    label: "Cash",
    shortLabel: "Cash",
    color: "bg-gray-500",
    bgColor: "bg-gray-100",
    lightColor: "bg-gray-200",
  },
];

// Chilean number format
function formatNumber(value: number, decimals: number = 0): string {
  const fixed = Math.abs(value).toFixed(decimals);
  const [intPart, decPart] = fixed.split(".");
  const withThousands = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  const formatted = decPart ? `${withThousands},${decPart}` : withThousands;
  return value < 0 ? `-${formatted}` : formatted;
}

function formatCurrency(value: number): string {
  return `$${formatNumber(value, 0)}`;
}

export default function ComparacionBar({ recommendation, actual, totalValue }: Props) {
  // Calculate deviations
  const deviations = ASSET_CLASSES.map((ac) => {
    const actualVal = actual[ac.key] || 0;
    const recVal = recommendation[ac.recKey] || 0;
    const deviation = actualVal - recVal;
    return {
      ...ac,
      actual: actualVal,
      recommended: recVal,
      deviation,
      absDeviation: Math.abs(deviation),
      isSignificant: Math.abs(deviation) > 5,
    };
  });

  // Calculate total drift (sum of absolute deviations / 2)
  const totalDrift = deviations.reduce((sum, d) => sum + d.absDeviation, 0) / 2;
  const hasSignificantDeviation = deviations.some((d) => d.isSignificant);

  // Determine overall status
  const status = totalDrift <= 3 ? "aligned" : totalDrift <= 10 ? "moderate" : "significant";

  // Generate rebalancing suggestions
  const suggestions = deviations
    .filter((d) => d.isSignificant)
    .map((d) => {
      const action = d.deviation > 0 ? "Reducir" : "Aumentar";
      const amount = Math.abs(d.deviation);
      const valueAmount = totalValue ? (totalValue * amount) / 100 : null;
      return {
        assetClass: d.label,
        action,
        amount,
        valueAmount,
        deviation: d.deviation,
      };
    });

  return (
    <div className="bg-white rounded-lg border border-gb-border shadow-sm">
      {/* Header */}
      <div className="px-6 py-4 border-b border-gb-border flex items-center justify-between">
        <h2 className="text-base font-semibold text-gb-black flex items-center gap-2">
          <Target className="w-4 h-4 text-blue-500" />
          Comparación con Recomendación
        </h2>
        <div className="flex items-center gap-2">
          {status === "aligned" && (
            <span className="flex items-center gap-1 text-xs text-green-600 bg-green-50 px-2 py-1 rounded font-medium">
              <CheckCircle2 className="w-3 h-3" />
              Alineado
            </span>
          )}
          {status === "moderate" && (
            <span className="flex items-center gap-1 text-xs text-amber-600 bg-amber-50 px-2 py-1 rounded font-medium">
              <AlertTriangle className="w-3 h-3" />
              Desviación moderada
            </span>
          )}
          {status === "significant" && (
            <span className="flex items-center gap-1 text-xs text-red-600 bg-red-50 px-2 py-1 rounded font-medium">
              <AlertTriangle className="w-3 h-3" />
              Desviación significativa
            </span>
          )}
        </div>
      </div>

      <div className="p-6">
        {/* Horizontal stacked bars comparison */}
        <div className="space-y-6 mb-6">
          {/* Recommended bar */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-gb-gray">Recomendado</span>
              <span className="text-xs text-gb-gray">100%</span>
            </div>
            <div className="h-8 flex rounded-lg overflow-hidden border border-slate-200">
              {ASSET_CLASSES.map((ac) => {
                const value = recommendation[ac.recKey] || 0;
                if (value === 0) return null;
                return (
                  <div
                    key={ac.key}
                    className={`${ac.lightColor} flex items-center justify-center transition-all relative group`}
                    style={{ width: `${value}%` }}
                  >
                    <span className="text-xs font-semibold text-slate-700">
                      {value > 8 ? `${formatNumber(value, 0)}%` : ""}
                    </span>
                    {/* Tooltip */}
                    <div className="absolute bottom-full mb-1 left-1/2 -translate-x-1/2 bg-slate-800 text-white text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-10">
                      {ac.label}: {formatNumber(value, 0)}%
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Actual bar */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-gb-black">Actual</span>
              <span className="text-xs text-gb-gray">100%</span>
            </div>
            <div className="h-8 flex rounded-lg overflow-hidden border border-slate-200">
              {ASSET_CLASSES.map((ac) => {
                const value = actual[ac.key] || 0;
                if (value === 0) return null;
                return (
                  <div
                    key={ac.key}
                    className={`${ac.color} flex items-center justify-center transition-all relative group`}
                    style={{ width: `${value}%` }}
                  >
                    <span className="text-xs font-semibold text-white">
                      {value > 8 ? `${formatNumber(value, 0)}%` : ""}
                    </span>
                    {/* Tooltip */}
                    <div className="absolute bottom-full mb-1 left-1/2 -translate-x-1/2 bg-slate-800 text-white text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-10">
                      {ac.label}: {formatNumber(value, 0)}%
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Legend and deviations */}
        <div className="grid grid-cols-4 gap-4 mb-6">
          {deviations.map((d) => (
            <div
              key={d.key}
              className={`p-3 rounded-lg ${d.isSignificant ? "bg-amber-50 border border-amber-200" : "bg-slate-50"}`}
            >
              <div className="flex items-center gap-2 mb-2">
                <div className={`w-3 h-3 rounded ${d.color}`} />
                <span className="text-xs font-medium text-gb-gray">{d.label}</span>
              </div>
              <div className="flex items-baseline justify-between">
                <div>
                  <span className="text-lg font-bold text-gb-black">{formatNumber(d.actual, 0)}%</span>
                  <span className="text-xs text-gb-gray ml-1">/ {formatNumber(d.recommended, 0)}%</span>
                </div>
                <span
                  className={`text-sm font-semibold ${
                    d.isSignificant
                      ? d.deviation > 0
                        ? "text-red-600"
                        : "text-amber-600"
                      : "text-gb-gray"
                  }`}
                >
                  {d.deviation >= 0 ? "+" : ""}
                  {formatNumber(d.deviation, 1)}%
                </span>
              </div>
            </div>
          ))}
        </div>

        {/* Drift indicator */}
        <div className="flex items-center justify-between p-3 bg-slate-50 rounded-lg mb-4">
          <div>
            <span className="text-sm font-medium text-gb-gray">Drift Total</span>
            <p className="text-xs text-gb-gray">Desviación agregada del portafolio</p>
          </div>
          <div className="text-right">
            <span
              className={`text-xl font-bold ${
                totalDrift <= 3 ? "text-green-600" : totalDrift <= 10 ? "text-amber-600" : "text-red-600"
              }`}
            >
              {formatNumber(totalDrift, 1)}%
            </span>
            <p className="text-xs text-gb-gray">
              {totalDrift <= 3 ? "Dentro del rango" : totalDrift <= 10 ? "Considerar rebalanceo" : "Rebalanceo sugerido"}
            </p>
          </div>
        </div>

        {/* Rebalancing suggestions */}
        {suggestions.length > 0 && (
          <div className="border-t border-slate-200 pt-4">
            <h3 className="text-sm font-semibold text-gb-black mb-3 flex items-center gap-2">
              <ArrowRight className="w-4 h-4 text-blue-500" />
              Sugerencias de Rebalanceo
            </h3>
            <div className="space-y-2">
              {suggestions.map((s, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between p-3 bg-blue-50 border border-blue-100 rounded-lg"
                >
                  <div className="flex items-center gap-3">
                    {s.deviation > 0 ? (
                      <TrendingDown className="w-4 h-4 text-red-500" />
                    ) : (
                      <TrendingUp className="w-4 h-4 text-green-500" />
                    )}
                    <div>
                      <span className="text-sm font-medium text-gb-black">
                        {s.action} {s.assetClass}
                      </span>
                      <p className="text-xs text-gb-gray">
                        Ajustar {formatNumber(s.amount, 1)} puntos porcentuales
                      </p>
                    </div>
                  </div>
                  {s.valueAmount && (
                    <span className="text-sm font-semibold text-blue-600">
                      ~{formatCurrency(s.valueAmount)}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Aligned message */}
        {suggestions.length === 0 && status === "aligned" && (
          <div className="border-t border-slate-200 pt-4">
            <div className="flex items-center gap-3 p-3 bg-green-50 border border-green-100 rounded-lg">
              <CheckCircle2 className="w-5 h-5 text-green-500" />
              <div>
                <span className="text-sm font-medium text-green-800">
                  Portafolio alineado con la recomendación
                </span>
                <p className="text-xs text-green-600">
                  No se requieren ajustes significativos en este momento.
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
