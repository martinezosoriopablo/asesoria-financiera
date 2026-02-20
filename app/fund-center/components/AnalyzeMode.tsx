// app/fund-center/components/AnalyzeMode.tsx
// Modo Análisis: Analizar PDFs de fondos

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
import { MOCK_FUND_DATA } from "@/components/analisis/MOCK_FUND_DATA";

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
  "#2563eb", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6",
  "#ec4899", "#06b6d4", "#f97316", "#84cc16", "#6366f1",
];

export default function AnalyzeMode() {
  const [fundData, setFundData] = useState<FundData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const handleFileUpload = async (file: File) => {
    if (file.type !== "application/pdf") {
      setError("Por favor sube un archivo PDF válido");
      return;
    }

    setLoading(true);
    setError(null);

    // Simular carga con datos de ejemplo
    setTimeout(() => {
      setFundData(MOCK_FUND_DATA as FundData);
      setLoading(false);
    }, 1500);
  };

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
    if (file) handleFileUpload(file);
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFileUpload(file);
  };

  const formatCurrency = (value: number): string => {
    if (value >= 1e9) return `$${(value / 1e9).toFixed(1)}B`;
    if (value >= 1e6) return `$${(value / 1e6).toFixed(1)}M`;
    return `$${value.toLocaleString()}`;
  };

  const prepareSectorData = (sectors: { [key: string]: number }) => {
    return Object.entries(sectors).map(([name, value]) => ({ name, value }));
  };

  return (
    <div className="space-y-6">
      {/* Upload Section */}
      {!fundData && (
        <div className="bg-white border border-gb-border rounded-lg p-8">
          <div className="text-center mb-6">
            <FileText className="w-12 h-12 text-gb-gray mx-auto mb-3" />
            <h2 className="text-lg font-semibold text-gb-black mb-1">
              Analizador de Fondos
            </h2>
            <p className="text-sm text-gb-gray">
              Sube un PDF de factsheet para analizar el fondo
            </p>
          </div>

          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className={`border-2 border-dashed rounded-lg p-12 text-center transition-colors ${
              isDragging
                ? "border-gb-accent bg-blue-50"
                : "border-gb-border hover:border-gb-gray"
            }`}
          >
            <Upload className="w-10 h-10 text-gb-gray mx-auto mb-4" />
            <p className="text-sm text-gb-dark mb-2">
              Arrastra un PDF aquí o
            </p>
            <label className="inline-block">
              <span className="px-4 py-2 bg-gb-black text-white text-sm font-medium rounded-lg cursor-pointer hover:bg-gb-dark transition-colors">
                Seleccionar archivo
              </span>
              <input
                type="file"
                accept=".pdf"
                onChange={handleFileInputChange}
                className="hidden"
              />
            </label>
          </div>

          {loading && (
            <div className="mt-6 flex items-center justify-center gap-3">
              <div className="w-5 h-5 border-2 border-gb-accent border-t-transparent rounded-full animate-spin" />
              <span className="text-sm text-gb-gray">Analizando PDF...</span>
            </div>
          )}

          {error && (
            <div className="mt-6 p-4 bg-red-50 border border-red-200 rounded-lg flex items-center gap-3">
              <AlertCircle className="w-5 h-5 text-red-500" />
              <span className="text-sm text-red-700">{error}</span>
            </div>
          )}

          {/* Demo button */}
          <div className="mt-6 text-center">
            <button
              onClick={() => {
                setLoading(true);
                setTimeout(() => {
                  setFundData(MOCK_FUND_DATA as FundData);
                  setLoading(false);
                }, 1000);
              }}
              className="text-sm text-gb-accent hover:underline"
            >
              Ver demo con datos de ejemplo
            </button>
          </div>
        </div>
      )}

      {/* Results */}
      {fundData && (
        <div className="space-y-6">
          {/* Fund Header */}
          <div className="bg-white border border-gb-border rounded-lg p-6">
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-xl font-bold text-gb-black mb-1">
                  {fundData.nombre}
                </h2>
                <p className="text-sm text-gb-gray">
                  Manager: {fundData.manager} ({fundData.experiencia_anos} años)
                </p>
                <p className="text-sm text-gb-gray">
                  Benchmark: {fundData.benchmark}
                </p>
              </div>
              <button
                onClick={() => setFundData(null)}
                className="text-sm text-gb-gray hover:text-gb-black"
              >
                Analizar otro
              </button>
            </div>

            {/* Key Metrics */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6">
              <div className="p-3 bg-gb-light rounded-lg">
                <p className="text-xs text-gb-gray mb-1">AUM</p>
                <p className="text-lg font-bold text-gb-black">
                  {formatCurrency(fundData.aum)}
                </p>
              </div>
              <div className="p-3 bg-gb-light rounded-lg">
                <p className="text-xs text-gb-gray mb-1">Expense Ratio</p>
                <p className="text-lg font-bold text-gb-black">
                  {fundData.expense_ratio}%
                </p>
              </div>
              <div className="p-3 bg-gb-light rounded-lg">
                <p className="text-xs text-gb-gray mb-1">Alpha</p>
                <p className={`text-lg font-bold ${fundData.alpha >= 0 ? "text-green-600" : "text-red-600"}`}>
                  {fundData.alpha >= 0 ? "+" : ""}{fundData.alpha}%
                </p>
              </div>
              <div className="p-3 bg-gb-light rounded-lg">
                <p className="text-xs text-gb-gray mb-1">Sharpe Ratio</p>
                <p className="text-lg font-bold text-gb-black">
                  {fundData.sharpe_ratio || "N/A"}
                </p>
              </div>
            </div>
          </div>

          {/* Performance Chart */}
          <div className="bg-white border border-gb-border rounded-lg p-6">
            <h3 className="text-base font-semibold text-gb-black mb-4">
              Rendimiento Histórico
            </h3>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={fundData.historical}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} stroke="#9ca3af" />
                  <YAxis tick={{ fontSize: 11 }} stroke="#9ca3af" />
                  <Tooltip />
                  <Legend />
                  <Line
                    type="monotone"
                    dataKey="fondo"
                    name="Fondo"
                    stroke="#2563eb"
                    strokeWidth={2}
                    dot={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="benchmark"
                    name="Benchmark"
                    stroke="#9ca3af"
                    strokeWidth={2}
                    dot={false}
                    strokeDasharray="5 5"
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Returns Table */}
          <div className="bg-white border border-gb-border rounded-lg p-6">
            <h3 className="text-base font-semibold text-gb-black mb-4">
              Retornos por Período
            </h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gb-border">
                    <th className="py-2 text-left font-medium text-gb-gray">Período</th>
                    <th className="py-2 text-right font-medium text-gb-gray">Fondo</th>
                    <th className="py-2 text-right font-medium text-gb-gray">Benchmark</th>
                    <th className="py-2 text-right font-medium text-gb-gray">Diferencia</th>
                  </tr>
                </thead>
                <tbody>
                  {(["1y", "3y", "5y", "10y"] as const).map((period) => {
                    const data = fundData.retornos[period];
                    const diff = data.fondo - data.benchmark;
                    return (
                      <tr key={period} className="border-b border-gb-border">
                        <td className="py-3 font-medium text-gb-black">
                          {period === "1y" ? "1 Año" : period === "3y" ? "3 Años" : period === "5y" ? "5 Años" : "10 Años"}
                        </td>
                        <td className={`py-3 text-right font-semibold ${data.fondo >= 0 ? "text-green-600" : "text-red-600"}`}>
                          {data.fondo >= 0 ? "+" : ""}{data.fondo.toFixed(2)}%
                        </td>
                        <td className="py-3 text-right text-gb-gray">
                          {data.benchmark >= 0 ? "+" : ""}{data.benchmark.toFixed(2)}%
                        </td>
                        <td className={`py-3 text-right font-semibold ${diff >= 0 ? "text-green-600" : "text-red-600"}`}>
                          {diff >= 0 ? "+" : ""}{diff.toFixed(2)} pp
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Risk Metrics */}
          <div className="bg-white border border-gb-border rounded-lg p-6">
            <h3 className="text-base font-semibold text-gb-black mb-4">
              Métricas de Riesgo
            </h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="p-3 bg-gb-light rounded-lg text-center">
                <p className="text-xs text-gb-gray mb-1">Beta</p>
                <p className="text-lg font-bold text-gb-black">{fundData.beta}</p>
              </div>
              <div className="p-3 bg-gb-light rounded-lg text-center">
                <p className="text-xs text-gb-gray mb-1">Tracking Error</p>
                <p className="text-lg font-bold text-gb-black">{fundData.tracking_error}%</p>
              </div>
              <div className="p-3 bg-gb-light rounded-lg text-center">
                <p className="text-xs text-gb-gray mb-1">Information Ratio</p>
                <p className="text-lg font-bold text-gb-black">{fundData.information_ratio}</p>
              </div>
              <div className="p-3 bg-gb-light rounded-lg text-center">
                <p className="text-xs text-gb-gray mb-1">R²</p>
                <p className="text-lg font-bold text-gb-black">{(fundData.r_squared * 100).toFixed(0)}%</p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
