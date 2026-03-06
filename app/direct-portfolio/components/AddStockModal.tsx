// app/direct-portfolio/components/AddStockModal.tsx
// Modal para agregar acciones/ETFs al portafolio

"use client";

import React, { useState, useEffect } from "react";
import { X, Loader, TrendingUp, TrendingDown } from "lucide-react";
import SecuritySearch from "./SecuritySearch";
import type {
  SecuritySearchResult,
  SecurityQuote,
  HoldingType,
  DirectPortfolioHolding,
} from "@/lib/direct-portfolio/types";
import { formatCurrency } from "@/lib/direct-portfolio/types";

interface AddStockModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAdd: (holding: Partial<DirectPortfolioHolding>) => Promise<void>;
  editHolding?: DirectPortfolioHolding | null;
}

export default function AddStockModal({
  isOpen,
  onClose,
  onAdd,
  editHolding,
}: AddStockModalProps) {
  const [selectedSecurity, setSelectedSecurity] = useState<SecuritySearchResult | null>(null);
  const [quote, setQuote] = useState<SecurityQuote | null>(null);
  const [loadingQuote, setLoadingQuote] = useState(false);
  const [cantidad, setCantidad] = useState<string>("");
  const [precioCompra, setPrecioCompra] = useState<string>("");
  const [fechaCompra, setFechaCompra] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset form cuando se abre/cierra
  useEffect(() => {
    if (isOpen) {
      if (editHolding) {
        // Modo edición
        setSelectedSecurity({
          ticker: editHolding.ticker || "",
          name: editHolding.nombre,
          type: editHolding.tipo as HoldingType,
          exchange: "",
          exchangeName: "",
        });
        setCantidad(editHolding.cantidad.toString());
        setPrecioCompra(editHolding.precio_compra?.toString() || "");
        setFechaCompra(editHolding.fecha_compra || "");
        if (editHolding.precio_actual) {
          setQuote({
            ticker: editHolding.ticker || "",
            name: editHolding.nombre,
            price: editHolding.precio_actual,
            currency: "USD",
            exchange: "",
            type: editHolding.tipo as HoldingType,
          });
        }
      } else {
        // Modo agregar
        setSelectedSecurity(null);
        setQuote(null);
        setCantidad("");
        setPrecioCompra("");
        setFechaCompra(new Date().toISOString().split("T")[0]);
      }
      setError(null);
    }
  }, [isOpen, editHolding]);

  // Obtener cotización cuando se selecciona un valor
  const handleSelectSecurity = async (security: SecuritySearchResult) => {
    setSelectedSecurity(security);
    setLoadingQuote(true);
    setError(null);

    try {
      const response = await fetch(`/api/securities/quote/${encodeURIComponent(security.ticker)}`);
      const data = await response.json();

      if (data.success) {
        setQuote(data.quote);
        // Auto-llenar precio de compra con precio actual si está vacío
        if (!precioCompra) {
          setPrecioCompra(data.quote.price.toFixed(2));
        }
      } else {
        setError(data.error);
      }
    } catch {
      setError("Error obteniendo cotización");
    } finally {
      setLoadingQuote(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!selectedSecurity) {
      setError("Seleccione un valor");
      return;
    }

    const cantidadNum = parseFloat(cantidad);
    if (isNaN(cantidadNum) || cantidadNum <= 0) {
      setError("Ingrese una cantidad válida");
      return;
    }

    setSaving(true);
    setError(null);

    try {
      await onAdd({
        id: editHolding?.id,
        tipo: selectedSecurity.type,
        ticker: selectedSecurity.ticker,
        nombre: selectedSecurity.name,
        cantidad: cantidadNum,
        precio_compra: precioCompra ? parseFloat(precioCompra) : null,
        fecha_compra: fechaCompra || null,
      });

      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al guardar");
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  const valorEstimado =
    cantidad && quote?.price ? parseFloat(cantidad) * quote.price : null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ backgroundColor: "rgba(0,0,0,0.5)" }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg mx-4">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <h2 className="text-lg font-semibold text-gray-900">
            {editHolding ? "Editar Posición" : "Agregar Acción / ETF"}
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
          >
            <X size={24} />
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* Buscador de valores */}
          {!editHolding && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Buscar Instrumento
              </label>
              <SecuritySearch onSelect={handleSelectSecurity} />
            </div>
          )}

          {/* Valor seleccionado */}
          {selectedSecurity && (
            <div className="bg-gray-50 rounded-lg p-4">
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-lg">
                      {selectedSecurity.ticker}
                    </span>
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full ${
                        selectedSecurity.type === "stock_us"
                          ? "bg-blue-100 text-blue-800"
                          : selectedSecurity.type === "stock_cl"
                          ? "bg-green-100 text-green-800"
                          : "bg-purple-100 text-purple-800"
                      }`}
                    >
                      {selectedSecurity.type === "stock_us"
                        ? "USA"
                        : selectedSecurity.type === "stock_cl"
                        ? "Chile"
                        : "ETF"}
                    </span>
                  </div>
                  <p className="text-sm text-gray-600 mt-1">
                    {selectedSecurity.name}
                  </p>
                </div>

                {/* Precio actual */}
                {loadingQuote ? (
                  <Loader size={20} className="animate-spin text-gray-400" />
                ) : quote ? (
                  <div className="text-right">
                    <div className="text-xl font-semibold">
                      {formatCurrency(quote.price, quote.currency)}
                    </div>
                    {quote.changePercent !== undefined && (
                      <div
                        className={`flex items-center justify-end gap-1 text-sm ${
                          quote.changePercent >= 0
                            ? "text-green-600"
                            : "text-red-600"
                        }`}
                      >
                        {quote.changePercent >= 0 ? (
                          <TrendingUp size={14} />
                        ) : (
                          <TrendingDown size={14} />
                        )}
                        {quote.changePercent >= 0 ? "+" : ""}
                        {quote.changePercent.toFixed(2)}%
                      </div>
                    )}
                  </div>
                ) : null}
              </div>
            </div>
          )}

          {/* Campos de entrada */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Cantidad *
              </label>
              <input
                type="number"
                value={cantidad}
                onChange={(e) => setCantidad(e.target.value)}
                placeholder="Ej: 100"
                step="any"
                min="0"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Precio Compra
              </label>
              <input
                type="number"
                value={precioCompra}
                onChange={(e) => setPrecioCompra(e.target.value)}
                placeholder="Ej: 150.00"
                step="0.01"
                min="0"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Fecha de Compra
            </label>
            <input
              type="date"
              value={fechaCompra}
              onChange={(e) => setFechaCompra(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Valor estimado */}
          {valorEstimado && (
            <div className="bg-blue-50 rounded-lg p-3 flex justify-between items-center">
              <span className="text-sm text-blue-800">Valor de mercado estimado:</span>
              <span className="font-semibold text-blue-900">
                {formatCurrency(valorEstimado, quote?.currency || "USD")}
              </span>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="bg-red-50 text-red-600 text-sm p-3 rounded-lg">
              {error}
            </div>
          )}

          {/* Botones */}
          <div className="flex justify-end gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-gray-600 hover:text-gray-800"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={!selectedSecurity || !cantidad || saving}
              className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {saving && <Loader size={16} className="animate-spin" />}
              {editHolding ? "Guardar Cambios" : "Agregar al Portafolio"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
