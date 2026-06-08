"use client";

import React from "react";
import { Search, AlertTriangle, Loader, X } from "lucide-react";
import type { Holding } from "./hooks/useSnapshotForm";

const ASSET_CLASS_OPTIONS = [
  { value: "equity", label: "Renta Variable", color: "bg-blue-100 text-blue-800" },
  { value: "fixedIncome", label: "Renta Fija", color: "bg-green-100 text-green-800" },
  { value: "balanced", label: "Balanceado", color: "bg-purple-100 text-purple-800" },
  { value: "alternatives", label: "Alternativos", color: "bg-orange-100 text-orange-800" },
  { value: "cash", label: "Cash/MM", color: "bg-gray-100 text-gray-800" },
];

const CURRENCY_OPTIONS = [
  { value: "USD", label: "USD", shortLabel: "$" },
  { value: "CLP", label: "CLP", shortLabel: "$" },
  { value: "EUR", label: "EUR", shortLabel: "€" },
  { value: "UF", label: "UF", shortLabel: "UF" },
];

interface SearchResult {
  id: string;
  type: "fund" | "stock";
  fo_run?: number;
  serie?: string;
  nombre: string;
  agf?: string;
  exchange?: string;
  moneda: string;
  valor_cuota: number | null;
  fecha_precio: string | null;
}

interface HoldingsEditTableProps {
  holdings: Holding[];
  setHoldings: React.Dispatch<React.SetStateAction<Holding[]>>;
  uniqueSources: (string | undefined)[];
  unmatchedIndices: Set<number>;
  autoMatchComplete: boolean;
  handleCurrencyChange: (index: number, currency: string) => void;
  handleQuantityChange: (index: number, quantity: number) => void;
  handlePriceChange: (index: number, price: number) => void;
  handleValueChange: (index: number, value: number) => void;
  handleAssetClassChange: (index: number, assetClass: string) => void;
  handlePurchaseDateChange: (index: number, date: string) => void;
  searchFundPrice: (index: number, fundName: string, customQuery?: string) => void;
  searchingIndex: number | null;
  searchQuery: string;
  setSearchQuery: React.Dispatch<React.SetStateAction<string>>;
  searchLoading: boolean;
  searchResults: SearchResult[];
  applyFundPrice: (index: number, result: SearchResult) => void;
  closeSearch: () => void;
  formatNumber: (value: number, decimals?: number) => string;
}

