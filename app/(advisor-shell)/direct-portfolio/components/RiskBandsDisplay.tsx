// app/direct-portfolio/components/RiskBandsDisplay.tsx
// Componente para mostrar bandas de riesgo y alertas

"use client";

import React from "react";
import { AlertTriangle, CheckCircle, Info } from "lucide-react";
import type { DirectPortfolioHolding, RiskProfile } from "@/lib/direct-portfolio/types";
import { RISK_BANDS, getAssetClass } from "@/lib/direct-portfolio/types";

interface RiskBandsDisplayProps {
  holdings: DirectPortfolioHolding[];
  perfilRiesgo: RiskProfile | null;
  onChangeProfile?: (profile: RiskProfile) => void;
}

const PROFILE_LABELS: Record<RiskProfile, string> = {
  defensivo: "Defensivo",
  moderado: "Moderado",
  crecimiento: "Crecimiento",
  agresivo: "Agresivo",
};

const PROFILE_DESCRIPTIONS: Record<RiskProfile, string> = {
  defensivo: "Prioriza la preservación del capital con baja volatilidad",
  moderado: "Balance entre crecimiento y estabilidad",
  crecimiento: "Busca mayor crecimiento aceptando más volatilidad",
  agresivo: "Maximiza el crecimiento a largo plazo con alta volatilidad",
};

