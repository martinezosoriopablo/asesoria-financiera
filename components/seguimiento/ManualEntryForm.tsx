"use client";

import React, { useState } from "react";
import { Loader } from "lucide-react";

interface Props {
  clientId: string;
  onSuccess: () => void;
  onCancel: () => void;
}

interface FormData {
  fecha_cartola: string;
  total_value: string;
  equity_percent: string;
  fixed_income_percent: string;
  alternatives_percent: string;
  cash_percent: string;
  nombre_agf: string;
}

export default function ManualEntryForm({ clientId, onSuccess, onCancel }: Props) {
  const [formData, setFormData] = useState<FormData>({
    fecha_cartola: new Date().toISOString().split("T")[0],
    total_value: "",
    equity_percent: "",
    fixed_income_percent: "",
    alternatives_percent: "",
    cash_percent: "",
    nombre_agf: "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleChange = (field: keyof FormData, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    setError(null);
  };

  // Calculate remaining percent
  const usedPercent =
    (parseFloat(formData.equity_percent) || 0) +
    (parseFloat(formData.fixed_income_percent) || 0) +
    (parseFloat(formData.alternatives_percent) || 0) +
    (parseFloat(formData.cash_percent) || 0);

  const remainingPercent = 100 - usedPercent;

  const handleSubmit = async () => {
    // Validate
    if (!formData.total_value || parseFloat(formData.total_value) <= 0) {
      setError("El valor total es requerido");
      return;
    }

    if (Math.abs(remainingPercent) > 0.01) {
      setError("Los porcentajes deben sumar 100%");
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const totalValue = parseFloat(formData.total_value);
      const equityPercent = parseFloat(formData.equity_percent) || 0;
      const fixedIncomePercent = parseFloat(formData.fixed_income_percent) || 0;
      const alternativesPercent = parseFloat(formData.alternatives_percent) || 0;
      const cashPercent = parseFloat(formData.cash_percent) || 0;

      const res = await fetch("/api/portfolio/snapshots", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientId,
          snapshotDate: formData.fecha_cartola,
          totalValue,
          composition: {
            equity: { value: totalValue * (equityPercent / 100), percent: equityPercent },
            fixedIncome: { value: totalValue * (fixedIncomePercent / 100), percent: fixedIncomePercent },
            alternatives: { value: totalValue * (alternativesPercent / 100), percent: alternativesPercent },
            cash: { value: totalValue * (cashPercent / 100), percent: cashPercent },
          },
          source: "manual",
        }),
      });

      const result = await res.json();

      if (result.success) {
        onSuccess();
      } else {
        setError(result.error || "Error al guardar");
      }
    } catch (err) {
      console.error("Error saving snapshot:", err);
      setError("Error de conexión");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-md">
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {/* Date and AGF name */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">
            Fecha de la Cartola *
          </label>
          <input
            type="date"
            value={formData.fecha_cartola}
            onChange={(e) => handleChange("fecha_cartola", e.target.value)}
            className="w-full px-3 py-2 border border-slate-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">
            Nombre AGF/Corredora
          </label>
          <input
            type="text"
            value={formData.nombre_agf}
            onChange={(e) => handleChange("nombre_agf", e.target.value)}
            placeholder="Ej: BCI, Santander, etc."
            className="w-full px-3 py-2 border border-slate-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
        </div>
      </div>

      {/* Total value */}
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">
          Valor Total (USD) *
        </label>
        <input
          type="number"
          value={formData.total_value}
          onChange={(e) => handleChange("total_value", e.target.value)}
          placeholder="Ej: 100000"
          min="0"
          step="0.01"
          className="w-full px-3 py-2 border border-slate-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
        />
      </div>

      {/* Composition */}
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-2">
          Composición (%)
        </label>
        <div className="grid grid-cols-4 gap-3">
          <div>
            <label className="block text-xs text-slate-500 mb-1">Renta Variable</label>
            <input
              type="number"
              value={formData.equity_percent}
              onChange={(e) => handleChange("equity_percent", e.target.value)}
              placeholder="0"
              min="0"
              max="100"
              step="0.1"
              className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">Renta Fija</label>
            <input
              type="number"
              value={formData.fixed_income_percent}
              onChange={(e) => handleChange("fixed_income_percent", e.target.value)}
              placeholder="0"
              min="0"
              max="100"
              step="0.1"
              className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">Alternativos</label>
            <input
              type="number"
              value={formData.alternatives_percent}
              onChange={(e) => handleChange("alternatives_percent", e.target.value)}
              placeholder="0"
              min="0"
              max="100"
              step="0.1"
              className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">Cash</label>
            <input
              type="number"
              value={formData.cash_percent}
              onChange={(e) => handleChange("cash_percent", e.target.value)}
              placeholder="0"
              min="0"
              max="100"
              step="0.1"
              className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
        </div>
        <div className="mt-2 flex items-center justify-between">
          <p className="text-xs text-slate-500">
            Total: {usedPercent.toFixed(1)}%
          </p>
          {Math.abs(remainingPercent) > 0.01 && (
            <p className={`text-xs ${remainingPercent > 0 ? "text-amber-600" : "text-red-600"}`}>
              {remainingPercent > 0 ? `Faltan ${remainingPercent.toFixed(1)}%` : `Excede por ${Math.abs(remainingPercent).toFixed(1)}%`}
            </p>
          )}
          {Math.abs(remainingPercent) <= 0.01 && usedPercent > 0 && (
            <p className="text-xs text-green-600">OK</p>
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-3 justify-end pt-4 border-t border-slate-200">
        <button
          onClick={onCancel}
          disabled={saving}
          className="px-4 py-2 text-sm font-medium border border-slate-300 text-slate-600 rounded-md hover:bg-slate-50 transition-colors"
        >
          Cancelar
        </button>
        <button
          onClick={handleSubmit}
          disabled={saving || !formData.total_value}
          className="px-4 py-2 text-sm font-medium bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 transition-colors flex items-center gap-2"
        >
          {saving ? (
            <>
              <Loader className="w-4 h-4 animate-spin" />
              Guardando...
            </>
          ) : (
            "Guardar Snapshot"
          )}
        </button>
      </div>
    </div>
  );
}