export default function HoldingsEditTable({
  holdings,
  setHoldings,
  uniqueSources,
  unmatchedIndices,
  autoMatchComplete,
  handleCurrencyChange,
  handleQuantityChange,
  handlePriceChange,
  handleValueChange,
  handleAssetClassChange,
  handlePurchaseDateChange,
  searchFundPrice,
  searchingIndex,
  searchQuery,
  setSearchQuery,
  searchLoading,
  searchResults,
  applyFundPrice,
  closeSearch,
  formatNumber,
}: HoldingsEditTableProps) {
  return (
    <div className="mb-6">
          <h4 className="text-sm font-semibold text-gb-black mb-3">
            Posiciones ({holdings.length})
          </h4>
          <div className="border border-slate-200 rounded-lg overflow-x-auto">
            <table className="w-full text-sm min-w-[800px]">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-slate-600">Instrumento</th>
                  {uniqueSources.length > 1 && (
                    <th className="px-3 py-2 text-center text-xs font-semibold text-slate-600 w-20">Custodio</th>
                  )}
                  <th className="px-3 py-2 text-center text-xs font-semibold text-slate-600 w-16">Moneda</th>
                  <th className="px-3 py-2 text-right text-xs font-semibold text-slate-600 w-24">Cantidad</th>
                  <th className="px-3 py-2 text-right text-xs font-semibold text-slate-600 w-28">Precio</th>
                  <th className="px-3 py-2 text-right text-xs font-semibold text-slate-600 w-32">Valor Total</th>
                  <th className="px-3 py-2 text-center text-xs font-semibold text-slate-600 w-28">Clase</th>
                  <th className="px-3 py-2 text-center text-xs font-semibold text-slate-600 w-28">F. Compra</th>
                  <th className="px-3 py-2 text-right text-xs font-semibold text-slate-600 w-24">Tasa Mdo.</th>
                </tr>
              </thead>
              <tbody>
                {holdings.map((holding, index) => {
                  const isUnmatched = unmatchedIndices.has(index) && autoMatchComplete;
                  return (
                  <tr key={index} className={`border-t border-slate-100 hover:bg-slate-50 ${isUnmatched ? "bg-amber-50" : ""}`}>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-1">
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium text-gb-black truncate" title={holding.fundName}>
                            {holding.fundName}
                          </p>
                          <div className="flex items-center gap-1">
                            {holding.securityId && (
                              <span className="text-xs text-gb-gray">{holding.securityId}</span>
                            )}
                            {holding.isPrevisional && (
                              <span className="text-[10px] px-1 py-0.5 bg-orange-100 text-orange-700 rounded font-medium">
                                Previsional
                              </span>
                            )}
                            {isUnmatched && (
                              <span className="text-[10px] px-1 py-0.5 bg-amber-200 text-amber-800 rounded font-medium flex items-center gap-0.5">
                                <AlertTriangle className="w-2.5 h-2.5" />
                                No encontrado
                              </span>
                            )}
                          </div>
                        </div>
                        <button
                          onClick={() => searchFundPrice(index, holding.fundName)}
                          className={`p-1 rounded shrink-0 ${isUnmatched ? "text-amber-600 hover:bg-amber-100 animate-pulse" : "text-blue-500 hover:bg-blue-50"}`}
                          title="Buscar por RUN o nombre"
                        >
                          <Search className="w-3 h-3" />
                        </button>
                      </div>
                    </td>
                    {uniqueSources.length > 1 && (
                      <td className="px-3 py-2 text-center">
                        <span className="text-xs px-1 py-0.5 bg-slate-100 rounded text-slate-600">
                          {holding.source || "-"}
                        </span>
                      </td>
                    )}
                    <td className="px-3 py-2 text-center">
                      <select
                        value={holding.currency || "USD"}
                        onChange={(e) => handleCurrencyChange(index, e.target.value)}
                        className="w-14 px-1 py-1 text-xs border border-slate-200 rounded focus:ring-1 focus:ring-blue-500"
                      >
                        {CURRENCY_OPTIONS.map((opt) => (
                          <option key={opt.value} value={opt.value}>{opt.value}</option>
                        ))}
                      </select>
                    </td>
                    <td className="px-3 py-2 text-right">
                      <input
                        type="number"
                        value={holding.quantity || ""}
                        onChange={(e) => handleQuantityChange(index, parseFloat(e.target.value) || 0)}
                        placeholder="0"
                        className="w-20 px-2 py-1 text-right border border-slate-200 rounded text-sm focus:ring-1 focus:ring-blue-500"
                      />
                    </td>
                    <td className="px-3 py-2 text-right">
                      <input
                        type="number"
                        value={holding.marketPrice || ""}
                        onChange={(e) => handlePriceChange(index, parseFloat(e.target.value) || 0)}
                        placeholder="0"
                        step="0.0001"
                        className="w-24 px-2 py-1 text-right border border-slate-200 rounded text-sm focus:ring-1 focus:ring-blue-500"
                      />
                    </td>
                    <td className="px-3 py-2 text-right">
                      <input
                        type="text"
                        inputMode="numeric"
                        value={holding.marketValue ? holding.marketValue.toLocaleString("es-CL") : "0"}
                        onChange={(e) => {
                          const raw = e.target.value.replace(/\./g, "").replace(/,/g, ".");
                          handleValueChange(index, parseFloat(raw) || 0);
                        }}
                        className="w-32 px-2 py-1 text-right border border-slate-200 rounded text-sm focus:ring-1 focus:ring-blue-500"
                      />
                    </td>
                    <td className="px-3 py-2 text-center">
                      <select
                        value={holding.assetClass || "equity"}
                        onChange={(e) => handleAssetClassChange(index, e.target.value)}
                        className={`px-2 py-1 text-xs font-medium rounded border-0 cursor-pointer ${
                          ASSET_CLASS_OPTIONS.find((o) => o.value === holding.assetClass)?.color || "bg-blue-100 text-blue-800"
                        }`}
                      >
                        {ASSET_CLASS_OPTIONS.map((opt) => (
                          <option key={opt.value} value={opt.value}>{opt.label}</option>
                        ))}
                      </select>
                    </td>
                    <td className="px-3 py-2 text-center">
                      {holding.assetType === "bond" ? (
                        <input
                          type="date"
                          value={holding.purchaseDate || ""}
                          onChange={(e) => handlePurchaseDateChange(index, e.target.value)}
                          className="w-28 px-1 py-1 text-xs border border-slate-200 rounded focus:ring-1 focus:ring-blue-500"
                        />
                      ) : (
                        <span className="text-xs text-gb-gray">-</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {holding.assetType === "bond" ? (
                        <div className="flex items-center gap-0.5 justify-end">
                          <input
                            type="number"
                            value={holding.marketYield ?? ""}
                            onChange={(e) => {
                              const updated = [...holdings];
                              updated[index] = { ...updated[index], marketYield: e.target.value ? parseFloat(e.target.value) : null };
                              setHoldings(updated);
                            }}
                            placeholder="-"
                            step="0.01"
                            className="w-16 px-1 py-1 text-right text-xs border border-slate-200 rounded focus:ring-1 focus:ring-blue-500"
                          />
                          <span className="text-xs text-gb-gray">%</span>
                        </div>
                      ) : (
                        <span className="text-xs text-gb-gray">-</span>
                      )}
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Search Results Popup */}
          {searchingIndex !== null && (
            <div className={`mt-3 p-3 rounded-lg border ${unmatchedIndices.has(searchingIndex) ? "bg-amber-50 border-amber-300" : "bg-blue-50 border-blue-200"}`}>
              <div className="flex items-center justify-between mb-2">
                <div>
                  <span className={`text-sm font-medium ${unmatchedIndices.has(searchingIndex) ? "text-amber-800" : "text-blue-800"}`}>
                    {unmatchedIndices.has(searchingIndex)
                      ? `Fondo no encontrado: "${holdings[searchingIndex]?.fundName.substring(0, 40)}"`
                      : `Buscando precio para: ${holdings[searchingIndex]?.fundName.substring(0, 40)}`}
                  </span>
                  {unmatchedIndices.has(searchingIndex) && (
                    <p className="text-xs text-amber-700 mt-0.5">
                      El precio no coincidió con ningún fondo. Busca por RUN o nombre del fondo.
                    </p>
                  )}
                </div>
                <button
                  onClick={closeSearch}
                  className={`${unmatchedIndices.has(searchingIndex) ? "text-amber-600 hover:text-amber-800" : "text-blue-600 hover:text-blue-800"}`}
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Search input for RUN or name */}
              <div className="flex gap-2 mb-3">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && searchQuery.trim().length >= 2) {
                      searchFundPrice(searchingIndex, "", searchQuery.trim());
                    }
                  }}
                  placeholder="Buscar por RUN (ej: 8000) o nombre..."
                  className="flex-1 px-3 py-1.5 text-sm border border-slate-300 rounded-md focus:ring-2 focus:ring-blue-500"
                  autoFocus
                />
                <button
                  onClick={() => searchQuery.trim().length >= 2 && searchFundPrice(searchingIndex, "", searchQuery.trim())}
                  disabled={searchQuery.trim().length < 2}
                  className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
                >
                  <Search className="w-4 h-4" />
                </button>
              </div>

              {searchLoading ? (
                <div className="flex items-center gap-2 text-sm text-blue-600">
                  <Loader className="w-4 h-4 animate-spin" />
                  Buscando fondos y acciones...
                </div>
              ) : searchResults.length > 0 ? (
                <div className="space-y-2">
                  {searchResults.map((result) => (
                    <div
                      key={result.id}
                      className={`flex items-center justify-between p-2 bg-white rounded border cursor-pointer ${
                        result.type === "stock"
                          ? "border-purple-100 hover:border-purple-300"
                          : "border-blue-100 hover:border-blue-300"
                      }`}
                      onClick={() => applyFundPrice(searchingIndex, result)}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                            result.type === "stock"
                              ? "bg-purple-100 text-purple-700"
                              : "bg-blue-100 text-blue-700"
                          }`}>
                            {result.type === "stock" ? "Acción" : "Fondo"}
                          </span>
                          <p className="text-sm font-medium text-gb-black truncate">{result.nombre}</p>
                        </div>
                        <p className="text-xs text-gb-gray">
                          {result.type === "stock"
                            ? result.exchange || "Bolsa"
                            : `${result.agf} - Serie ${result.serie}`}
                        </p>
                      </div>
                      <div className="text-right ml-3">
                        {result.valor_cuota ? (
                          <>
                            <p className="text-sm font-semibold text-green-600">
                              {result.type === "stock"
                                ? formatNumber(result.valor_cuota, 2)
                                : formatNumber(result.valor_cuota, 4)}
                            </p>
                            <p className="text-xs text-gb-gray">{result.moneda}</p>
                          </>
                        ) : (
                          <p className="text-xs text-amber-600">Sin precio</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-blue-600">No se encontraron fondos ni acciones</p>
              )}
            </div>
          )}
        </div>
  );
}
