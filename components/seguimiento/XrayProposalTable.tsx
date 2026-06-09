"use client";

import React, { useState, useRef, useCallback } from "react";
import { Search, X, Mail, Loader } from "lucide-react";
import { formatCurrency, formatNumber, formatPercent } from "@/lib/format";
import CartaCorredorModal from "@/components/portfolio/CartaCorredorModal";
import type { HoldingAnalysis, ProposalOverride } from "./hooks/useXrayProposal";

interface SearchResult {
  id: string;
  type: "fund" | "stock";
  fo_run?: number;
  serie?: string;
  nombre: string;
  agf?: string;
  moneda: string;
  valor_cuota: number | null;
  tac?: number | null;
  rent_1m?: number | null;
  rent_3m?: number | null;
  rent_12m?: number | null;
  isPreferred?: boolean;
}

interface MergedProposalHolding {
  originalFund: string;
  proposedFund: string;
  proposedAgf: string;
  proposedSerie: string;
  changed: boolean;
  isPreferred?: boolean;
  weight: number;
  currentTac: number | null;
  proposedTac: number;
  tacSavingBps: number;
  marketValue: number;
  categoria: string;
  currentRent1m: number | null;
  currentRent3m: number | null;
  currentRent12m: number | null;
  proposedRent1m: number | null;
  proposedRent3m: number | null;
  proposedRent12m: number | null;
}

interface MergedProposal {
  holdings: MergedProposalHolding[];
  currentTacPromedio: number;
  proposedTacPromedio: number;
  currentCostoAnual: number;
  proposedCostoAnual: number;
  ahorroFondosAnual: number;
  currentRent12m: number | null;
  proposedRent12m: number | null;
  currentRent12mCoverage: number;
  proposedRent12mCoverage: number;
  feeAnual: number;
  costoTotalPropuesto: number;
  ahorroNeto: number;
}

interface XrayProposalTableProps {
  mergedProposal: MergedProposal;
  dataHoldings: HoldingAnalysis[];
  ufValue: number | null;
  advisoryFee: number;
  onAdvisoryFeeChange: (fee: number) => void;
  tacOverrides: Record<string, number>;
  onTacOverride: (fundName: string, value: number) => void;
  proposedTacOverrides: Record<string, number>;
  onProposedTacOverride: (fundName: string, value: number) => void;
  proposalOverrides: Record<string, ProposalOverride>;
  onSelectFund: (holdingFundName: string, searchResult: SearchResult) => void;
  onRemoveOverride: (holdingFundName: string) => void;
  readOnly?: boolean;
  clientId?: string;
}

