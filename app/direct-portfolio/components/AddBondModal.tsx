// app/direct-portfolio/components/AddBondModal.tsx
// Modal para agregar bonos corporativos con entrada manual

"use client";

import React, { useState, useEffect, useMemo } from "react";
import { X, Loader, Info } from "lucide-react";
import type { DirectPortfolioHolding } from "@/lib/direct-portfolio/types";
import {
  formatCurrency,
  calculateYTM,
  calculateDuration,
} from "@/lib/direct-portfolio/types";

interface AddBondModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAdd: (holding: Partial<DirectPortfolioHolding>) => Promise<void>;
  editHolding?: DirectPortfolioHolding | null;
}

export default function AddBondModal({
  isOpen,
  onClose,
  onAdd,
  editHolding,
}: AddBondModalProps) {
  const [nombre, setNombre] = useState("");
  const [cusip, setCusip] = useState("");
  const [isin, setIsin] = useState("");
  const [cantidad, setCantidad] = useState<string>("");
  const [valorNominal, setValorNominal] = useState<string>("1000");
  const [precioCompra, setPrecioCompra] = useState<string>("");
  const [cupon, setCupon] = useState<string>("");
  const [vencimiento, setVencimiento] = useState<string>("");
  const [fechaCompra, setFechaCompra] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset form cuando se abre/cierra
  useEffect(() => {
    if (isOpen) {
      if (editHolding) {
        // Modo edición
        setNombre(editHolding.nombre);
        setCusip(editHolding.cusip || "");
        setIsin(editHolding.isin || "");
        setCantidad(editHolding.cantidad.toString());
        setValorNominal(editHolding.valor_nominal?.toString() || "1000");
        setPrecioCompra(editHolding.precio_compra?.toString() || "");
        setCupon(editHolding.cupon?.toString() || "");
        setVencimiento(editHolding.vencimiento || "");
        setFechaCompra(editHolding.fecha_compra || "");
      } else {
        // Modo agregar
        setNombre("");
        setCusip("");
        setIsin("");
        setCantidad("");
        setValorNominal("1000");
        setPrecioCompra("");
        setCupon("");
        setVencimiento("");
        setFechaCompra(new Date().toISOString().split("T")[0]);
      }
      setError(null);
    }
  }, [isOpen, editHolding]);

  // Calcular métricas del bono
  const bondMetrics = useMemo(() => {
    const precioNum = parseFloat(precioCompra) || 0;
    const valorNominalNum = parseFloat(valorNominal) || 1000;
    const cuponNum = parseFloat(cupon) || 0;
    const cantidadNum = parseFloat(cantidad) || 0;

    if (!vencimiento || !precioNum || !valorNominalNum) {
      return null;
    }

    const vencDate = new Date(vencimiento);
    const today = new Date();
    const añosHastaVencimiento =
      (vencDate.getTime() - today.getTime()) / (365.25 * 24 * 60 * 60 * 1000);

    if (añosHastaVencimiento <= 0) {
      return { error: "El bono ya venció" };
    }

    const ytm = calculateYTM(precioNum, valorNominalNum, cuponNum, añosHastaVencimiento);
    const duration = calculateDuration(cuponNum, añosHastaVencimiento, ytm);
    const valorMercado = cantidadNum * precioNum;
    const valorNominalTotal = cantidadNum * valorNominalNum;

    return {
      ytm: ytm.toFixed(2),
      duration: duration.toFixed(2),
      añosHastaVencimiento: añosHastaVencimiento.toFixed(1),
      valorMercado,
      valorNominalTotal,
      precioRelativo: ((precioNum / valorNominalNum) * 100).toFixed(2),
    };
  }, [precioCompra, valorNominal, cupon, vencimiento, cantidad]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!nombre.trim()) {
      setError("Ingrese el nombre del bono");
      return;
    }

    const cantidadNum = parseFloat(cantidad);
    if (isNaN(cantidadNum) || cantidadNum <= 0) {
      setError("Ingrese una cantidad válida");
      return;
    }

    const cuponNum = parseFloat(cupon);
    if (isNaN(cuponNum) || cuponNum < 0) {
      setError("Ingrese una tasa de cupón válida");
      return;
    }

    if (!vencimiento) {
      setError("Ingrese la fecha de vencimiento");
      return;
    }

    const valorNominalNum = parseFloat(valorNominal);
    if (isNaN(valorNominalNum) || valorNominalNum <= 0) {
      setError("Ingrese un valor nominal válido");
      return;
    }

    setSaving(true);
    setError(null);

    try {
      await onAdd({
        id: editHolding?.id,
        tipo: "bond",
        ticker: cusip || isin || null,
        nombre: nombre.trim(),
        cantidad: cantidadNum,
        precio_compra: precioCompra ? parseFloat(precioCompra) : null,
        fecha_compra: fechaCompra || null,
        cupon: cuponNum,
        vencimiento,
        valor_nominal: valorNominalNum,
        cusip: cusip || null,
        isin: isin || null,
      });

      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al guardar");
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ backgroundColor: "rgba(0,0,0,0.5)" }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl mx-4 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b sticky top-0 bg-white">
          <h2 className="text-lg font-semibold text-gray-900">
            {editHolding ? "Editar Bono" : "Agregar Bono Corporativo"}
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
          >
            <X size={24} />
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {/* Info */}
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 flex gap-2">
            <Info size={18} className="text-amber-600 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-amber-800">
              Los bonos corporativos requieren entrada manual. Ingrese los datos
              del prospecto o su estado de cuenta.
            </p>
          </div>

          {/* Nombre del bono */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Nombre del Bono *
            </label>
            <input
              type="text"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              placeholder="Ej: Apple Inc 4.375% 2028"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            />
          </div>

          {/* Identificadores */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                CUSIP
              </label>
              <input
                type="text"
                value={cusip}
                onChange={(e) => setCusip(e.target.value.toUpperCase())}
                placeholder="Ej: 037833100"
                maxLength={9}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                ISIN
              </label>
              <input
                type="text"
                value={isin}
                onChange={(e) => setIsin(e.target.value.toUpperCase())}
                placeholder="Ej: US0378331005"
                maxLength={12}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
              />
            </div>
          </div>

          {/* Características del bono */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Cupón Anual (%) *
              </label>
              <input
                type="number"
                value={cupon}
                onChange={(e) => setCupon(e.target.value)}
                placeholder="Ej: 4.375"
                step="0.001"
                min="0"
                max="100"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Fecha de Vencimiento *
              </label>
              <input
                type="date"
                value={vencimiento}
                onChange={(e) => setVencimiento(e.target.value)}
                min={new Date().toISOString().split("T")[0]}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              />
            </div>
          </div>

          {/* Cantidad y valor nominal */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Cantidad (unidades) *
              </label>
              <input
                type="number"
                value={cantidad}
                onChange={(e) => setCantidad(e.target.value)}
                placeholder="Ej: 10"
                step="1"
                min="1"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Valor Nominal (par) *
              </label>
              <input
                type="number"
                value={valorNominal}
                onChange={(e) => setValorNominal(e.target.value)}
                placeholder="1000"
                step="1"
                min="1"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              />
            </div>
          </div>

          {/* Precio de compra y fecha */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Precio de Compra (por bono)
              </label>
              <input
                type="number"
                value={precioCompra}
                onChange={(e) => setPrecioCompra(e.target.value)}
                placeholder="Ej: 980.50"
                step="0.01"
                min="0"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              {bondMetrics && bondMetrics.precioRelativo && (
                <p className="text-xs text-gray-500 mt-1">
                  {bondMetrics.precioRelativo}% del valor nominal
                </p>
              )}
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
          </div>

          {/* Métricas calculadas */}
          {bondMetrics && !("error" in bondMetrics) && (
            <div className="bg-gray-50 rounded-lg p-4 grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <p className="text-xs text-gray-500">YTM (Yield to Maturity)</p>
                <p className="text-lg font-semibold text-blue-600">
                  {bondMetrics.ytm}%
                </p>
              </div>
              <div>
                <p className="text-xs text-gray-500">Duración Modificada</p>
                <p className="text-lg font-semibold text-gray-900">
                  {bondMetrics.duration} años
                </p>
              </div>
              <div>
                <p className="text-xs text-gray-500">Años a Vencimiento</p>
                <p className="text-lg font-semibold text-gray-900">
                  {bondMetrics.añosHastaVencimiento}
                </p>
              </div>
              <div>
                <p className="text-xs text-gray-500">Valor Nominal Total</p>
                <p className="text-lg font-semibold text-gray-900">
                  {formatCurrency(bondMetrics.valorNominalTotal, "USD")}
                </p>
              </div>
            </div>
          )}

          {bondMetrics && "error" in bondMetrics && (
            <div className="bg-red-50 text-red-600 text-sm p-3 rounded-lg">
              {bondMetrics.error}
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
              disabled={saving}
              className="px-6 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {saving && <Loader size={16} className="animate-spin" />}
              {editHolding ? "Guardar Cambios" : "Agregar Bono"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
