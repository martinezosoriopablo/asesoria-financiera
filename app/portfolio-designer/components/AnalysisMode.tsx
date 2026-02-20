// app/portfolio-designer/components/AnalysisMode.tsx
// Modo Análisis: Comparación de rendimiento de fondos

"use client";

import React, { useState } from "react";
import {
  TrendingUp,
  BarChart3,
  PieChart,
  Search,
  Plus,
  X,
  ArrowUpRight,
  ArrowDownRight,
} from "lucide-react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";

// Colores para las líneas del gráfico
const CHART_COLORS = [
  "#2563eb", // Azul
  "#10b981", // Verde
  "#f59e0b", // Amarillo
  "#ef4444", // Rojo
  "#8b5cf6", // Púrpura
];

// Datos de ejemplo para fondos
const SAMPLE_FUNDS = [
  {
    id: "btg-acciones-chile",
    name: "BTG Pactual Acciones Chile",
    category: "Renta Variable Chile",
    returns: { "1m": 2.3, "3m": 5.1, "1y": 12.4, "3y": 28.5 },
    risk: "Alto",
    expense: 1.45,
  },
  {
    id: "banchile-usa",
    name: "Banchile USA Equity",
    category: "Renta Variable USA",
    returns: { "1m": 1.8, "3m": 7.2, "1y": 18.6, "3y": 45.2 },
    risk: "Alto",
    expense: 1.65,
  },
  {
    id: "scotiabank-global",
    name: "Scotiabank Global Equity",
    category: "Renta Variable Global",
    returns: { "1m": 1.5, "3m": 6.0, "1y": 15.2, "3y": 35.8 },
    risk: "Alto",
    expense: 1.55,
  },
  {
    id: "santander-renta-fija",
    name: "Santander Renta Fija Chile",
    category: "Renta Fija Chile",
    returns: { "1m": 0.4, "3m": 1.2, "1y": 4.8, "3y": 12.5 },
    risk: "Bajo",
    expense: 0.85,
  },
  {
    id: "bci-money-market",
    name: "BCI Money Market",
    category: "Money Market",
    returns: { "1m": 0.3, "3m": 0.9, "1y": 3.6, "3y": 9.2 },
    risk: "Muy Bajo",
    expense: 0.45,
  },
];

// Generar datos históricos de ejemplo
function generateHistoricalData(funds: typeof SAMPLE_FUNDS) {
  const months = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
  return months.map((month, idx) => {
    const dataPoint: Record<string, any> = { month };
    funds.forEach((fund) => {
      // Simular crecimiento acumulado con algo de volatilidad
      const baseGrowth = (fund.returns["1y"] / 12) * (idx + 1);
      const volatility = (Math.random() - 0.5) * 2;
      dataPoint[fund.id] = Number((100 + baseGrowth + volatility).toFixed(2));
    });
    return dataPoint;
  });
}

