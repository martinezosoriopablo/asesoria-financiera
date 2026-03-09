// components/shared/CurrencyConfirmModal.tsx
// Modal para confirmar la moneda detectada en una cartola

"use client";

import React, { useState, useEffect } from "react";
import { X, AlertTriangle, DollarSign, Check } from "lucide-react";

interface CurrencyConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (currency: "USD" | "CLP", convertedData?: ParsedStatement) => void;
  statement: ParsedStatement;
  detectedCurrency: "USD" | "CLP";
  confidence: "high" | "medium" | "low";
  reason: string;
  exchangeRate?: number; // CLP per USD
}

interface ParsedStatement {
  clientName: string;
  accountNumber: string;
  period: string;
  beginningValue: number;
  endingValue: number;
  fees: number;
  cashBalance: number;
  holdings: Array<{
    fundName: string;
    securityId: string;
    quantity: number;
    unitCost: number;
    costBasis: number;
    marketPrice: number;
    marketValue: number;
    unrealizedGainLoss: number;
  }>;
}

export default function CurrencyConfirmModal({
  isOpen,
  onClose,
  onConfirm,
  statement,
  detectedCurrency,
  confidence,
  reason,
  exchangeRate = 950,
}: CurrencyConfirmModalProps) {
  const [selectedCurrency, setSelectedCurrency] = useState<"USD" | "CLP">(detectedCurrency);

  useEffect(() => {
    setSelectedCurrency(detectedCurrency);
  }, [detectedCurrency]);

  if (!isOpen) return null;

  const totalValue = statement.endingValue ||
    statement.holdings.reduce((sum, h) => sum + (h.marketValue || 0), 0);

  // Calcular valor en la otra moneda
  const valueInUSD = selectedCurrency === "USD" ? totalValue : totalValue / exchangeRate;
  const valueInCLP = selectedCurrency === "CLP" ? totalValue : totalValue * exchangeRate;

  const formatValue = (value: number, currency: "USD" | "CLP") => {
    return new Intl.NumberFormat("es-CL", {
      style: "currency",
      currency,
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  };

  const handleConfirm = () => {
    if (selectedCurrency === detectedCurrency) {
      // No conversion needed
      onConfirm(selectedCurrency);
    } else {
      // Convert all values
      const factor = selectedCurrency === "USD"
        ? 1 / exchangeRate  // CLP → USD
        : exchangeRate;      // USD → CLP

      const convertedStatement: ParsedStatement = {
        ...statement,
        beginningValue: statement.beginningValue * factor,
        endingValue: statement.endingValue * factor,
        fees: statement.fees * factor,
        cashBalance: statement.cashBalance * factor,
        holdings: statement.holdings.map(h => ({
          ...h,
          unitCost: h.unitCost * factor,
          costBasis: h.costBasis * factor,
          marketPrice: h.marketPrice * factor,
          marketValue: h.marketValue * factor,
          unrealizedGainLoss: h.unrealizedGainLoss * factor,
        })),
      };

      onConfirm(selectedCurrency, convertedStatement);
    }
  };

  const confidenceColors = {
    high: "text-green-600 bg-green-50",
    medium: "text-yellow-600 bg-yellow-50",
    low: "text-red-600 bg-red-50",
  };

  const confidenceLabels = {
    high: "Alta",
    medium: "Media",
    low: "Baja",
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ backgroundColor: "rgba(0,0,0,0.5)" }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg mx-4">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <div className="flex items-center gap-2">
            <DollarSign className="w-5 h-5 text-blue-600" />
            <h2 className="text-lg font-semibold text-gray-900">
              Confirmar Moneda
            </h2>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
          >
            <X size={24} />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-5">
          {/* Detected currency info */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm text-blue-800">
                  <strong>Moneda detectada:</strong> {detectedCurrency}
                </p>
                <p className="text-xs text-blue-600 mt-1">{reason}</p>
                <span className={`inline-block text-xs px-2 py-0.5 rounded mt-2 ${confidenceColors[confidence]}`}>
                  Confianza: {confidenceLabels[confidence]}
                </span>
              </div>
            </div>
          </div>

          {/* Value preview */}
          <div className="bg-gray-50 rounded-lg p-4">
            <p className="text-sm text-gray-600 mb-3">Valor total del portafolio:</p>
            <div className="grid grid-cols-2 gap-4">
              <div
                onClick={() => setSelectedCurrency("USD")}
                className={`p-4 rounded-lg border-2 cursor-pointer transition-all ${
                  selectedCurrency === "USD"
                    ? "border-blue-500 bg-blue-50"
                    : "border-gray-200 hover:border-gray-300"
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-gray-700">USD</span>
                  {selectedCurrency === "USD" && (
                    <Check className="w-4 h-4 text-blue-600" />
                  )}
                </div>
                <p className="text-xl font-bold text-gray-900">
                  {formatValue(valueInUSD, "USD")}
                </p>
                <p className="text-xs text-gray-500 mt-1">Dólares americanos</p>
              </div>

              <div
                onClick={() => setSelectedCurrency("CLP")}
                className={`p-4 rounded-lg border-2 cursor-pointer transition-all ${
                  selectedCurrency === "CLP"
                    ? "border-blue-500 bg-blue-50"
                    : "border-gray-200 hover:border-gray-300"
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-gray-700">CLP</span>
                  {selectedCurrency === "CLP" && (
                    <Check className="w-4 h-4 text-blue-600" />
                  )}
                </div>
                <p className="text-xl font-bold text-gray-900">
                  {formatValue(valueInCLP, "CLP")}
                </p>
                <p className="text-xs text-gray-500 mt-1">Pesos chilenos</p>
              </div>
            </div>
          </div>

          {/* Warning if changing currency */}
          {selectedCurrency !== detectedCurrency && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 flex gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-amber-800">
                Los valores serán convertidos usando tipo de cambio {formatValue(exchangeRate, "CLP")}/USD
              </p>
            </div>
          )}

          {/* Holdings count */}
          <p className="text-sm text-gray-500">
            {statement.holdings.length} posiciones detectadas
          </p>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 px-6 py-4 border-t bg-gray-50 rounded-b-xl">
          <button
            onClick={onClose}
            className="px-4 py-2 text-gray-600 hover:text-gray-800"
          >
            Cancelar
          </button>
          <button
            onClick={handleConfirm}
            className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2"
          >
            <Check className="w-4 h-4" />
            Confirmar {selectedCurrency}
          </button>
        </div>
      </div>
    </div>
  );
}
