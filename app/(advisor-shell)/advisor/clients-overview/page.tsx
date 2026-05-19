"use client";

import React, { useState, useEffect, useMemo } from "react";
import { useAdvisor } from "@/lib/hooks/useAdvisor";
import Link from "next/link";
import {
  Loader,
  Search,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Filter,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Users,
  Target,
  Activity,
  ChevronDown,
} from "lucide-react";

interface ClientOverview {
  id: string;
  nombre: string;
  apellido: string;
  email: string;
  status: string;
  perfilRiesgo: string | null;
  puntajeRiesgo: number | null;
  portalEnabled: boolean;
  portalLastSeen: string | null;
  createdAt: string;
  totalValue: number | null;
  cumulativeReturn: number | null;
  lastSnapshotDate: string | null;
  equityPercent: number | null;
  fixedIncomePercent: number | null;
  return1M: number | null;
  return2M: number | null;
  hasRecommendation: boolean;
  drift: number | null;
  lastContactDate: string | null;
  daysSinceContact: number | null;
  lastContactType: string | null;
  reportFrequency: string | null;
  lastReportDate: string | null;
  receivingReports: boolean;
}

type SortKey =
  | "nombre"
  | "totalValue"
  | "cumulativeReturn"
  | "drift"
  | "daysSinceContact"
  | "perfilRiesgo";

const PROFILE_ORDER: Record<string, number> = {
  defensivo: 1,
  conservador: 2,
  moderado: 3,
  crecimiento: 4,
  agresivo: 5,
  muy_agresivo: 6,
};

const PROFILE_COLORS: Record<string, string> = {
  defensivo: "bg-sky-100 text-sky-700",
  conservador: "bg-blue-100 text-blue-700",
  moderado: "bg-emerald-100 text-emerald-700",
  crecimiento: "bg-amber-100 text-amber-700",
  agresivo: "bg-red-100 text-red-700",
  muy_agresivo: "bg-red-200 text-red-800",
};

function formatCurrency(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
}

function formatDate(d: string): string {
  return new Date(d).toLocaleDateString("es-CL", { day: "numeric", month: "short" });
}

