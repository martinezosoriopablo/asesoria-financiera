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

export default function ComparadorETF() {
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
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 py-12">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="text-center mb-12">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-br from-blue-600 to-blue-700 rounded-full mb-4">
            <BarChart3 className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-4xl font-bold text-slate-900 mb-2">
            Comparador de ETFs
          </h1>
          <p className="text-lg text-slate-600">
            Compara el desempeño histórico de ETFs usando datos reales de Yahoo Finance
          </p>
        </div>

        {/* Selector de ETFs */}
        <div className="bg-white rounded-xl shadow-lg p-8 mb-8 border border-slate-200">
          <h2 className="text-2xl font-bold text-slate-900 mb-6">
            Seleccionar ETFs a Comparar
          </h2>

          {/* Input para agregar ETF */}
          <div className="flex gap-3 mb-6">
            <div className="flex-1">
              <input
                type="text"
                placeholder="Ingresa ticker (ej: SPY, QQQ, VTI)"
                value={tickerInput}
                onChange={(e) => setTickerInput(e.target.value.toUpperCase())}
                onKeyPress={(e) => e.key === "Enter" && handleAgregarETF()}
                className="w-full border-2 border-slate-300 rounded-lg px-4 py-3 text-lg focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
                disabled={loading}
              />
            </div>
            <button
              onClick={handleAgregarETF}
              disabled={loading || !tickerInput}
              className="px-6 py-3 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 disabled:bg-slate-300 disabled:cursor-not-allowed flex items-center gap-2"
            >
              <Plus className="w-5 h-5" />
              {loading ? "Cargando..." : "Agregar"}
            </button>
          </div>

          {/* ETFs populares (quick add) */}
          <div className="mb-6">
            <p className="text-sm text-slate-600 mb-3">ETFs populares:</p>
            <div className="flex flex-wrap gap-2">
              {etfsPopulares.slice(0, 8).map((etf) => (
                <button
                  key={etf.ticker}
                  onClick={() => {
                    setTickerInput(etf.ticker);
                  }}
                  className="px-3 py-1 bg-slate-100 hover:bg-slate-200 rounded-md text-sm text-slate-700 transition-colors"
                >
                  {etf.ticker}
                </button>
              ))}
            </div>
          </div>

          {/* Error */}
          {error && (
            <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2">
              <AlertCircle className="w-5 h-5 text-red-600" />
              <p className="text-red-700">{error}</p>
            </div>
          )}

          {/* ETFs seleccionados */}
          {etfsSeleccionados.length > 0 && (
            <div>
              <p className="text-sm font-semibold text-slate-700 mb-3">
                ETFs en comparación ({etfsSeleccionados.length}/6):
              </p>
              <div className="flex flex-wrap gap-3">
                {etfData.map((etf) => (
                  <div
                    key={etf.ticker}
                    className="flex items-center gap-2 px-4 py-2 bg-slate-50 rounded-lg border-2"
                    style={{ borderColor: etf.color }}
                  >
                    <div
                      className="w-3 h-3 rounded-full"
                      style={{ backgroundColor: etf.color }}
                    />
                    <span className="font-semibold text-slate-900">{etf.ticker}</span>
                    <span className="text-sm text-slate-600">({etf.name})</span>
                    <button
                      onClick={() => handleRemoverETF(etf.ticker)}
                      className="ml-2 text-slate-400 hover:text-red-600 transition-colors"
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
            <div className="mt-6">
              <p className="text-sm font-semibold text-slate-700 mb-3">Período:</p>
              <div className="flex gap-3">
                {[
                  { value: "1y", label: "1 Año" },
                  { value: "5y", label: "5 Años" },
                  { value: "10y", label: "10 Años" },
                  { value: "max", label: "Máximo" },
                ].map((p) => (
                  <button
                    key={p.value}
                    onClick={() => handleCambioPeriodo(p.value as any)}
                    className={`px-4 py-2 rounded-lg font-semibold transition-all ${
                      periodo === p.value
                        ? "bg-blue-600 text-white"
                        : "bg-slate-100 text-slate-700 hover:bg-slate-200"
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
          <div className="bg-white rounded-xl shadow-lg p-8 mb-8 border border-slate-200">
            <h2 className="text-2xl font-bold text-slate-900 mb-6">
              Desempeño Histórico (Normalizado)
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

            <p className="text-sm text-slate-600 mt-4">
              💡 Gráfico normalizado a 100: todos los ETFs comienzan en 100 al inicio del período,
              permitiendo comparar el rendimiento relativo fácilmente (ej: 150 = subió 50%).
            </p>
          </div>
        )}

        {/* Tabla Comparativa */}
        {etfData.length > 0 && (
          <div className="bg-white rounded-xl shadow-lg p-8 mb-8 border border-slate-200">
            <h2 className="text-2xl font-bold text-slate-900 mb-6">
              Tabla Comparativa
            </h2>

            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b-2 border-slate-300 bg-slate-50">
                    <th className="text-left py-3 px-4 text-sm font-semibold text-slate-700">
                      ETF
                    </th>
                    <th className="text-left py-3 px-4 text-sm font-semibold text-slate-700">
                      Nombre
                    </th>
                    <th className="text-right py-3 px-4 text-sm font-semibold text-slate-700">
                      Precio
                    </th>
                    <th className="text-right py-3 px-4 text-sm font-semibold text-slate-700">
                      1 Año
                    </th>
                    <th className="text-right py-3 px-4 text-sm font-semibold text-slate-700">
                      5 Años
                    </th>
                    <th className="text-right py-3 px-4 text-sm font-semibold text-slate-700">
                      Expense Ratio
                    </th>
                    <th className="text-right py-3 px-4 text-sm font-semibold text-slate-700">
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
                      <tr key={etf.ticker} className="border-b border-slate-200">
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-2">
                            <div
                              className="w-3 h-3 rounded-full"
                              style={{ backgroundColor: etf.color }}
                            />
                            <span className="font-bold text-slate-900">{etf.ticker}</span>
                          </div>
                        </td>
                        <td className="py-3 px-4 text-sm text-slate-600">{etf.name}</td>
                        <td className="py-3 px-4 text-right font-semibold text-slate-900">
                          ${etf.price.toFixed(2)}
                        </td>
                        <td
                          className={`py-3 px-4 text-right font-semibold ${
                            etf.change1Y >= 0 ? "text-green-600" : "text-red-600"
                          }`}
                        >
                          {etf.change1Y >= 0 ? "+" : ""}
                          {etf.change1Y.toFixed(1)}%
                          {mejor1Y?.ticker === etf.ticker && (
                            <Award className="inline w-4 h-4 ml-1 text-yellow-500" />
                          )}
                        </td>
                        <td
                          className={`py-3 px-4 text-right font-semibold ${
                            etf.change5Y >= 0 ? "text-green-600" : "text-red-600"
                          }`}
                        >
                          {etf.change5Y >= 0 ? "+" : ""}
                          {etf.change5Y.toFixed(1)}%
                          {mejor5Y?.ticker === etf.ticker && (
                            <Award className="inline w-4 h-4 ml-1 text-yellow-500" />
                          )}
                        </td>
                        <td className="py-3 px-4 text-right text-slate-700">
                          {etf.expenseRatio.toFixed(2)}%
                          {mejorExpense?.ticker === etf.ticker && (
                            <Award className="inline w-4 h-4 ml-1 text-yellow-500" />
                          )}
                        </td>
                        <td className="py-3 px-4 text-right text-slate-700">
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
          <div className="bg-gradient-to-br from-blue-50 to-slate-50 rounded-xl shadow-lg p-8 border border-blue-200">
            <h2 className="text-2xl font-bold text-slate-900 mb-6 flex items-center gap-2">
              <Award className="w-6 h-6 text-yellow-500" />
              Resumen: Mejor en Cada Categoría
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {[
                { campo: "change5Y" as keyof ETFData, label: "Rentabilidad 5 Años", icon: TrendingUp },
                { campo: "expenseRatio" as keyof ETFData, label: "Menor Costo", icon: DollarSign },
                { campo: "dividendYield" as keyof ETFData, label: "Mejores Dividendos", icon: Percent },
                { campo: "change1Y" as keyof ETFData, label: "Rentabilidad 1 Año", icon: Clock },
              ].map(({ campo, label, icon: Icon }) => {
                const mejor = encontrarMejor(campo);
                if (!mejor) return null;

                return (
                  <div
                    key={label}
                    className="p-6 bg-white rounded-lg border-2 border-blue-200"
                  >
                    <div className="flex items-center gap-2 mb-2">
                      <Icon className="w-5 h-5 text-blue-600" />
                      <p className="text-sm font-semibold text-slate-700">{label}</p>
                    </div>
                    <p className="text-2xl font-bold text-blue-600 mb-1">
                      {mejor.ticker}
                    </p>
                    <p className="text-sm text-slate-600">
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
          <div className="bg-white rounded-xl shadow-lg p-12 text-center border border-slate-200">
            <BarChart3 className="w-16 h-16 text-slate-300 mx-auto mb-4" />
            <h3 className="text-xl font-bold text-slate-900 mb-2">
              Agrega ETFs para comenzar
            </h3>
            <p className="text-slate-600">
              Ingresa hasta 6 tickers de ETFs para compararlos
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