export default function AnalysisMode() {
  const [selectedFunds, setSelectedFunds] = useState<string[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [showSearch, setShowSearch] = useState(false);

  const selectedFundData = SAMPLE_FUNDS.filter((f) => selectedFunds.includes(f.id));
  const historicalData = generateHistoricalData(selectedFundData);

  const addFund = (fundId: string) => {
    if (!selectedFunds.includes(fundId) && selectedFunds.length < 5) {
      setSelectedFunds([...selectedFunds, fundId]);
    }
    setShowSearch(false);
    setSearchTerm("");
  };

  const removeFund = (fundId: string) => {
    setSelectedFunds(selectedFunds.filter((id) => id !== fundId));
  };

  const filteredFunds = SAMPLE_FUNDS.filter(
    (fund) =>
      !selectedFunds.includes(fund.id) &&
      (fund.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        fund.category.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  return (
    <div className="space-y-6">
      {/* Header con búsqueda */}
      <section className="bg-white border border-gb-border rounded-lg p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-gb-black" />
            <h2 className="text-lg font-semibold text-gb-black">
              Comparador de Fondos
            </h2>
          </div>
          <span className="text-sm text-gb-gray">
            {selectedFunds.length}/5 fondos seleccionados
          </span>
        </div>

        {/* Fondos seleccionados */}
        <div className="flex flex-wrap gap-2 mb-4">
          {selectedFundData.map((fund, idx) => (
            <div
              key={fund.id}
              className="flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium"
              style={{
                backgroundColor: `${CHART_COLORS[idx]}15`,
                borderColor: CHART_COLORS[idx],
                borderWidth: 1,
              }}
            >
              <span
                className="w-2 h-2 rounded-full"
                style={{ backgroundColor: CHART_COLORS[idx] }}
              />
              <span className="text-gb-dark">{fund.name}</span>
              <button
                onClick={() => removeFund(fund.id)}
                className="ml-1 text-gb-gray hover:text-red-500"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}

          {selectedFunds.length < 5 && (
            <div className="relative">
              <button
                onClick={() => setShowSearch(!showSearch)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium border border-dashed border-gb-border text-gb-gray hover:border-gb-black hover:text-gb-black transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                Agregar fondo
              </button>

              {showSearch && (
                <>
                  <div
                    className="fixed inset-0 z-40"
                    onClick={() => setShowSearch(false)}
                  />
                  <div className="absolute left-0 top-full mt-2 w-80 bg-white rounded-lg shadow-lg border border-gb-border z-50">
                    <div className="p-3 border-b border-gb-border">
                      <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gb-gray" />
                        <input
                          type="text"
                          value={searchTerm}
                          onChange={(e) => setSearchTerm(e.target.value)}
                          placeholder="Buscar fondos..."
                          className="w-full pl-9 pr-4 py-2 text-sm border border-gb-border rounded-lg focus:outline-none focus:border-gb-accent"
                          autoFocus
                        />
                      </div>
                    </div>
                    <div className="max-h-60 overflow-y-auto">
                      {filteredFunds.map((fund) => (
                        <button
                          key={fund.id}
                          onClick={() => addFund(fund.id)}
                          className="w-full px-4 py-3 text-left hover:bg-gb-light transition-colors"
                        >
                          <div className="text-sm font-medium text-gb-black">
                            {fund.name}
                          </div>
                          <div className="text-xs text-gb-gray">
                            {fund.category}
                          </div>
                        </button>
                      ))}
                      {filteredFunds.length === 0 && (
                        <div className="px-4 py-6 text-center text-sm text-gb-gray">
                          No se encontraron fondos
                        </div>
                      )}
                    </div>
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        {selectedFunds.length === 0 && (
          <div className="text-center py-8 text-gb-gray">
            <PieChart className="w-12 h-12 mx-auto mb-3 opacity-50" />
            <p className="text-sm">
              Selecciona hasta 5 fondos para comparar su rendimiento
            </p>
          </div>
        )}
      </section>

      {/* Gráfico de rendimiento */}
      {selectedFunds.length > 0 && (
        <section className="bg-white border border-gb-border rounded-lg p-6">
          <div className="flex items-center gap-2 mb-6">
            <TrendingUp className="w-5 h-5 text-gb-black" />
            <h3 className="text-lg font-semibold text-gb-black">
              Rendimiento Histórico (Base 100)
            </h3>
          </div>

          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={historicalData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis
                  dataKey="month"
                  tick={{ fontSize: 12 }}
                  stroke="#9ca3af"
                />
                <YAxis
                  tick={{ fontSize: 12 }}
                  stroke="#9ca3af"
                  domain={["dataMin - 2", "dataMax + 2"]}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "white",
                    border: "1px solid #e5e7eb",
                    borderRadius: "8px",
                    fontSize: "12px",
                  }}
                />
                <Legend />
                {selectedFundData.map((fund, idx) => (
                  <Line
                    key={fund.id}
                    type="monotone"
                    dataKey={fund.id}
                    name={fund.name}
                    stroke={CHART_COLORS[idx]}
                    strokeWidth={2}
                    dot={false}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
        </section>
      )}

      {/* Tabla comparativa */}
      {selectedFunds.length > 0 && (
        <section className="bg-white border border-gb-border rounded-lg overflow-hidden">
          <div className="p-6 border-b border-gb-border">
            <div className="flex items-center gap-2">
              <BarChart3 className="w-5 h-5 text-gb-black" />
              <h3 className="text-lg font-semibold text-gb-black">
                Comparativa de Retornos
              </h3>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gb-light">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gb-dark uppercase tracking-wider">
                    Fondo
                  </th>
                  <th className="px-6 py-3 text-center text-xs font-semibold text-gb-dark uppercase tracking-wider">
                    1 Mes
                  </th>
                  <th className="px-6 py-3 text-center text-xs font-semibold text-gb-dark uppercase tracking-wider">
                    3 Meses
                  </th>
                  <th className="px-6 py-3 text-center text-xs font-semibold text-gb-dark uppercase tracking-wider">
                    1 Año
                  </th>
                  <th className="px-6 py-3 text-center text-xs font-semibold text-gb-dark uppercase tracking-wider">
                    3 Años
                  </th>
                  <th className="px-6 py-3 text-center text-xs font-semibold text-gb-dark uppercase tracking-wider">
                    Riesgo
                  </th>
                  <th className="px-6 py-3 text-center text-xs font-semibold text-gb-dark uppercase tracking-wider">
                    Gasto
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gb-border">
                {selectedFundData.map((fund, idx) => (
                  <tr key={fund.id} className="hover:bg-gb-light/50">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <span
                          className="w-3 h-3 rounded-full"
                          style={{ backgroundColor: CHART_COLORS[idx] }}
                        />
                        <div>
                          <div className="text-sm font-medium text-gb-black">
                            {fund.name}
                          </div>
                          <div className="text-xs text-gb-gray">
                            {fund.category}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-center">
                      <ReturnCell value={fund.returns["1m"]} />
                    </td>
                    <td className="px-6 py-4 text-center">
                      <ReturnCell value={fund.returns["3m"]} />
                    </td>
                    <td className="px-6 py-4 text-center">
                      <ReturnCell value={fund.returns["1y"]} />
                    </td>
                    <td className="px-6 py-4 text-center">
                      <ReturnCell value={fund.returns["3y"]} />
                    </td>
                    <td className="px-6 py-4 text-center">
                      <span
                        className={`px-2 py-1 rounded-full text-xs font-medium ${
                          fund.risk === "Muy Bajo"
                            ? "bg-green-100 text-green-700"
                            : fund.risk === "Bajo"
                            ? "bg-blue-100 text-blue-700"
                            : fund.risk === "Medio"
                            ? "bg-yellow-100 text-yellow-700"
                            : "bg-red-100 text-red-700"
                        }`}
                      >
                        {fund.risk}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-center text-sm text-gb-gray">
                      {fund.expense.toFixed(2)}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}

// Componente para mostrar retornos con color
function ReturnCell({ value }: { value: number }) {
  const isPositive = value >= 0;
  return (
    <span
      className={`inline-flex items-center gap-0.5 text-sm font-semibold ${
        isPositive ? "text-green-600" : "text-red-600"
      }`}
    >
      {isPositive ? (
        <ArrowUpRight className="w-3.5 h-3.5" />
      ) : (
        <ArrowDownRight className="w-3.5 h-3.5" />
      )}
      {isPositive ? "+" : ""}
      {value.toFixed(1)}%
    </span>
  );
}
