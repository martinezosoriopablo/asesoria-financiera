// app/direct-portfolio/components/AllocationChart.tsx
// Gráfico de distribución del portafolio

"use client";

import React from "react";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from "recharts";
import type { DirectPortfolioHolding } from "@/lib/direct-portfolio/types";
import { getAssetClass, formatCurrency } from "@/lib/direct-portfolio/types";

interface AllocationChartProps {
  holdings: DirectPortfolioHolding[];
  currency?: string;
}

interface ChartData {
  name: string;
  value: number;
  percentage: number;
  color: string;
  [key: string]: string | number;
}

const COLORS = {
  renta_variable: "#3B82F6", // blue
  renta_fija: "#F59E0B", // amber
  stock_us: "#2563EB",
  stock_cl: "#10B981",
  etf: "#8B5CF6",
  bond: "#F59E0B",
};

const LABELS = {
  renta_variable: "Renta Variable",
  renta_fija: "Renta Fija",
  stock_us: "Acciones USA",
  stock_cl: "Acciones Chile",
  etf: "ETFs",
  bond: "Bonos",
};

// Custom Tooltip component - defined outside to avoid recreating on each render
interface CustomTooltipProps {
  active?: boolean;
  payload?: readonly { payload: ChartData }[];
  currency: string;
}

function CustomTooltip({ active, payload, currency }: CustomTooltipProps) {
  if (active && payload && payload.length) {
    const data = payload[0].payload;
    return (
      <div className="bg-white p-3 rounded-lg shadow-lg border text-sm">
        <p className="font-semibold">{data.name}</p>
        <p className="text-gray-600">
          {formatCurrency(data.value, currency)}
        </p>
        <p className="text-gray-500">{data.percentage.toFixed(1)}%</p>
      </div>
    );
  }
  return null;
}

export default function AllocationChart({
  holdings,
  currency = "USD",
}: AllocationChartProps) {
  // Calcular totales por clase de activo
  const totalValue = holdings.reduce((sum, h) => sum + (h.valor_mercado || 0), 0);

  if (totalValue === 0) {
    return (
      <div className="bg-white rounded-lg border border-gray-200 p-6 text-center">
        <p className="text-gray-500">
          Sin datos para mostrar. Agregue posiciones al portafolio.
        </p>
      </div>
    );
  }

  // Datos por clase de activo principal
  const byAssetClass: Record<string, number> = {
    renta_variable: 0,
    renta_fija: 0,
  };

  // Datos por tipo específico
  const byType: Record<string, number> = {};

  holdings.forEach((h) => {
    const value = h.valor_mercado || 0;
    const assetClass = getAssetClass(h.tipo);
    byAssetClass[assetClass] = (byAssetClass[assetClass] || 0) + value;
    byType[h.tipo] = (byType[h.tipo] || 0) + value;
  });

  // Preparar datos para el gráfico de clases de activo
  const assetClassData: ChartData[] = Object.entries(byAssetClass)
    .filter(([, value]) => value > 0)
    .map(([key, value]) => ({
      name: LABELS[key as keyof typeof LABELS] || key,
      value,
      percentage: (value / totalValue) * 100,
      color: COLORS[key as keyof typeof COLORS] || "#9CA3AF",
    }));

  // Preparar datos para el gráfico por tipo
  const typeData: ChartData[] = Object.entries(byType)
    .filter(([, value]) => value > 0)
    .map(([key, value]) => ({
      name: LABELS[key as keyof typeof LABELS] || key,
      value,
      percentage: (value / totalValue) * 100,
      color: COLORS[key as keyof typeof COLORS] || "#9CA3AF",
    }));

  // Create a bound tooltip for this instance
  const renderTooltip = (props: { active?: boolean; payload?: readonly { payload: ChartData }[] }) => (
    <CustomTooltip {...props} currency={currency} />
  );

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-6">
      <h3 className="text-lg font-semibold text-gray-900 mb-4">
        Distribución del Portafolio
      </h3>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Gráfico por clase de activo */}
        <div>
          <h4 className="text-sm font-medium text-gray-600 mb-3 text-center">
            Por Clase de Activo
          </h4>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={assetClassData}
                  cx="50%"
                  cy="50%"
                  innerRadius={50}
                  outerRadius={80}
                  paddingAngle={2}
                  dataKey="value"
                >
                  {assetClassData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip content={renderTooltip} />
                <Legend
                  formatter={(value) => {
                    const data = assetClassData.find(d => d.name === value);
                    return (
                      <span className="text-sm">
                        {value} ({data?.percentage.toFixed(1)}%)
                      </span>
                    );
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Gráfico por tipo de instrumento */}
        <div>
          <h4 className="text-sm font-medium text-gray-600 mb-3 text-center">
            Por Tipo de Instrumento
          </h4>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={typeData}
                  cx="50%"
                  cy="50%"
                  innerRadius={50}
                  outerRadius={80}
                  paddingAngle={2}
                  dataKey="value"
                >
                  {typeData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip content={renderTooltip} />
                <Legend
                  formatter={(value) => {
                    const data = typeData.find(d => d.name === value);
                    return (
                      <span className="text-sm">
                        {value} ({data?.percentage.toFixed(1)}%)
                      </span>
                    );
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Resumen en texto */}
      <div className="mt-6 pt-4 border-t grid grid-cols-2 md:grid-cols-4 gap-4">
        {typeData.map((data) => (
          <div key={data.name} className="text-center">
            <div
              className="w-3 h-3 rounded-full mx-auto mb-1"
              style={{ backgroundColor: data.color }}
            />
            <p className="text-xs text-gray-500">{data.name}</p>
            <p className="font-semibold">{formatCurrency(data.value, currency)}</p>
            <p className="text-sm text-gray-600">{data.percentage.toFixed(1)}%</p>
          </div>
        ))}
      </div>
    </div>
  );
}
