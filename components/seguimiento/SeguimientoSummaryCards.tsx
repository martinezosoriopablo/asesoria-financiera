"use client";

import React from "react";
import { Calendar } from "lucide-react";
import { formatNumber, formatCurrency, formatDate } from "@/lib/format";

interface Props {
  metrics: { initialValue: number; currentValue: number };
  cartolaExchangeRates: { usd: number; uf: number; eur?: number } | null;
  currentExchangeRates: { usd: number; uf: number; eur?: number } | null;
  exchangeRates: { usd: number; uf: number; eur?: number } | null;
  livePortfolioValue: number | null;
  livePriceDate: string | null;
  historicalSeries: Array<{ fecha: string; total: number; [key: string]: string | number }>;
  snapshots: Array<{ snapshot_date: string; source: string; is_baseline?: boolean }>;
  displayCurrency: string;
  setDisplayCurrency: (cur: string) => void;
  weightedTAC: { weighted: number; annualCost: number; coverage: number } | null;
  baselineAccReturn: number | null;
  convertFromCLP: (clpValue: number, rates: { usd: number; uf: number } | null) => string;
  periodReturns: Record<string, { nominal: number; real: number | null; usd: number | null } | null> | null;
}

export default function SeguimientoSummaryCards({
  metrics,
  cartolaExchangeRates,
  currentExchangeRates,
  exchangeRates,
  livePortfolioValue,
  livePriceDate,
  historicalSeries,
  snapshots,
  displayCurrency,
  setDisplayCurrency,
  weightedTAC,
  baselineAccReturn,
  convertFromCLP,
  periodReturns,
}: Props) {
  return (
          <div className="mb-6 space-y-3">
            {/* Currency toggle */}
            <div className="flex justify-end">
              <div className="inline-flex rounded-md border border-gb-border bg-white text-xs">
                {(["CLP", "USD", "UF"] as const).map((cur) => (
                  <button
                    key={cur}
                    onClick={() => setDisplayCurrency(cur)}
                    className={`px-2.5 py-1 font-medium transition-colors ${
                      displayCurrency === cur
                        ? "bg-gb-primary text-white"
                        : "text-gb-gray hover:text-gb-black"
                    } ${cur === "CLP" ? "rounded-l-md" : cur === "UF" ? "rounded-r-md" : ""}`}
                  >
                    {cur}
                  </button>
                ))}
              </div>
            </div>
            {/* Row 1: Valor Inicial + Valor Actual (big cards) + TAC */}
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {/* Valor Inicial (cartola) */}
              <div className="bg-white rounded-lg border border-gb-border p-5 shadow-sm">
                <p className="text-xs text-gb-gray font-medium uppercase mb-1">Valor Cartola</p>
                <p className="text-2xl font-bold text-gb-black">
                  {convertFromCLP(metrics.initialValue, cartolaExchangeRates || exchangeRates)}
                </p>
                <p className="text-xs text-gb-gray mt-1">
                  {(() => {
                    const rates = cartolaExchangeRates || exchangeRates;
                    if (!rates || displayCurrency === "CLP") {
                      return rates ? (
                        <span>UF {(metrics.initialValue / rates.uf).toLocaleString("es-CL", { maximumFractionDigits: 1 })} · USD {(metrics.initialValue / rates.usd).toLocaleString("es-CL", { maximumFractionDigits: 0 })}</span>
                      ) : null;
                    }
                    return <span>{formatCurrency(metrics.initialValue)}</span>;
                  })()}
                  {snapshots.length > 0 && (
                    <span>{(cartolaExchangeRates || exchangeRates) ? " · " : ""}<Calendar className="w-3 h-3 inline mr-1" />{formatDate(snapshots.find(s => s.source === "statement" || s.source === "manual" || s.source === "excel")?.snapshot_date || snapshots[0].snapshot_date)}</span>
                  )}
                </p>
                {(() => {
                  const rates = cartolaExchangeRates || exchangeRates;
                  return rates ? (
                    <p className="text-[10px] text-gb-gray/60 mt-0.5">
                      TC: USD ${rates.usd.toLocaleString("es-CL", { maximumFractionDigits: 2 })} · UF ${rates.uf.toLocaleString("es-CL", { maximumFractionDigits: 2 })}
                    </p>
                  ) : null;
                })()}
              </div>

              {/* Valor Actual */}
              <div className="bg-white rounded-lg border-2 border-blue-200 p-5 shadow-sm">
                <p className="text-xs text-blue-600 font-medium uppercase mb-1">Valor Actual</p>
                <p className="text-2xl font-bold text-gb-black">
                  {convertFromCLP(livePortfolioValue ?? metrics.currentValue, currentExchangeRates || exchangeRates)}
                </p>
                <p className="text-xs text-gb-gray mt-1">
                  {(() => {
                    const rates = currentExchangeRates || exchangeRates;
                    if (!rates || displayCurrency === "CLP") {
                      return rates ? (
                        <span>UF {((livePortfolioValue ?? metrics.currentValue) / rates.uf).toLocaleString("es-CL", { maximumFractionDigits: 1 })} · USD {((livePortfolioValue ?? metrics.currentValue) / rates.usd).toLocaleString("es-CL", { maximumFractionDigits: 0 })}</span>
                      ) : null;
                    }
                    return <span>{formatCurrency(livePortfolioValue ?? metrics.currentValue)}</span>;
                  })()}
                  {(livePriceDate || historicalSeries.length > 0 || snapshots.length > 0) && (
                    <span>{(currentExchangeRates || exchangeRates) ? " · " : ""}<Calendar className="w-3 h-3 inline mr-1" />{formatDate(
                      livePriceDate
                      || (historicalSeries.length > 0 ? historicalSeries[historicalSeries.length - 1].fecha as string : null)
                      || snapshots[snapshots.length - 1].snapshot_date
                    )}</span>
                  )}
                </p>
                {(() => {
                  const rates = currentExchangeRates || exchangeRates;
                  return rates ? (
                    <p className="text-[10px] text-gb-gray/60 mt-0.5">
                      TC: USD ${rates.usd.toLocaleString("es-CL", { maximumFractionDigits: 2 })} · UF ${rates.uf.toLocaleString("es-CL", { maximumFractionDigits: 2 })}
                    </p>
                  ) : null;
                })()}
                {baselineAccReturn !== null && (
                  <p className="text-xs text-gb-gray mt-1">
                    Sin cambios: <span className={baselineAccReturn >= 0 ? "text-green-600" : "text-red-600"}>{baselineAccReturn >= 0 ? '+' : ''}{baselineAccReturn.toFixed(1)}%</span>
                  </p>
                )}
              </div>

              {/* TAC ponderado */}
              <div className="bg-white rounded-lg border border-gb-border p-5 shadow-sm col-span-2 md:col-span-1">
                <p className="text-xs text-gb-gray font-medium uppercase mb-1">TAC Ponderado</p>
                {weightedTAC ? (
                  <>
                    <p className="text-2xl font-bold text-gb-black">
                      {formatNumber(weightedTAC.weighted, 2)}%
                    </p>
                    <p className="text-xs text-gb-gray mt-1">
                      {convertFromCLP(weightedTAC.annualCost, exchangeRates)}/año{displayCurrency === "CLP" && exchangeRates ? ` (UF ${(weightedTAC.annualCost / exchangeRates.uf).toLocaleString("es-CL", { maximumFractionDigits: 1 })})` : ""}
                    </p>
                  </>
                ) : (
                  <p className="text-2xl font-bold text-gb-gray">-</p>
                )}
              </div>
            </div>

            {/* Row 2: Rentabilidades (compact) — nominal / real / USD */}
            <div className="grid grid-cols-5 gap-2">
              {(["1M", "3M", "6M", "1Y", "YTD"] as const).map((p) => {
                const ret = periodReturns?.[p] ?? null;
                const renderVal = (v: number | null | undefined, label: string, bold?: boolean) => {
                  if (v === null || v === undefined) return null;
                  return (
                    <p className={`${bold ? "text-sm font-bold" : "text-[10px] font-medium"} ${v >= 0 ? "text-green-600" : "text-red-600"}`}>
                      {!bold && <span className="text-gb-gray mr-0.5">{label}</span>}
                      {v >= 0 ? "+" : ""}{formatNumber(v, 1)}%
                    </p>
                  );
                };
                return (
                  <div key={p} className="bg-white rounded-lg border border-gb-border px-3 py-2 shadow-sm text-center">
                    <p className="text-[10px] text-gb-gray font-medium uppercase mb-0.5">{p}</p>
                    {ret !== null ? (
                      <>
                        {renderVal(ret.nominal, "", true)}
                        {renderVal(ret.real, "UF ")}
                        {renderVal(ret.usd, "USD ")}
                      </>
                    ) : (
                      <p className="text-sm font-bold text-gb-gray">-</p>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
  );
}