export default function RiskBandsDisplay({
  holdings,
  perfilRiesgo,
  onChangeProfile,
}: RiskBandsDisplayProps) {
  // Calcular distribución actual
  const totalValue = holdings.reduce((sum, h) => sum + (h.valor_mercado || 0), 0);

  const distribution = {
    renta_variable: 0,
    renta_fija: 0,
  };

  holdings.forEach((h) => {
    const value = h.valor_mercado || 0;
    const assetClass = getAssetClass(h.tipo);
    distribution[assetClass] += value;
  });

  const percentages = {
    renta_variable:
      totalValue > 0 ? (distribution.renta_variable / totalValue) * 100 : 0,
    renta_fija:
      totalValue > 0 ? (distribution.renta_fija / totalValue) * 100 : 0,
  };

  // Obtener bandas objetivo
  const targetBands = perfilRiesgo ? RISK_BANDS[perfilRiesgo] : null;

  // Verificar si está dentro de las bandas
  const isWithinBands = targetBands
    ? percentages.renta_variable >= targetBands.rentaVariable.min &&
      percentages.renta_variable <= targetBands.rentaVariable.max &&
      percentages.renta_fija >= targetBands.rentaFija.min &&
      percentages.renta_fija <= targetBands.rentaFija.max
    : true;

  // Calcular desvío
  const getDeviation = (
    actual: number,
    min: number,
    max: number
  ): { status: "ok" | "low" | "high"; deviation: number } => {
    if (actual < min) {
      return { status: "low", deviation: min - actual };
    }
    if (actual > max) {
      return { status: "high", deviation: actual - max };
    }
    return { status: "ok", deviation: 0 };
  };

  const rentaVariableStatus = targetBands
    ? getDeviation(
        percentages.renta_variable,
        targetBands.rentaVariable.min,
        targetBands.rentaVariable.max
      )
    : { status: "ok" as const, deviation: 0 };

  const rentaFijaStatus = targetBands
    ? getDeviation(
        percentages.renta_fija,
        targetBands.rentaFija.min,
        targetBands.rentaFija.max
      )
    : { status: "ok" as const, deviation: 0 };

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-900">
          Asignación por Perfil de Riesgo
        </h3>
        {perfilRiesgo && (
          <span
            className={`px-3 py-1 rounded-full text-sm font-medium ${
              isWithinBands
                ? "bg-green-100 text-green-800"
                : "bg-amber-100 text-amber-800"
            }`}
          >
            {isWithinBands ? (
              <span className="flex items-center gap-1">
                <CheckCircle size={14} />
                Dentro de bandas
              </span>
            ) : (
              <span className="flex items-center gap-1">
                <AlertTriangle size={14} />
                Fuera de bandas
              </span>
            )}
          </span>
        )}
      </div>

      {/* Selector de perfil */}
      {onChangeProfile && (
        <div className="mb-6">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Perfil de Riesgo Objetivo
          </label>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            {(Object.keys(RISK_BANDS) as RiskProfile[]).map((profile) => (
              <button
                key={profile}
                onClick={() => onChangeProfile(profile)}
                className={`p-3 rounded-lg border text-left transition-all ${
                  perfilRiesgo === profile
                    ? "border-blue-500 bg-blue-50"
                    : "border-gray-200 hover:border-gray-300"
                }`}
              >
                <p className="font-medium text-sm">{PROFILE_LABELS[profile]}</p>
                <p className="text-xs text-gray-500 mt-1">
                  RV: {RISK_BANDS[profile].rentaVariable.min}-
                  {RISK_BANDS[profile].rentaVariable.max}%
                </p>
              </button>
            ))}
          </div>
          {perfilRiesgo && (
            <p className="text-sm text-gray-600 mt-2">
              {PROFILE_DESCRIPTIONS[perfilRiesgo]}
            </p>
          )}
        </div>
      )}

      {/* Visualización de bandas */}
      {targetBands && totalValue > 0 && (
        <div className="space-y-6">
          {/* Renta Variable */}
          <div>
            <div className="flex justify-between items-center mb-2">
              <span className="text-sm font-medium text-gray-700">
                Renta Variable
              </span>
              <span
                className={`text-sm font-medium ${
                  rentaVariableStatus.status === "ok"
                    ? "text-green-600"
                    : "text-amber-600"
                }`}
              >
                {percentages.renta_variable.toFixed(1)}%
                {rentaVariableStatus.status !== "ok" && (
                  <span className="text-xs ml-1">
                    ({rentaVariableStatus.status === "high" ? "+" : "-"}
                    {rentaVariableStatus.deviation.toFixed(1)}%)
                  </span>
                )}
              </span>
            </div>

            {/* Barra de progreso con bandas */}
            <div className="relative h-6 bg-gray-100 rounded-full overflow-hidden">
              {/* Zona objetivo */}
              <div
                className="absolute h-full bg-green-100"
                style={{
                  left: `${targetBands.rentaVariable.min}%`,
                  width: `${
                    targetBands.rentaVariable.max - targetBands.rentaVariable.min
                  }%`,
                }}
              />

              {/* Marcador de posición actual */}
              <div
                className={`absolute top-0 h-full w-1.5 rounded ${
                  rentaVariableStatus.status === "ok"
                    ? "bg-green-500"
                    : "bg-amber-500"
                }`}
                style={{
                  left: `${Math.min(Math.max(percentages.renta_variable, 0), 100)}%`,
                  transform: "translateX(-50%)",
                }}
              />

              {/* Etiquetas de min/max */}
              <div
                className="absolute top-1/2 transform -translate-y-1/2 text-xs text-gray-500"
                style={{ left: `${targetBands.rentaVariable.min}%`, marginLeft: "4px" }}
              >
                {targetBands.rentaVariable.min}%
              </div>
              <div
                className="absolute top-1/2 transform -translate-y-1/2 text-xs text-gray-500"
                style={{ left: `${targetBands.rentaVariable.max}%`, marginLeft: "-20px" }}
              >
                {targetBands.rentaVariable.max}%
              </div>
            </div>
          </div>

          {/* Renta Fija */}
          <div>
            <div className="flex justify-between items-center mb-2">
              <span className="text-sm font-medium text-gray-700">
                Renta Fija
              </span>
              <span
                className={`text-sm font-medium ${
                  rentaFijaStatus.status === "ok"
                    ? "text-green-600"
                    : "text-amber-600"
                }`}
              >
                {percentages.renta_fija.toFixed(1)}%
                {rentaFijaStatus.status !== "ok" && (
                  <span className="text-xs ml-1">
                    ({rentaFijaStatus.status === "high" ? "+" : "-"}
                    {rentaFijaStatus.deviation.toFixed(1)}%)
                  </span>
                )}
              </span>
            </div>

            {/* Barra de progreso con bandas */}
            <div className="relative h-6 bg-gray-100 rounded-full overflow-hidden">
              {/* Zona objetivo */}
              <div
                className="absolute h-full bg-amber-100"
                style={{
                  left: `${targetBands.rentaFija.min}%`,
                  width: `${targetBands.rentaFija.max - targetBands.rentaFija.min}%`,
                }}
              />

              {/* Marcador de posición actual */}
              <div
                className={`absolute top-0 h-full w-1.5 rounded ${
                  rentaFijaStatus.status === "ok"
                    ? "bg-green-500"
                    : "bg-amber-500"
                }`}
                style={{
                  left: `${Math.min(Math.max(percentages.renta_fija, 0), 100)}%`,
                  transform: "translateX(-50%)",
                }}
              />

              {/* Etiquetas de min/max */}
              <div
                className="absolute top-1/2 transform -translate-y-1/2 text-xs text-gray-500"
                style={{ left: `${targetBands.rentaFija.min}%`, marginLeft: "4px" }}
              >
                {targetBands.rentaFija.min}%
              </div>
              <div
                className="absolute top-1/2 transform -translate-y-1/2 text-xs text-gray-500"
                style={{ left: `${targetBands.rentaFija.max}%`, marginLeft: "-20px" }}
              >
                {targetBands.rentaFija.max}%
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Alertas y recomendaciones */}
      {!isWithinBands && targetBands && totalValue > 0 && (
        <div className="mt-6 p-4 bg-amber-50 border border-amber-200 rounded-lg">
          <div className="flex gap-2">
            <AlertTriangle size={20} className="text-amber-600 flex-shrink-0" />
            <div>
              <p className="font-medium text-amber-800">
                El portafolio está fuera de las bandas del perfil {perfilRiesgo}
              </p>
              <ul className="mt-2 text-sm text-amber-700 space-y-1">
                {rentaVariableStatus.status === "high" && (
                  <li>
                    • Reducir renta variable en{" "}
                    {rentaVariableStatus.deviation.toFixed(1)}%
                  </li>
                )}
                {rentaVariableStatus.status === "low" && (
                  <li>
                    • Aumentar renta variable en{" "}
                    {rentaVariableStatus.deviation.toFixed(1)}%
                  </li>
                )}
                {rentaFijaStatus.status === "high" && (
                  <li>
                    • Reducir renta fija en{" "}
                    {rentaFijaStatus.deviation.toFixed(1)}%
                  </li>
                )}
                {rentaFijaStatus.status === "low" && (
                  <li>
                    • Aumentar renta fija en{" "}
                    {rentaFijaStatus.deviation.toFixed(1)}%
                  </li>
                )}
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* Sin perfil seleccionado */}
      {!perfilRiesgo && (
        <div className="p-4 bg-gray-50 border border-gray-200 rounded-lg">
          <div className="flex gap-2">
            <Info size={20} className="text-gray-500 flex-shrink-0" />
            <p className="text-sm text-gray-600">
              Seleccione un perfil de riesgo para ver las bandas de asignación
              recomendadas.
            </p>
          </div>
        </div>
      )}

      {/* Tabla de referencia */}
      <div className="mt-6">
        <h4 className="text-sm font-medium text-gray-700 mb-2">
          Referencia de Perfiles
        </h4>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left border-b">
                <th className="py-2 font-medium">Perfil</th>
                <th className="py-2 font-medium text-center">Renta Variable</th>
                <th className="py-2 font-medium text-center">Renta Fija</th>
              </tr>
            </thead>
            <tbody>
              {(Object.keys(RISK_BANDS) as RiskProfile[]).map((profile) => (
                <tr
                  key={profile}
                  className={`border-b ${
                    profile === perfilRiesgo ? "bg-blue-50" : ""
                  }`}
                >
                  <td className="py-2">{PROFILE_LABELS[profile]}</td>
                  <td className="py-2 text-center">
                    {RISK_BANDS[profile].rentaVariable.min}% -{" "}
                    {RISK_BANDS[profile].rentaVariable.max}%
                  </td>
                  <td className="py-2 text-center">
                    {RISK_BANDS[profile].rentaFija.min}% -{" "}
                    {RISK_BANDS[profile].rentaFija.max}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
