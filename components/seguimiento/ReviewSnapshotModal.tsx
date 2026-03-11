"use client";

import React, { useState, useMemo } from "react";
import { X, Loader, AlertTriangle, Check, DollarSign, Calendar } from "lucide-react";

interface Holding {
  fundName: string;
  securityId?: string | null;
  quantity?: number;
  unitCost?: number;
  costBasis?: number;
  marketPrice?: number;
  marketValue: number;
  unrealizedGainLoss?: number;
  assetClass?: string;
}

interface ParsedData {
  clientName?: string;
  accountNumber?: string;
  period?: string;
  beginningValue?: number;
  endingValue?: number;
  totalValue?: number;
  holdings?: Holding[];
  detectedCurrency?: string;
  currencyConfidence?: string;
  currencyReason?: string;
}

interface Props {
  clientId: string;
  parsedData: ParsedData;
  source: "pdf" | "excel";
  onClose: () => void;
  onSuccess: () => void;
}

const ASSET_CLASS_OPTIONS = [
  { value: "equity", label: "Renta Variable", color: "bg-blue-100 text-blue-800" },
  { value: "fixedIncome", label: "Renta Fija", color: "bg-green-100 text-green-800" },
  { value: "balanced", label: "Balanceado", color: "bg-purple-100 text-purple-800" },
  { value: "alternatives", label: "Alternativos", color: "bg-orange-100 text-orange-800" },
  { value: "cash", label: "Cash/MM", color: "bg-gray-100 text-gray-800" },
];

const CURRENCY_OPTIONS = [
  { value: "USD", label: "USD (Dólares)" },
  { value: "CLP", label: "CLP (Pesos Chilenos)" },
  { value: "EUR", label: "EUR (Euros)" },
  { value: "UF", label: "UF" },
];

// Heurísticas para clasificar fondos
function classifyFund(fundName: string): string {
  const name = fundName.toLowerCase();

  // Money Market / Cash
  if (name.includes("money market") || name.includes("mm ") || name.includes("liquidez") ||
      name.includes("efectivo") || name.includes("cash") || name.includes("disponible")) {
    return "cash";
  }

  // Fixed Income / Renta Fija
  if (name.includes("renta fija") || name.includes("fixed income") || name.includes("bond") ||
      name.includes("bono") || name.includes("deuda") || name.includes("corporate") ||
      name.includes("soberan") || name.includes("high yield") || name.includes("investment grade") ||
      name.includes("ig ") || name.includes("hy ") || name.includes("rf ") ||
      name.includes("deposito") || name.includes("depósito") || name.includes("pacto")) {
    return "fixedIncome";
  }

  // Balanced / Balanceado
  if (name.includes("balanced") || name.includes("balanceado") || name.includes("mixto") ||
      name.includes("multi-asset") || name.includes("multiactivo") || name.includes("allocation") ||
      name.includes("moderate") || name.includes("moderado")) {
    return "balanced";
  }

  // Alternatives
  if (name.includes("alternativ") || name.includes("real estate") || name.includes("inmobiliario") ||
      name.includes("private equity") || name.includes("hedge") || name.includes("commodity") ||
      name.includes("infraestruct") || name.includes("real asset")) {
    return "alternatives";
  }

  // Default: Equity / Renta Variable
  return "equity";
}

