// components/portfolio/ProposedFundFormV2.tsx

"use client";

import React, { useState } from "react";
import { X, Upload, FileSpreadsheet, Calculator } from "lucide-react";
import { supabaseBrowserClient } from "@/lib/supabase/supabaseClient";
import * as XLSX from "xlsx";

// ============================================================
// INTERFACES
// ============================================================

interface ProposedFundFormProps {
  assetClass: string;
  subCategory?: string;
  onSuccess: (fund: any) => void;
  onCancel: () => void;
}

interface FormData {
  name: string;
  ticker: string;
  provider: string;
  platform: string;
  asset_class: string;
  sub_category: string;
  currency: string;
  expense_ratio: number;
  platform_fee: number;
  return_1y?: number;
  return_3y?: number;
  return_5y?: number;
  description?: string;
  factsheet_url?: string;
}

interface NavData {
  date: string;
  nav: number;
}

// ============================================================
// COMPONENTE PRINCIPAL
// ============================================================

export function ProposedFundFormV2({
  assetClass,
  subCategory,
  onSuccess,
  onCancel,
}: ProposedFundFormProps) {
  const [formData, setFormData] = useState<FormData>({
    name: "",
    ticker: "",
    provider: "",
    platform: "Stonex",
    asset_class: assetClass,
    sub_category: subCategory || "",
    currency: "USD",
    expense_ratio: 0,
    platform_fee: 0.1, // 0.1% por defecto para Stonex
  });

  const [navUploadMethod, setNavUploadMethod] = useState<"manual" | "file">("manual");
  const [navFile, setNavFile] = useState<File | null>(null);
  const [navData, setNavData] = useState<NavData[]>([]);
  const [calculatedReturns, setCalculatedReturns] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // ============================================================
  // MANEJO DE FORMULARIO
  // ============================================================

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) => {
    const { name, value } = e.target;
    
    // Convertir a número si es un campo numérico
    const numericFields = ['expense_ratio', 'platform_fee', 'return_1y', 'return_3y', 'return_5y'];
    const parsedValue = numericFields.includes(name) ? parseFloat(value) || 0 : value;
    
    setFormData((prev) => ({ ...prev, [name]: parsedValue }));
  };

  const totalCost = Number(formData.expense_ratio || 0) + Number(formData.platform_fee || 0);

  // ============================================================
  // MANEJO DE ARCHIVO NAV
  // ============================================================

  const handleNavFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setNavFile(file);
    setError("");

    try {
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer);
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      const data = XLSX.utils.sheet_to_json(worksheet);

      // Parsear datos
      const parsed: NavData[] = data.map((row: any) => ({
        date: normalizeDate(row.fecha || row.date),
        nav: parseFloat(row.valor_cuota || row.nav || row.value),
      }));

      // Ordenar por fecha
      parsed.sort((a, b) => a.date.localeCompare(b.date));

      setNavData(parsed);

      // Calcular rentabilidades
      const returns = calculateReturnsFromNav(parsed);
      setCalculatedReturns(returns);

      // Pre-llenar rentabilidades en el formulario
      setFormData((prev) => ({
        ...prev,
        return_1y: returns.return_1y,
        return_3y: returns.return_3y,
        return_5y: returns.return_5y,
      }));
    } catch (error: any) {
      setError(`Error leyendo archivo: ${error.message}`);
    }
  };

  const normalizeDate = (dateValue: any): string => {
    // Número de serie de Excel (ej: 44197 = 1 enero 2021)
    if (typeof dateValue === "number") {
      // Convertir número de serie Excel a fecha manualmente
      // Excel cuenta desde 1 enero 1900, pero tiene un bug con el año bisiesto 1900
      const excelEpoch = new Date(1899, 11, 30); // 30 dic 1899
      const date = new Date(excelEpoch.getTime() + dateValue * 24 * 60 * 60 * 1000);

      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, "0");
      const day = String(date.getDate()).padStart(2, "0");
      return `${year}-${month}-${day}`;
    }

    if (typeof dateValue === "string") {
      // YYYY-MM-DD
      if (/^\d{4}-\d{2}-\d{2}$/.test(dateValue)) return dateValue;
      // DD/MM/YYYY
      if (/^\d{2}\/\d{2}\/\d{4}$/.test(dateValue)) {
        const [day, month, year] = dateValue.split("/");
        return `${year}-${month}-${day}`;
      }
      // MM/DD/YYYY (formato US)
      if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(dateValue)) {
        const parts = dateValue.split("/");
        return `${parts[2]}-${parts[0].padStart(2, "0")}-${parts[1].padStart(2, "0")}`;
      }
    }

    if (dateValue instanceof Date) {
      const year = dateValue.getFullYear();
      const month = String(dateValue.getMonth() + 1).padStart(2, "0");
      const day = String(dateValue.getDate()).padStart(2, "0");
      return `${year}-${month}-${day}`;
    }

    // Fallback seguro
    return dateValue ? String(dateValue) : "";
  };

  const calculateReturnsFromNav = (navs: NavData[]) => {
    if (navs.length === 0) return {};

    const today = navs[navs.length - 1];
    const todayDate = new Date(today.date);

    // Buscar NAV hace 1 año
    const oneYearAgo = new Date(todayDate);
    oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
    const nav1y = findClosestNav(navs, oneYearAgo);

    // Buscar NAV hace 3 años
    const threeYearsAgo = new Date(todayDate);
    threeYearsAgo.setFullYear(threeYearsAgo.getFullYear() - 3);
    const nav3y = findClosestNav(navs, threeYearsAgo);

    // Buscar NAV hace 5 años
    const fiveYearsAgo = new Date(todayDate);
    fiveYearsAgo.setFullYear(fiveYearsAgo.getFullYear() - 5);
    const nav5y = findClosestNav(navs, fiveYearsAgo);

    return {
      return_1y: nav1y ? (today.nav / nav1y.nav - 1) : undefined,
      return_3y: nav3y ? Math.pow(today.nav / nav3y.nav, 1 / 3) - 1 : undefined,
      return_5y: nav5y ? Math.pow(today.nav / nav5y.nav, 1 / 5) - 1 : undefined,
    };
  };

  const findClosestNav = (navs: NavData[], targetDate: Date): NavData | null => {
    let closest: NavData | null = null;
    let minDiff = Infinity;

    for (const nav of navs) {
      const navDate = new Date(nav.date);
      const diff = Math.abs(navDate.getTime() - targetDate.getTime());
      if (diff < minDiff && diff < 14 * 24 * 60 * 60 * 1000) {
        // 14 días de tolerancia
        minDiff = diff;
        closest = nav;
      }
    }

    return closest;
  };

  // ============================================================
  // SUBMIT
  // ============================================================

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    const supabase = supabaseBrowserClient();

    try {
      // 1. Crear fondo propuesto
      const { data: fund, error: fundError } = await supabase
        .from("proposed_funds")
        .insert({
          name: formData.name,
          ticker: formData.ticker.toUpperCase(),
          provider: formData.provider,
          platform: formData.platform,
          asset_class: formData.asset_class,
          sub_category: formData.sub_category,
          currency: formData.currency,
          expense_ratio: formData.expense_ratio / 100,
          platform_fee: formData.platform_fee / 100,
          total_cost: totalCost / 100,
          return_1y: formData.return_1y ? formData.return_1y / 100 : null,
          return_3y: formData.return_3y ? formData.return_3y / 100 : null,
          return_5y: formData.return_5y ? formData.return_5y / 100 : null,
          description: formData.description,
          factsheet_url: formData.factsheet_url,
          is_active: true,
        })
        .select()
        .single();

      if (fundError) throw fundError;

      // 2. Si hay datos NAV, importarlos
      if (navData.length > 0 && fund) {
        const navRecords = navData.map((nav) => ({
          proposed_fund_id: fund.id,
          date: nav.date,
          nav: nav.nav,
          source: "import",
        }));

        // Insertar en lotes
        const batchSize = 500;
        for (let i = 0; i < navRecords.length; i += batchSize) {
          const batch = navRecords.slice(i, i + batchSize);
          const { error: navError } = await supabase
            .from("nav_history")
            .insert(batch);

          if (navError) throw navError;
        }

        // Recalcular rentabilidades con función de BD
        const { data: returns, error: returnsError } = await supabase
          .rpc("calculate_proposed_fund_returns", { p_proposed_fund_id: fund.id })
          .single() as { data: Record<string, any>; error: any };

        if (!returnsError && returns) {
          // Actualizar fondo con rentabilidades calculadas
          await supabase
            .from("proposed_funds")
            .update({
              return_1y: returns.return_1y,
              return_3y: returns.return_3y,
              return_5y: returns.return_5y,
              return_10y: returns.return_10y,
              return_ytd: returns.return_ytd,
            })
            .eq("id", fund.id);
        }
      }

      onSuccess(fund);
    } catch (error: any) {
      console.error("Error guardando fondo:", error);
      setError(error.message || "Error al guardar el fondo");
    } finally {
      setLoading(false);
    }
  };

  // ============================================================
  // RENDER
  // ============================================================

  return (
    <div className="bg-white rounded-2xl shadow-2xl max-w-3xl w-full max-h-[90vh] overflow-y-auto">
      <div className="sticky top-0 bg-white border-b border-slate-200 p-6 flex items-center justify-between z-10">
        <h2 className="text-2xl font-bold text-slate-900">Agregar Fondo Propuesto</h2>
        <button
          onClick={onCancel}
          className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
        >
          <X className="w-5 h-5 text-slate-600" />
        </button>
      </div>

      <form onSubmit={handleSubmit} className="p-6 space-y-6">
        {/* Información Básica */}
        <div className="space-y-4">
          <h3 className="font-semibold text-slate-900 text-lg">Información Básica</h3>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Nombre del Fondo *
              </label>
              <input
                type="text"
                name="name"
                value={formData.name}
                onChange={handleChange}
                required
                placeholder="Vanguard Total Stock Market ETF"
                className="w-full px-3 py-2 border-2 border-slate-200 rounded-lg focus:border-blue-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Ticker *
              </label>
              <input
                type="text"
                name="ticker"
                value={formData.ticker}
                onChange={handleChange}
                required
                placeholder="VTI"
                className="w-full px-3 py-2 border-2 border-slate-200 rounded-lg focus:border-blue-500 focus:outline-none uppercase"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Proveedor *
              </label>
              <input
                type="text"
                name="provider"
                value={formData.provider}
                onChange={handleChange}
                required
                placeholder="Vanguard"
                className="w-full px-3 py-2 border-2 border-slate-200 rounded-lg focus:border-blue-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Plataforma *
              </label>
              <select
                name="platform"
                value={formData.platform}
                onChange={handleChange}
                className="w-full px-3 py-2 border-2 border-slate-200 rounded-lg focus:border-blue-500 focus:outline-none"
              >
                <option value="Stonex">Stonex</option>
                <option value="All Funds">All Funds</option>
                <option value="Interactive Brokers">Interactive Brokers</option>
                <option value="TD Ameritrade">TD Ameritrade</option>
                <option value="Fidelity">Fidelity</option>
                <option value="Schwab">Schwab</option>
                <option value="Otro">Otro</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Sub-categoría
              </label>
              <input
                type="text"
                name="sub_category"
                value={formData.sub_category}
                onChange={handleChange}
                placeholder="USA, Europe, Chile, etc."
                className="w-full px-3 py-2 border-2 border-slate-200 rounded-lg focus:border-blue-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Moneda *
              </label>
              <select
                name="currency"
                value={formData.currency}
                onChange={handleChange}
                className="w-full px-3 py-2 border-2 border-slate-200 rounded-lg focus:border-blue-500 focus:outline-none"
              >
                <option value="USD">USD</option>
                <option value="EUR">EUR</option>
                <option value="GBP">GBP</option>
                <option value="CHF">CHF</option>
                <option value="CLP">CLP</option>
              </select>
            </div>
          </div>
        </div>

        {/* Costos */}
        <div className="space-y-4">
          <h3 className="font-semibold text-slate-900 text-lg">Costos</h3>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Expense Ratio (%) *
              </label>
              <input
                type="number"
                step="0.01"
                name="expense_ratio"
                value={formData.expense_ratio}
                onChange={handleChange}
                required
                placeholder="0.03"
                className="w-full px-3 py-2 border-2 border-slate-200 rounded-lg focus:border-blue-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Comisión Plataforma (%)
              </label>
              <input
                type="number"
                step="0.01"
                name="platform_fee"
                value={formData.platform_fee}
                onChange={handleChange}
                placeholder="0.10"
                className="w-full px-3 py-2 border-2 border-slate-200 rounded-lg focus:border-blue-500 focus:outline-none"
              />
            </div>
          </div>

          {/* Total Cost Display */}
          <div className="p-4 bg-blue-50 border-2 border-blue-200 rounded-lg">
            <div className="flex items-center gap-2 mb-2">
              <Calculator className="w-5 h-5 text-blue-600" />
              <span className="font-semibold text-blue-900">Costo Total</span>
            </div>
            <div className="text-3xl font-bold text-blue-600">
              {totalCost.toFixed(2)}%
            </div>
            <div className="text-sm text-blue-700 mt-1">
              Expense Ratio + Comisión Plataforma
            </div>
          </div>
        </div>

        {/* Rentabilidades */}
        <div className="space-y-4">
          <h3 className="font-semibold text-slate-900 text-lg">Rentabilidades</h3>

          {/* Método de ingreso */}
          <div className="flex gap-2 p-1 bg-slate-100 rounded-lg">
            <button
              type="button"
              onClick={() => setNavUploadMethod("manual")}
              className={`flex-1 px-4 py-2 rounded-md font-medium transition-colors ${
                navUploadMethod === "manual"
                  ? "bg-white text-blue-600 shadow"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              Ingresar Manualmente
            </button>
            <button
              type="button"
              onClick={() => setNavUploadMethod("file")}
              className={`flex-1 px-4 py-2 rounded-md font-medium transition-colors ${
                navUploadMethod === "file"
                  ? "bg-white text-blue-600 shadow"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              Subir Valores Cuota
            </button>
          </div>

          {navUploadMethod === "manual" ? (
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  1 año (%)
                </label>
                <input
                  type="number"
                  step="0.1"
                  name="return_1y"
                  value={formData.return_1y || ""}
                  onChange={handleChange}
                  placeholder="18.5"
                  className="w-full px-3 py-2 border-2 border-slate-200 rounded-lg focus:border-blue-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  3 años (%)
                </label>
                <input
                  type="number"
                  step="0.1"
                  name="return_3y"
                  value={formData.return_3y || ""}
                  onChange={handleChange}
                  placeholder="12.8"
                  className="w-full px-3 py-2 border-2 border-slate-200 rounded-lg focus:border-blue-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  5 años (%)
                </label>
                <input
                  type="number"
                  step="0.1"
                  name="return_5y"
                  value={formData.return_5y || ""}
                  onChange={handleChange}
                  placeholder="14.2"
                  className="w-full px-3 py-2 border-2 border-slate-200 rounded-lg focus:border-blue-500 focus:outline-none"
                />
              </div>
            </div>
          ) : (
            <div>
              <label
                htmlFor="nav-upload"
                className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed border-slate-300 rounded-lg cursor-pointer hover:border-blue-500 hover:bg-blue-50 transition-colors"
              >
                <div className="flex flex-col items-center justify-center pt-5 pb-6">
                  {navFile ? (
                    <>
                      <FileSpreadsheet className="w-8 h-8 mb-2 text-blue-600" />
                      <p className="text-sm font-medium text-slate-900">{navFile.name}</p>
                      <p className="text-xs text-slate-500 mt-1">
                        {navData.length} valores cuota importados
                      </p>
                    </>
                  ) : (
                    <>
                      <Upload className="w-8 h-8 mb-2 text-slate-400" />
                      <p className="text-sm text-slate-600">
                        Click para subir Excel con valores cuota
                      </p>
                      <p className="text-xs text-slate-500 mt-1">
                        Formato: fecha, valor_cuota
                      </p>
                    </>
                  )}
                </div>
                <input
                  id="nav-upload"
                  type="file"
                  className="hidden"
                  accept=".csv,.xlsx,.xls"
                  onChange={handleNavFileChange}
                />
              </label>

              {calculatedReturns && (
                <div className="mt-4 p-4 bg-green-50 border-2 border-green-200 rounded-lg">
                  <h4 className="font-semibold text-green-900 mb-2">
                    ✅ Rentabilidades Calculadas:
                  </h4>
                  <div className="grid grid-cols-3 gap-4 text-sm">
                    {calculatedReturns.return_1y && (
                      <div>
                        <span className="text-green-700">1Y:</span>{" "}
                        <span className="font-bold text-green-900">
                          {(calculatedReturns.return_1y * 100).toFixed(2)}%
                        </span>
                      </div>
                    )}
                    {calculatedReturns.return_3y && (
                      <div>
                        <span className="text-green-700">3Y:</span>{" "}
                        <span className="font-bold text-green-900">
                          {(calculatedReturns.return_3y * 100).toFixed(2)}%
                        </span>
                      </div>
                    )}
                    {calculatedReturns.return_5y && (
                      <div>
                        <span className="text-green-700">5Y:</span>{" "}
                        <span className="font-bold text-green-900">
                          {(calculatedReturns.return_5y * 100).toFixed(2)}%
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Información Adicional */}
        <div className="space-y-4">
          <h3 className="font-semibold text-slate-900 text-lg">Información Adicional</h3>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              Descripción / Estrategia
            </label>
            <textarea
              name="description"
              value={formData.description || ""}
              onChange={handleChange}
              rows={3}
              placeholder="ETF que replica el mercado total de acciones de EE.UU."
              className="w-full px-3 py-2 border-2 border-slate-200 rounded-lg focus:border-blue-500 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              URL Factsheet
            </label>
            <input
              type="url"
              name="factsheet_url"
              value={formData.factsheet_url || ""}
              onChange={handleChange}
              placeholder="https://..."
              className="w-full px-3 py-2 border-2 border-slate-200 rounded-lg focus:border-blue-500 focus:outline-none"
            />
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="p-4 bg-red-50 border-2 border-red-200 rounded-lg text-red-800">
            {error}
          </div>
        )}

        {/* Botones */}
        <div className="flex gap-3 pt-4 border-t border-slate-200">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 px-6 py-3 bg-slate-100 text-slate-700 font-semibold rounded-lg hover:bg-slate-200 transition-colors"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={loading}
            className="flex-1 px-6 py-3 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 transition-colors disabled:bg-slate-300 disabled:cursor-not-allowed"
          >
            {loading ? "Guardando..." : "Guardar Fondo"}
          </button>
        </div>
      </form>
    </div>
  );
}
