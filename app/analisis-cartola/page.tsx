"use client";

import { useState, useRef, DragEvent } from "react";
import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import {
  classifyPortfolio,
  type PortfolioComposition,
  type ParsedHolding,
} from "@/lib/portfolio/fund_classifier";

interface ParsedStatement {
  clientName: string;
  accountNumber: string;
  period: string;
  beginningValue: number;
  endingValue: number;
  fees: number;
  cashBalance: number;
  holdings: ParsedHolding[];
}

const COLORS = [
  "#2563eb",
  "#16a34a",
  "#eab308",
  "#dc2626",
  "#9333ea",
  "#f97316",
  "#06b6d4",
  "#ec4899",
];

export default function AnalisisCartolaPage() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statement, setStatement] = useState<ParsedStatement | null>(null);
  const [composition, setComposition] = useState<PortfolioComposition | null>(null);
  const [email, setEmail] = useState("");
  const [dragActive, setDragActive] = useState(false);
  const [sendingQuestionnaire, setSendingQuestionnaire] = useState(false);
  const [questionnaireSent, setQuestionnaireSent] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function sendQuestionnaire() {
    if (!email) return;
    setSendingQuestionnaire(true);
    setQuestionnaireSent(false);
    try {
      const res = await fetch("/api/send-questionnaire", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      if (!res.ok) throw new Error();
      setQuestionnaireSent(true);
    } catch {
      alert("Error enviando el cuestionario");
    } finally {
      setSendingQuestionnaire(false);
    }
  }

  async function processFile(file: File) {
    setLoading(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch("/api/parse-portfolio-statement", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Error al procesar el PDF");
      }

      const data: ParsedStatement = await res.json();
      setStatement(data);
      setComposition(classifyPortfolio(data.holdings, data.cashBalance));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error desconocido");
    } finally {
      setLoading(false);
    }
  }

  function handleDrag(e: DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  }

  function handleDrop(e: DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files?.[0]) {
      processFile(e.dataTransfer.files[0]);
    }
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    if (e.target.files?.[0]) {
      processFile(e.target.files[0]);
    }
  }

  const assetClassData = composition
    ? Object.entries(composition.byAssetClass).map(([name, d]) => ({
        name,
        value: Math.round(d.value * 100) / 100,
        percent: Math.round(d.percent * 10) / 10,
      }))
    : [];

  const regionData = composition
    ? Object.entries(composition.byRegion).map(([name, d]) => ({
        name,
        value: Math.round(d.value * 100) / 100,
        percent: Math.round(d.percent * 10) / 10,
      }))
    : [];

  const totalGainLoss = statement
    ? statement.holdings.reduce((s, h) => s + h.unrealizedGainLoss, 0)
    : 0;

  return (
    <div className="min-h-screen bg-gray-50 p-6 md:p-10">
      <div className="mx-auto max-w-6xl space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-gray-900">
            Análisis de Cartola
          </h1>
          <p className="text-gray-500 mt-1">
            Sube la cartola o estado de cuenta del cliente para analizar la composición de su portafolio
          </p>
        </div>

        {/* Upload */}
        <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
          <h2 className="text-lg font-semibold text-gray-900">Subir Cartola del Cliente</h2>
          <p className="text-sm text-gray-500">Arrastra el PDF de la cartola o estado de cuenta, o haz clic para seleccionar</p>

          <div
            onDragEnter={handleDrag}
            onDragLeave={handleDrag}
            onDragOver={handleDrag}
            onDrop={handleDrop}
            onClick={() => inputRef.current?.click()}
            className={`border-2 border-dashed rounded-lg p-10 text-center cursor-pointer transition-colors ${
              dragActive
                ? "border-blue-500 bg-blue-50"
                : "border-gray-300 hover:border-blue-400"
            }`}
          >
            <input
              ref={inputRef}
              type="file"
              accept=".pdf"
              onChange={handleChange}
              className="hidden"
            />
            {loading ? (
              <div className="flex flex-col items-center gap-2">
                <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-500 border-t-transparent" />
                <p className="text-sm text-gray-500">Procesando PDF con IA...</p>
              </div>
            ) : dragActive ? (
              <p className="text-blue-600">Suelta el archivo aquí</p>
            ) : (
              <p className="text-gray-500">Arrastra la cartola PDF del cliente aquí, o haz clic para seleccionar</p>
            )}
          </div>

          <div className="flex items-center gap-3">
            <input
              type="email"
              placeholder="Email del cliente (opcional)"
              value={email}
              onChange={(e) => { setEmail(e.target.value); setQuestionnaireSent(false); }}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm max-w-sm w-full focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <button
              type="button"
              onClick={sendQuestionnaire}
              disabled={!email || sendingQuestionnaire}
              className="whitespace-nowrap px-4 py-2 text-sm font-medium rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {sendingQuestionnaire ? "Enviando..." : questionnaireSent ? "Enviado" : "Enviar cuestionario"}
            </button>
          </div>

          {error && <p className="text-sm text-red-600">Error: {error}</p>}
        </div>

        {/* Results */}
        {statement && composition && (
          <>
            {/* Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              {[
                {
                  label: "Valor Total",
                  value: `$${composition.totalValue.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
                },
                {
                  label: "Gain/Loss Total",
                  value: `${totalGainLoss >= 0 ? "+" : ""}$${totalGainLoss.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
                  color: totalGainLoss >= 0 ? "text-green-600" : "text-red-600",
                },
                { label: "# Fondos", value: String(statement.holdings.length) },
                { label: "Período", value: statement.period || "N/A" },
              ].map((card) => (
                <div key={card.label} className="bg-white rounded-xl border border-gray-200 p-5">
                  <p className="text-sm text-gray-500">{card.label}</p>
                  <p className={`text-2xl font-bold ${card.color || "text-gray-900"}`}>
                    {card.value}
                  </p>
                </div>
              ))}
            </div>

            {/* Holdings Table */}
            <div className="bg-white rounded-xl border border-gray-200 p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-1">Holdings</h2>
              <p className="text-sm text-gray-500 mb-4">
                {statement.clientName && `Cliente: ${statement.clientName}`}
                {statement.accountNumber && ` — Cuenta: ${statement.accountNumber}`}
              </p>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-gray-500">
                      <th className="pb-2 pr-4">Fondo</th>
                      <th className="pb-2 pr-4 text-right">Market Value</th>
                      <th className="pb-2 pr-4 text-right">% Portfolio</th>
                      <th className="pb-2 pr-4 text-right">Gain/Loss</th>
                      <th className="pb-2">Asset Class</th>
                      <th className="pb-2">Región</th>
                    </tr>
                  </thead>
                  <tbody>
                    {composition.holdings.map((h, i) => (
                      <tr key={i} className="border-b last:border-0">
                        <td className="py-2 pr-4">
                          <div className="font-medium text-gray-900">{h.fundName}</div>
                          <div className="text-xs text-gray-400">{h.securityId}</div>
                        </td>
                        <td className="py-2 pr-4 text-right tabular-nums">
                          ${h.marketValue.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </td>
                        <td className="py-2 pr-4 text-right tabular-nums">
                          {h.percentOfPortfolio.toFixed(1)}%
                        </td>
                        <td className={`py-2 pr-4 text-right tabular-nums ${h.unrealizedGainLoss >= 0 ? "text-green-600" : "text-red-600"}`}>
                          {h.unrealizedGainLoss >= 0 ? "+" : ""}
                          ${h.unrealizedGainLoss.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </td>
                        <td className="py-2">
                          <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${
                            h.assetClass === "Equity"
                              ? "bg-blue-100 text-blue-700"
                              : h.assetClass === "Fixed Income"
                              ? "bg-green-100 text-green-700"
                              : "bg-gray-100 text-gray-700"
                          }`}>
                            {h.assetClass}
                          </span>
                        </td>
                        <td className="py-2 text-gray-500">{h.region}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Charts */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="bg-white rounded-xl border border-gray-200 p-6">
                <h2 className="text-lg font-semibold text-gray-900 mb-4">Por Asset Class</h2>
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie
                      data={assetClassData}
                      cx="50%"
                      cy="50%"
                      outerRadius={100}
                      dataKey="value"
                      label={({ name, percent }) => `${name} ${percent}%`}
                    >
                      {assetClassData.map((_, i) => (
                        <Cell key={i} fill={COLORS[i % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(value) =>
                        `$${Number(value).toLocaleString("en-US", { minimumFractionDigits: 2 })}`
                      }
                    />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              </div>

              <div className="bg-white rounded-xl border border-gray-200 p-6">
                <h2 className="text-lg font-semibold text-gray-900 mb-4">Por Región</h2>
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie
                      data={regionData}
                      cx="50%"
                      cy="50%"
                      outerRadius={100}
                      dataKey="value"
                      label={({ name, percent }) => `${name} ${percent}%`}
                    >
                      {regionData.map((_, i) => (
                        <Cell key={i} fill={COLORS[i % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(value) =>
                        `$${Number(value).toLocaleString("en-US", { minimumFractionDigits: 2 })}`
                      }
                    />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Benchmark Comparison */}
            {email && (
              <div className="bg-white rounded-xl border border-gray-200 p-6">
                <h2 className="text-lg font-semibold text-gray-900 mb-1">Comparación vs Benchmark</h2>
                <p className="text-sm text-gray-500 mb-4">Perfil de riesgo del cliente: {email}</p>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-left text-gray-500">
                        <th className="pb-2 pr-4">Asset Class</th>
                        <th className="pb-2 pr-4 text-right">Actual %</th>
                        <th className="pb-2 pr-4 text-right">Target %</th>
                        <th className="pb-2 text-right">Diferencia</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[
                        { name: "Equity", target: 50 },
                        { name: "Fixed Income", target: 40 },
                        { name: "Cash", target: 10 },
                      ].map((row) => {
                        const actual = composition.byAssetClass[row.name]?.percent ?? 0;
                        const diff = actual - row.target;
                        return (
                          <tr key={row.name} className="border-b last:border-0">
                            <td className="py-2 pr-4 font-medium text-gray-900">{row.name}</td>
                            <td className="py-2 pr-4 text-right tabular-nums">{actual.toFixed(1)}%</td>
                            <td className="py-2 pr-4 text-right tabular-nums">{row.target}%</td>
                            <td className={`py-2 text-right tabular-nums font-medium ${
                              Math.abs(diff) > 5 ? (diff > 0 ? "text-amber-600" : "text-blue-600") : "text-gray-900"
                            }`}>
                              {diff >= 0 ? "+" : ""}{diff.toFixed(1)}%
                              {Math.abs(diff) > 5 && (
                                <span className="ml-1 text-xs">
                                  {diff > 0 ? "overweight" : "underweight"}
                                </span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <p className="mt-4 text-xs text-gray-400">
                  * Benchmark moderado por defecto (50/40/10). Conectar con perfil de riesgo del cliente para personalizar.
                </p>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