export default function ReviewSnapshotModal({
  clientId,
  parsedData,
  source,
  onClose,
  onSuccess,
}: Props) {
  // Initialize state from parsed data
  const initialHoldings = (parsedData.holdings || []).map((h) => ({
    ...h,
    assetClass: h.assetClass || classifyFund(h.fundName),
  }));

  const [holdings, setHoldings] = useState<Holding[]>(initialHoldings);
  const [fechaCartola, setFechaCartola] = useState(
    parsedData.period ? parseDate(parsedData.period) : new Date().toISOString().split("T")[0]
  );
  const [currency, setCurrency] = useState(parsedData.detectedCurrency || "USD");
  const [totalValue, setTotalValue] = useState(
    parsedData.totalValue || parsedData.endingValue ||
    initialHoldings.reduce((sum, h) => sum + (h.marketValue || 0), 0)
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Try to parse period string to date
  function parseDate(period: string): string {
    try {
      // Try common formats
      const date = new Date(period);
      if (!isNaN(date.getTime())) {
        return date.toISOString().split("T")[0];
      }
    } catch {
      // ignore
    }
    return new Date().toISOString().split("T")[0];
  }

  // Calculate composition from holdings
  const composition = useMemo(() => {
    const comp: Record<string, { value: number; percent: number }> = {
      equity: { value: 0, percent: 0 },
      fixedIncome: { value: 0, percent: 0 },
      balanced: { value: 0, percent: 0 },
      alternatives: { value: 0, percent: 0 },
      cash: { value: 0, percent: 0 },
    };

    let total = 0;
    holdings.forEach((h) => {
      const value = h.marketValue || 0;
      const assetClass = h.assetClass || "equity";

      // Balanced se divide 50/50 entre equity y fixed income
      if (assetClass === "balanced") {
        comp.equity.value += value * 0.5;
        comp.fixedIncome.value += value * 0.5;
      } else {
        comp[assetClass].value += value;
      }
      total += value;
    });

    // Calculate percentages
    if (total > 0) {
      Object.keys(comp).forEach((key) => {
        comp[key].percent = (comp[key].value / total) * 100;
      });
    }

    return comp;
  }, [holdings]);

  const handleAssetClassChange = (index: number, newClass: string) => {
    const updated = [...holdings];
    updated[index] = { ...updated[index], assetClass: newClass };
    setHoldings(updated);
  };

  const handleValueChange = (index: number, newValue: number) => {
    const updated = [...holdings];
    updated[index] = { ...updated[index], marketValue: newValue };
    setHoldings(updated);

    // Recalculate total
    const newTotal = updated.reduce((sum, h) => sum + (h.marketValue || 0), 0);
    setTotalValue(newTotal);
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);

    try {
      const res = await fetch("/api/portfolio/snapshots", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientId,
          snapshotDate: fechaCartola,
          totalValue,
          composition: {
            equity: composition.equity,
            fixedIncome: composition.fixedIncome,
            alternatives: composition.alternatives,
            cash: composition.cash,
          },
          holdings: holdings.map((h) => ({
            ...h,
            currency,
          })),
          source,
          currency,
        }),
      });

      const result = await res.json();

      if (result.success) {
        onSuccess();
      } else {
        setError(result.error || "Error al guardar snapshot");
      }
    } catch (err) {
      console.error("Error saving snapshot:", err);
      setError("Error de conexión");
    } finally {
      setSaving(false);
    }
  };

  const formatCurrency = (value: number) => {
    if (currency === "CLP") {
      return new Intl.NumberFormat("es-CL", {
        style: "currency",
        currency: "CLP",
        minimumFractionDigits: 0,
      }).format(value);
    }
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: currency,
      minimumFractionDigits: 0,
    }).format(value);
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 max-w-4xl w-full mx-4 shadow-xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h3 className="text-lg font-semibold text-gb-black">Revisar y Confirmar</h3>
            <p className="text-sm text-gb-gray">Verifica y ajusta los datos antes de guardar</p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-gb-gray hover:text-gb-black hover:bg-slate-100 rounded transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Error */}
        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-red-600 mt-0.5 shrink-0" />
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}

        {/* Currency warning */}
        {parsedData.currencyConfidence && parsedData.currencyConfidence !== "high" && (
          <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-md">
            <p className="text-sm text-amber-700">
              <AlertTriangle className="w-4 h-4 inline mr-1" />
              Moneda detectada con baja confianza: {parsedData.currencyReason}
            </p>
          </div>
        )}

        {/* Date and Currency */}
        <div className="grid grid-cols-2 gap-4 mb-6">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1 flex items-center gap-1">
              <Calendar className="w-4 h-4" />
              Fecha de la Cartola
            </label>
            <input
              type="date"
              value={fechaCartola}
              onChange={(e) => setFechaCartola(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
            {parsedData.period && (
              <p className="text-xs text-gb-gray mt-1">Período detectado: {parsedData.period}</p>
            )}
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1 flex items-center gap-1">
              <DollarSign className="w-4 h-4" />
              Moneda
            </label>
            <select
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              {CURRENCY_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Total Value */}
        <div className="mb-6 p-4 bg-slate-50 rounded-lg">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-slate-700">Valor Total</span>
            <span className="text-2xl font-bold text-gb-black">{formatCurrency(totalValue)}</span>
          </div>
        </div>

        {/* Composition Summary */}
        <div className="mb-6">
          <h4 className="text-sm font-semibold text-gb-black mb-3">Composición Resultante</h4>
          <div className="flex gap-2">
            {composition.equity.percent > 0 && (
              <div className="flex-1 p-2 bg-blue-50 rounded text-center">
                <p className="text-xs text-blue-700">RV</p>
                <p className="text-sm font-bold text-blue-800">{composition.equity.percent.toFixed(1)}%</p>
              </div>
            )}
            {composition.fixedIncome.percent > 0 && (
              <div className="flex-1 p-2 bg-green-50 rounded text-center">
                <p className="text-xs text-green-700">RF</p>
                <p className="text-sm font-bold text-green-800">{composition.fixedIncome.percent.toFixed(1)}%</p>
              </div>
            )}
            {composition.alternatives.percent > 0 && (
              <div className="flex-1 p-2 bg-orange-50 rounded text-center">
                <p className="text-xs text-orange-700">Alt</p>
                <p className="text-sm font-bold text-orange-800">{composition.alternatives.percent.toFixed(1)}%</p>
              </div>
            )}
            {composition.cash.percent > 0 && (
              <div className="flex-1 p-2 bg-gray-100 rounded text-center">
                <p className="text-xs text-gray-600">Cash</p>
                <p className="text-sm font-bold text-gray-800">{composition.cash.percent.toFixed(1)}%</p>
              </div>
            )}
          </div>
        </div>

        {/* Holdings */}
        <div className="mb-6">
          <h4 className="text-sm font-semibold text-gb-black mb-3">
            Posiciones ({holdings.length})
          </h4>
          <div className="border border-slate-200 rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-slate-600">Instrumento</th>
                  <th className="px-3 py-2 text-right text-xs font-semibold text-slate-600">Valor</th>
                  <th className="px-3 py-2 text-center text-xs font-semibold text-slate-600">Clasificación</th>
                </tr>
              </thead>
              <tbody>
                {holdings.map((holding, index) => (
                  <tr key={index} className="border-t border-slate-100 hover:bg-slate-50">
                    <td className="px-3 py-2">
                      <p className="font-medium text-gb-black truncate max-w-xs" title={holding.fundName}>
                        {holding.fundName}
                      </p>
                      {holding.securityId && (
                        <p className="text-xs text-gb-gray">{holding.securityId}</p>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <input
                        type="number"
                        value={holding.marketValue}
                        onChange={(e) => handleValueChange(index, parseFloat(e.target.value) || 0)}
                        className="w-28 px-2 py-1 text-right border border-slate-200 rounded text-sm focus:ring-1 focus:ring-blue-500"
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
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-3 justify-end pt-4 border-t border-slate-200">
          <button
            onClick={onClose}
            disabled={saving}
            className="px-4 py-2 text-sm font-medium border border-slate-300 text-slate-600 rounded-md hover:bg-slate-50 transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={handleSave}
            disabled={saving || holdings.length === 0}
            className="px-6 py-2 text-sm font-medium bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 transition-colors flex items-center gap-2"
          >
            {saving ? (
              <>
                <Loader className="w-4 h-4 animate-spin" />
                Guardando...
              </>
            ) : (
              <>
                <Check className="w-4 h-4" />
                Confirmar y Guardar
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
