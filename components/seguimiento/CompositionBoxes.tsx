"use client";

import React from "react";
import { formatNumber } from "@/lib/format";
import type { HoldingReturnsData } from "./HoldingReturnsPanel";

interface Snapshot {
  snapshot_date: string;
  cash_value: number;
}

interface Props {
  holdingReturnsData: HoldingReturnsData;
  snapshots: Snapshot[];
  compositionBaseMode: "inicio" | "fecha";
  compositionBaseDate: string;
  onBaseModeChange: (mode: "inicio" | "fecha") => void;
  onBaseDateChange: (date: string) => void;
  convertFromCLP: (clpValue: number, rates: { uf: number; usd: number } | null) => string;
  cartolaExchangeRates: { uf: number; usd: number } | null;
  currentExchangeRates: { uf: number; usd: number } | null;
  exchangeRates: { uf: number; usd: number } | null;
}

export default function CompositionBoxes({
  holdingReturnsData,
  snapshots,
  compositionBaseMode,
  compositionBaseDate,
  onBaseModeChange,
  onBaseDateChange,
  convertFromCLP,
  cartolaExchangeRates,
  currentExchangeRates,
  exchangeRates,
}: Props) {
  const d = holdingReturnsData;
  const cashVal = d.cashValue > 0 ? d.cashValue : (snapshots[snapshots.length - 1].cash_value || 0);

  // Base snapshot: "Desde inicio" = first snapshot, "Desde fecha" = nearest to selected date
  const useCustomBase = compositionBaseMode === "fecha" && compositionBaseDate;
  const baseSnap = useCustomBase
    ? (snapshots
        .filter(s => s.snapshot_date <= compositionBaseDate)
        .sort((a, b) => b.snapshot_date.localeCompare(a.snapshot_date))[0] || snapshots[0])
    : snapshots[0];

  const baseLabel = useCustomBase
    ? new Date(baseSnap.snapshot_date + "T12:00:00").toLocaleDateString("es-CL", { day: "numeric", month: "short", year: "2-digit" })
    : "Inicio";

  // Derive initial CLP value per holding: marketValue × (purchasePrice / currentPrice)
  // This uses the same classification and CLP conversion as final values,
  // just at cartola-date prices instead of current prices.
  const initCLP = (h: { marketValue: number; purchasePrice: number; currentPrice: number }) =>
    h.currentPrice > 0 && h.purchasePrice > 0
      ? h.marketValue * (h.purchasePrice / h.currentPrice)
      : h.marketValue;

  const rvInitial = d.equityHoldings.reduce((s, h) => s + initCLP(h), 0);
  const rfInitial = d.fixedIncomeFundHoldings.reduce((s, h) => s + initCLP(h), 0)
    + d.bondHoldings.reduce((s, h) => {
      // Bonds: use costBasis as initial value (already in CLP)
      return s + (h.costBasis > 0 ? h.costBasis : h.marketValue);
    }, 0);
  const altInitial = (d.alternativesHoldings || []).reduce((s, h) => s + initCLP(h), 0);
  const cashInitial = baseSnap.cash_value || 0;

  // Final (current) values: from live holdingReturnsData
  const rvFinal = d.equityHoldings.reduce((s, h) => s + h.marketValue, 0);
  const rfFinal = d.fixedIncomeFundHoldings.reduce((s, h) => s + h.marketValue, 0)
    + d.bondHoldings.reduce((s, h) => s + h.marketValue, 0);
  const altFinal = (d.alternativesHoldings || []).reduce((s, h) => s + h.marketValue, 0);

  // Sub-lines for detail
  type SubLine = { label: string; initial: number; final: number };
  type Box = { label: string; initial: number; final: number; pct: number; bg: string; border: string; text: string; textBold: string; subs: SubLine[] };

  const etfsFinal = d.equityHoldings.filter(h => h.assetType === "etf").reduce((s, h) => s + h.marketValue, 0);
  const fondosRVFinal = d.equityHoldings.filter(h => h.assetType === "fund").reduce((s, h) => s + h.marketValue, 0);
  const accionesFinal = d.equityHoldings.filter(h => h.assetType === "stock").reduce((s, h) => s + h.marketValue, 0);
  const fondosRFFinal = d.fixedIncomeFundHoldings.reduce((s, h) => s + h.marketValue, 0);
  const bonosFinal = d.bondHoldings.reduce((s, h) => s + h.marketValue, 0);

  // For sub-lines, distribute initial proportionally based on final weights
  const rvSubDistrib = (subFinal: number) => rvFinal > 0 ? rvInitial * (subFinal / rvFinal) : 0;
  const rfSubDistrib = (subFinal: number) => rfFinal > 0 ? rfInitial * (subFinal / rfFinal) : 0;

  const rvSubs: SubLine[] = [
    etfsFinal > 0 ? { label: "ETFs", initial: rvSubDistrib(etfsFinal), final: etfsFinal } : null,
    fondosRVFinal > 0 ? { label: "Fondos", initial: rvSubDistrib(fondosRVFinal), final: fondosRVFinal } : null,
    accionesFinal > 0 ? { label: "Acciones", initial: rvSubDistrib(accionesFinal), final: accionesFinal } : null,
  ].filter(Boolean) as SubLine[];
  const rfSubs: SubLine[] = [
    fondosRFFinal > 0 ? { label: "Fondos RF", initial: rfSubDistrib(fondosRFFinal), final: fondosRFFinal } : null,
    bonosFinal > 0 ? { label: "Bonos", initial: rfSubDistrib(bonosFinal), final: bonosFinal } : null,
  ].filter(Boolean) as SubLine[];

  const total = d.totalValue || 1;
  const boxes: Box[] = [
    rvFinal > 0 || rvInitial > 0 ? { label: "Renta Variable", initial: rvInitial, final: rvFinal, pct: (rvFinal / total) * 100, bg: "bg-blue-50", border: "border-blue-200", text: "text-blue-600", textBold: "text-blue-800", subs: rvSubs } : null,
    rfFinal > 0 || rfInitial > 0 ? { label: "Renta Fija", initial: rfInitial, final: rfFinal, pct: (rfFinal / total) * 100, bg: "bg-green-50", border: "border-green-200", text: "text-green-600", textBold: "text-green-800", subs: rfSubs } : null,
    altFinal > 0 || altInitial > 0 ? { label: "Alternativos", initial: altInitial, final: altFinal, pct: (altFinal / total) * 100, bg: "bg-orange-50", border: "border-orange-200", text: "text-orange-600", textBold: "text-orange-800", subs: [] } : null,
    cashVal > 0 ? { label: "Caja", initial: cashInitial, final: cashVal, pct: (cashVal / total) * 100, bg: "bg-slate-50", border: "border-slate-200", text: "text-slate-600", textBold: "text-slate-800", subs: [] } : null,
  ].filter(Boolean) as Box[];

  return (
    <>
      {/* Tab: Desde inicio / Desde fecha */}
      <div className="flex items-center gap-3 mb-3">
        <div className="flex rounded-lg border border-gb-border overflow-hidden">
          <button
            onClick={() => onBaseModeChange("inicio")}
            className={`px-3 py-1.5 text-xs font-medium transition-colors ${
              compositionBaseMode === "inicio"
                ? "bg-blue-600 text-white"
                : "bg-white text-gb-gray hover:bg-slate-50"
            }`}
          >
            Desde inicio
          </button>
          <button
            onClick={() => {
              onBaseModeChange("fecha");
              if (!compositionBaseDate && snapshots.length > 1) {
                onBaseDateChange(snapshots[Math.max(0, snapshots.length - 2)].snapshot_date);
              }
            }}
            className={`px-3 py-1.5 text-xs font-medium border-l border-gb-border transition-colors ${
              compositionBaseMode === "fecha"
                ? "bg-blue-600 text-white"
                : "bg-white text-gb-gray hover:bg-slate-50"
            }`}
          >
            Desde fecha
          </button>
        </div>
        {compositionBaseMode === "fecha" && (
          <input
            type="date"
            value={compositionBaseDate}
            onChange={(e) => onBaseDateChange(e.target.value)}
            min={snapshots[0]?.snapshot_date}
            max={snapshots[snapshots.length - 1]?.snapshot_date}
            className="px-2 py-1 text-xs border border-gb-border rounded-lg bg-white text-gb-black focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        )}
      </div>

      <div className="grid grid-cols-4 gap-3 mb-6">
        {boxes.map(b => {
          const ret = b.initial > 0 ? ((b.final / b.initial) - 1) * 100 : 0;
          return (
            <div key={b.label} className={`${b.bg} rounded-lg border ${b.border} p-3 flex flex-col`}>
              <div className="flex items-center justify-between mb-1.5">
                <p className={`text-xs ${b.text} font-medium`}>{b.label}</p>
                <span className={`text-[10px] ${b.text}`}>{formatNumber(b.pct, 1)}%</span>
              </div>
              <div className="flex items-baseline justify-between mb-1">
                <div>
                  <p className="text-[10px] text-gb-gray leading-tight">{baseLabel}</p>
                  <p className={`text-sm font-semibold ${b.textBold}`}>{convertFromCLP(b.initial, cartolaExchangeRates || exchangeRates)}</p>
                </div>
                <div className="text-right">
                  <p className="text-[10px] text-gb-gray leading-tight">Actual</p>
                  <p className={`text-sm font-semibold ${b.textBold}`}>{convertFromCLP(b.final, currentExchangeRates || exchangeRates)}</p>
                </div>
              </div>
              {b.initial > 0 && b.label !== "Caja" && (
                <p className={`text-xs font-semibold text-right ${ret >= 0 ? "text-green-600" : "text-red-600"}`}>
                  {ret >= 0 ? "+" : ""}{formatNumber(ret, 1)}%
                </p>
              )}
              {b.subs.length > 0 && (
                <div className="mt-auto pt-1.5 border-t border-black/5 space-y-0.5">
                  {b.subs.map(sub => {
                    const subRet = sub.initial > 0 ? ((sub.final / sub.initial) - 1) * 100 : 0;
                    return (
                      <div key={sub.label} className="flex items-center justify-between text-[10px]">
                        <span className="text-gb-gray">{sub.label}</span>
                        <span className="flex items-center gap-1.5">
                          <span className="text-gb-gray">{convertFromCLP(sub.final, currentExchangeRates || exchangeRates)}</span>
                          {sub.initial > 0 && (
                            <span className={`font-medium ${subRet >= 0 ? "text-green-600" : "text-red-600"}`}>
                              {subRet >= 0 ? "+" : ""}{formatNumber(subRet, 1)}%
                            </span>
                          )}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </>
  );
}