export default function ClientsOverviewPage() {
  const { advisor: _advisor, loading: authLoading } = useAdvisor();
  const [clients, setClients] = useState<ClientOverview[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [search, setSearch] = useState("");
  const [profileFilter, setProfileFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  // Sort
  const [sortKey, setSortKey] = useState<SortKey>("nombre");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  useEffect(() => {
    if (authLoading) return;
    const fetchData = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch("/api/advisor/clients-overview");
        const data = await res.json();
        if (data.success) {
          setClients(data.clients);
        } else {
          setError(data.error || "Error cargando datos");
        }
      } catch {
        setError("Error de conexión");
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [authLoading]);

  // Derived stats
  const stats = useMemo(() => {
    const total = clients.length;
    const withPortfolio = clients.filter((c) => c.totalValue != null).length;
    const withRec = clients.filter((c) => c.hasRecommendation).length;
    const highDrift = clients.filter((c) => c.drift != null && c.drift > 5).length;
    const noContact30 = clients.filter(
      (c) => c.daysSinceContact != null && c.daysSinceContact > 30
    ).length;
    const negativeReturn = clients.filter(
      (c) => c.return1M != null && c.return1M < -2
    ).length;
    const totalAUM = clients.reduce((s, c) => s + (c.totalValue || 0), 0);
    const avgReturn =
      clients.filter((c) => c.cumulativeReturn != null).length > 0
        ? clients
            .filter((c) => c.cumulativeReturn != null)
            .reduce((s, c) => s + (c.cumulativeReturn || 0), 0) /
          clients.filter((c) => c.cumulativeReturn != null).length
        : null;

    return { total, withPortfolio, withRec, highDrift, noContact30, negativeReturn, totalAUM, avgReturn };
  }, [clients]);

  // Filter & sort
  const filtered = useMemo(() => {
    let list = [...clients];

    // Search
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (c) =>
          c.nombre.toLowerCase().includes(q) ||
          c.apellido.toLowerCase().includes(q) ||
          c.email.toLowerCase().includes(q)
      );
    }

    // Profile filter
    if (profileFilter !== "all") {
      list = list.filter(
        (c) => (c.perfilRiesgo || "").toLowerCase() === profileFilter
      );
    }

    // Status filter
    if (statusFilter === "negative-return") {
      list = list.filter((c) => c.return1M != null && c.return1M < -2);
    } else if (statusFilter === "high-drift") {
      list = list.filter((c) => c.drift != null && c.drift > 5);
    } else if (statusFilter === "no-contact") {
      list = list.filter(
        (c) => c.daysSinceContact != null && c.daysSinceContact > 30
      );
    } else if (statusFilter === "no-reports") {
      list = list.filter((c) => !c.receivingReports);
    } else if (statusFilter === "no-portfolio") {
      list = list.filter((c) => c.totalValue == null);
    } else if (statusFilter === "no-recommendation") {
      list = list.filter((c) => !c.hasRecommendation);
    }

    // Sort
    list.sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case "nombre":
          cmp = `${a.nombre} ${a.apellido}`.localeCompare(
            `${b.nombre} ${b.apellido}`
          );
          break;
        case "totalValue":
          cmp = (a.totalValue || 0) - (b.totalValue || 0);
          break;
        case "cumulativeReturn":
          cmp = (a.cumulativeReturn || -999) - (b.cumulativeReturn || -999);
          break;
        case "drift":
          cmp = (a.drift || 0) - (b.drift || 0);
          break;
        case "daysSinceContact":
          cmp = (a.daysSinceContact || 999) - (b.daysSinceContact || 999);
          break;
        case "perfilRiesgo":
          cmp =
            (PROFILE_ORDER[(a.perfilRiesgo || "").toLowerCase()] || 99) -
            (PROFILE_ORDER[(b.perfilRiesgo || "").toLowerCase()] || 99);
          break;
      }
      return sortDir === "asc" ? cmp : -cmp;
    });

    return list;
  }, [clients, search, profileFilter, statusFilter, sortKey, sortDir]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(key === "nombre" ? "asc" : "desc");
    }
  };

  const SortIcon = ({ k }: { k: SortKey }) => {
    if (sortKey !== k)
      return <ArrowUpDown className="w-3 h-3 text-gray-300" />;
    return sortDir === "asc" ? (
      <ArrowUp className="w-3 h-3 text-blue-600" />
    ) : (
      <ArrowDown className="w-3 h-3 text-blue-600" />
    );
  };

  if (authLoading || loading) {
    return (
      <div className="flex items-center justify-center py-32">
        <Loader className="w-8 h-8 animate-spin text-gray-400" />
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-5 py-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-semibold text-gb-black">
              Vista Consolidada de Clientes
            </h1>
            <p className="text-sm text-gb-gray">
              Performance, drift y estado de todos tus clientes
            </p>
          </div>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">
            {error}
          </div>
        )}

        {/* Summary cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3 mb-6">
          <div className="bg-white rounded-lg border border-gb-border p-3 shadow-sm">
            <div className="flex items-center gap-2 text-gb-gray text-xs font-medium mb-1">
              <Users className="w-3.5 h-3.5" /> Clientes
            </div>
            <div className="text-xl font-bold text-gb-black">{stats.total}</div>
          </div>
          <div className="bg-white rounded-lg border border-gb-border p-3 shadow-sm">
            <div className="flex items-center gap-2 text-gb-gray text-xs font-medium mb-1">
              <Activity className="w-3.5 h-3.5" /> AUM Total
            </div>
            <div className="text-xl font-bold text-gb-black">
              {formatCurrency(stats.totalAUM)}
            </div>
          </div>
          <div className="bg-white rounded-lg border border-gb-border p-3 shadow-sm">
            <div className="flex items-center gap-2 text-gb-gray text-xs font-medium mb-1">
              <TrendingUp className="w-3.5 h-3.5" /> Retorno Prom.
            </div>
            <div
              className={`text-xl font-bold ${
                (stats.avgReturn || 0) >= 0 ? "text-green-600" : "text-red-600"
              }`}
            >
              {stats.avgReturn != null
                ? `${stats.avgReturn >= 0 ? "+" : ""}${stats.avgReturn.toFixed(1)}%`
                : "—"}
            </div>
          </div>
          <div className="bg-white rounded-lg border border-gb-border p-3 shadow-sm">
            <div className="flex items-center gap-2 text-gb-gray text-xs font-medium mb-1">
              <Target className="w-3.5 h-3.5" /> Con Recom.
            </div>
            <div className="text-xl font-bold text-gb-black">
              {stats.withRec}/{stats.total}
            </div>
          </div>
          <div
            className={`rounded-lg border p-3 shadow-sm ${
              stats.highDrift > 0
                ? "bg-amber-50 border-amber-200"
                : "bg-white border-gb-border"
            }`}
          >
            <div className="flex items-center gap-2 text-gb-gray text-xs font-medium mb-1">
              <AlertTriangle className="w-3.5 h-3.5" /> Alto Drift
            </div>
            <div
              className={`text-xl font-bold ${
                stats.highDrift > 0 ? "text-amber-600" : "text-gb-black"
              }`}
            >
              {stats.highDrift}
            </div>
          </div>
          <div
            className={`rounded-lg border p-3 shadow-sm ${
              stats.noContact30 > 0
                ? "bg-red-50 border-red-200"
                : "bg-white border-gb-border"
            }`}
          >
            <div className="flex items-center gap-2 text-gb-gray text-xs font-medium mb-1">
              <Clock className="w-3.5 h-3.5" /> Sin contacto 30d+
            </div>
            <div
              className={`text-xl font-bold ${
                stats.noContact30 > 0 ? "text-red-600" : "text-gb-black"
              }`}
            >
              {stats.noContact30}
            </div>
          </div>
          <div
            className={`rounded-lg border p-3 shadow-sm ${
              stats.negativeReturn > 0
                ? "bg-red-50 border-red-200"
                : "bg-white border-gb-border"
            }`}
          >
            <div className="flex items-center gap-2 text-gb-gray text-xs font-medium mb-1">
              <TrendingDown className="w-3.5 h-3.5" /> Retorno Neg. 1M
            </div>
            <div
              className={`text-xl font-bold ${
                stats.negativeReturn > 0 ? "text-red-600" : "text-gb-black"
              }`}
            >
              {stats.negativeReturn}
            </div>
          </div>
        </div>

        {/* Filters */}
        <div className="bg-white rounded-lg border border-gb-border p-4 mb-4 shadow-sm">
          <div className="flex flex-wrap items-center gap-3">
            {/* Search */}
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar por nombre o email..."
                className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:border-blue-500 focus:outline-none"
              />
            </div>

            {/* Profile filter */}
            <div className="relative">
              <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
              <select
                value={profileFilter}
                onChange={(e) => setProfileFilter(e.target.value)}
                className="pl-8 pr-8 py-2 border border-gray-200 rounded-lg text-sm appearance-none bg-white cursor-pointer focus:border-blue-500 focus:outline-none"
              >
                <option value="all">Todos los perfiles</option>
                <option value="defensivo">Defensivo</option>
                <option value="conservador">Conservador</option>
                <option value="moderado">Moderado</option>
                <option value="crecimiento">Crecimiento</option>
                <option value="agresivo">Agresivo</option>
                <option value="muy_agresivo">Muy Agresivo</option>
              </select>
              <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
            </div>

            {/* Status filter */}
            <div className="relative">
              <AlertTriangle className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="pl-8 pr-8 py-2 border border-gray-200 rounded-lg text-sm appearance-none bg-white cursor-pointer focus:border-blue-500 focus:outline-none"
              >
                <option value="all">Todos los estados</option>
                <option value="negative-return">Retorno negativo 1M</option>
                <option value="high-drift">Drift alto (&gt;5%)</option>
                <option value="no-contact">Sin contacto 30d+</option>
                <option value="no-reports">Sin reportes configurados</option>
                <option value="no-portfolio">Sin portafolio</option>
                <option value="no-recommendation">Sin recomendación</option>
              </select>
              <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
            </div>

            <div className="text-xs text-gb-gray">
              {filtered.length} de {clients.length} clientes
            </div>
          </div>
        </div>

        {/* Client table */}
        <div className="bg-white rounded-lg border border-gb-border shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50">
                  <th
                    className="text-left py-3 px-4 font-medium text-gb-gray cursor-pointer hover:text-gb-black select-none"
                    onClick={() => toggleSort("nombre")}
                  >
                    <div className="flex items-center gap-1">
                      Cliente <SortIcon k="nombre" />
                    </div>
                  </th>
                  <th className="text-center py-3 px-3 font-medium text-gb-gray">
                    Estado
                  </th>
                  <th
                    className="text-center py-3 px-3 font-medium text-gb-gray cursor-pointer hover:text-gb-black select-none hidden md:table-cell"
                    onClick={() => toggleSort("perfilRiesgo")}
                  >
                    <div className="flex items-center justify-center gap-1">
                      Perfil <SortIcon k="perfilRiesgo" />
                    </div>
                  </th>
                  <th
                    className="text-right py-3 px-3 font-medium text-gb-gray cursor-pointer hover:text-gb-black select-none"
                    onClick={() => toggleSort("totalValue")}
                  >
                    <div className="flex items-center justify-end gap-1">
                      Valor <SortIcon k="totalValue" />
                    </div>
                  </th>
                  <th
                    className="text-right py-3 px-3 font-medium text-gb-gray cursor-pointer hover:text-gb-black select-none hidden md:table-cell"
                    onClick={() => toggleSort("cumulativeReturn")}
                  >
                    <div className="flex items-center justify-end gap-1">
                      1M / 2M <SortIcon k="cumulativeReturn" />
                    </div>
                  </th>
                  <th
                    className="text-center py-3 px-3 font-medium text-gb-gray cursor-pointer hover:text-gb-black select-none hidden lg:table-cell"
                    onClick={() => toggleSort("drift")}
                  >
                    <div className="flex items-center justify-center gap-1">
                      Drift <SortIcon k="drift" />
                    </div>
                  </th>
                  <th
                    className="text-center py-3 px-3 font-medium text-gb-gray cursor-pointer hover:text-gb-black select-none hidden lg:table-cell"
                    onClick={() => toggleSort("daysSinceContact")}
                  >
                    <div className="flex items-center justify-center gap-1">
                      Contacto <SortIcon k="daysSinceContact" />
                    </div>
                  </th>
                  <th className="text-center py-3 px-3 font-medium text-gb-gray hidden xl:table-cell">
                    Alertas
                  </th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr>
                    <td
                      colSpan={8}
                      className="text-center py-12 text-gb-gray"
                    >
                      No se encontraron clientes con los filtros seleccionados
                    </td>
                  </tr>
                ) : (
                  filtered.map((c) => {
                    const hasNegReturn = c.return1M != null && c.return1M < -2;
                    const hasHighDrift = c.drift != null && c.drift > 5;
                    const noContact = c.daysSinceContact != null && c.daysSinceContact > 30;
                    const hasAlert = hasNegReturn || hasHighDrift || noContact;

                    return (
                    <tr
                      key={c.id}
                      className={`border-b border-gray-100 hover:bg-blue-50/30 transition-colors ${
                        hasNegReturn ? "bg-red-50/40" : ""
                      }`}
                    >
                      {/* Client name */}
                      <td className="py-3 px-4">
                        <Link
                          href={`/clients/${c.id}`}
                          className="hover:text-blue-600 transition-colors"
                        >
                          <div className="font-medium text-gb-black">
                            {c.nombre} {c.apellido}
                          </div>
                          <div className="text-xs text-gb-gray">{c.email}</div>
                        </Link>
                      </td>

                      {/* Status */}
                      <td className="py-3 px-3 text-center">
                        <span className={`text-xs px-2 py-0.5 rounded font-medium ${
                          c.status === "activo" ? "bg-emerald-50 text-emerald-700"
                          : c.status === "prospecto" ? "bg-amber-50 text-amber-700"
                          : "bg-gray-100 text-gray-600"
                        }`}>
                          {c.status}
                        </span>
                      </td>

                      {/* Risk profile */}
                      <td className="py-3 px-3 text-center hidden md:table-cell">
                        {c.perfilRiesgo ? (
                          <span
                            className={`text-xs px-2 py-1 rounded-full font-medium ${
                              PROFILE_COLORS[
                                c.perfilRiesgo.toLowerCase()
                              ] || "bg-gray-100 text-gray-600"
                            }`}
                          >
                            {c.perfilRiesgo}
                          </span>
                        ) : (
                          <span className="text-xs text-gb-gray">—</span>
                        )}
                      </td>

                      {/* Total value */}
                      <td className="py-3 px-3 text-right">
                        {c.totalValue != null ? (
                          <div>
                            <div className="font-medium text-gb-black">
                              {formatCurrency(c.totalValue)}
                            </div>
                            {c.lastSnapshotDate && (
                              <div className="text-xs text-gb-gray">
                                {formatDate(c.lastSnapshotDate)}
                              </div>
                            )}
                          </div>
                        ) : (
                          <span className="text-xs text-gb-gray">Sin datos</span>
                        )}
                      </td>

                      {/* Period returns: 1M / 2M (fallback to cumulative) */}
                      <td className="py-3 px-3 text-right hidden md:table-cell">
                        <div className="space-y-0.5">
                          {c.return1M != null ? (
                            <>
                              <div className={`flex items-center justify-end gap-1 text-xs font-bold ${
                                c.return1M >= 0 ? "text-green-600" : "text-red-600"
                              }`}>
                                {c.return1M >= 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                                {c.return1M >= 0 ? "+" : ""}{c.return1M.toFixed(1)}%
                                <span className="text-[10px] font-normal text-gb-gray">1M</span>
                              </div>
                              {c.return2M != null && (
                                <div className={`flex items-center justify-end gap-1 text-[11px] ${
                                  c.return2M >= 0 ? "text-green-500" : "text-red-500"
                                }`}>
                                  {c.return2M >= 0 ? "+" : ""}{c.return2M.toFixed(1)}%
                                  <span className="text-[10px] text-gb-gray">2M</span>
                                </div>
                              )}
                            </>
                          ) : c.cumulativeReturn != null ? (
                            <div className={`flex items-center justify-end gap-1 text-xs font-bold ${
                              c.cumulativeReturn >= 0 ? "text-green-600" : "text-red-600"
                            }`}>
                              {c.cumulativeReturn >= 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                              {c.cumulativeReturn >= 0 ? "+" : ""}{c.cumulativeReturn.toFixed(1)}%
                              <span className="text-[10px] font-normal text-gb-gray">total</span>
                            </div>
                          ) : (
                            <span className="text-xs text-gb-gray">—</span>
                          )}
                        </div>
                      </td>

                      {/* Drift */}
                      <td className="py-3 px-3 text-center hidden lg:table-cell">
                        {c.drift != null ? (
                          <span
                            className={`text-xs px-2 py-1 rounded-full font-medium ${
                              c.drift <= 3
                                ? "bg-green-100 text-green-700"
                                : c.drift <= 7
                                ? "bg-amber-100 text-amber-700"
                                : "bg-red-100 text-red-700"
                            }`}
                          >
                            {c.drift.toFixed(1)}%
                          </span>
                        ) : c.hasRecommendation ? (
                          <span className="text-xs text-gb-gray">Sin snap</span>
                        ) : (
                          <span className="text-xs text-gb-gray">—</span>
                        )}
                      </td>

                      {/* Last contact */}
                      <td className="py-3 px-3 text-center hidden lg:table-cell">
                        {c.daysSinceContact != null ? (
                          <span
                            className={`text-xs font-medium ${
                              c.daysSinceContact <= 7
                                ? "text-green-600"
                                : c.daysSinceContact <= 30
                                ? "text-amber-600"
                                : "text-red-600"
                            }`}
                          >
                            {c.daysSinceContact === 0
                              ? "Hoy"
                              : c.daysSinceContact === 1
                              ? "Ayer"
                              : `${c.daysSinceContact}d`}
                          </span>
                        ) : (
                          <span className="text-xs text-gb-gray">Nunca</span>
                        )}
                      </td>

                      {/* Alerts */}
                      <td className="py-3 px-3 hidden xl:table-cell">
                        {hasAlert ? (
                          <div className="flex items-center justify-center gap-1">
                            {hasNegReturn && (
                              <span
                                title={`Retorno 1M: ${c.return1M!.toFixed(1)}%`}
                                className="w-5 h-5 bg-red-100 text-red-600 rounded flex items-center justify-center"
                              >
                                <TrendingDown className="w-3 h-3" />
                              </span>
                            )}
                            {hasHighDrift && (
                              <span
                                title={`Drift: ${c.drift!.toFixed(1)}%`}
                                className="w-5 h-5 bg-amber-100 text-amber-600 rounded flex items-center justify-center"
                              >
                                <AlertTriangle className="w-3 h-3" />
                              </span>
                            )}
                            {noContact && (
                              <span
                                title={`Sin contacto: ${c.daysSinceContact}d`}
                                className="w-5 h-5 bg-red-100 text-red-600 rounded flex items-center justify-center"
                              >
                                <Clock className="w-3 h-3" />
                              </span>
                            )}
                          </div>
                        ) : (
                          <div className="flex items-center justify-center">
                            <CheckCircle2 className="w-4 h-4 text-green-400" />
                          </div>
                        )}
                      </td>
                    </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
    </div>
  );
}
