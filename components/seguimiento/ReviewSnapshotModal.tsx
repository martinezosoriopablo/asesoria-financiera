"use client";

import React, { useState, useMemo, useEffect } from "react";
import { X, Loader, AlertTriangle, Check, DollarSign, Calendar, RefreshCw } from "lucide-react";

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
  currency?: string;
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

interface ExchangeRates {
  usd: number; // CLP per USD
  eur: number; // CLP per EUR
  uf: number;  // CLP per UF
}

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

// Heurísticas para detectar moneda del nombre del fondo
function detectCurrencyFromName(fundName: string): string {
  const name = fundName.toLowerCase();

  // USD indicators
  if (name.includes("usd") || name.includes("dollar") || name.includes("dolar") ||
      name.includes("us ") || name.includes("(us)") || name.includes("eeuu") ||
      name.includes("usa") || name.includes("global") || name.includes("international")) {
    return "USD";
  }

  // EUR indicators
  if (name.includes("eur") || name.includes("euro") || name.includes("europa") ||
      name.includes("european")) {
    return "EUR";
  }

  // UF indicators (Chilean)
  if (name.includes(" uf") || name.includes("(uf)") || name.includes("uf ")) {
    return "UF";
  }

  // CLP indicators or default for Chilean funds
  if (name.includes("clp") || name.includes("peso") || name.includes("chile") ||
      name.includes("local") || name.includes("nacional")) {
    return "CLP";
  }

  // Default based on detected currency or USD
  return "USD";
}

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
  // Exchange rates state
  const [exchangeRates, setExchangeRates] = useState<ExchangeRates | null>(null);
  const [loadingRates, setLoadingRates] = useState(true);
  const [ratesError, setRatesError] = useState<string | null>(null);

  // Initialize holdings with currency per fund
  const initialHoldings = (parsedData.holdings || []).map((h) => ({
    ...h,
    assetClass: h.assetClass || classifyFund(h.fundName),
    currency: h.currency || parsedData.detectedCurrency || detectCurrencyFromName(h.fundName),
  }));

  const [holdings, setHoldings] = useState<Holding[]>(initialHoldings);
  const [fechaCartola, setFechaCartola] = useState(
    parsedData.period ? parseDate(parsedData.period) : new Date().toISOString().split("T")[0]
  );
  const [consolidationCurrency, setConsolidationCurrency] = useState("CLP");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch exchange rates on mount
  useEffect(() => {
    async function fetchRates() {
      setLoadingRates(true);
      try {
        const res = await fetch("/api/exchange-rates");
        const data = await res.json();

        if (data.success) {
          // Calculate EUR from USD (approximate EUR/USD rate of 1.08)
          const eurUsdRate = 1.08;
          setExchangeRates({
            usd: data.usd || 980,
            eur: (data.usd || 980) * eurUsdRate,
            uf: data.uf || 38500,
          });
        } else {
          setRatesError("Error al obtener tipos de cambio");
          // Use fallback rates
          setExchangeRates({ usd: 980, eur: 1058, uf: 38500 });
        }
      } catch {
        setRatesError("Error de conexión");
        setExchangeRates({ usd: 980, eur: 1058, uf: 38500 });
      } finally {
        setLoadingRates(false);
      }
    }
    fetchRates();
  }, []);

  // Try to parse period string to date
  function parseDate(period: string): string {
    try {
      const date = new Date(period);
      if (!isNaN(date.getTime())) {
        return date.toISOString().split("T")[0];
      }
    } catch {
      // ignore
    }
    return new Date().toISOString().split("T")[0];
  }

  // Convert value to CLP
  const toCLP = (value: number, currency: string): number => {
    if (!exchangeRates) return value;
    switch (currency) {
      case "USD": return value * exchangeRates.usd;
      case "EUR": return value * exchangeRates.eur;
      case "UF": return value * exchangeRates.uf;
      case "CLP": return value;
      default: return value;
    }
  };

  // Convert CLP to target currency
  const fromCLP = (clpValue: number, targetCurrency: string): number => {
    if (!exchangeRates) return clpValue;
    switch (targetCurrency) {
      case "USD": return clpValue / exchangeRates.usd;
      case "EUR": return clpValue / exchangeRates.eur;
      case "UF": return clpValue / exchangeRates.uf;
      case "CLP": return clpValue;
      default: return clpValue;
    }
  };

  // Calculate totals by currency and consolidated total
  const { totalsByCurrency, consolidatedTotal, totalInCLP } = useMemo(() => {
    const totals: Record<string, number> = { USD: 0, CLP: 0, EUR: 0, UF: 0 };
    let clpTotal = 0;

    holdings.forEach((h) => {
      const curr = h.currency || "USD";
      totals[curr] = (totals[curr] || 0) + (h.marketValue || 0);
      clpTotal += toCLP(h.marketValue || 0, curr);
    });

    return {
      totalsByCurrency: totals,
      totalInCLP: clpTotal,
      consolidatedTotal: fromCLP(clpTotal, consolidationCurrency),
    };
  }, [holdings, exchangeRates, consolidationCurrency]);

  // Calculate composition from holdings (using CLP values for percentages)
  const composition = useMemo(() => {
    const comp: Record<string, { value: number; percent: number }> = {
      equity: { value: 0, percent: 0 },
      fixedIncome: { value: 0, percent: 0 },
      balanced: { value: 0, percent: 0 },
      alternatives: { value: 0, percent: 0 },
      cash: { value: 0, percent: 0 },
    };

    holdings.forEach((h) => {
      const clpValue = toCLP(h.marketValue || 0, h.currency || "USD");
      const assetClass = h.assetClass || "equity";

      if (assetClass === "balanced") {
        comp.equity.value += clpValue * 0.5;
        comp.fixedIncome.value += clpValue * 0.5;
      } else {
        comp[assetClass].value += clpValue;
      }
    });

    if (totalInCLP > 0) {
      Object.keys(comp).forEach((key) => {
        comp[key].percent = (comp[key].value / totalInCLP) * 100;
      });
    }

    return comp;
  }, [holdings, totalInCLP]);

  const handleAssetClassChange = (index: number, newClass: string) => {
    const updated = [...holdings];
    updated[index] = { ...updated[index], assetClass: newClass };
    setHoldings(updated);
  };

  const handleValueChange = (index: number, newValue: number) => {
    const updated = [...holdings];
    updated[index] = { ...updated[index], marketValue: newValue };
    setHoldings(updated);
  };

  const handleCurrencyChange = (index: number, newCurrency: string) => {
    const updated = [...holdings];
    updated[index] = { ...updated[index], currency: newCurrency };
    setHoldings(updated);
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
          totalValue: totalInCLP, // Store in CLP
          composition: {
            equity: composition.equity,
            fixedIncome: composition.fixedIncome,
            alternatives: composition.alternatives,
            cash: composition.cash,
          },
          holdings: holdings.map((h) => ({
            ...h,
            marketValueCLP: toCLP(h.marketValue || 0, h.currency || "USD"),
          })),
          source,
          currency: "CLP", // Base currency for storage
          exchangeRates,
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

  // Manual Chilean format: dots for thousands, commas for decimals
  const formatNumber = (value: number, decimals: number = 0): string => {
    const fixed = value.toFixed(decimals);
    const [intPart, decPart] = fixed.split(".");

    // Add thousand separators (dots)
    const withThousands = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ".");

    // Return with comma for decimals if needed
    return decPart ? `${withThousands},${decPart}` : withThousands;
  };

  const formatCurrency = (value: number, currency: string) => {
    switch (currency) {
      case "CLP":
        return `$${formatNumber(value, 0)}`;
      case "USD":
        return `US$${formatNumber(value, 0)}`;
      case "EUR":
        return `€${formatNumber(value, 0)}`;
      case "UF":
        return `UF ${formatNumber(value, 2)}`;
      default:
        return `${currency} ${formatNumber(value, 0)}`;
    }
  };

  const formatRate = (rate: number) => {
    return formatNumber(rate, 2);
  };

  // Get currencies that have holdings
  const activeCurrencies = Object.entries(totalsByCurrency)
    .filter(([, value]) => value > 0)
    .map(([currency]) => currency);

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 max-w-5xl w-full mx-4 shadow-xl max-h-[90vh] overflow-y-auto">
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

        {/* Exchange Rates Info */}
        <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <DollarSign className="w-4 h-4 text-blue-600" />
              <span className="text-sm font-medium text-blue-800">Tipos de Cambio</span>
            </div>
            {loadingRates ? (
              <Loader className="w-4 h-4 text-blue-600 animate-spin" />
            ) : (
              <RefreshCw className="w-4 h-4 text-blue-400" />
            )}
          </div>
          {exchangeRates && (
            <div className="mt-2 flex gap-4 text-xs text-blue-700">
              <span>USD/CLP: {formatRate(exchangeRates.usd)}</span>
              <span>EUR/CLP: {formatRate(exchangeRates.eur)}</span>
              <span>UF: {formatRate(exchangeRates.uf)}</span>
            </div>
          )}
          {ratesError && (
            <p className="mt-1 text-xs text-amber-600">
              <AlertTriangle className="w-3 h-3 inline mr-1" />
              {ratesError} - usando valores aproximados
            </p>
          )}
        </div>

        {/* Date */}
        <div className="mb-6">
          <label className="block text-sm font-medium text-slate-700 mb-1 flex items-center gap-1">
            <Calendar className="w-4 h-4" />
            Fecha de la Cartola
          </label>
          <input
            type="date"
            value={fechaCartola}
            onChange={(e) => setFechaCartola(e.target.value)}
            className="w-48 px-3 py-2 border border-slate-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
          {parsedData.period && (
            <p className="text-xs text-gb-gray mt-1">Período detectado: {parsedData.period}</p>
          )}
        </div>

        {/* Totals by Currency */}
        <div className="mb-6 p-4 bg-slate-50 rounded-lg">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-medium text-slate-700">Totales por Moneda</span>
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-500">Consolidar en:</span>
              <select
                value={consolidationCurrency}
                onChange={(e) => setConsolidationCurrency(e.target.value)}
                className="px-2 py-1 text-sm border border-slate-300 rounded focus:ring-1 focus:ring-blue-500"
              >
                {CURRENCY_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Subtotals by currency */}
          <div className="grid grid-cols-4 gap-2 mb-3">
            {activeCurrencies.map((curr) => (
              <div key={curr} className="p-2 bg-white rounded border border-slate-200 text-center">
                <p className="text-xs text-slate-500">{curr}</p>
                <p className="text-sm font-semibold text-slate-800">
                  {formatCurrency(totalsByCurrency[curr], curr)}
                </p>
              </div>
            ))}
          </div>

          {/* Consolidated total */}
          <div className="pt-3 border-t border-slate-200 flex items-center justify-between">
            <span className="text-sm font-semibold text-slate-700">Total Consolidado</span>
            <span className="text-2xl font-bold text-gb-black">
              {formatCurrency(consolidatedTotal, consolidationCurrency)}
            </span>
          </div>
          {consolidationCurrency !== "CLP" && (
            <p className="text-xs text-slate-500 text-right mt-1">
              ({formatCurrency(totalInCLP, "CLP")})
            </p>
          )}
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
                  <th className="px-3 py-2 text-center text-xs font-semibold text-slate-600 w-20">Moneda</th>
                  <th className="px-3 py-2 text-right text-xs font-semibold text-slate-600 w-32">Valor</th>
                  <th className="px-3 py-2 text-right text-xs font-semibold text-slate-600 w-28">En CLP</th>
                  <th className="px-3 py-2 text-center text-xs font-semibold text-slate-600 w-32">Clasificación</th>
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
                    <td className="px-3 py-2 text-center">
                      <select
                        value={holding.currency || "USD"}
                        onChange={(e) => handleCurrencyChange(index, e.target.value)}
                        className="w-16 px-1 py-1 text-xs border border-slate-200 rounded focus:ring-1 focus:ring-blue-500"
                      >
                        {CURRENCY_OPTIONS.map((opt) => (
                          <option key={opt.value} value={opt.value}>{opt.value}</option>
                        ))}
                      </select>
                    </td>
                    <td className="px-3 py-2 text-right">
                      <input
                        type="number"
                        value={holding.marketValue}
                        onChange={(e) => handleValueChange(index, parseFloat(e.target.value) || 0)}
                        className="w-28 px-2 py-1 text-right border border-slate-200 rounded text-sm focus:ring-1 focus:ring-blue-500"
                      />
                    </td>
                    <td className="px-3 py-2 text-right text-xs text-slate-500">
                      {formatCurrency(toCLP(holding.marketValue || 0, holding.currency || "USD"), "CLP")}
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
            disabled={saving || holdings.length === 0 || loadingRates}
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
