// components/portfolio/FundSelector.tsx

"use client";

import React, { useState, useEffect } from "react";
import { Search, Loader, TrendingUp, DollarSign } from "lucide-react";
import { supabaseBrowserClient } from "@/lib/supabase/supabaseClient";

// ============================================================
// INTERFACES
// ============================================================

export interface Fund {
  id: string;
  name: string;
  series?: string;
  provider: string;
  ticker?: string;
  cmf_code?: string;
  asset_class: string;
  sub_category?: string;
  total_expense_ratio: number;
  return_1y?: number;
  return_3y?: number;
  return_5y?: number;
  return_ytd?: number;
  currency: string;
  type: "chilean" | "proposed";
}

interface FundSelectorProps {
  assetClass: string;
  subCategory?: string;
  type: "chilean" | "proposed";
  onSelectFund: (fund: Fund) => void;
  placeholder?: string;
  value?: Fund | null;
}

// ============================================================
// COMPONENTE PRINCIPAL
// ============================================================

export function FundSelector({
  assetClass,
  subCategory,
  type,
  onSelectFund,
  placeholder = "Seleccionar fondo...",
  value,
}: FundSelectorProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [funds, setFunds] = useState<Fund[]>([]);
  const [loading, setLoading] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);

  // Buscar fondos cuando cambia el query
  useEffect(() => {
    if (searchQuery.length >= 2) {
      searchFunds(searchQuery);
    } else {
      setFunds([]);
    }
  }, [searchQuery, assetClass, subCategory, type]);

  const searchFunds = async (query: string) => {
    setLoading(true);
    const supabase = supabaseBrowserClient();

    try {
      if (type === "chilean") {
        // Buscar en fondos chilenos - BÚSQUEDA SIMPLIFICADA
        const { data, error } = await supabase
          .from("funds")
          .select("*")
          .eq("is_active", true)
          .eq("asset_class", assetClass)
          .or(
            `name.ilike.%${query}%,provider.ilike.%${query}%,cmf_code.ilike.%${query}%`
          )
          .limit(50);

        if (error) throw error;

        // Filtrar por sub_category en cliente si se especifica
        let filteredData = data || [];
        if (subCategory && filteredData.length > 0) {
          const subCategoryFiltered = filteredData.filter(
            (f) =>
              f.sub_category &&
              f.sub_category.toLowerCase().includes(subCategory.toLowerCase())
          );
          // Si el filtro elimina todos los resultados, mostrar todos
          if (subCategoryFiltered.length > 0) {
            filteredData = subCategoryFiltered;
          }
        }

        setFunds(
          filteredData.map((f) => ({
            ...f,
            type: "chilean" as const,
          }))
        );
      } else {
        // Buscar en fondos propuestos - BÚSQUEDA SIMPLIFICADA
        const { data, error } = await supabase
          .from("proposed_funds")
          .select("*")
          .eq("is_active", true)
          .eq("asset_class", assetClass)
          .or(`name.ilike.%${query}%,provider.ilike.%${query}%,ticker.ilike.%${query}%`)
          .limit(50);

        if (error) throw error;

        // Filtrar por sub_category en cliente si se especifica
        let filteredData = data || [];
        if (subCategory && filteredData.length > 0) {
          const subCategoryFiltered = filteredData.filter(
            (f) =>
              f.sub_category &&
              f.sub_category.toLowerCase().includes(subCategory.toLowerCase())
          );
          // Si el filtro elimina todos los resultados, mostrar todos
          if (subCategoryFiltered.length > 0) {
            filteredData = subCategoryFiltered;
          }
        }

        setFunds(
          filteredData.map((f) => ({
            ...f,
            type: "proposed" as const,
            total_expense_ratio: f.total_cost || 0,
          }))
        );
      }

      setShowDropdown(true);
    } catch (error) {
      console.error("Error buscando fondos:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleSelect = (fund: Fund) => {
    onSelectFund(fund);
    setSearchQuery("");
    setShowDropdown(false);
  };

  return (
    <div className="relative">
      {/* Selected Fund Display */}
      {value ? (
        <div className="bg-white border-2 border-blue-200 rounded-lg p-4">
          <div className="flex items-start justify-between mb-3">
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <h4 className="font-bold text-slate-900">{value.name}</h4>
                {value.type === "proposed" && (
                  <span className="text-xs px-2 py-0.5 bg-blue-100 text-blue-700 rounded font-medium">
                    Stonex
                  </span>
                )}
              </div>
              {value.series && (
                <span className="text-xs text-slate-600">Serie {value.series}</span>
              )}
              <p className="text-sm text-slate-600 mt-1">
                {value.provider}
                {value.ticker && ` • ${value.ticker}`}
                {value.cmf_code && ` • RUN: ${value.cmf_code}`}
              </p>
            </div>
            <button
              onClick={() => onSelectFund(null as any)}
              className="text-sm text-blue-600 hover:text-blue-800 font-medium"
            >
              Cambiar
            </button>
          </div>

          {/* Costos y Rentabilidades */}
          <div className="grid grid-cols-2 gap-4 pt-3 border-t border-slate-200">
            {/* Costos */}
            <div>
              <div className="flex items-center gap-1 mb-1">
                <DollarSign className="w-3 h-3 text-slate-500" />
                <span className="text-xs font-medium text-slate-600">Costo</span>
              </div>
              <div className="text-lg font-bold text-red-600">
                {(value.total_expense_ratio * 100).toFixed(2)}%
              </div>
            </div>

            {/* Rentabilidades */}
            <div>
              <div className="flex items-center gap-1 mb-1">
                <TrendingUp className="w-3 h-3 text-slate-500" />
                <span className="text-xs font-medium text-slate-600">Rent 1Y</span>
              </div>
              <div className="text-lg font-bold text-green-600">
                {value.return_1y ? `${(value.return_1y * 100).toFixed(1)}%` : "N/A"}
              </div>
            </div>
          </div>

          {/* Rentabilidades adicionales */}
          {(value.return_3y || value.return_ytd) && (
            <div className="mt-2 pt-2 border-t border-slate-100 flex gap-4 text-xs text-slate-600">
              {value.return_3y && (
                <div>
                  <span className="font-medium">3Y:</span>{" "}
                  <span className="text-green-600 font-semibold">
                    {(value.return_3y * 100).toFixed(1)}%
                  </span>
                </div>
              )}
              {value.return_ytd && (
                <div>
                  <span className="font-medium">YTD:</span>{" "}
                  <span className="text-green-600 font-semibold">
                    {(value.return_ytd * 100).toFixed(1)}%
                  </span>
                </div>
              )}
            </div>
          )}
        </div>
      ) : (
        <>
          {/* Search Input */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onFocus={() => {
                if (funds.length > 0) setShowDropdown(true);
              }}
              placeholder={placeholder}
              className="w-full pl-10 pr-4 py-2 border-2 border-slate-200 rounded-lg focus:border-blue-500 focus:outline-none"
            />
            {loading && (
              <Loader className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-blue-600 animate-spin" />
            )}
          </div>

          {/* Dropdown Results */}
          {showDropdown && funds.length > 0 && (
            <div className="absolute z-50 w-full mt-2 bg-white border-2 border-slate-200 rounded-lg shadow-xl max-h-96 overflow-y-auto">
              {funds.map((fund) => (
                <button
                  key={fund.id}
                  onClick={() => handleSelect(fund)}
                  className="w-full p-3 hover:bg-blue-50 transition-colors text-left border-b border-slate-100 last:border-b-0"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <h4 className="font-semibold text-slate-900 text-sm truncate">
                          {fund.name}
                        </h4>
                        {fund.type === "proposed" && (
                          <span className="text-xs px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded font-medium flex-shrink-0">
                            Stonex
                          </span>
                        )}
                      </div>
                      {fund.series && (
                        <span className="text-xs text-slate-500">Serie {fund.series}</span>
                      )}
                      <p className="text-xs text-slate-600 mt-0.5">
                        {fund.provider}
                        {fund.ticker && ` • ${fund.ticker}`}
                        {fund.cmf_code && ` • ${fund.cmf_code}`}
                      </p>
                    </div>
                  </div>

                  <div className="flex gap-4 mt-2 text-xs">
                    <div>
                      <span className="text-slate-500">TER:</span>{" "}
                      <span className="font-bold text-red-600">
                        {(fund.total_expense_ratio * 100).toFixed(2)}%
                      </span>
                    </div>
                    {fund.return_1y && (
                      <div>
                        <span className="text-slate-500">1Y:</span>{" "}
                        <span className="font-bold text-green-600">
                          {(fund.return_1y * 100).toFixed(1)}%
                        </span>
                      </div>
                    )}
                    {fund.return_3y && (
                      <div>
                        <span className="text-slate-500">3Y:</span>{" "}
                        <span className="font-bold text-green-600">
                          {(fund.return_3y * 100).toFixed(1)}%
                        </span>
                      </div>
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}

          {/* No results */}
          {showDropdown && !loading && searchQuery.length >= 2 && funds.length === 0 && (
            <div className="absolute z-50 w-full mt-2 bg-white border-2 border-slate-200 rounded-lg shadow-xl p-4 text-center text-slate-500 text-sm">
              No se encontraron fondos
            </div>
          )}
        </>
      )}

      {/* Click outside to close */}
      {showDropdown && (
        <div
          className="fixed inset-0 z-40"
          onClick={() => setShowDropdown(false)}
        />
      )}
    </div>
  );
}