export default function XrayProposalTable({
  mergedProposal,
  dataHoldings,
  ufValue,
  advisoryFee,
  onAdvisoryFeeChange,
  tacOverrides,
  onTacOverride,
  proposedTacOverrides,
  onProposedTacOverride,
  proposalOverrides,
  onSelectFund,
  onRemoveOverride,
  readOnly,
  clientId,
}: XrayProposalTableProps) {
  // Rent period selector for proposal table
  const [rentPeriod, setRentPeriod] = useState<"1M" | "3M" | "1Y">("1Y");

  // Carta corredor modal
  const [showCartaCorredor, setShowCartaCorredor] = useState(false);

  // Fund search state
  const [searchingFund, setSearchingFund] = useState<string | null>(null);
  const [fundSearchQuery, setFundSearchQuery] = useState("");
  const [fundSearchResults, setFundSearchResults] = useState<SearchResult[]>([]);
  const [fundSearchLoading, setFundSearchLoading] = useState(false);
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Fund search for proposal overrides
  const searchFunds = useCallback(async (query: string) => {
    if (query.length < 2) { setFundSearchResults([]); return; }
    setFundSearchLoading(true);
    try {
      const res = await fetch(`/api/fondos/search-price?q=${encodeURIComponent(query)}&type=fund`);
      const result = await res.json();
      if (result.success) {
        setFundSearchResults(result.results || []);
      }
    } catch { /* ignore */ }
    setFundSearchLoading(false);
  }, []);

  const handleFundSearchInput = useCallback((value: string) => {
    setFundSearchQuery(value);
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    searchTimeoutRef.current = setTimeout(() => searchFunds(value), 400);
  }, [searchFunds]);

  return (
    <>
      {/* Proposal Section — "Nuestra Propuesta" */}
      <div className="bg-white rounded-lg border border-gb-border shadow-sm">
        <div className="px-4 py-3 border-b border-gb-border">
          <h3 className="text-sm font-semibold text-gb-black">
            Propuesta de Optimización
          </h3>
          <p className="text-xs text-gb-gray mt-0.5">
            Comparación entre fondos actuales y alternativas de menor costo. Usa el buscador para proponer fondos manualmente.
          </p>
        </div>

        {/* Proposal comparison table */}
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-slate-50 border-b border-gb-border">
                <th className="text-left px-3 py-2 font-semibold text-gb-gray">Actual</th>
                <th className="text-left px-3 py-2 font-semibold text-gb-gray">Propuesto</th>
                <th className="text-center px-3 py-2 font-semibold text-gb-gray">Cat.</th>
                <th className="text-right px-3 py-2 font-semibold text-gb-gray">Peso</th>
                <th className="text-right px-3 py-2 font-semibold text-gb-gray">TAC Actual</th>
                <th className="text-right px-3 py-2 font-semibold text-gb-gray">TAC Prop.</th>
                <th className="text-center px-2 py-2 font-semibold text-gb-gray" colSpan={2}>
                  <div className="flex items-center justify-center gap-1">
                    <span>Rent.</span>
                    <select
                      value={rentPeriod}
                      onChange={(e) => setRentPeriod(e.target.value as "1M" | "3M" | "1Y")}
                      className="text-[10px] font-semibold text-gb-gray bg-white border border-gb-border rounded px-1 py-0.5 cursor-pointer"
                    >
                      <option value="1M">1M</option>
                      <option value="3M">3M</option>
                      <option value="1Y">1Y</option>
                    </select>
                  </div>
                  <div className="flex justify-between text-[9px] text-gb-gray mt-0.5 px-1">
                    <span>Actual</span>
                    <span>Prop.</span>
                  </div>
                </th>
                <th className="text-right px-3 py-2 font-semibold text-gb-gray">Ahorro</th>
                {!readOnly && <th className="text-center px-3 py-2 font-semibold text-gb-gray w-8"></th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-gb-border">
              {mergedProposal.holdings
                .sort((a, b) => b.weight - a.weight)
                .map((ph, i) => {
                  const isSearching = searchingFund === ph.originalFund;
                  const hasOverride = !!proposalOverrides[ph.originalFund];
                  return (
                    <React.Fragment key={i}>
                      <tr className={ph.changed ? "bg-green-50/50" : ""}>
                        <td className="px-3 py-2">
                          <span className="font-medium text-gb-black truncate block max-w-[180px]" title={ph.originalFund}>
                            {ph.originalFund.length > 28 ? ph.originalFund.substring(0, 28) + "..." : ph.originalFund}
                          </span>
                          {(() => {
                            const hMatch = dataHoldings.find(h => h.fundName === ph.originalFund);
                            if (!hMatch) return null;
                            const badges: Array<{ label: string; color: string }> = [];
                            if (hMatch.beneficio107lir) badges.push({ label: "107", color: "bg-green-100 text-green-700" });
                            if (hMatch.beneficio108lir) badges.push({ label: "108", color: "bg-green-100 text-green-700" });
                            if (hMatch.isApvEligible) badges.push({ label: "APV", color: "bg-blue-100 text-blue-700" });
                            if (hMatch.regimen57bis) badges.push({ label: "57bis", color: "bg-purple-100 text-purple-700" });
                            if (badges.length === 0) return null;
                            return (
                              <div className="flex gap-1 mt-0.5">
                                {badges.map(b => (
                                  <span key={b.label} className={`px-1 py-0 rounded text-[9px] font-medium ${b.color}`}>{b.label}</span>
                                ))}
                              </div>
                            );
                          })()}
                        </td>
                        <td className="px-3 py-2">
                          {ph.changed ? (
                            <div className="flex items-center gap-1">
                              <div className="flex-1 min-w-0">
                                <span className={`font-medium truncate block max-w-[160px] ${hasOverride ? "text-blue-700" : "text-green-700"}`} title={ph.proposedFund}>
                                  {ph.isPreferred && <span className="text-[9px] px-1 py-0 rounded bg-amber-100 text-amber-700 font-semibold mr-1">MI FONDO</span>}
                                  {ph.proposedFund.length > 26 ? ph.proposedFund.substring(0, 26) + "..." : ph.proposedFund}
                                </span>
                                <span className="text-[10px] text-gb-gray">{ph.proposedAgf}{ph.proposedSerie && ` — ${ph.proposedSerie}`}</span>
                              </div>
                              {!readOnly && hasOverride && (
                                <button
                                  onClick={() => onRemoveOverride(ph.originalFund)}
                                  className="text-gb-gray hover:text-red-500 shrink-0"
                                  title="Quitar override"
                                >
                                  <X className="w-3 h-3" />
                                </button>
                              )}
                            </div>
                          ) : (
                            <span className="text-gb-gray italic">Sin cambio</span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-center">
                          <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                            ph.categoria === "Renta Variable" ? "bg-blue-100 text-blue-700" :
                            ph.categoria === "Renta Fija" ? "bg-green-100 text-green-700" :
                            ph.categoria === "Balanceado" ? "bg-purple-100 text-purple-700" :
                            "bg-slate-100 text-slate-700"
                          }`}>
                            {ph.categoria === "Renta Variable" ? "RV" :
                             ph.categoria === "Renta Fija" ? "RF" :
                             ph.categoria === "Balanceado" ? "Bal" :
                             ph.categoria === "Alternativos" ? "Alt" : "Otro"}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-right text-gb-gray">{formatNumber(ph.weight, 1)}%</td>
                        <td className="px-3 py-2 text-right">
                          <input
                            type="number"
                            value={ph.currentTac ?? ""}
                            onChange={(e) => {
                              const val = parseFloat(e.target.value);
                              if (!isNaN(val) && val >= 0 && val <= 10) {
                                onTacOverride(ph.originalFund, val);
                              }
                            }}
                            placeholder="-"
                            className={`w-16 px-1 py-0.5 text-xs text-right border rounded ${
                              tacOverrides[ph.originalFund] !== undefined ? "border-blue-400 bg-blue-50" : "border-gb-border"
                            } ${(ph.currentTac ?? 0) > 2 ? "text-red-600 font-semibold" : (ph.currentTac ?? 0) > 1 ? "text-amber-600" : "text-gb-black"}`}
                            step="0.01"
                            min="0"
                            max="10"
                          />
                        </td>
                        <td className="px-3 py-2 text-right">
                          <input
                            type="number"
                            value={ph.proposedTac}
                            onChange={(e) => {
                              const val = parseFloat(e.target.value);
                              if (!isNaN(val) && val >= 0 && val <= 10) {
                                onProposedTacOverride(ph.originalFund, val);
                              }
                            }}
                            className={`w-16 px-1 py-0.5 text-xs text-right border rounded ${
                              proposedTacOverrides[ph.originalFund] !== undefined ? "border-blue-400 bg-blue-50" : "border-gb-border"
                            } ${ph.changed ? "text-green-700 font-semibold" : "text-gb-gray"}`}
                            step="0.01"
                            min="0"
                            max="10"
                          />
                        </td>
                        {(() => {
                          const currentRent = rentPeriod === "1M" ? ph.currentRent1m : rentPeriod === "3M" ? ph.currentRent3m : ph.currentRent12m;
                          const proposedRent = rentPeriod === "1M" ? ph.proposedRent1m : rentPeriod === "3M" ? ph.proposedRent3m : ph.proposedRent12m;
                          return (
                            <>
                              <td className="px-2 py-2 text-right">
                                {currentRent !== null ? (
                                  <span className={`${currentRent >= 0 ? "text-gb-black" : "text-red-600"}`}>
                                    {formatPercent(currentRent)}
                                  </span>
                                ) : <span className="text-gb-gray">-</span>}
                              </td>
                              <td className="px-2 py-2 text-right">
                                {proposedRent !== null ? (
                                  <span className={`font-medium ${proposedRent >= 0 ? "text-green-600" : "text-red-600"}`}>
                                    {formatPercent(proposedRent)}
                                  </span>
                                ) : <span className="text-gb-gray">-</span>}
                              </td>
                            </>
                          );
                        })()}
                        <td className="px-3 py-2 text-right">
                          {ph.tacSavingBps > 0 ? (
                            <span className="text-green-700 font-semibold">-{ph.tacSavingBps} bps</span>
                          ) : <span className="text-gb-gray">-</span>}
                        </td>
                        {!readOnly && (
                        <td className="px-3 py-2 text-center">
                          <button
                            onClick={() => {
                              if (isSearching) {
                                setSearchingFund(null);
                                setFundSearchQuery("");
                                setFundSearchResults([]);
                              } else {
                                setSearchingFund(ph.originalFund);
                                setFundSearchQuery("");
                                setFundSearchResults([]);
                              }
                            }}
                            className={`p-1 rounded transition-colors ${isSearching ? "bg-blue-100 text-blue-600" : "text-gb-gray hover:bg-slate-100"}`}
                            title="Buscar fondo alternativo"
                          >
                            <Search className="w-3.5 h-3.5" />
                          </button>
                        </td>
                        )}
                      </tr>
                      {/* Inline search row */}
                      {!readOnly && isSearching && (
                        <tr>
                          <td colSpan={9} className="px-3 py-2 bg-blue-50/50">
                            <div className="flex items-center gap-2 mb-2">
                              <Search className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                              <input
                                type="text"
                                value={fundSearchQuery}
                                onChange={(e) => handleFundSearchInput(e.target.value)}
                                placeholder="Buscar fondo por nombre, RUN o AGF..."
                                className="flex-1 px-2 py-1.5 text-xs border border-gb-border rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                autoFocus
                              />
                              <button
                                onClick={() => { setSearchingFund(null); setFundSearchQuery(""); setFundSearchResults([]); }}
                                className="text-gb-gray hover:text-red-500"
                              >
                                <X className="w-3.5 h-3.5" />
                              </button>
                            </div>
                            {fundSearchLoading && (
                              <div className="flex items-center gap-2 py-2 text-xs text-gb-gray">
                                <Loader className="w-3 h-3 animate-spin" /> Buscando...
                              </div>
                            )}
                            {fundSearchResults.length > 0 && (
                              <div className="max-h-48 overflow-y-auto space-y-1">
                                {fundSearchResults.slice(0, 10).map((r, ri) => (
                                  <button
                                    key={ri}
                                    onClick={() => {
                                      onSelectFund(ph.originalFund, r);
                                      setSearchingFund(null);
                                      setFundSearchQuery("");
                                      setFundSearchResults([]);
                                    }}
                                    className={`w-full text-left px-2 py-1.5 text-xs border rounded hover:bg-blue-50 hover:border-blue-300 transition-colors flex items-center gap-2 ${
                                      r.isPreferred ? "bg-amber-50/50 border-amber-200" : "bg-white border-gb-border"
                                    }`}
                                  >
                                    <div className="flex-1 min-w-0">
                                      <span className="font-medium text-gb-black block truncate">
                                        {r.isPreferred && <span className="text-[9px] px-1 py-0 rounded bg-amber-100 text-amber-700 font-semibold mr-1">MI FONDO</span>}
                                        {r.nombre}
                                      </span>
                                      <span className="text-gb-gray">{r.agf}{r.serie && ` — Serie ${r.serie}`}</span>
                                    </div>
                                    {r.tac != null && (
                                      <span className={`shrink-0 font-semibold ${r.tac > 2 ? "text-red-600" : r.tac > 1 ? "text-amber-600" : "text-green-600"}`}>
                                        TAC {formatNumber(r.tac, 2)}%
                                      </span>
                                    )}
                                    {r.rent_12m != null && (
                                      <span className={`shrink-0 font-medium ${r.rent_12m >= 0 ? "text-green-600" : "text-red-600"}`}>
                                        {formatPercent(r.rent_12m)}
                                      </span>
                                    )}
                                  </button>
                                ))}
                              </div>
                            )}
                            {!fundSearchLoading && fundSearchQuery.length >= 2 && fundSearchResults.length === 0 && (
                              <p className="text-xs text-gb-gray py-2">Sin resultados para &ldquo;{fundSearchQuery}&rdquo;</p>
                            )}
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
            </tbody>
          </table>
        </div>

        {/* Cost & return comparison summary */}
        <div className="px-4 py-4 border-t border-gb-border bg-slate-50">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {/* Current Cost */}
            <div className="bg-white rounded-lg border border-gb-border p-3">
              <p className="text-[10px] text-gb-gray font-medium uppercase mb-1">Costo Actual (Fondos)</p>
              <p className="text-lg font-bold text-red-600">
                {formatNumber(mergedProposal.currentTacPromedio, 2)}%
              </p>
              <p className="text-xs text-gb-gray">
                {formatCurrency(mergedProposal.currentCostoAnual)}/año
                {ufValue ? ` (UF ${(mergedProposal.currentCostoAnual / ufValue).toLocaleString("es-CL", { maximumFractionDigits: 1 })})` : ""}
              </p>
              {mergedProposal.currentRent12m !== null && (
                <p className="text-xs mt-1">
                  <span className="text-gb-gray">Rent 12M: </span>
                  <span className={mergedProposal.currentRent12m >= 0 ? "text-green-600 font-medium" : "text-red-600 font-medium"}>
                    {formatPercent(mergedProposal.currentRent12m)}
                  </span>
                  {mergedProposal.currentRent12mCoverage < 100 && (
                    <span className="text-[10px] text-gb-gray"> ({mergedProposal.currentRent12mCoverage}% cobertura)</span>
                  )}
                </p>
              )}
            </div>

            {/* Proposed Cost with Advisory Fee */}
            <div className="bg-white rounded-lg border border-green-200 p-3">
              <p className="text-[10px] text-gb-gray font-medium uppercase mb-1">Costo Propuesto (Fondos + Fee)</p>
              <p className="text-lg font-bold text-green-600">
                {formatNumber(mergedProposal.proposedTacPromedio + advisoryFee, 2)}%
              </p>
              <div className="text-xs text-gb-gray space-y-0.5">
                <p>Fondos: {formatNumber(mergedProposal.proposedTacPromedio, 2)}% ({formatCurrency(mergedProposal.proposedCostoAnual)}/año)</p>
                <div className="flex items-center gap-1">
                  <span>Advisory Fee:</span>
                  <input
                    type="number"
                    value={advisoryFee}
                    onChange={(e) => onAdvisoryFeeChange(Math.max(0, Math.min(5, parseFloat(e.target.value) || 0)))}
                    className="w-14 px-1 py-0.5 text-xs border border-gb-border rounded text-right"
                    step="0.1"
                    min="0"
                    max="5"
                  />
                  <span>% ({formatCurrency(mergedProposal.feeAnual)}/año)</span>
                </div>
                <p className="font-medium text-gb-black">
                  Total: {formatCurrency(mergedProposal.costoTotalPropuesto)}/año
                  {ufValue ? ` (UF ${(mergedProposal.costoTotalPropuesto / ufValue).toLocaleString("es-CL", { maximumFractionDigits: 1 })})` : ""}
                </p>
              </div>
              {mergedProposal.proposedRent12m !== null && (
                <p className="text-xs mt-1">
                  <span className="text-gb-gray">Rent 12M: </span>
                  <span className={mergedProposal.proposedRent12m >= 0 ? "text-green-600 font-medium" : "text-red-600 font-medium"}>
                    {formatPercent(mergedProposal.proposedRent12m)}
                  </span>
                  {mergedProposal.proposedRent12mCoverage < 100 && (
                    <span className="text-[10px] text-gb-gray"> ({mergedProposal.proposedRent12mCoverage}% cobertura)</span>
                  )}
                </p>
              )}
            </div>

            {/* Net Savings */}
            <div className="bg-white rounded-lg border border-gb-border p-3">
              <p className="text-[10px] text-gb-gray font-medium uppercase mb-1">Ahorro Neto del Cliente</p>
              {(() => {
                const ahorroNeto = mergedProposal.ahorroNeto;
                return (
                  <>
                    <p className={`text-lg font-bold ${ahorroNeto > 0 ? "text-green-600" : "text-red-600"}`}>
                      {ahorroNeto > 0 ? "+" : ""}{formatCurrency(ahorroNeto)}/año
                    </p>
                    <p className="text-xs text-gb-gray">
                      {ahorroNeto > 0
                        ? `Ahorra ${formatCurrency(Math.abs(ahorroNeto))}/año${ufValue ? ` (UF ${(Math.abs(ahorroNeto) / ufValue).toLocaleString("es-CL", { maximumFractionDigits: 1 })})` : ""}`
                        : ahorroNeto === 0
                          ? "Costo equivalente con asesoría profesional"
                          : `Costo adicional de ${formatCurrency(Math.abs(ahorroNeto))}/año por asesoría profesional`
                      }
                    </p>
                    <p className="text-[10px] text-gb-gray mt-1">
                      Diferencia TAC: {formatNumber(mergedProposal.currentTacPromedio - mergedProposal.proposedTacPromedio - advisoryFee, 2)}% puntos
                    </p>
                  </>
                );
              })()}
            </div>

            {/* Return comparison */}
            <div className="bg-white rounded-lg border border-gb-border p-3">
              <p className="text-[10px] text-gb-gray font-medium uppercase mb-1">Rentabilidad 12M Ponderada</p>
              {mergedProposal.currentRent12m !== null || mergedProposal.proposedRent12m !== null ? (
                <div className="space-y-2">
                  <div>
                    <p className="text-[10px] text-gb-gray">Actual</p>
                    <p className={`text-sm font-bold ${(mergedProposal.currentRent12m ?? 0) >= 0 ? "text-gb-black" : "text-red-600"}`}>
                      {mergedProposal.currentRent12m !== null ? formatPercent(mergedProposal.currentRent12m) : "N/D"}
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] text-gb-gray">Propuesto</p>
                    <p className={`text-sm font-bold ${(mergedProposal.proposedRent12m ?? 0) >= 0 ? "text-green-600" : "text-red-600"}`}>
                      {mergedProposal.proposedRent12m !== null ? formatPercent(mergedProposal.proposedRent12m) : "N/D"}
                    </p>
                  </div>
                  {mergedProposal.currentRent12m !== null && mergedProposal.proposedRent12m !== null && (
                    <p className="text-[10px] text-gb-gray">
                      Diferencia: <span className={`font-medium ${mergedProposal.proposedRent12m - mergedProposal.currentRent12m >= 0 ? "text-green-600" : "text-red-600"}`}>
                        {mergedProposal.proposedRent12m - mergedProposal.currentRent12m >= 0 ? "+" : ""}{formatPercent(mergedProposal.proposedRent12m - mergedProposal.currentRent12m)}
                      </span>
                    </p>
                  )}
                </div>
              ) : (
                <p className="text-sm text-gb-gray">Sin datos de rentabilidad</p>
              )}
            </div>
          </div>

          {/* Mail al Corredor button */}
          {!readOnly && clientId && mergedProposal.holdings.some(h => h.changed) && (
            <div className="mt-3 flex justify-end">
              <button
                onClick={() => setShowCartaCorredor(true)}
                className="text-xs px-3 py-1.5 bg-white border border-gb-border rounded-md hover:bg-slate-50 transition-colors font-medium flex items-center gap-1.5 text-gb-gray hover:text-gb-black"
              >
                <Mail className="w-3.5 h-3.5" />
                Generar mail al corredor
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Carta Corredor Modal */}
      {!readOnly && showCartaCorredor && clientId && (
        <CartaCorredorModal
          clientId={clientId}
          operaciones={mergedProposal.holdings
            .filter(h => h.changed)
            .flatMap(h => {
              const ops: Array<{ tipo: "comprar" | "vender"; fondo: string; monto: number; moneda: string }> = [];
              ops.push({ tipo: "vender", fondo: h.originalFund, monto: h.marketValue, moneda: "CLP" });
              ops.push({ tipo: "comprar", fondo: `${h.proposedFund} (${h.proposedAgf}${h.proposedSerie ? ` serie ${h.proposedSerie}` : ""})`, monto: h.marketValue, moneda: "CLP" });
              return ops;
            })}
          onClose={() => setShowCartaCorredor(false)}
        />
      )}
    </>
  );
}
