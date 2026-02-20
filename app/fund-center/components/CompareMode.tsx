// app/fund-center/components/CompareMode.tsx
// Modo Comparador: Comparar múltiples ETFs

"use client";

import React, { useState } from "react";
import {
  BarChart3,
  TrendingUp,
  Plus,
  X,
  DollarSign,
  Percent,
  Clock,
  AlertCircle,
  Award,
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

// ============================================================
// TIPOS
// ============================================================

interface ETFData {
  ticker: string;
  name: string;
  price: number;
  change1Y: number;
  change5Y: number;
  expenseRatio: number;
  dividendYield: number;
  historicalData: HistoricalPoint[];
  color: string;
}

interface HistoricalPoint {
  date: string;
  value: number;
  [key: string]: any; // Para múltiples ETFs
}

// ============================================================
// ETFs POPULARES (LISTA PREDEFINIDA)
// ============================================================

const etfsPopulares = [
  { ticker: "SPY", name: "S&P 500 ETF" },
  { ticker: "QQQ", name: "Nasdaq 100 ETF" },
  { ticker: "VTI", name: "Total Stock Market ETF" },
  { ticker: "VOO", name: "Vanguard S&P 500 ETF" },
  { ticker: "IWM", name: "Russell 2000 ETF" },
  { ticker: "VEA", name: "Developed Markets ETF" },
  { ticker: "VWO", name: "Emerging Markets ETF" },
  { ticker: "AGG", name: "Aggregate Bond ETF" },
  { ticker: "BND", name: "Total Bond Market ETF" },
  { ticker: "TLT", name: "20+ Year Treasury ETF" },
  { ticker: "GLD", name: "Gold ETF" },
  { ticker: "SLV", name: "Silver ETF" },
  { ticker: "VNQ", name: "Real Estate ETF" },
  { ticker: "EEM", name: "Emerging Markets Equity ETF" },
  { ticker: "DIA", name: "Dow Jones ETF" },
];

// Colores para cada ETF
const colores = [
  "#2563eb", // Azul
  "#059669", // Verde
  "#dc2626", // Rojo
  "#7c3aed", // Morado
  "#f59e0b", // Naranja
  "#06b6d4", // Cyan
];

// ============================================================
// COMPONENTE PRINCIPAL
// ============================================================

export default function CompareMode() {
  const [etfsSeleccionados, setEtfsSeleccionados] = useState<string[]>([]);
  const [etfData, setEtfData] = useState<ETFData[]>([]);
  const [tickerInput, setTickerInput] = useState("");
  const [periodo, setPeriodo] = useState<"1y" | "5y" | "10y" | "max">("5y");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Agregar ETF a la comparación
  const handleAgregarETF = async () => {
    if (!tickerInput) return;

    const ticker = tickerInput.toUpperCase();

    if (etfsSeleccionados.includes(ticker)) {
      setError("Este ETF ya está en la comparación");
      return;
    }

    if (etfsSeleccionados.length >= 6) {
      setError("Máximo 6 ETFs para comparar");
      return;
    }

    setLoading(true);
    setError("");

    try {
      // Llamar a API de Yahoo Finance
      const response = await fetch(`/api/etf/${ticker}?period=${periodo}`);

      if (!response.ok) {
        throw new Error("ETF no encontrado");
      }

      const data = await response.json();

      const newETF: ETFData = {
        ticker: data.ticker,
        name: data.name,
        price: data.price,
        change1Y: data.change1Y,
        change5Y: data.change5Y,
        expenseRatio: data.expenseRatio,
        dividendYield: data.dividendYield,
        historicalData: data.historical,
        color: colores[etfsSeleccionados.length % colores.length],
      };

      setEtfsSeleccionados([...etfsSeleccionados, ticker]);
      setEtfData([...etfData, newETF]);
      setTickerInput("");
    } catch (err) {
      setError("Error al cargar ETF. Verifica que el ticker sea correcto.");
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  // Remover ETF
  const handleRemoverETF = (ticker: string) => {
    setEtfsSeleccionados(etfsSeleccionados.filter((t) => t !== ticker));
    setEtfData(etfData.filter((e) => e.ticker !== ticker));
  };

  // Cambiar período (requiere recargar datos)
  const handleCambioPeriodo = async (newPeriod: "1y" | "5y" | "10y" | "max") => {
    setPeriodo(newPeriod);

    if (etfsSeleccionados.length === 0) return;

    setLoading(true);

    try {
      const updatedData = await Promise.all(
        etfsSeleccionados.map(async (ticker) => {
          const response = await fetch(`/api/etf/${ticker}?period=${newPeriod}`);
          const data = await response.json();

          const existingETF = etfData.find(e => e.ticker === ticker);

          return {
            ...existingETF!,
            historicalData: data.historical,
          };
        })
      );

      setEtfData(updatedData);
    } catch (err) {
      setError("Error al actualizar datos");
    } finally {
      setLoading(false);
    }
  };

  // Preparar datos para el gráfico
  const prepararDatosGrafico = () => {
    if (etfData.length === 0) return [];

    // Obtener todas las fechas únicas
    const allDates = new Set<string>();
    etfData.forEach(etf => {
      etf.historicalData.forEach(point => allDates.add(point.date));
    });

    const sortedDates = Array.from(allDates).sort();

    // Crear dataset combinado
    return sortedDates.map(date => {
      const point: any = { date };

      etfData.forEach(etf => {
        const dataPoint = etf.historicalData.find(p => p.date === date);
        if (dataPoint) {
          // Normalizar a 100 en el punto inicial (permite comparar % de cambio)
          const primerValor = etf.historicalData[0].value;
          const valorNormalizado = (dataPoint.value / primerValor) * 100;
          point[etf.ticker] = valorNormalizado;
        }
      });

      return point;
    });
  };

  // Encontrar mejor en cada categoría
  const encontrarMejor = (campo: keyof ETFData) => {
    if (etfData.length === 0) return null;

    return etfData.reduce((mejor, actual) => {
      if (campo === "expenseRatio") {
        return actual[campo] < mejor[campo] ? actual : mejor;
      }
      return actual[campo] > mejor[campo] ? actual : mejor;
    });
  };

  const datosGrafico = prepararDatosGrafico();

  return (
    <div className="space-y-6">
      {/* Selector de ETFs */}
        <div className="bg-white border border-gb-border rounded-lg p-6 mb-6">
          <h2 className="text-lg font-bold text-gb-black mb-4">
            Seleccionar ETFs a Comparar
          </h2>

          {/* Input para agregar ETF */}
          <div className="flex gap-3 mb-4">
            <div className="flex-1">
              <input
                type="text"
                placeholder="Ingresa ticker (ej: SPY, QQQ, VTI)"
                value={tickerInput}
                onChange={(e) => setTickerInput(e.target.value.toUpperCase())}
                onKeyPress={(e) => e.key === "Enter" && handleAgregarETF()}
                className="w-full border border-gb-border rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-gb-accent focus:ring-1 focus:ring-gb-accent"
                disabled={loading}
              />
            </div>
            <button
              onClick={handleAgregarETF}
              disabled={loading || !tickerInput}
              className="px-5 py-2.5 bg-gb-black text-white rounded-lg text-sm font-semibold hover:bg-gb-dark disabled:bg-gray-300 disabled:cursor-not-allowed flex items-center gap-2"
            >
              <Plus className="w-4 h-4" />
              {loading ? "Cargando..." : "Agregar"}
            </button>
          </div>

          {/* ETFs populares (quick add) */}
          <div className="mb-4">
            <p className="text-xs text-gb-gray mb-2">ETFs populares:</p>
            <div className="flex flex-wrap gap-2">
              {etfsPopulares.slice(0, 8).map((etf) => (
                <button
                  key={etf.ticker}
                  onClick={() => {
                    setTickerInput(etf.ticker);
                  }}
                  className="px-3 py-1 bg-gb-light hover:bg-gray-200 rounded-md text-xs text-gb-dark transition-colors border border-gb-border"
                >
                  {etf.ticker}
                </button>
              ))}
            </div>
          </div>

          {/* Error */}
          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-red-600" />
              <p className="text-sm text-red-700">{error}</p>
            </div>
          )}

          {/* ETFs seleccionados */}
          {etfsSeleccionados.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-gb-dark mb-2">
                ETFs en comparacion ({etfsSeleccionados.length}/6):
              </p>
              <div className="flex flex-wrap gap-3">
                {etfData.map((etf) => (
                  <div
                    key={etf.ticker}
                    className="flex items-center gap-2 px-3 py-1.5 bg-gb-light rounded-lg border"
                    style={{ borderColor: etf.color }}
                  >
                    <div
                      className="w-3 h-3 rounded-full"
                      style={{ backgroundColor: etf.color }}
                    />
                    <span className="text-sm font-semibold text-gb-black">{etf.ticker}</span>
                    <span className="text-xs text-gb-gray">({etf.name})</span>
                    <button
                      onClick={() => handleRemoverETF(etf.ticker)}
                      className="ml-1 text-gb-gray hover:text-red-600 transition-colors"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Selector de período */}
          {etfsSeleccionados.length > 0 && (
            <div className="mt-4">
              <p className="text-xs font-semibold text-gb-dark mb-2">Periodo:</p>
              <div className="flex gap-2">
                {[
                  { value: "1y", label: "1 Ano" },
                  { value: "5y", label: "5 Anos" },
                  { value: "10y", label: "10 Anos" },
                  { value: "max", label: "Maximo" },
                ].map((p) => (
                  <button
                    key={p.value}
                    onClick={() => handleCambioPeriodo(p.value as any)}
                    className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
                      periodo === p.value
                        ? "bg-gb-black text-white"
                        : "bg-gb-light text-gb-dark hover:bg-gray-200 border border-gb-border"
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Gráfico Histórico */}
        {datosGrafico.length > 0 && (
          <div className="bg-white border border-gb-border rounded-lg p-6 mb-6">
            <h2 className="text-lg font-bold text-gb-black mb-4">
              Desempeno Historico (Normalizado)
            </h2>

            <ResponsiveContainer width="100%" height={400}>
              <LineChart data={datosGrafico}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis
                  dataKey="date"
                  stroke="#64748b"
                  tickFormatter={(value) => {
                    const date = new Date(value);
                    return `${date.getMonth() + 1}/${date.getFullYear()}`;
                  }}
                />
                <YAxis
                  stroke="#64748b"
                  label={{ value: "Retorno (%)", angle: -90, position: "insideLeft" }}
                />
                <Tooltip
                  formatter={(value: any) => `${value.toFixed(2)}%`}
                  labelFormatter={(label) => {
                    const date = new Date(label);
                    return date.toLocaleDateString("es-CL");
                  }}
                  contentStyle={{
                    backgroundColor: "white",
                    border: "1px solid #e2e8f0",
                    borderRadius: "8px",
                  }}
                />
                <Legend />
                {etfData.map((etf) => (
                  <Line
                    key={etf.ticker}
                    type="monotone"
                    dataKey={etf.ticker}
                    stroke={etf.color}
                    strokeWidth={2}
                    dot={false}
                    name={etf.ticker}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>

            <p className="text-xs text-gb-gray mt-4">
              Grafico normalizado a 100: todos los ETFs comienzan en 100 al inicio del periodo,
              permitiendo comparar el rendimiento relativo facilmente (ej: 150 = subio 50%).
            </p>
          </div>
        )}

        {/* Tabla Comparativa */}
        {etfData.length > 0 && (
          <div className="bg-white border border-gb-border rounded-lg p-6 mb-6">
            <h2 className="text-lg font-bold text-gb-black mb-4">
              Tabla Comparativa
            </h2>

            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gb-border bg-gb-light">
                    <th className="text-left py-3 px-4 text-xs font-semibold text-gb-dark">
                      ETF
                    </th>
                    <th className="text-left py-3 px-4 text-xs font-semibold text-gb-dark">
                      Nombre
                    </th>
                    <th className="text-right py-3 px-4 text-xs font-semibold text-gb-dark">
                      Precio
                    </th>
                    <th className="text-right py-3 px-4 text-xs font-semibold text-gb-dark">
                      1 Ano
                    </th>
                    <th className="text-right py-3 px-4 text-xs font-semibold text-gb-dark">
                      5 Anos
                    </th>
                    <th className="text-right py-3 px-4 text-xs font-semibold text-gb-dark">
                      Expense Ratio
                    </th>
                    <th className="text-right py-3 px-4 text-xs font-semibold text-gb-dark">
                      Dividend Yield
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {etfData.map((etf) => {
                    const mejor1Y = encontrarMejor("change1Y");
                    const mejor5Y = encontrarMejor("change5Y");
                    const mejorExpense = encontrarMejor("expenseRatio");
                    const mejorDividend = encontrarMejor("dividendYield");

                    return (
                      <tr key={etf.ticker} className="border-b border-gb-border">
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-2">
                            <div
                              className="w-3 h-3 rounded-full"
                              style={{ backgroundColor: etf.color }}
                            />
                            <span className="text-sm font-bold text-gb-black">{etf.ticker}</span>
                          </div>
                        </td>
                        <td className="py-3 px-4 text-sm text-gb-gray">{etf.name}</td>
                        <td className="py-3 px-4 text-right text-sm font-semibold text-gb-black">
                          ${etf.price.toFixed(2)}
                        </td>
                        <td
                          className={`py-3 px-4 text-right text-sm font-semibold ${
                            etf.change1Y >= 0 ? "text-emerald-700" : "text-red-600"
                          }`}
                        >
                          {etf.change1Y >= 0 ? "+" : ""}
                          {etf.change1Y.toFixed(1)}%
                          {mejor1Y?.ticker === etf.ticker && (
                            <Award className="inline w-4 h-4 ml-1 text-yellow-500" />
                          )}
                        </td>
                        <td
                          className={`py-3 px-4 text-right text-sm font-semibold ${
                            etf.change5Y >= 0 ? "text-emerald-700" : "text-red-600"
                          }`}
                        >
                          {etf.change5Y >= 0 ? "+" : ""}
                          {etf.change5Y.toFixed(1)}%
                          {mejor5Y?.ticker === etf.ticker && (
                            <Award className="inline w-4 h-4 ml-1 text-yellow-500" />
                          )}
                        </td>
                        <td className="py-3 px-4 text-right text-sm text-gb-dark">
                          {etf.expenseRatio.toFixed(2)}%
                          {mejorExpense?.ticker === etf.ticker && (
                            <Award className="inline w-4 h-4 ml-1 text-yellow-500" />
                          )}
                        </td>
                        <td className="py-3 px-4 text-right text-sm text-gb-dark">
                          {etf.dividendYield.toFixed(2)}%
                          {mejorDividend?.ticker === etf.ticker && (
                            <Award className="inline w-4 h-4 ml-1 text-yellow-500" />
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Resumen: Mejor en cada categoría */}
        {etfData.length > 0 && (
          <div className="bg-white border border-gb-border rounded-lg p-6">
            <h2 className="text-lg font-bold text-gb-black mb-4 flex items-center gap-2">
              <Award className="w-5 h-5 text-yellow-500" />
              Resumen: Mejor en Cada Categoria
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {[
                { campo: "change5Y" as keyof ETFData, label: "Rentabilidad 5 Anos", icon: TrendingUp },
                { campo: "expenseRatio" as keyof ETFData, label: "Menor Costo", icon: DollarSign },
                { campo: "dividendYield" as keyof ETFData, label: "Mejores Dividendos", icon: Percent },
                { campo: "change1Y" as keyof ETFData, label: "Rentabilidad 1 Ano", icon: Clock },
              ].map(({ campo, label, icon: Icon }) => {
                const mejor = encontrarMejor(campo);
                if (!mejor) return null;

                return (
                  <div
                    key={label}
                    className="p-4 bg-gb-light rounded-lg border border-gb-border"
                  >
                    <div className="flex items-center gap-2 mb-2">
                      <Icon className="w-4 h-4 text-gb-dark" />
                      <p className="text-xs font-semibold text-gb-dark">{label}</p>
                    </div>
                    <p className="text-xl font-bold text-gb-black mb-1">
                      {mejor.ticker}
                    </p>
                    <p className="text-sm text-gb-gray">
                      {campo === "expenseRatio" ? (
                        `${(mejor[campo] as number).toFixed(2)}%`
                      ) : campo === "dividendYield" ? (
                        `${(mejor[campo] as number).toFixed(2)}%`
                      ) : (
                        `+${(mejor[campo] as number).toFixed(1)}%`
                      )}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Estado vacío */}
        {etfsSeleccionados.length === 0 && (
          <div className="bg-white border border-gb-border rounded-lg p-12 text-center">
            <BarChart3 className="w-12 h-12 text-gb-gray mx-auto mb-4" />
            <h3 className="text-base font-bold text-gb-black mb-2">
              Agrega ETFs para comenzar
            </h3>
            <p className="text-sm text-gb-gray">
              Ingresa hasta 6 tickers de ETFs para compararlos
            </p>
          </div>
        )}
    </div>
  );
}
