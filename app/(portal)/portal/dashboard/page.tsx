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
  const [benchmark, setBenchmark] = useState<Record<string, number> | null>(null);

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
        setBenchmark(pData.benchmark || null);
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
          </>
        )}
      </main>
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
