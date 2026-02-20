// components/portfolio/FundSelector.tsx

"use client";

import React, { useState, useEffect, useRef } from "react";
import { Search, Loader, Globe, Plus, X, Upload, FileSpreadsheet } from "lucide-react";

// ============================================================
// INTERFACES
// ============================================================

export interface Fund {
  id: string;
  name: string;
  symbol?: string;
  isin?: string;
  series?: string;
  provider?: string;
  ticker?: string;
  asset_class?: string;
  sub_category?: string;
  total_expense_ratio?: number;
  return_1m?: number;
  return_3m?: number;
  return_6m?: number;
  return_1y?: number;
  return_3y?: number;
  return_5y?: number;
  return_10y?: number;
  return_ytd?: number;
  currency?: string;
  type: "chilean" | "proposed" | "international";
  region?: string;
  fundType?: string; // ETF, Mutual Fund, etc.
  source?: string;
  // Datos de precio en tiempo real
  price?: {
    current: number | null;
    previousClose: number | null;
    changePercent: number | null;
    currency: string;
  };
  dividendYield?: number;
  beta?: number;
  isETF?: boolean;
}

interface FundSelectorProps {
  assetClass?: string;
  subCategory?: string;
  type: "chilean" | "proposed";
  onSelectFund: (fund: Fund | null) => void;
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
  placeholder = "Buscar ETF o fondo mutuo...",
  value,
}: FundSelectorProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [funds, setFunds] = useState<Fund[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Estado para formulario manual
  const [showManualForm, setShowManualForm] = useState(false);
  const [manualFund, setManualFund] = useState({
    symbol: "",
    name: "",
    isin: "",
    currency: "USD",
    total_expense_ratio: "",
    return_1y: "",
    return_3y: "",
    return_5y: "",
    return_10y: "",
  });
  const [navFile, setNavFile] = useState<File | null>(null);
  const [uploadingNav, setUploadingNav] = useState(false);
  const [uploadResult, setUploadResult] = useState<{ success: boolean; message: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const fileInputId = useRef(`nav-file-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`);

  // Buscar fondos cuando cambia el query (debounce reducido - API pagada)
  useEffect(() => {
    const timer = setTimeout(() => {
      if (searchQuery.length >= 2) {
        searchFunds(searchQuery);
      } else {
        setFunds([]);
        setError(null);
      }
    }, 150); // Reducido a 150ms con API pagada

    return () => clearTimeout(timer);
  }, [searchQuery, type]);

  const searchFunds = async (query: string) => {
    setLoading(true);
    setError(null);

    try {
      const allFunds: Fund[] = [];

      // 1. Buscar en base de datos local (fondos chilenos y externos importados)
      try {
        const localResponse = await fetch(`/api/funds/search?q=${encodeURIComponent(query)}`);
        const localResult = await localResponse.json();

        if (localResult.success && localResult.funds) {
          const localFunds: Fund[] = localResult.funds.map((f: any) => ({
            id: f.id,
            symbol: f.symbol || f.name?.substring(0, 6).toUpperCase(),
            isin: f.isin,
            name: f.name,
            ticker: f.symbol,
            type: f.type === "external" ? "international" as const : "chilean" as const,
            fundType: f.asset_class,
            provider: f.provider,
            total_expense_ratio: f.total_expense_ratio,
            return_1y: f.return_1y,
            return_3y: f.return_3y,
            return_5y: f.return_5y,
            currency: f.currency || "CLP",
            source: "local",
          }));
          allFunds.push(...localFunds);
        }
      } catch (localErr) {
        console.warn("Error buscando en BD local:", localErr);
      }

      // 2. Buscar en Alpha Vantage (fondos internacionales)
      try {
        const params = new URLSearchParams({
          q: query,
          type: "all",
        });

        const alphaResponse = await fetch(`/api/funds/search-alpha?${params}`);
        const alphaResult = await alphaResponse.json();

        if (alphaResult.success && alphaResult.funds) {
          const alphaFunds: Fund[] = alphaResult.funds.map((f: any) => ({
            id: f.symbol || f.id,
            symbol: f.symbol,
            name: f.name,
            ticker: f.symbol,
            type: "international" as const,
            fundType: f.type,
            region: f.region,
            currency: f.currency,
            source: "alphavantage",
          }));

          // Evitar duplicados (si ya está en local, no agregar de Alpha)
          const existingSymbols = new Set(allFunds.map(f => f.symbol?.toUpperCase()));
          const uniqueAlphaFunds = alphaFunds.filter(f => !existingSymbols.has(f.symbol?.toUpperCase()));
          allFunds.push(...uniqueAlphaFunds);
        }
      } catch (alphaErr) {
        console.warn("Error buscando en Alpha Vantage:", alphaErr);
      }

      if (allFunds.length === 0) {
        setError("No se encontraron fondos. Puedes agregar uno manualmente.");
      }

      setFunds(allFunds);
      setShowDropdown(true);
    } catch (err: any) {
      console.error("Error buscando fondos:", err);
      setError(err.message || "Error al buscar fondos");
      setFunds([]);
    } finally {
      setLoading(false);
    }
  };

  const handleSelect = async (fund: Fund) => {
    // Si es de Alpha Vantage, obtener perfil completo (precio, retornos, etc.)
    if (fund.source === "alphavantage" && fund.symbol) {
      setLoadingDetails(true);
      try {
        const response = await fetch(`/api/funds/full-profile?symbol=${fund.symbol}`);
        const result = await response.json();

        if (result.success && result.profile) {
          const profile = result.profile;
          // Enriquecer el fondo con todos los datos
          fund = {
            ...fund,
            name: profile.name || fund.name,
            total_expense_ratio: profile.expenseRatio || undefined,
            return_1m: profile.returns?.["1m"] || undefined,
            return_3m: profile.returns?.["3m"] || undefined,
            return_6m: profile.returns?.["6m"] || undefined,
            return_ytd: profile.returns?.ytd || undefined,
            return_1y: profile.returns?.["1y"] || undefined,
            return_3y: profile.returns?.["3y"] || undefined,
            return_5y: profile.returns?.["5y"] || undefined,
            asset_class: profile.assetType || fund.fundType,
            price: profile.price,
            dividendYield: profile.dividendYield,
            beta: profile.beta,
            isETF: profile.isETF,
            currency: profile.price?.currency || fund.currency,
          };
        }
      } catch (err) {
        console.warn("No se pudieron obtener detalles del fondo:", err);
      }
      setLoadingDetails(false);
    }

    onSelectFund(fund);
    setSearchQuery("");
    setShowDropdown(false);
  };

  const formatExpenseRatio = (ratio?: number) => {
    if (ratio === undefined || ratio === null) return "N/A";
    // Si ya está en porcentaje (> 1), mostrar directamente
    if (ratio > 1) return `${ratio.toFixed(2)}%`;
    // Si está en decimal, convertir a porcentaje
    return `${(ratio * 100).toFixed(2)}%`;
  };

  const formatReturn = (ret?: number) => {
    if (ret === undefined || ret === null) return "N/A";
    // Si ya está en porcentaje (> 1 o < -1), mostrar directamente
    if (Math.abs(ret) > 1) return `${ret.toFixed(1)}%`;
    // Si está en decimal, convertir a porcentaje
    return `${(ret * 100).toFixed(1)}%`;
  };

  const handleManualSubmit = async () => {
    if (!manualFund.name.trim()) return;

    const symbol = manualFund.symbol.trim().toUpperCase() || manualFund.name.substring(0, 6).toUpperCase();

    // Variables para guardar los returns calculados del servidor
    let calculatedReturns: { return_1y?: number; return_3y?: number; return_5y?: number; return_10y?: number } = {};

    // Si hay archivo de valores cuota, subirlo primero (esto creará el fondo en la BD)
    if (navFile) {
      setUploadingNav(true);
      setUploadResult(null);

      try {
        // Renombrar el archivo para que use el símbolo como identificador
        const renamedFile = new File([navFile], `${symbol}.xlsx`, { type: navFile.type });

        const formData = new FormData();
        formData.append("file", renamedFile);

        const response = await fetch("/api/admin/upload-nav-history", {
          method: "POST",
          body: formData,
        });

        const result = await response.json();

        if (!response.ok) {
          setUploadResult({ success: false, message: result.error || "Error al subir valores cuota" });
          setUploadingNav(false);
          return;
        }

        setUploadResult({
          success: true,
          message: `${result.stats?.imported || 0} valores cuota importados`
        });

        // Si hay rentabilidades calculadas, guardarlas para usar después
        if (result.returns) {
          calculatedReturns = {
            return_1y: result.returns.return_1y,
            return_3y: result.returns.return_3y,
            return_5y: result.returns.return_5y,
            return_10y: result.returns.return_10y,
          };
          // También actualizar el form para que se vean
          setManualFund((prev) => ({
            ...prev,
            return_1y: result.returns.return_1y != null ? String(result.returns.return_1y) : prev.return_1y,
            return_3y: result.returns.return_3y != null ? String(result.returns.return_3y) : prev.return_3y,
            return_5y: result.returns.return_5y != null ? String(result.returns.return_5y) : prev.return_5y,
            return_10y: result.returns.return_10y != null ? String(result.returns.return_10y) : prev.return_10y,
          }));
        }
      } catch (err: any) {
        setUploadResult({ success: false, message: err.message || "Error al subir archivo" });
        setUploadingNav(false);
        return;
      }
      setUploadingNav(false);
    }

    // Usar los returns calculados si existen, sino los del formulario
    const finalReturn1y = calculatedReturns.return_1y ?? (manualFund.return_1y ? parseFloat(manualFund.return_1y) : undefined);
    const finalReturn3y = calculatedReturns.return_3y ?? (manualFund.return_3y ? parseFloat(manualFund.return_3y) : undefined);
    const finalReturn5y = calculatedReturns.return_5y ?? (manualFund.return_5y ? parseFloat(manualFund.return_5y) : undefined);
    const finalReturn10y = calculatedReturns.return_10y ?? (manualFund.return_10y ? parseFloat(manualFund.return_10y) : undefined);

    const fund: Fund = {
      // Si estamos editando, mantener el ID original
      id: value?.id || `manual-${Date.now()}`,
      symbol: symbol,
      isin: manualFund.isin.trim().toUpperCase() || undefined,
      name: manualFund.name.trim(),
      type: value?.type || "international",
      currency: manualFund.currency,
      total_expense_ratio: manualFund.total_expense_ratio ? parseFloat(manualFund.total_expense_ratio) : undefined,
      return_1y: finalReturn1y,
      return_3y: finalReturn3y,
      return_5y: finalReturn5y,
      return_10y: finalReturn10y,
      source: value?.source || "manual",
      // Preservar otros campos del fondo original si existe
      ...(value && {
        ticker: value.ticker,
        provider: value.provider,
        asset_class: value.asset_class,
        fundType: value.fundType,
        region: value.region,
        price: value.price,
        dividendYield: value.dividendYield,
        beta: value.beta,
        isETF: value.isETF,
      }),
    };

    onSelectFund(fund);
    resetManualForm();
  };

  const resetManualForm = () => {
    setShowManualForm(false);
    setManualFund({
      symbol: "",
      name: "",
      isin: "",
      currency: "USD",
      total_expense_ratio: "",
      return_1y: "",
      return_3y: "",
      return_5y: "",
      return_10y: "",
    });
    setNavFile(null);
    setUploadResult(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const openManualForm = () => {
    setShowManualForm(true);
    setShowDropdown(false);
    setNavFile(null);
    setUploadResult(null);
    // Pre-llenar con el query de búsqueda si existe
    if (searchQuery.length >= 2) {
      setManualFund((prev) => ({
        ...prev,
        symbol: searchQuery.toUpperCase(),
        name: searchQuery,
      }));
    }
  };

  const openEditForm = () => {
    if (!value) return;
    setShowManualForm(true);
    setNavFile(null);
    setUploadResult(null);
    // Pre-llenar con los datos del fondo actual
    setManualFund({
      symbol: value.symbol || "",
      name: value.name || "",
      isin: value.isin || "",
      currency: value.currency || "USD",
      total_expense_ratio: value.total_expense_ratio != null ? String(value.total_expense_ratio) : "",
      return_1y: value.return_1y != null ? String(value.return_1y) : "",
      return_3y: value.return_3y != null ? String(value.return_3y) : "",
      return_5y: value.return_5y != null ? String(value.return_5y) : "",
      return_10y: value.return_10y != null ? String(value.return_10y) : "",
    });
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setNavFile(file);
      setUploadResult(null);
    }
  };

  return (
    <div className="relative">
      {/* Selected Fund Display - Compact Version */}
      {value && !showManualForm ? (
        <div className="bg-white border-2 border-blue-200 rounded-lg p-3">
          {/* Header: Name, Symbol, Badges, Change button */}
          <div className="flex items-start justify-between mb-2">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                {value.symbol && (
                  <span className="text-sm px-2 py-0.5 bg-blue-100 text-blue-700 rounded font-mono font-bold">
                    {value.symbol}
                  </span>
                )}
                {value.isETF && (
                  <span className="text-xs px-1.5 py-0.5 bg-teal-100 text-teal-700 rounded font-medium">
                    ETF
                  </span>
                )}
                {value.type === "international" && !value.isETF && (
                  <span className="text-xs px-1.5 py-0.5 bg-indigo-100 text-indigo-700 rounded font-medium">
                    {value.fundType || "Fondo"}
                  </span>
                )}
              </div>
              <h4 className="font-medium text-slate-900 text-sm mt-1 truncate" title={value.name}>
                {value.name}
              </h4>
              <p className="text-xs text-slate-500">
                {value.region && `${value.region}`}
                {value.currency && ` • ${value.currency}`}
              </p>
            </div>
            <div className="flex items-center gap-2 ml-2 flex-shrink-0">
              <button
                onClick={openEditForm}
                className="text-xs text-slate-500 hover:text-slate-700 font-medium"
              >
                Editar
              </button>
              <span className="text-slate-300">|</span>
              <button
                onClick={() => onSelectFund(null)}
                className="text-xs text-blue-600 hover:text-blue-800 font-medium"
              >
                Cambiar
              </button>
            </div>
          </div>

          {/* Metrics Row: TER + Returns in one compact line */}
          <div className="flex items-center gap-3 py-2 px-3 bg-slate-50 rounded-lg text-xs overflow-x-auto">
            {/* Expense Ratio */}
            <div className="flex items-center gap-1 flex-shrink-0">
              <span className="text-slate-500">TER:</span>
              <span className="font-bold text-amber-600">
                {formatExpenseRatio(value.total_expense_ratio)}
              </span>
            </div>

            <span className="text-slate-300">│</span>

            {/* 1Y Return */}
            <div className="flex items-center gap-1 flex-shrink-0">
              <span className="text-slate-500">1Y:</span>
              <span className={`font-bold ${(value.return_1y || 0) >= 0 ? "text-green-600" : "text-red-600"}`}>
                {formatReturn(value.return_1y)}
              </span>
            </div>

            {/* YTD Return */}
            {value.return_ytd !== undefined && (
              <>
                <span className="text-slate-300">│</span>
                <div className="flex items-center gap-1 flex-shrink-0">
                  <span className="text-slate-500">YTD:</span>
                  <span className={`font-bold ${(value.return_ytd || 0) >= 0 ? "text-green-600" : "text-red-600"}`}>
                    {formatReturn(value.return_ytd)}
                  </span>
                </div>
              </>
            )}

            {/* 3Y Return */}
            {value.return_3y !== undefined && (
              <>
                <span className="text-slate-300">│</span>
                <div className="flex items-center gap-1 flex-shrink-0">
                  <span className="text-slate-500">3Y:</span>
                  <span className={`font-bold ${(value.return_3y || 0) >= 0 ? "text-green-600" : "text-red-600"}`}>
                    {formatReturn(value.return_3y)}
                  </span>
                </div>
              </>
            )}

            {/* 5Y Return */}
            {value.return_5y !== undefined && (
              <>
                <span className="text-slate-300">│</span>
                <div className="flex items-center gap-1 flex-shrink-0">
                  <span className="text-slate-500">5Y:</span>
                  <span className={`font-bold ${(value.return_5y || 0) >= 0 ? "text-green-600" : "text-red-600"}`}>
                    {formatReturn(value.return_5y)}
                  </span>
                </div>
              </>
            )}

            {/* 10Y Return */}
            {value.return_10y !== undefined && (
              <>
                <span className="text-slate-300">│</span>
                <div className="flex items-center gap-1 flex-shrink-0">
                  <span className="text-slate-500">10Y:</span>
                  <span className={`font-bold ${(value.return_10y || 0) >= 0 ? "text-green-600" : "text-red-600"}`}>
                    {formatReturn(value.return_10y)}
                  </span>
                </div>
              </>
            )}
          </div>

          {/* Additional data: Div Yield & Beta */}
          {(value.dividendYield || value.beta) && (
            <div className="mt-2 flex gap-3 text-xs text-slate-600">
              {value.dividendYield && (
                <div>
                  <span className="text-slate-500">Div:</span>{" "}
                  <span className="text-blue-600 font-semibold">
                    {(value.dividendYield * 100).toFixed(2)}%
                  </span>
                </div>
              )}
              {value.beta && (
                <div>
                  <span className="text-slate-500">Beta:</span>{" "}
                  <span className="text-slate-700 font-semibold">
                    {value.beta.toFixed(2)}
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
              placeholder="Buscar ETF o fondo (ej: SPY, VTI, VXUS)..."
              className="w-full pl-10 pr-4 py-2 border-2 border-slate-200 rounded-lg focus:border-blue-500 focus:outline-none"
            />
            {(loading || loadingDetails) && (
              <Loader className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-blue-600 animate-spin" />
            )}
          </div>

          {/* Error message with manual add button */}
          {error && (
            <div className="mt-2 p-2 bg-amber-50 border border-amber-200 rounded text-amber-700 text-xs flex items-center justify-between">
              <span>{error}</span>
              <button
                onClick={openManualForm}
                className="ml-2 px-2 py-1 bg-blue-600 text-white rounded text-xs hover:bg-blue-700 flex items-center gap-1"
              >
                <Plus className="w-3 h-3" />
                Agregar
              </button>
            </div>
          )}

          {/* Dropdown Results */}
          {showDropdown && funds.length > 0 && (
            <div className="absolute z-50 w-full mt-2 bg-white border-2 border-slate-200 rounded-lg shadow-xl max-h-96 overflow-y-auto">
              {funds.map((fund) => (
                <button
                  key={fund.id}
                  onClick={() => handleSelect(fund)}
                  className="w-full p-3 hover:bg-blue-50 transition-colors text-left border-b border-slate-100"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono text-sm font-bold text-blue-600">
                          {fund.symbol || fund.ticker}
                        </span>
                        {fund.fundType && (
                          <span className="text-xs px-1.5 py-0.5 bg-teal-100 text-teal-700 rounded font-medium">
                            {fund.fundType}
                          </span>
                        )}
                        {fund.source === "local" && (
                          <span className="text-xs px-1.5 py-0.5 bg-green-100 text-green-700 rounded font-medium">
                            Local
                          </span>
                        )}
                      </div>
                      <h4 className="font-medium text-slate-900 text-sm mt-1 truncate">
                        {fund.name}
                      </h4>
                      <p className="text-xs text-slate-500 mt-0.5">
                        {fund.region}
                        {fund.currency && ` • ${fund.currency}`}
                      </p>
                    </div>
                  </div>
                </button>
              ))}
              {/* Botón para agregar manualmente */}
              <button
                onClick={openManualForm}
                className="w-full p-3 hover:bg-slate-50 transition-colors text-left border-t border-slate-200 flex items-center gap-2 text-slate-600"
              >
                <Plus className="w-4 h-4" />
                <span className="text-sm">Agregar fondo manualmente</span>
              </button>
            </div>
          )}

          {/* No results */}
          {showDropdown && !loading && searchQuery.length >= 2 && funds.length === 0 && !error && (
            <div className="absolute z-50 w-full mt-2 bg-white border-2 border-slate-200 rounded-lg shadow-xl p-4 text-center text-slate-500 text-sm">
              No se encontraron fondos para "{searchQuery}"
            </div>
          )}

          {/* Help text */}
          {!showDropdown && !showManualForm && searchQuery.length === 0 && (
            <div className="flex items-center justify-between mt-2">
              <p className="text-xs text-slate-500">
                Busca por símbolo (SPY, VTI, QQQ) o nombre del fondo
              </p>
              <button
                onClick={openManualForm}
                className="text-xs text-blue-600 hover:text-blue-800 flex items-center gap-1"
              >
                <Plus className="w-3 h-3" />
                Agregar manual
              </button>
            </div>
          )}

          {/* Manual Entry Form */}
          {showManualForm && (
            <div className="mt-2 p-4 bg-slate-50 border-2 border-slate-200 rounded-lg">
              <div className="flex items-center justify-between mb-3">
                <h4 className="font-semibold text-slate-900 text-sm">
                  {value ? "Editar fondo" : "Agregar fondo manualmente"}
                </h4>
                <button
                  onClick={resetManualForm}
                  disabled={uploadingNav}
                  className="text-slate-400 hover:text-slate-600 disabled:opacity-50"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="space-y-3">
                {/* Símbolo, ISIN y Nombre */}
                <div className="grid grid-cols-4 gap-2">
                  <div>
                    <label className="block text-xs text-slate-600 mb-1">Símbolo</label>
                    <input
                      type="text"
                      value={manualFund.symbol}
                      onChange={(e) => setManualFund((prev) => ({ ...prev, symbol: e.target.value.toUpperCase() }))}
                      placeholder="SPY"
                      className="w-full px-2 py-1.5 border border-slate-300 rounded text-sm focus:border-blue-500 focus:outline-none font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-600 mb-1">ISIN</label>
                    <input
                      type="text"
                      value={manualFund.isin}
                      onChange={(e) => setManualFund((prev) => ({ ...prev, isin: e.target.value.toUpperCase() }))}
                      placeholder="US78462F1030"
                      maxLength={12}
                      className="w-full px-2 py-1.5 border border-slate-300 rounded text-sm focus:border-blue-500 focus:outline-none font-mono"
                    />
                  </div>
                  <div className="col-span-2">
                    <label className="block text-xs text-slate-600 mb-1">Nombre *</label>
                    <input
                      type="text"
                      value={manualFund.name}
                      onChange={(e) => setManualFund((prev) => ({ ...prev, name: e.target.value }))}
                      placeholder="SPDR S&P 500 ETF Trust"
                      className="w-full px-2 py-1.5 border border-slate-300 rounded text-sm focus:border-blue-500 focus:outline-none"
                    />
                  </div>
                </div>

                {/* Moneda y TER */}
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-xs text-slate-600 mb-1">Moneda</label>
                    <select
                      value={manualFund.currency}
                      onChange={(e) => setManualFund((prev) => ({ ...prev, currency: e.target.value }))}
                      className="w-full px-2 py-1.5 border border-slate-300 rounded text-sm focus:border-blue-500 focus:outline-none"
                    >
                      <option value="USD">USD</option>
                      <option value="CLP">CLP</option>
                      <option value="EUR">EUR</option>
                      <option value="GBP">GBP</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs text-slate-600 mb-1">TER (%)</label>
                    <input
                      type="number"
                      step="0.01"
                      value={manualFund.total_expense_ratio}
                      onChange={(e) => setManualFund((prev) => ({ ...prev, total_expense_ratio: e.target.value }))}
                      placeholder="0.09"
                      className="w-full px-2 py-1.5 border border-slate-300 rounded text-sm focus:border-blue-500 focus:outline-none"
                    />
                  </div>
                </div>

                {/* Retornos */}
                <div className="grid grid-cols-4 gap-2">
                  <div>
                    <label className="block text-xs text-slate-600 mb-1">Ret. 1Y (%)</label>
                    <input
                      type="number"
                      step="0.1"
                      value={manualFund.return_1y}
                      onChange={(e) => setManualFund((prev) => ({ ...prev, return_1y: e.target.value }))}
                      placeholder="12.5"
                      className="w-full px-2 py-1.5 border border-slate-300 rounded text-sm focus:border-blue-500 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-600 mb-1">Ret. 3Y (%)</label>
                    <input
                      type="number"
                      step="0.1"
                      value={manualFund.return_3y}
                      onChange={(e) => setManualFund((prev) => ({ ...prev, return_3y: e.target.value }))}
                      placeholder="25.0"
                      className="w-full px-2 py-1.5 border border-slate-300 rounded text-sm focus:border-blue-500 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-600 mb-1">Ret. 5Y (%)</label>
                    <input
                      type="number"
                      step="0.1"
                      value={manualFund.return_5y}
                      onChange={(e) => setManualFund((prev) => ({ ...prev, return_5y: e.target.value }))}
                      placeholder="50.0"
                      className="w-full px-2 py-1.5 border border-slate-300 rounded text-sm focus:border-blue-500 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-600 mb-1">Ret. 10Y (%)</label>
                    <input
                      type="number"
                      step="0.1"
                      value={manualFund.return_10y}
                      onChange={(e) => setManualFund((prev) => ({ ...prev, return_10y: e.target.value }))}
                      placeholder="100.0"
                      className="w-full px-2 py-1.5 border border-slate-300 rounded text-sm focus:border-blue-500 focus:outline-none"
                    />
                  </div>
                </div>

                {/* Subir valores cuota */}
                <div className="pt-2 border-t border-slate-200">
                  <label className="block text-xs text-slate-600 mb-2">
                    Valores cuota (opcional)
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".xlsx,.xls,.csv"
                      onChange={handleFileChange}
                      className="hidden"
                      id={fileInputId.current}
                    />
                    <label
                      htmlFor={fileInputId.current}
                      className="flex items-center gap-2 px-3 py-2 bg-white border border-slate-300 rounded cursor-pointer hover:bg-slate-50 text-sm text-slate-700"
                    >
                      <Upload className="w-4 h-4" />
                      {navFile ? "Cambiar archivo" : "Subir Excel"}
                    </label>
                    {navFile && (
                      <div className="flex items-center gap-2 text-sm text-slate-600">
                        <FileSpreadsheet className="w-4 h-4 text-green-600" />
                        <span className="truncate max-w-[150px]">{navFile.name}</span>
                        <button
                          type="button"
                          onClick={() => {
                            setNavFile(null);
                            if (fileInputRef.current) fileInputRef.current.value = "";
                          }}
                          className="text-slate-400 hover:text-red-500"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    )}
                  </div>
                  <p className="text-xs text-slate-500 mt-1">
                    Excel con columnas: fecha, valor_cuota
                  </p>

                  {/* Upload result message */}
                  {uploadResult && (
                    <div className={`mt-2 p-2 rounded text-xs ${
                      uploadResult.success
                        ? "bg-green-50 text-green-700 border border-green-200"
                        : "bg-red-50 text-red-700 border border-red-200"
                    }`}>
                      {uploadResult.message}
                    </div>
                  )}
                </div>

                {/* Botones */}
                <div className="flex justify-end gap-2 pt-2">
                  <button
                    onClick={resetManualForm}
                    disabled={uploadingNav}
                    className="px-3 py-1.5 text-sm text-slate-600 hover:text-slate-800 disabled:opacity-50"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={handleManualSubmit}
                    disabled={!manualFund.name.trim() || uploadingNav}
                    className="px-4 py-1.5 bg-blue-600 text-white rounded text-sm hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                  >
                    {uploadingNav && <Loader className="w-3 h-3 animate-spin" />}
                    {uploadingNav ? "Subiendo..." : value ? "Guardar cambios" : "Agregar fondo"}
                  </button>
                </div>
              </div>
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
