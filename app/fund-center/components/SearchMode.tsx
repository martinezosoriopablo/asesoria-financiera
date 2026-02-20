// app/fund-center/components/SearchMode.tsx
// Modo Búsqueda: Buscar fondos y ETFs internacionales

"use client";

import React, { useState } from "react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";
import {
  Search,
  Loader,
  TrendingUp,
  TrendingDown,
  Globe,
  DollarSign,
  BarChart3,
} from "lucide-react";

// ============================================================
// POPULAR FUNDS
// ============================================================

const POPULAR_FUNDS = [
  { ticker: "VTI", name: "Vanguard Total Stock Market ETF" },
  { ticker: "VOO", name: "Vanguard S&P 500 ETF" },
  { ticker: "VEA", name: "Vanguard FTSE Developed Markets ETF" },
  { ticker: "VWO", name: "Vanguard FTSE Emerging Markets ETF" },
  { ticker: "BND", name: "Vanguard Total Bond Market ETF" },
  { ticker: "VXUS", name: "Vanguard Total International Stock ETF" },
  { ticker: "AGG", name: "iShares Core US Aggregate Bond ETF" },
  { ticker: "EEM", name: "iShares MSCI Emerging Markets ETF" },
  { ticker: "IVV", name: "iShares Core S&P 500 ETF" },
  { ticker: "SCHD", name: "Schwab US Dividend Equity ETF" },
  { ticker: "QQQ", name: "Invesco QQQ Trust" },
  { ticker: "SPY", name: "SPDR S&P 500 ETF Trust" },
];

// ============================================================
// TYPES
// ============================================================

interface FundData {
  ticker: string;
  name: string;
  price: number;
  change1Y: number;
  change5Y: number;
  expenseRatio: number;
  dividendYield: number;
  historical: { date: string; value: number }[];
  dataPoints: number;
}

// ============================================================
// COMPONENT
// ============================================================

