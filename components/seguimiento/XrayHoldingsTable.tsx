"use client";

import React, { useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  ArrowRight,
  TrendingDown,
  DollarSign,
  CheckCircle2,
  XCircle,
} from "lucide-react";
import { formatCurrency, formatNumber, formatPercent } from "@/lib/format";
import type { HoldingAnalysis } from "./hooks/useXrayProposal";

interface Props {
  holdings: HoldingAnalysis[];
  ahorroPotencial10Y: number;
  ahorroAnualPotencial: number;
  getEffectiveTac: (h: HoldingAnalysis) => number | null;
  tacOverrides: Record<string, number>;
  onTacOverride: (fundName: string, value: number) => void;
}

export default function XrayHoldingsTable({
  holdings,
  ahorroPotencial10Y,
  ahorroAnualPotencial,
  getEffectiveTac,
  tacOverrides,
  onTacOverride,
}: Props) {
  const [expandedHolding, setExpandedHolding] = useState<string | null>(null);

  return (
    <div className="bg-white rounded-lg border border-gb-border shadow-sm">
      <div className="px-4 py-3 border-b border-gb-border flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gb-black">
          Detalle por Holding
        </h3>
        {ahorroAnualPotencial > 0 && (
          <span className="text-xs px-2 py-1 bg-green-50 text-green-700 rounded-full font-medium">
            Ahorro 10 años: {formatCurrency(ahorroPotencial10Y)}
          </span>
        )}
      </div>
      <div className="divide-y divide-gb-border">
        {holdings
          .sort((a, b) => b.marketValue - a.marketValue)
          .map((h) => {
            const isExpanded = expandedHolding === h.fundName;
            return (
              <div key={h.fundName}>
                <div
                  className="px-4 py-3 flex items-center gap-3 hover:bg-slate-50 cursor-pointer transition-colors"
                  onClick={() =>
                    setExpandedHolding(isExpanded ? null : h.fundName)
                  }
                >
                  {/* Expand icon */}
                  <span className="text-gb-gray">
                    {h.cheaperAlternatives.length > 0 ? (
                      isExpanded ? (
                        <ChevronDown className="w-4 h-4" />
                      ) : (
                        <ChevronRight className="w-4 h-4" />
                      )
                    ) : (
                      <span className="w-4" />
                    )}
                  </span>

                  {/* Fund info */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gb-black truncate">
                      {h.fundName}
                    </p>
                    <div className="flex items-center gap-2 text-xs text-gb-gray">
                      <span className="px-1.5 py-0.5 bg-slate-100 rounded">
                        {h.categoria}
                      </span>
                      {h.matchedAgf && <span>{h.matchedAgf}</span>}
                      {!h.matched && (
                        <span className="px-1.5 py-0.5 bg-red-100 text-red-700 rounded font-medium">
                          No identificado
                        </span>
                      )}
                      {h.isFondoInversion && (
                        <span className="px-1.5 py-0.5 bg-amber-100 text-amber-700 rounded font-medium">
                          FI{h.fiPrecioFecha ? ` ${h.fiPrecioFecha}` : ""}
                        </span>
                      )}
                      {h.beneficio107lir && (
                        <span className="px-1.5 py-0.5 bg-green-100 text-green-700 rounded font-medium">
                          107
                        </span>
                      )}
                      {h.beneficio108lir && (
                        <span className="px-1.5 py-0.5 bg-green-100 text-green-700 rounded font-medium">
                          108
                        </span>
                      )}
                      {h.isApvEligible && (
                        <span className="px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded font-medium">
                          APV
                        </span>
                      )}
                      {h.regimen57bis && (
                        <span className="px-1.5 py-0.5 bg-purple-100 text-purple-700 rounded font-medium">
                          57bis
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Value */}
                  <div className="text-right">
                    <p className="text-sm font-semibold text-gb-black">
                      {formatCurrency(h.marketValue)}
                    </p>
                    <p className="text-xs text-gb-gray">
                      {formatNumber(h.weight, 1)}%
                    </p>
                  </div>

                  {/* TAC (editable) */}
                  <div className="text-right w-24" onClick={(e) => e.stopPropagation()}>
                    {(() => {
                      const effectiveTac = getEffectiveTac(h);
                      const isOverridden = tacOverrides[h.fundName] !== undefined;
                      return effectiveTac !== null ? (
                        <div>
                          <input
                            type="number"
                            value={isOverridden ? tacOverrides[h.fundName] : effectiveTac}
                            onChange={(e) => {
                              const val = parseFloat(e.target.value);
                              if (!isNaN(val) && val >= 0 && val <= 10) {
                                onTacOverride(h.fundName, val);
                              }
                            }}
                            className={`w-16 px-1 py-0.5 text-xs text-right border rounded ${
                              isOverridden ? "border-blue-400 bg-blue-50" : "border-gb-border"
                            } ${effectiveTac > 2 ? "text-red-600" : effectiveTac > 1 ? "text-amber-600" : "text-green-600"} font-semibold`}
                            step="0.01"
                            min="0"
                            max="10"
                          />
                          <p className="text-[10px] text-gb-gray uppercase">
                            TAC{isOverridden && " (edit)"}
                          </p>
                        </div>
                      ) : (
                        <div>
                          <input
                            type="number"
                            placeholder="-"
                            onChange={(e) => {
                              const val = parseFloat(e.target.value);
                              if (!isNaN(val) && val >= 0 && val <= 10) {
                                onTacOverride(h.fundName, val);
                              }
                            }}
                            className="w-16 px-1 py-0.5 text-xs text-right border border-dashed border-gb-border rounded text-gb-gray"
                            step="0.01"
                            min="0"
                            max="10"
                          />
                          <p className="text-[10px] text-gb-gray uppercase">TAC</p>
                        </div>
                      );
                    })()}
                  </div>

                  {/* Savings indicator */}
                  <div className="w-24 text-right">
                    {h.potentialSavingAnnual && h.potentialSavingAnnual > 0 ? (
                      <p className="text-sm font-semibold text-green-600">
                        <TrendingDown className="w-3 h-3 inline mr-0.5" />
                        {formatCurrency(h.potentialSavingAnnual)}
                      </p>
                    ) : h.tac !== null ? (
                      <span className="text-xs text-gb-gray">
                        <CheckCircle2 className="w-3 h-3 inline text-green-500" /> Competitivo
                      </span>
                    ) : (
                      <span className="text-xs text-gb-gray">
                        <XCircle className="w-3 h-3 inline text-slate-400" /> Sin datos
                      </span>
                    )}
                  </div>
                </div>

                {/* Expanded: alternatives */}
                {isExpanded && h.cheaperAlternatives.length > 0 && (
                  <div className="px-4 pb-3 ml-7">
                    <p className="text-xs font-semibold text-gb-gray mb-2">
                      Alternativas más económicas:
                    </p>
                    <div className="space-y-1.5">
                      {h.cheaperAlternatives.map((alt, i) => (
                        <div
                          key={i}
                          className="flex items-center gap-3 text-xs bg-green-50 border border-green-200 rounded-md px-3 py-2"
                        >
                          <ArrowRight className="w-3 h-3 text-green-600 shrink-0" />
                          <div className="flex-1 min-w-0">
                            <span className="font-medium text-gb-black truncate block">
                              {alt.nombre_fondo}
                            </span>
                            <span className="text-gb-gray">
                              {alt.nombre_agf} — Serie {alt.fm_serie}
                            </span>
                          </div>
                          <div className="text-right shrink-0">
                            <span className="font-bold text-green-700">
                              TAC {formatNumber(alt.tac_sintetica, 2)}%
                            </span>
                            <span className="text-gb-gray block">
                              vs {formatNumber(h.tac || 0, 2)}% actual
                            </span>
                          </div>
                          {alt.rent_12m !== null && (
                            <div className="text-right shrink-0">
                              <span className={`font-medium ${alt.rent_12m >= 0 ? "text-green-700" : "text-red-600"}`}>
                                {formatPercent(alt.rent_12m)}
                              </span>
                              <span className="text-gb-gray block">12M</span>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                    {h.potentialSaving10Y && h.potentialSaving10Y > 0 && (
                      <p className="mt-2 text-xs text-green-700 font-medium">
                        <DollarSign className="w-3 h-3 inline" />
                        Ahorro estimado en 10 años: {formatCurrency(h.potentialSaving10Y)}
                      </p>
                    )}
                  </div>
                )}
              </div>
            );
          })}
      </div>
    </div>
  );
}
