"use client";

import { useEffect, useState } from "react";
import PortalTopbar from "@/components/portal/PortalTopbar";
import {
  Loader,
  TrendingUp,
  TrendingDown,
  Minus,
  PieChart,
  Calendar,
  Target,
} from "lucide-react";

interface Snapshot {
  id: string;
  snapshot_date: string;
  total_value: number;
  equity_percent: number;
  fixed_income_percent: number;
  alternatives_percent: number;
  cash_percent: number;
  twr_cumulative: number | null;
  twr_period: number | null;
  holdings: Array<{
    nombre: string;
    tipo: string;
    valor: number;
    porcentaje: number;
  }>;
}

interface HistoryPoint {
  date: string;
  value: number;
  twr: number | null;
}

interface CarteraRecomendada {
  cartera: Array<{
    ticker: string;
    nombre: string;
    clase: string;
    porcentaje: number;
  }>;
  generadoEn?: string;
  guardadoEn?: string;
}

interface ClientInfo {
  id: string;
  nombre: string;
  apellido: string;
  email: string;
}

export default function PortalDashboardPage() {
  const [loading, setLoading] = useState(true);
  const [clientInfo, setClientInfo] = useState<ClientInfo | null>(null);
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [history, setHistory] = useState<HistoryPoint[]>([]);
  const [benchmark, setBenchmark] = useState<Record<string, number> | null>(null);
  const [carteraRecomendada, setCarteraRecomendada] = useState<CarteraRecomendada | null>(null);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [meRes, portfolioRes] = await Promise.all([
        fetch("/api/portal/me"),
        fetch("/api/portal/portfolio"),
      ]);

      if (meRes.ok) {
        const meData = await meRes.json();
        setClientInfo(meData.client);
      }

      if (portfolioRes.ok) {
        const pData = await portfolioRes.json();
        setSnapshot(pData.snapshot || null);
        setHistory(pData.history || []);
        setBenchmark(pData.benchmark || null);
        setCarteraRecomendada(pData.carteraRecomendada || null);
      }
    } catch (err) {
      console.error("Error fetching dashboard:", err);
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat("es-CL", {
      style: "currency",
      currency: "CLP",
      minimumFractionDigits: 0,
    }).format(amount);

  const formatPercent = (value: number | null) => {
    if (value === null || value === undefined) return "—";
    const sign = value > 0 ? "+" : "";
    return `${sign}${value.toFixed(2)}%`;
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gb-light flex items-center justify-center">
        <Loader className="w-6 h-6 text-gb-gray animate-spin" />
      </div>
    );
  }

  if (!clientInfo) {
    return (
      <div className="min-h-screen bg-gb-light flex items-center justify-center">
        <p className="text-gb-gray">Error cargando datos</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gb-light">
      <PortalTopbar
        clientName={`${clientInfo.nombre} ${clientInfo.apellido}`}
        clientEmail={clientInfo.email}
      />

      <main className="max-w-3xl mx-auto px-6 py-8">
        <h1 className="text-2xl font-semibold text-gb-black mb-6">Mi Portafolio</h1>

        {!snapshot ? (
          <div className="bg-white rounded-lg border border-gb-border p-8 text-center">
            <PieChart className="w-12 h-12 text-gb-border mx-auto mb-3" />
            <h2 className="text-base font-semibold text-gb-black mb-1">
              Portafolio pendiente
            </h2>
            <p className="text-sm text-gb-gray">
              Tu asesor aún no ha cargado tu cartola. Una vez disponible, podrás ver
              aquí tu composición, rendimientos y evolución.
            </p>
          </div>
        ) : (
          <>
            {/* Summary cards */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
              <div className="bg-white rounded-lg border border-gb-border p-4">
                <p className="text-xs text-gb-gray mb-1">Valor Total</p>
                <p className="text-xl font-bold text-gb-black">
                  {formatCurrency(snapshot.total_value)}
                </p>
                <p className="text-xs text-gb-gray mt-1 flex items-center gap-1">
                  <Calendar className="w-3 h-3" />
                  {new Date(snapshot.snapshot_date).toLocaleDateString("es-CL")}
                </p>
              </div>

              <div className="bg-white rounded-lg border border-gb-border p-4">
                <p className="text-xs text-gb-gray mb-1">Retorno Período</p>
                <p className={`text-xl font-bold ${getReturnColor(snapshot.twr_period)}`}>
                  {formatPercent(snapshot.twr_period)}
                </p>
                <div className="flex items-center gap-1 mt-1">
                  {getReturnIcon(snapshot.twr_period)}
                  <span className="text-xs text-gb-gray">TWR período</span>
                </div>
              </div>

              <div className="bg-white rounded-lg border border-gb-border p-4">
                <p className="text-xs text-gb-gray mb-1">Retorno Acumulado</p>
                <p className={`text-xl font-bold ${getReturnColor(snapshot.twr_cumulative)}`}>
                  {formatPercent(snapshot.twr_cumulative)}
                </p>
                <div className="flex items-center gap-1 mt-1">
                  {getReturnIcon(snapshot.twr_cumulative)}
                  <span className="text-xs text-gb-gray">TWR acumulado</span>
                </div>
              </div>
            </div>

            {/* Evolution chart */}
            {history.length >= 2 && (
              <div className="bg-white rounded-lg border border-gb-border p-6 mb-6">
                <h2 className="text-sm font-semibold text-gb-black mb-4">
                  Evolución del Portafolio
                </h2>
                <EvolutionChart data={history} />
              </div>
            )}

            {/* Composition */}
            <div className="bg-white rounded-lg border border-gb-border p-6 mb-6">
              <h2 className="text-sm font-semibold text-gb-black mb-4">
                Composición del Portafolio
              </h2>
              <div className="space-y-3">
                <CompositionBar
                  label="Renta Variable"
                  value={snapshot.equity_percent}
                  benchmark={benchmark?.equity}
                  color="bg-blue-500"
                />
                <CompositionBar
                  label="Renta Fija"
                  value={snapshot.fixed_income_percent}
                  benchmark={benchmark?.fixed_income}
                  color="bg-emerald-500"
                />
                <CompositionBar
                  label="Alternativos"
                  value={snapshot.alternatives_percent}
                  benchmark={benchmark?.alternatives}
                  color="bg-amber-500"
                />
                <CompositionBar
                  label="Caja"
                  value={snapshot.cash_percent}
                  benchmark={benchmark?.cash}
                  color="bg-gray-400"
                />
              </div>
              {benchmark && (
                <p className="text-xs text-gb-gray mt-4 flex items-center gap-2">
                  <span className="w-3 h-0.5 bg-gray-400 inline-block" /> Benchmark recomendado
                </p>
              )}
            </div>

            {/* Holdings table */}
            {snapshot.holdings && snapshot.holdings.length > 0 && (
              <div className="bg-white rounded-lg border border-gb-border p-6">
                <h2 className="text-sm font-semibold text-gb-black mb-4">
                  Posiciones ({snapshot.holdings.length})
                </h2>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gb-border text-left">
                        <th className="pb-2 text-xs font-medium text-gb-gray">Instrumento</th>
                        <th className="pb-2 text-xs font-medium text-gb-gray text-right">Valor</th>
                        <th className="pb-2 text-xs font-medium text-gb-gray text-right">%</th>
                      </tr>
                    </thead>
                    <tbody>
                      {snapshot.holdings
                        .sort((a, b) => b.valor - a.valor)
                        .map((h, i) => (
                          <tr key={i} className="border-b border-gray-50">
                            <td className="py-2.5">
                              <p className="font-medium text-gb-black">{h.nombre}</p>
                              <p className="text-xs text-gb-gray capitalize">{h.tipo}</p>
                            </td>
                            <td className="py-2.5 text-right text-gb-black">
                              {formatCurrency(h.valor)}
                            </td>
                            <td className="py-2.5 text-right text-gb-gray">
                              {h.porcentaje.toFixed(1)}%
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Cartera Recomendada */}
            {carteraRecomendada && carteraRecomendada.cartera && carteraRecomendada.cartera.length > 0 && (
              <RecommendedPortfolioSection
                cartera={carteraRecomendada}
                snapshot={snapshot}
              />
            )}
          </>
        )}
      </main>
    </div>
  );
}

/* ── Cartera Recomendada Section ── */

const ASSET_CLASS_LABELS: Record<string, string> = {
  equity: "Renta Variable",
  "renta variable": "Renta Variable",
  fixed_income: "Renta Fija",
  "renta fija": "Renta Fija",
  alternatives: "Alternativos",
  alternativos: "Alternativos",
  cash: "Caja",
  caja: "Caja",
};

const ASSET_CLASS_COLORS: Record<string, string> = {
  "Renta Variable": "bg-blue-500",
  "Renta Fija": "bg-emerald-500",
  "Alternativos": "bg-amber-500",
  "Caja": "bg-gray-400",
};

function normalizeAssetClass(raw: string): string {
  const key = raw.toLowerCase().trim();
  return ASSET_CLASS_LABELS[key] || raw;
}

function aggregateByClass(items: Array<{ clase: string; porcentaje: number }>): Record<string, number> {
  const agg: Record<string, number> = {};
  for (const item of items) {
    const label = normalizeAssetClass(item.clase);
    agg[label] = (agg[label] || 0) + item.porcentaje;
  }
  return agg;
}

function RecommendedPortfolioSection({
  cartera,
  snapshot,
}: {
  cartera: CarteraRecomendada;
  snapshot: Snapshot;
}) {
  const recByClass = aggregateByClass(
    cartera.cartera.map((c) => ({ clase: c.clase, porcentaje: c.porcentaje }))
  );

  // Current allocation from snapshot
  const currentByClass: Record<string, number> = {
    "Renta Variable": snapshot.equity_percent || 0,
    "Renta Fija": snapshot.fixed_income_percent || 0,
    "Alternativos": snapshot.alternatives_percent || 0,
    "Caja": snapshot.cash_percent || 0,
  };

  // All classes that appear in either current or recommended
  const allClasses = Array.from(
    new Set([...Object.keys(currentByClass), ...Object.keys(recByClass)])
  ).filter((c) => (currentByClass[c] || 0) > 0 || (recByClass[c] || 0) > 0);

  const savedDate = cartera.guardadoEn
    ? new Date(cartera.guardadoEn).toLocaleDateString("es-CL", {
        day: "numeric",
        month: "long",
        year: "numeric",
      })
    : null;

  return (
    <div className="bg-white rounded-lg border border-gb-border p-6 mt-6">
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-2">
          <Target className="w-4 h-4 text-gb-gray" />
          <h2 className="text-sm font-semibold text-gb-black">
            Portafolio Recomendado por tu Asesor
          </h2>
        </div>
        {savedDate && (
          <span className="text-xs text-gb-gray">Actualizado el {savedDate}</span>
        )}
      </div>

      {/* Comparison bars: current vs recommended by asset class */}
      <div className="mb-6">
        <p className="text-xs text-gb-gray mb-3">
          Comparacion por clase de activo: tu portafolio actual vs. el objetivo recomendado.
        </p>
        <div className="space-y-4">
          {allClasses.map((cls) => {
            const current = currentByClass[cls] || 0;
            const target = recByClass[cls] || 0;
            const diff = current - target;
            const color = ASSET_CLASS_COLORS[cls] || "bg-gray-400";
            return (
              <div key={cls}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm text-gb-black">{cls}</span>
                  <div className="flex items-center gap-3 text-xs">
                    <span className="text-gb-gray">
                      Actual: <span className="font-medium text-gb-black">{current.toFixed(1)}%</span>
                    </span>
                    <span className="text-gb-gray">
                      Objetivo: <span className="font-medium text-gb-black">{target.toFixed(1)}%</span>
                    </span>
                    <span
                      className={`font-medium ${
                        Math.abs(diff) < 1
                          ? "text-gb-gray"
                          : diff > 0
                          ? "text-amber-600"
                          : "text-blue-600"
                      }`}
                    >
                      {Math.abs(diff) < 0.1
                        ? "En objetivo"
                        : diff > 0
                        ? `+${diff.toFixed(1)}% sobre`
                        : `${diff.toFixed(1)}% bajo`}
                    </span>
                  </div>
                </div>
                {/* Dual bar */}
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-gb-gray w-12">Actual</span>
                    <div className="flex-1 bg-gray-100 rounded-full h-2">
                      <div
                        className={`h-2 rounded-full ${color}`}
                        style={{ width: `${Math.min(current, 100)}%` }}
                      />
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-gb-gray w-12">Objetivo</span>
                    <div className="flex-1 bg-gray-100 rounded-full h-2">
                      <div
                        className={`h-2 rounded-full ${color} opacity-40`}
                        style={{
                          width: `${Math.min(target, 100)}%`,
                          backgroundImage:
                            "repeating-linear-gradient(90deg, transparent, transparent 3px, rgba(255,255,255,0.5) 3px, rgba(255,255,255,0.5) 6px)",
                        }}
                      />
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Instruments table */}
      <div>
        <h3 className="text-xs font-semibold text-gb-gray uppercase tracking-wide mb-3">
          Instrumentos Recomendados
        </h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gb-border text-left">
                <th className="pb-2 text-xs font-medium text-gb-gray">Instrumento</th>
                <th className="pb-2 text-xs font-medium text-gb-gray">Clase</th>
                <th className="pb-2 text-xs font-medium text-gb-gray text-right">% Objetivo</th>
              </tr>
            </thead>
            <tbody>
              {cartera.cartera
                .sort((a, b) => b.porcentaje - a.porcentaje)
                .map((item, i) => (
                  <tr key={i} className="border-b border-gray-50">
                    <td className="py-2.5">
                      <p className="font-medium text-gb-black">{item.nombre}</p>
                      <p className="text-xs text-gb-gray">{item.ticker}</p>
                    </td>
                    <td className="py-2.5 text-gb-gray capitalize text-xs">
                      {normalizeAssetClass(item.clase)}
                    </td>
                    <td className="py-2.5 text-right font-medium text-gb-black">
                      {item.porcentaje.toFixed(1)}%
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

function CompositionBar({
  label,
  value,
  benchmark,
  color,
}: {
  label: string;
  value: number;
  benchmark?: number;
  color: string;
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-sm text-gb-black">{label}</span>
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-gb-black">{value.toFixed(1)}%</span>
          {benchmark !== undefined && (
            <span className="text-xs text-gb-gray">/ {benchmark.toFixed(0)}%</span>
          )}
        </div>
      </div>
      <div className="relative w-full bg-gray-100 rounded-full h-2">
        <div
          className={`h-2 rounded-full ${color}`}
          style={{ width: `${Math.min(value, 100)}%` }}
        />
        {benchmark !== undefined && (
          <div
            className="absolute top-0 w-0.5 h-2 bg-gray-500"
            style={{ left: `${Math.min(benchmark, 100)}%` }}
          />
        )}
      </div>
    </div>
  );
}

function getReturnColor(value: number | null): string {
  if (value === null || value === undefined) return "text-gb-gray";
  if (value > 0) return "text-gb-success";
  if (value < 0) return "text-gb-danger";
  return "text-gb-gray";
}

function getReturnIcon(value: number | null) {
  if (value === null || value === undefined) return <Minus className="w-3 h-3 text-gb-gray" />;
  if (value > 0) return <TrendingUp className="w-3 h-3 text-gb-success" />;
  if (value < 0) return <TrendingDown className="w-3 h-3 text-gb-danger" />;
  return <Minus className="w-3 h-3 text-gb-gray" />;
}

function EvolutionChart({ data }: { data: HistoryPoint[] }) {
  if (data.length < 2) return null;

  const values = data.map((d) => d.value);
  const minVal = Math.min(...values);
  const maxVal = Math.max(...values);
  const range = maxVal - minVal || 1;

  const chartH = 160;
  const chartW = 100; // percent
  const padY = 10;

  const points = data.map((d, i) => {
    const x = (i / (data.length - 1)) * chartW;
    const y = chartH - padY - ((d.value - minVal) / range) * (chartH - 2 * padY);
    return { x, y, ...d };
  });

  const polyline = points.map((p) => `${p.x},${p.y}`).join(" ");
  const areaPath = `M ${points[0].x},${chartH} L ${polyline} L ${points[points.length - 1].x},${chartH} Z`;

  const isPositive = values[values.length - 1] >= values[0];
  const strokeColor = isPositive ? "#16a34a" : "#dc2626";
  const fillColor = isPositive ? "rgba(22,163,74,0.08)" : "rgba(220,38,38,0.08)";

  const formatCLP = (n: number) =>
    new Intl.NumberFormat("es-CL", {
      style: "currency",
      currency: "CLP",
      minimumFractionDigits: 0,
      notation: "compact",
    }).format(n);

  // Show ~4 x-axis labels
  const labelStep = Math.max(1, Math.floor(data.length / 4));
  const xLabels = data.filter((_, i) => i === 0 || i === data.length - 1 || i % labelStep === 0);

  return (
    <div>
      <svg viewBox={`0 0 ${chartW} ${chartH}`} className="w-full" preserveAspectRatio="none" style={{ height: chartH }}>
        <path d={areaPath} fill={fillColor} />
        <polyline
          points={polyline}
          fill="none"
          stroke={strokeColor}
          strokeWidth="0.5"
          vectorEffect="non-scaling-stroke"
        />
        {/* Dots at start and end */}
        <circle cx={points[0].x} cy={points[0].y} r="1" fill={strokeColor} vectorEffect="non-scaling-stroke" />
        <circle cx={points[points.length - 1].x} cy={points[points.length - 1].y} r="1" fill={strokeColor} vectorEffect="non-scaling-stroke" />
      </svg>

      {/* X-axis labels */}
      <div className="flex justify-between mt-2 px-1">
        {xLabels.map((d, i) => (
          <span key={i} className="text-[10px] text-gb-gray">
            {new Date(d.date + "T12:00:00").toLocaleDateString("es-CL", { month: "short", year: "2-digit" })}
          </span>
        ))}
      </div>

      {/* Y-axis summary */}
      <div className="flex justify-between mt-1 px-1">
        <span className="text-[10px] text-gb-gray">{formatCLP(minVal)}</span>
        <span className="text-[10px] text-gb-gray">{formatCLP(maxVal)}</span>
      </div>
    </div>
  );
}
