"use client";

import React, { useState } from "react";
import {
  Upload,
  TrendingUp,
  PieChart as PieChartIcon,
  BarChart3,
  FileText,
  AlertCircle,
} from "lucide-react";
import {
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { MOCK_FUND_DATA } from "./MOCK_FUND_DATA";

// Tipos
interface FundData {
  nombre: string;
  manager: string;
  experiencia_anos: number;
  aum: number;
  benchmark: string;
  alpha: number;
  beta: number;
  sharpe_ratio: number | null;
  tracking_error: number;
  information_ratio: number;
  r_squared: number;
  expense_ratio: number;
  dividend_yield: number;
  inception_date: string;
  retornos: {
    "1y": { fondo: number; benchmark: number };
    "3y": { fondo: number; benchmark: number };
    "5y": { fondo: number; benchmark: number };
    "10y": { fondo: number; benchmark: number };
  };
  sectors: {
    fondo: { [key: string]: number };
    benchmark: { [key: string]: number };
  };
  holdings: Array<{
    ticker: string;
    name: string;
    fondo: number;
    benchmark: number;
  }>;
  historical: Array<{
    date: string;
    fondo: number;
    benchmark: number;
  }>;
  active_share: number;
  num_posiciones: number;
}

const SECTOR_COLORS = [
  "#2563eb", // Azul
  "#10b981", // Verde
  "#f59e0b", // Amarillo
  "#ef4444", // Rojo
  "#8b5cf6", // Purpura
  "#ec4899", // Rosa
  "#06b6d4", // Cian
  "#f97316", // Naranja
  "#84cc16", // Lima
  "#6366f1", // Indigo
];

export default function AnalizadorFondos() {
  const [activeTab, setActiveTab] = useState<"info" | "metricas" | "composicion">("info");
  const [fundData, setFundData] = useState<FundData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  // Handle file upload
  const handleFileUpload = async (file: File) => {
    if (file.type !== "application/pdf") {
      setError("Por favor sube un archivo PDF valido");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append("pdf", file);

      const response = await fetch("/api/analyze-fund", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        throw new Error("Error al analizar el fondo");
      }

      const data = await response.json();
      setFundData(data);
    } catch (err: any) {
      setError(err.message || "Error al procesar el archivo");
    } finally {
      setLoading(false);
    }
  };

  // Drag and drop handlers
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);

    const file = e.dataTransfer.files[0];
    if (file) {
      handleFileUpload(file);
    }
  };

  // File input handler
  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleFileUpload(file);
    }
  };

  // Formatear numero a moneda
  const formatCurrency = (value: number): string => {
    if (value >= 1e9) {
      return `$${(value / 1e9).toFixed(1)}B`;
    }
    if (value >= 1e6) {
      return `$${(value / 1e6).toFixed(1)}M`;
    }
    return `$${value.toLocaleString()}`;
  };

  // Preparar datos para grafico de sectores
  const prepareSectorData = (sectors: { [key: string]: number }) => {
    return Object.entries(sectors).map(([name, value]) => ({
      name,
      value,
    }));
  };

  return (
    <div className="min-h-screen bg-gb-light p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="text-center mb-12">
          <div className="flex items-center justify-center gap-3 mb-4">
            <TrendingUp className="w-12 h-12 text-gb-accent" />
            <h1 className="text-5xl font-bold text-gb-black">
              Analisis de Fondos Mutuos
            </h1>
          </div>
          <p className="text-xl text-gb-gray max-w-2xl mx-auto">
            Sube un factsheet (PDF) y obten un analisis completo con metricas de
            performance, composicion y comparacion vs benchmark
          </p>
        </div>

        {/* Upload Area */}
        {!fundData && (
          <div
            className={`bg-white border border-gb-border rounded-lg border-4 border-dashed transition-all duration-300 ${
              isDragging
                ? "border-gb-accent bg-gb-light scale-105"
                : "border-gb-border hover:border-gb-accent"
            } p-16 text-center mb-8`}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
          >
            <input
              type="file"
              accept="application/pdf"
              onChange={handleFileInputChange}
              className="hidden"
              id="file-upload"
            />
            <label htmlFor="file-upload" className="cursor-pointer">
              <Upload className="w-20 h-20 text-gb-accent mx-auto mb-6" />
              <h3 className="text-2xl font-bold text-gb-black mb-3">
                Arrastra un PDF o haz clic para subir
              </h3>
              <p className="text-gb-gray mb-6">
                Sube el factsheet del fondo (formato PDF)
              </p>
              <button className="px-8 py-4 bg-gb-black text-white rounded-lg font-semibold hover:bg-gb-dark transition-colors">
                Seleccionar archivo
              </button>
            </label>
          </div>
        )}

        {/* Example Button */}
        {!fundData && !loading && (
          <div className="text-center mt-6">
            <button
              onClick={() => setFundData(MOCK_FUND_DATA)}
              className="px-8 py-4 bg-gb-black text-white rounded-lg font-semibold hover:bg-gb-dark transition-all duration-300"
            >
              Cargar Ejemplo: Morgan Stanley Global Brands
            </button>
            <p className="text-sm text-gb-gray mt-3">
              (Para testing sin subir PDF - usa datos reales del factsheet)
            </p>
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div className="bg-white border border-gb-border rounded-lg p-16 text-center">
            <div className="animate-spin w-16 h-16 border-4 border-gb-accent border-t-transparent rounded-full mx-auto mb-6"></div>
            <p className="text-xl text-gb-gray">
              Analizando fondo con Claude API...
            </p>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="bg-red-50 border-2 border-red-300 rounded-lg p-6 flex items-center gap-4 mb-8">
            <AlertCircle className="w-6 h-6 text-red-600" />
            <p className="text-red-800">{error}</p>
          </div>
        )}

        {/* Fund Analysis */}
        {fundData && (
          <div className="space-y-6">
            {/* Fund Header */}
            <div className="bg-white border border-gb-border rounded-lg p-8">
              <div className="flex items-start justify-between mb-6">
                <div>
                  <h2 className="text-3xl font-bold text-gb-black mb-2">
                    {fundData.nombre}
                  </h2>
                  <div className="flex items-center gap-6 text-gb-gray">
                    <span className="flex items-center gap-2">
                      <FileText className="w-5 h-5" />
                      Manager: <strong>{fundData.manager}</strong> (
                      {fundData.experiencia_anos} anos)
                    </span>
                  </div>
                </div>
                <button
                  onClick={() => setFundData(null)}
                  className="px-6 py-3 bg-gb-light text-gb-dark rounded-lg font-semibold hover:bg-gb-border transition-colors"
                >
                  Analizar otro fondo
                </button>
              </div>

              <div className="grid grid-cols-4 gap-6">
                <div className="bg-gb-light rounded-lg p-4 border border-gb-border">
                  <p className="text-sm text-gb-gray mb-1">AUM</p>
                  <p className="text-2xl font-bold text-gb-accent">
                    {formatCurrency(fundData.aum)}
                  </p>
                </div>
                <div className="bg-gb-light rounded-lg p-4 border border-gb-border">
                  <p className="text-sm text-gb-gray mb-1">Expense Ratio</p>
                  <p className="text-2xl font-bold text-green-600">
                    {fundData.expense_ratio.toFixed(2)}%
                  </p>
                </div>
                <div className="bg-gb-light rounded-lg p-4 border border-gb-border">
                  <p className="text-sm text-gb-gray mb-1">Benchmark</p>
                  <p className="text-lg font-bold text-gb-dark">
                    {fundData.benchmark}
                  </p>
                </div>
                <div className="bg-gb-light rounded-lg p-4 border border-gb-border">
                  <p className="text-sm text-gb-gray mb-1">Fecha Inicio</p>
                  <p className="text-lg font-bold text-gb-dark">
                    {fundData.inception_date}
                  </p>
                </div>
              </div>
            </div>

            {/* Tabs */}
            <div className="bg-white border border-gb-border rounded-lg overflow-hidden">
              <div className="flex border-b-2 border-gb-border">
                <button
                  onClick={() => setActiveTab("info")}
                  className={`flex-1 py-4 px-6 font-semibold transition-colors flex items-center justify-center gap-2 ${
                    activeTab === "info"
                      ? "bg-gb-black text-white"
                      : "text-gb-gray hover:bg-gb-light"
                  }`}
                >
                  <FileText className="w-5 h-5" />
                  Informacion General
                </button>
                <button
                  onClick={() => setActiveTab("metricas")}
                  className={`flex-1 py-4 px-6 font-semibold transition-colors flex items-center justify-center gap-2 ${
                    activeTab === "metricas"
                      ? "bg-gb-black text-white"
                      : "text-gb-gray hover:bg-gb-light"
                  }`}
                >
                  <BarChart3 className="w-5 h-5" />
                  Metricas
                </button>
                <button
                  onClick={() => setActiveTab("composicion")}
                  className={`flex-1 py-4 px-6 font-semibold transition-colors flex items-center justify-center gap-2 ${
                    activeTab === "composicion"
                      ? "bg-gb-black text-white"
                      : "text-gb-gray hover:bg-gb-light"
                  }`}
                >
                  <PieChartIcon className="w-5 h-5" />
                  Composicion
                </button>
              </div>

              <div className="p-8">
                {/* Tab 1: Informacion General */}
                {activeTab === "info" && (
                  <div className="space-y-8">
                    <div>
                      <h3 className="text-2xl font-bold text-gb-black mb-6">
                        Evolucion Historica vs Benchmark
                      </h3>
                      <div className="bg-gb-light rounded-lg p-6 border border-gb-border">
                        <ResponsiveContainer width="100%" height={400}>
                          <LineChart data={fundData.historical}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                            <XAxis
                              dataKey="date"
                              stroke="#64748b"
                              style={{ fontSize: "12px" }}
                            />
                            <YAxis stroke="#64748b" style={{ fontSize: "12px" }} />
                            <Tooltip
                              contentStyle={{
                                backgroundColor: "#1e293b",
                                border: "none",
                                borderRadius: "8px",
                                color: "#fff",
                              }}
                            />
                            <Legend />
                            <Line
                              type="monotone"
                              dataKey="fondo"
                              stroke="#2563eb"
                              strokeWidth={3}
                              name="Fondo"
                              dot={false}
                            />
                            <Line
                              type="monotone"
                              dataKey="benchmark"
                              stroke="#64748b"
                              strokeWidth={2}
                              strokeDasharray="5 5"
                              name="Benchmark"
                              dot={false}
                            />
                          </LineChart>
                        </ResponsiveContainer>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-6">
                      <div className="bg-gb-light rounded-lg p-6 border border-gb-border">
                        <h4 className="text-lg font-bold text-gb-black mb-4">
                          Informacion del Fondo
                        </h4>
                        <div className="space-y-3">
                          <div className="flex justify-between">
                            <span className="text-gb-gray">Manager:</span>
                            <span className="font-semibold text-gb-black">
                              {fundData.manager}
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-gb-gray">Experiencia:</span>
                            <span className="font-semibold text-gb-black">
                              {fundData.experiencia_anos} anos
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-gb-gray">Posiciones:</span>
                            <span className="font-semibold text-gb-black">
                              {fundData.num_posiciones}
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-gb-gray">Active Share:</span>
                            <span className="font-semibold text-gb-black">
                              {fundData.active_share.toFixed(2)}%
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="bg-gb-light rounded-lg p-6 border border-gb-border">
                        <h4 className="text-lg font-bold text-gb-black mb-4">
                          Costos
                        </h4>
                        <div className="space-y-3">
                          <div className="flex justify-between">
                            <span className="text-gb-gray">Expense Ratio:</span>
                            <span className="font-semibold text-gb-black">
                              {fundData.expense_ratio.toFixed(2)}% anual
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-gb-gray">Dividend Yield:</span>
                            <span className="font-semibold text-gb-black">
                              {fundData.dividend_yield.toFixed(2)}%
                            </span>
                          </div>
                        </div>

                        <div className="mt-6 p-4 bg-amber-50 rounded-lg border border-amber-200">
                          <p className="text-sm text-amber-800">
                            <strong>Impacto en $10M/20 anos:</strong>
                            <br />
                            Costos totales: ~
                            {formatCurrency(10000000 * (fundData.expense_ratio / 100) * 20)}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Tab 2: Metricas */}
                {activeTab === "metricas" && (
                  <div className="space-y-8">
                    <div>
                      <h3 className="text-2xl font-bold text-gb-black mb-6">
                        Metricas de Performance vs Benchmark
                      </h3>
                      <div className="grid grid-cols-3 gap-6">
                        <div
                          className={`rounded-lg p-6 ${
                            fundData.alpha > 0
                              ? "bg-green-50 border-2 border-green-300"
                              : "bg-red-50 border-2 border-red-300"
                          }`}
                        >
                          <p className="text-sm text-gb-gray mb-1">Alpha</p>
                          <p
                            className={`text-3xl font-bold ${
                              fundData.alpha > 0 ? "text-green-600" : "text-red-600"
                            }`}
                          >
                            {fundData.alpha > 0 ? "+" : ""}
                            {fundData.alpha.toFixed(2)}%
                          </p>
                          <p className="text-xs text-gb-gray mt-2">
                            {fundData.alpha > 0
                              ? "Manager agrega valor"
                              : "Underperformance"}
                          </p>
                        </div>

                        <div className="bg-gb-light rounded-lg p-6 border border-gb-border">
                          <p className="text-sm text-gb-gray mb-1">Beta</p>
                          <p className="text-3xl font-bold text-gb-accent">
                            {fundData.beta.toFixed(2)}
                          </p>
                          <p className="text-xs text-gb-gray mt-2">
                            {fundData.beta > 1
                              ? "Mas volatil que mercado"
                              : fundData.beta === 1
                              ? "Igual que mercado"
                              : "Menos volatil"}
                          </p>
                        </div>

                        <div className="bg-gb-light rounded-lg p-6 border border-gb-border">
                          <p className="text-sm text-gb-gray mb-1">Tracking Error</p>
                          <p className="text-3xl font-bold text-gb-dark">
                            {fundData.tracking_error.toFixed(2)}%
                          </p>
                          <p className="text-xs text-gb-gray mt-2">
                            {fundData.tracking_error < 2
                              ? "Bajo - Sigue bien"
                              : fundData.tracking_error < 5
                              ? "Moderado"
                              : "Alto - Muy diferente"}
                          </p>
                        </div>

                        <div className="bg-gb-light rounded-lg p-6 border border-gb-border">
                          <p className="text-sm text-gb-gray mb-1">Information Ratio</p>
                          <p className="text-3xl font-bold text-gb-dark">
                            {fundData.information_ratio.toFixed(2)}
                          </p>
                          <p className="text-xs text-gb-gray mt-2">
                            Alpha ajustado por riesgo
                          </p>
                        </div>

                        <div className="bg-gb-light rounded-lg p-6 border border-gb-border">
                          <p className="text-sm text-gb-gray mb-1">R-Squared</p>
                          <p className="text-3xl font-bold text-gb-dark">
                            {fundData.r_squared.toFixed(2)}
                          </p>
                          <p className="text-xs text-gb-gray mt-2">
                            Correlacion con benchmark
                          </p>
                        </div>

                        {fundData.sharpe_ratio !== null && (
                          <div className="bg-gb-light rounded-lg p-6 border border-gb-border">
                            <p className="text-sm text-gb-gray mb-1">Sharpe Ratio</p>
                            <p className="text-3xl font-bold text-gb-dark">
                              {fundData.sharpe_ratio.toFixed(2)}
                            </p>
                            <p className="text-xs text-gb-gray mt-2">
                              {fundData.sharpe_ratio > 2
                                ? "Excelente"
                                : fundData.sharpe_ratio > 1
                                ? "Bueno"
                                : "Moderado"}
                            </p>
                          </div>
                        )}
                      </div>
                    </div>

                    <div>
                      <h3 className="text-2xl font-bold text-gb-black mb-6">
                        Retornos Anualizados
                      </h3>
                      <div className="bg-gb-light rounded-lg p-6 border border-gb-border">
                        <table className="w-full">
                          <thead>
                            <tr className="border-b-2 border-gb-border">
                              <th className="text-left py-3 px-4 text-gb-dark font-bold">
                                Periodo
                              </th>
                              <th className="text-right py-3 px-4 text-gb-dark font-bold">
                                Fondo
                              </th>
                              <th className="text-right py-3 px-4 text-gb-dark font-bold">
                                Benchmark
                              </th>
                              <th className="text-right py-3 px-4 text-gb-dark font-bold">
                                Diferencia
                              </th>
                            </tr>
                          </thead>
                          <tbody>
                            {Object.entries(fundData.retornos).map(([period, data]) => {
                              const diff = data.fondo - data.benchmark;
                              return (
                                <tr key={period} className="border-b border-gb-border">
                                  <td className="py-4 px-4 font-semibold text-gb-black">
                                    {period.toUpperCase()}
                                  </td>
                                  <td className="text-right py-4 px-4 font-semibold text-gb-accent">
                                    {data.fondo > 0 ? "+" : ""}
                                    {data.fondo.toFixed(2)}%
                                  </td>
                                  <td className="text-right py-4 px-4 font-semibold text-gb-gray">
                                    {data.benchmark > 0 ? "+" : ""}
                                    {data.benchmark.toFixed(2)}%
                                  </td>
                                  <td
                                    className={`text-right py-4 px-4 font-bold ${
                                      diff > 0 ? "text-green-600" : "text-red-600"
                                    }`}
                                  >
                                    {diff > 0 ? "+" : ""}
                                    {diff.toFixed(2)}%
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                )}

                {/* Tab 3: Composicion */}
                {activeTab === "composicion" && (
                  <div className="space-y-8">
                    <div>
                      <h3 className="text-2xl font-bold text-gb-black mb-6">
                        Distribucion por Sectores
                      </h3>
                      <div className="grid grid-cols-2 gap-8">
                        <div className="bg-gb-light rounded-lg p-6 border border-gb-border">
                          <h4 className="text-lg font-bold text-gb-black mb-4 text-center">
                            Fondo
                          </h4>
                          <ResponsiveContainer width="100%" height={300}>
                            <PieChart>
                              <Pie
                                data={prepareSectorData(fundData.sectors.fondo)}
                                cx="50%"
                                cy="50%"
                                labelLine={false}
                                label={({ name, value }) =>
                                  `${name}: ${value.toFixed(1)}%`
                                }
                                outerRadius={80}
                                fill="#8884d8"
                                dataKey="value"
                              >
                                {prepareSectorData(fundData.sectors.fondo).map(
                                  (entry, index) => (
                                    <Cell
                                      key={`cell-${index}`}
                                      fill={SECTOR_COLORS[index % SECTOR_COLORS.length]}
                                    />
                                  )
                                )}
                              </Pie>
                              <Tooltip />
                            </PieChart>
                          </ResponsiveContainer>
                        </div>

                        <div className="bg-gb-light rounded-lg p-6 border border-gb-border">
                          <h4 className="text-lg font-bold text-gb-black mb-4 text-center">
                            Benchmark
                          </h4>
                          <ResponsiveContainer width="100%" height={300}>
                            <PieChart>
                              <Pie
                                data={prepareSectorData(fundData.sectors.benchmark)}
                                cx="50%"
                                cy="50%"
                                labelLine={false}
                                label={({ name, value }) =>
                                  `${name}: ${value.toFixed(1)}%`
                                }
                                outerRadius={80}
                                fill="#8884d8"
                                dataKey="value"
                              >
                                {prepareSectorData(fundData.sectors.benchmark).map(
                                  (entry, index) => (
                                    <Cell
                                      key={`cell-${index}`}
                                      fill={SECTOR_COLORS[index % SECTOR_COLORS.length]}
                                    />
                                  )
                                )}
                              </Pie>
                              <Tooltip />
                            </PieChart>
                          </ResponsiveContainer>
                        </div>
                      </div>

                      <div className="mt-6 bg-gb-light rounded-lg p-6 border border-gb-border">
                        <h4 className="text-lg font-bold text-gb-black mb-4">
                          Diferencias Clave vs Benchmark
                        </h4>
                        <div className="space-y-2">
                          {Object.entries(fundData.sectors.fondo)
                            .map(([sector, fondoPct]) => {
                              const benchmarkPct =
                                fundData.sectors.benchmark[sector] || 0;
                              const diff = fondoPct - benchmarkPct;
                              return { sector, diff };
                            })
                            .sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff))
                            .slice(0, 3)
                            .map(({ sector, diff }) => (
                              <div
                                key={sector}
                                className="flex items-center justify-between"
                              >
                                <span className="font-semibold text-gb-black">
                                  {sector}:
                                </span>
                                <span
                                  className={`font-bold ${
                                    diff > 0 ? "text-green-600" : "text-red-600"
                                  }`}
                                >
                                  {diff > 0 ? "Sobreponderado" : "Subponderado"}{" "}
                                  {Math.abs(diff).toFixed(1)} pp
                                </span>
                              </div>
                            ))}
                        </div>
                      </div>
                    </div>

                    <div>
                      <h3 className="text-2xl font-bold text-gb-black mb-6">
                        Top 10 Holdings
                      </h3>
                      <div className="bg-gb-light rounded-lg p-6 border border-gb-border">
                        <table className="w-full">
                          <thead>
                            <tr className="border-b-2 border-gb-border">
                              <th className="text-left py-3 px-4 text-gb-dark font-bold">
                                Holding
                              </th>
                              <th className="text-left py-3 px-4 text-gb-dark font-bold">
                                Empresa
                              </th>
                              <th className="text-right py-3 px-4 text-gb-dark font-bold">
                                Fondo
                              </th>
                              <th className="text-right py-3 px-4 text-gb-dark font-bold">
                                Benchmark
                              </th>
                              <th className="text-right py-3 px-4 text-gb-dark font-bold">
                                Diferencia
                              </th>
                            </tr>
                          </thead>
                          <tbody>
                            {fundData.holdings.slice(0, 10).map((holding, index) => {
                              const diff = holding.fondo - holding.benchmark;
                              return (
                                <tr key={index} className="border-b border-gb-border">
                                  <td className="py-4 px-4 font-bold text-gb-accent">
                                    {holding.ticker}
                                  </td>
                                  <td className="py-4 px-4 text-gb-dark">
                                    {holding.name}
                                  </td>
                                  <td className="text-right py-4 px-4 font-semibold text-gb-black">
                                    {holding.fondo.toFixed(2)}%
                                  </td>
                                  <td className="text-right py-4 px-4 text-gb-gray">
                                    {holding.benchmark.toFixed(2)}%
                                  </td>
                                  <td
                                    className={`text-right py-4 px-4 font-bold ${
                                      diff > 0 ? "text-green-600" : "text-gb-gray"
                                    }`}
                                  >
                                    {diff > 0 ? "+" : ""}
                                    {diff.toFixed(2)} pp
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>

                        <div className="mt-6 p-4 bg-gb-light rounded-lg border border-gb-border">
                          <p className="text-sm text-gb-dark">
                            <strong>Concentracion:</strong> Top 10 representa{" "}
                            {fundData.holdings
                              .slice(0, 10)
                              .reduce((sum, h) => sum + h.fondo, 0)
                              .toFixed(2)}
                            % del fondo
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
