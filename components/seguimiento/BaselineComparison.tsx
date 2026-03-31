"use client";

import React from "react";
import { Star, TrendingUp, TrendingDown, ArrowRight } from "lucide-react";
import { formatNumber, formatCurrency, formatPercent, formatDate } from "@/lib/format";
import type { Snapshot } from "./SeguimientoPage";

interface Props {
  baseline: Snapshot;
  current: Snapshot;
}

interface AssetClassConfig {
  label: string;
  shortLabel: string;
  baselineKey: keyof Pick<Snapshot, "equity_percent" | "fixed_income_percent" | "alternatives_percent" | "cash_percent">;
  valueKey: keyof Pick<Snapshot, "equity_value" | "fixed_income_value" | "alternatives_value" | "cash_value">;
  color: string;
  bgColor: string;
  lightColor: string;
}

const ASSET_CLASSES: AssetClassConfig[] = [
  {
    label: "Renta Variable",
    shortLabel: "RV",
    baselineKey: "equity_percent",
    valueKey: "equity_value",
    color: "bg-blue-500",
    bgColor: "bg-blue-100",
    lightColor: "bg-blue-200",
  },
  {
    label: "Renta Fija",
    shortLabel: "RF",
    baselineKey: "fixed_income_percent",
    valueKey: "fixed_income_value",
    color: "bg-green-500",
    bgColor: "bg-green-100",
    lightColor: "bg-green-200",
  },
  {
    label: "Alternativos",
    shortLabel: "Alt",
    baselineKey: "alternatives_percent",
    valueKey: "alternatives_value",
    color: "bg-purple-500",
    bgColor: "bg-purple-100",
    lightColor: "bg-purple-200",
  },
  {
    label: "Cash",
    shortLabel: "Cash",
    baselineKey: "cash_percent",
    valueKey: "cash_value",
    color: "bg-gray-500",
    bgColor: "bg-gray-100",
    lightColor: "bg-gray-200",
  },
];

export default function BaselineComparison({ baseline, current }: Props) {
  const valueChange = current.total_value - baseline.total_value;
  const valueChangePercent = baseline.total_value > 0
    ? ((current.total_value - baseline.total_value) / baseline.total_value) * 100
    : 0;

  const daysBetween = Math.round(
    (new Date(current.snapshot_date).getTime() - new Date(baseline.snapshot_date).getTime()) /
    (1000 * 60 * 60 * 24)
  );

  return (
    <div className="bg-white rounded-lg border border-amber-200 shadow-sm">
      {/* Header */}
      <div className="px-6 py-4 border-b border-amber-200 bg-amber-50 flex items-center justify-between">
        <h2 className="text-base font-semibold text-gb-black flex items-center gap-2">
          <Star className="w-4 h-4 text-amber-500 fill-amber-500" />
          Portafolio Inicial vs Actual
        </h2>
        <span className="text-xs text-gb-gray">
          {formatDate(baseline.snapshot_date)} → {formatDate(current.snapshot_date)} ({daysBetween} días)
        </span>
      </div>

      <div className="p-6">
        {/* Value comparison cards */}
        <div className="grid grid-cols-3 gap-4 mb-6">
          <div className="p-4 bg-slate-50 rounded-lg">
            <p className="text-xs text-gb-gray font-medium uppercase mb-1">Valor Inicial</p>
            <p className="text-xl font-bold text-gb-black">{formatCurrency(baseline.total_value)}</p>
            <p className="text-xs text-gb-gray">{formatDate(baseline.snapshot_date)}</p>
          </div>
          <div className="p-4 bg-slate-50 rounded-lg">
            <p className="text-xs text-gb-gray font-medium uppercase mb-1">Valor Actual</p>
            <p className="text-xl font-bold text-gb-black">{formatCurrency(current.total_value)}</p>
            <p className="text-xs text-gb-gray">{formatDate(current.snapshot_date)}</p>
          </div>
          <div className={`p-4 rounded-lg ${valueChange >= 0 ? "bg-green-50" : "bg-red-50"}`}>
            <p className="text-xs text-gb-gray font-medium uppercase mb-1">Cambio</p>
            <p className={`text-xl font-bold ${valueChange >= 0 ? "text-green-600" : "text-red-600"}`}>
              {valueChange >= 0 ? "+" : ""}{formatCurrency(valueChange)}
            </p>
            <p className={`text-xs font-medium flex items-center gap-1 ${valueChange >= 0 ? "text-green-600" : "text-red-600"}`}>
              {valueChange >= 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
              {formatPercent(valueChangePercent)}
            </p>
          </div>
        </div>

        {/* Stacked bars comparison */}
        <div className="space-y-6 mb-6">
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-gb-gray flex items-center gap-1">
                <Star className="w-3 h-3 text-amber-500 fill-amber-500" />
                Inicial ({formatDate(baseline.snapshot_date)})
              </span>
            </div>
            <div className="h-8 flex rounded-lg overflow-hidden border border-slate-200">
              {ASSET_CLASSES.map((ac) => {
                const value = baseline[ac.baselineKey] || 0;
                if (value === 0) return null;
                return (
                  <div
                    key={ac.shortLabel}
                    className={`${ac.lightColor} flex items-center justify-center relative group`}
                    style={{ width: `${value}%` }}
                  >
                    <span className="text-xs font-semibold text-slate-700">
                      {value > 8 ? `${formatNumber(value, 0)}%` : ""}
                    </span>
                    <div className="absolute bottom-full mb-1 left-1/2 -translate-x-1/2 bg-slate-800 text-white text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-10">
                      {ac.label}: {formatNumber(value, 1)}%
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-gb-black">Actual</span>
            </div>
            <div className="h-8 flex rounded-lg overflow-hidden border border-slate-200">
              {ASSET_CLASSES.map((ac) => {
                const value = current[ac.baselineKey] || 0;
                if (value === 0) return null;
                return (
                  <div
                    key={ac.shortLabel}
                    className={`${ac.color} flex items-center justify-center relative group`}
                    style={{ width: `${value}%` }}
                  >
                    <span className="text-xs font-semibold text-white">
                      {value > 8 ? `${formatNumber(value, 0)}%` : ""}
                    </span>
                    <div className="absolute bottom-full mb-1 left-1/2 -translate-x-1/2 bg-slate-800 text-white text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-10">
                      {ac.label}: {formatNumber(value, 1)}%
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Per-asset class detail */}
        <div className="grid grid-cols-4 gap-4">
          {ASSET_CLASSES.map((ac) => {
            const baseVal = baseline[ac.baselineKey] || 0;
            const currVal = current[ac.baselineKey] || 0;
            const diff = currVal - baseVal;

            return (
              <div key={ac.shortLabel} className="p-3 rounded-lg bg-slate-50">
                <div className="flex items-center gap-2 mb-2">
                  <div className={`w-3 h-3 rounded ${ac.color}`} />
                  <span className="text-xs font-medium text-gb-gray">{ac.label}</span>
                </div>
                <div className="flex items-center gap-1 text-sm">
                  <span className="text-gb-gray">{formatNumber(baseVal, 0)}%</span>
                  <ArrowRight className="w-3 h-3 text-gb-gray" />
                  <span className="font-bold text-gb-black">{formatNumber(currVal, 0)}%</span>
                </div>
                {Math.abs(diff) > 0.5 && (
                  <span className={`text-xs font-medium ${diff > 0 ? "text-green-600" : "text-red-600"}`}>
                    {diff > 0 ? "+" : ""}{formatNumber(diff, 1)}pp
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
