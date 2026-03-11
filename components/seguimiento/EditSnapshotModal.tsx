"use client";

import React, { useState } from "react";
import { X, Loader } from "lucide-react";
import type { Snapshot } from "./SeguimientoPage";

interface Props {
  snapshot: Snapshot;
  onClose: () => void;
  onSuccess: () => void;
}

interface FormData {
  snapshot_date: string;
  total_value: string;
  equity_percent: string;
  fixed_income_percent: string;
  alternatives_percent: string;
  cash_percent: string;
}

export default function EditSnapshotModal({ snapshot, onClose, onSuccess }: Props) {
  // Formato chileno: puntos para miles, comas para decimales
  const formatNumber = (value: number, decimals: number = 0): string => {
    const fixed = Math.abs(value).toFixed(decimals);
    const [intPart, decPart] = fixed.split(".");
    const withThousands = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
    const formatted = decPart ? `${withThousands},${decPart}` : withThousands;
    return value < 0 ? `-${formatted}` : formatted;
  };

  const [formData, setFormData] = useState<FormData>({
    snapshot_date: snapshot.snapshot_date,
    total_value: snapshot.total_value.toString(),
    equity_percent: (snapshot.equity_percent || 0).toString(),
    fixed_income_percent: (snapshot.fixed_income_percent || 0).toString(),
    alternatives_percent: (snapshot.alternatives_percent || 0).toString(),
    cash_percent: (snapshot.cash_percent || 0).toString(),
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

      const res = await fetch(`/api/portfolio/snapshots/${snapshot.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          snapshotDate: formData.snapshot_date,
          totalValue,
          composition: {
            equity: { value: totalValue * (equityPercent / 100), percent: equityPercent },
            fixedIncome: { value: totalValue * (fixedIncomePercent / 100), percent: fixedIncomePercent },
            alternatives: { value: totalValue * (alternativesPercent / 100), percent: alternativesPercent },
            cash: { value: totalValue * (cashPercent / 100), percent: cashPercent },
          },
        }),
      });

      const result = await res.json();

      if (result.success) {
        onSuccess();
      } else {
        setError(result.error || "Error al guardar");
      }
    } catch (err) {
      console.error("Error updating snapshot:", err);
      setError("Error de conexión");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 max-w-lg w-full mx-4 shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-lg font-semibold text-gb-black">Editar Snapshot</h3>
          <button
            onClick={onClose}
            className="p-1.5 text-gb-gray hover:text-gb-black hover:bg-slate-100 rounded transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-4">
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-md">
              <p className="text-sm text-red-700">{error}</p>
            </div>
          )}

          {/* Date */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Fecha *
            </label>
            <input
              type="date"
              value={formData.snapshot_date}
              onChange={(e) => handleChange("snapshot_date", e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
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
                Total: {formatNumber(usedPercent, 1)}%
              </p>
              {Math.abs(remainingPercent) > 0.01 && (
                <p className={`text-xs ${remainingPercent > 0 ? "text-amber-600" : "text-red-600"}`}>
                  {remainingPercent > 0 ? `Faltan ${formatNumber(remainingPercent, 1)}%` : `Excede por ${formatNumber(Math.abs(remainingPercent), 1)}%`}
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
              onClick={onClose}
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
                "Guardar Cambios"
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