export default function SearchMode() {
  const [searchTicker, setSearchTicker] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fundData, setFundData] = useState<FundData | null>(null);
  const [period, setPeriod] = useState<string>("5y");
  const [searchHistory, setSearchHistory] = useState<FundData[]>([]);

  const searchFund = async (ticker?: string) => {
    const t = (ticker || searchTicker).trim().toUpperCase();
    if (!t) return;

    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/etf/${t}?period=${period}`);
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Error al obtener datos del fondo");
      }

      setFundData(data);
      // Add to history if not already there
      setSearchHistory((prev) => {
        const exists = prev.find((f) => f.ticker === data.ticker);
        if (exists) return prev;
        return [data, ...prev].slice(0, 5);
      });
    } catch (err: any) {
      setError(err.message);
      setFundData(null);
    } finally {
      setLoading(false);
    }
  };

  const fmt = (n: number) => n.toLocaleString("es-CL", { maximumFractionDigits: 2 });

  return (
    <div className="space-y-6">
      {/* Search */}
        <div className="bg-white border border-gb-border rounded-lg p-6 mb-6">
          <div className="flex gap-3 mb-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gb-gray" />
              <input
                type="text"
                value={searchTicker}
                onChange={(e) => setSearchTicker(e.target.value.toUpperCase())}
                onKeyDown={(e) => e.key === "Enter" && searchFund()}
                placeholder="Ingresa ticker (ej: VOO, VTI, QQQ)"
                className="w-full pl-10 pr-4 py-2.5 border border-gb-border rounded-lg text-sm focus:border-gb-accent focus:outline-none"
              />
            </div>

            {/* Period selector */}
            <select
              value={period}
              onChange={(e) => setPeriod(e.target.value)}
              className="border border-gb-border rounded-lg px-3 py-2.5 text-sm focus:border-gb-accent focus:outline-none"
            >
              <option value="1y">1 Año</option>
              <option value="5y">5 Años</option>
              <option value="10y">10 Años</option>
              <option value="max">Máximo</option>
            </select>

            <button
              onClick={() => searchFund()}
              disabled={loading || !searchTicker.trim()}
              className="px-5 py-2.5 bg-gb-black text-white text-sm font-medium rounded-lg hover:bg-gb-dark transition-colors disabled:bg-gb-border disabled:text-gb-gray disabled:cursor-not-allowed flex items-center gap-2"
            >
              {loading ? <Loader className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
              {loading ? "Buscando..." : "Buscar"}
            </button>
          </div>

          {/* Popular funds */}
          <div>
            <p className="text-xs text-gb-gray mb-2">Fondos populares:</p>
            <div className="flex flex-wrap gap-1.5">
              {POPULAR_FUNDS.map((f) => (
                <button
                  key={f.ticker}
                  onClick={() => {
                    setSearchTicker(f.ticker);
                    searchFund(f.ticker);
                  }}
                  disabled={loading}
                  className="px-2.5 py-1 text-xs border border-gb-border rounded-md hover:bg-gb-light transition-colors disabled:opacity-50"
                  title={f.name}
                >
                  {f.ticker}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
            <p className="text-sm text-red-800">{error}</p>
            <p className="text-xs text-red-600 mt-1">
              Alpha Vantage tiene un límite de 5 requests/minuto. Espera un momento e intenta de nuevo.
            </p>
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div className="bg-white border border-gb-border rounded-lg p-12 mb-6 flex flex-col items-center gap-3">
            <Loader className="w-8 h-8 animate-spin text-gb-gray" />
            <p className="text-sm text-gb-gray">Obteniendo datos del fondo... esto puede tardar unos segundos</p>
          </div>
        )}

        {/* Fund Data */}
        {fundData && !loading && (
          <div className="space-y-6">
            {/* Fund Header */}
            <div className="bg-white border border-gb-border rounded-lg p-6">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <div className="flex items-center gap-3">
                    <Globe className="w-5 h-5 text-gb-gray" />
                    <h2 className="text-lg font-semibold text-gb-black">{fundData.ticker}</h2>
                  </div>
                  <p className="text-sm text-gb-gray mt-1">{fundData.name}</p>
                </div>
                <div className="text-right">
                  <p className="text-2xl font-semibold text-gb-black">
                    USD ${fmt(fundData.price)}
                  </p>
                </div>
              </div>

              {/* Key Metrics */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-gb-light rounded-lg p-3">
                  <div className="flex items-center gap-1.5 mb-1">
                    {fundData.change1Y >= 0 ? (
                      <TrendingUp className="w-3.5 h-3.5 text-emerald-600" />
                    ) : (
                      <TrendingDown className="w-3.5 h-3.5 text-red-600" />
                    )}
                    <span className="text-xs text-gb-gray">Retorno 1A</span>
                  </div>
                  <p className={`text-lg font-semibold ${fundData.change1Y >= 0 ? "text-emerald-700" : "text-red-600"}`}>
                    {fundData.change1Y >= 0 ? "+" : ""}{fundData.change1Y.toFixed(2)}%
                  </p>
                </div>

                <div className="bg-gb-light rounded-lg p-3">
                  <div className="flex items-center gap-1.5 mb-1">
                    <BarChart3 className="w-3.5 h-3.5 text-gb-gray" />
                    <span className="text-xs text-gb-gray">Retorno {period === "1y" ? "1A" : period === "5y" ? "5A" : period === "10y" ? "10A" : "Total"}</span>
                  </div>
                  <p className={`text-lg font-semibold ${fundData.change5Y >= 0 ? "text-emerald-700" : "text-red-600"}`}>
                    {fundData.change5Y >= 0 ? "+" : ""}{fundData.change5Y.toFixed(2)}%
                  </p>
                </div>

                <div className="bg-gb-light rounded-lg p-3">
                  <div className="flex items-center gap-1.5 mb-1">
                    <DollarSign className="w-3.5 h-3.5 text-gb-gray" />
                    <span className="text-xs text-gb-gray">Expense Ratio</span>
                  </div>
                  <p className="text-lg font-semibold text-gb-black">
                    {fundData.expenseRatio > 0 ? `${(fundData.expenseRatio * 100).toFixed(2)}%` : "N/D"}
                  </p>
                </div>

                <div className="bg-gb-light rounded-lg p-3">
                  <div className="flex items-center gap-1.5 mb-1">
                    <DollarSign className="w-3.5 h-3.5 text-gb-gray" />
                    <span className="text-xs text-gb-gray">Dividend Yield</span>
                  </div>
                  <p className="text-lg font-semibold text-gb-black">
                    {fundData.dividendYield > 0 ? `${(fundData.dividendYield * 100).toFixed(2)}%` : "N/D"}
                  </p>
                </div>
              </div>
            </div>

            {/* Chart */}
            {fundData.historical.length > 0 && (
              <div className="bg-white border border-gb-border rounded-lg p-6">
                <h3 className="text-base font-semibold text-gb-black mb-4">
                  NAV Histórico — {fundData.dataPoints} datos
                </h3>
                <div className="h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={fundData.historical}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                      <XAxis
                        dataKey="date"
                        tick={{ fontSize: 11, fill: "#6b7280" }}
                        tickFormatter={(d) => {
                          const date = new Date(d);
                          return `${date.getMonth() + 1}/${date.getFullYear().toString().slice(2)}`;
                        }}
                        interval="preserveStartEnd"
                        minTickGap={60}
                      />
                      <YAxis
                        tick={{ fontSize: 11, fill: "#6b7280" }}
                        domain={["auto", "auto"]}
                        tickFormatter={(v) => `$${v.toFixed(0)}`}
                      />
                      <Tooltip
                        contentStyle={{ fontSize: 13, borderRadius: 8, border: "1px solid #e5e7eb" }}
                        formatter={(value) => [`$${Number(value).toFixed(2)}`, "NAV"]}
                        labelFormatter={(label) => new Date(label).toLocaleDateString("es-CL")}
                      />
                      <Line
                        type="monotone"
                        dataKey="value"
                        stroke="#1a1a1a"
                        strokeWidth={1.5}
                        dot={false}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Recent Searches */}
        {searchHistory.length > 0 && !loading && (
          <div className="mt-6 bg-white border border-gb-border rounded-lg p-6">
            <h3 className="text-sm font-semibold text-gb-dark mb-3">Búsquedas Recientes</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gb-border">
                    <th className="text-left py-2 font-medium text-gb-gray">Ticker</th>
                    <th className="text-left py-2 font-medium text-gb-gray">Nombre</th>
                    <th className="text-right py-2 font-medium text-gb-gray">Precio</th>
                    <th className="text-right py-2 font-medium text-gb-gray">1A</th>
                    <th className="text-right py-2 font-medium text-gb-gray">TER</th>
                    <th className="text-right py-2 font-medium text-gb-gray"></th>
                  </tr>
                </thead>
                <tbody>
                  {searchHistory.map((f) => (
                    <tr key={f.ticker} className="border-b border-gb-border last:border-b-0">
                      <td className="py-2 font-medium text-gb-black">{f.ticker}</td>
                      <td className="py-2 text-gb-gray">{f.name}</td>
                      <td className="py-2 text-right">${fmt(f.price)}</td>
                      <td className={`py-2 text-right font-medium ${f.change1Y >= 0 ? "text-emerald-700" : "text-red-600"}`}>
                        {f.change1Y >= 0 ? "+" : ""}{f.change1Y.toFixed(2)}%
                      </td>
                      <td className="py-2 text-right text-gb-gray">
                        {f.expenseRatio > 0 ? `${(f.expenseRatio * 100).toFixed(2)}%` : "—"}
                      </td>
                      <td className="py-2 text-right">
                        <button
                          onClick={() => {
                            setSearchTicker(f.ticker);
                            searchFund(f.ticker);
                          }}
                          className="text-xs text-gb-dark underline hover:text-gb-black"
                        >
                          Ver
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
    </div>
  );
}
