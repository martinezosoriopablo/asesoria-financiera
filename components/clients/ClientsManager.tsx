"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import {
  Users,
  Search,
  Plus,
  Filter,
  TrendingUp,
  AlertCircle,
  Phone,
  Mail,
  Calendar,
  DollarSign,
  Shield,
  Eye,
  Loader,
  ArrowLeft,
  FileText,
} from "lucide-react";

interface Client {
  id: string;
  nombre: string;
  apellido: string;
  email: string;
  telefono: string;
  perfil_riesgo: string;
  puntaje_riesgo: number;
  patrimonio_estimado: number;
  status: string;
  ultima_interaccion: string;
  fecha_onboarding: string;
  num_interacciones: number;
  client_interactions: any[];
}

interface Stats {
  total_clientes: number;
  clientes_activos: number;
  prospectos: number;
  clientes_con_portfolio: number;
  patrimonio_total: number;
}

const PERFIL_COLORS: { [key: string]: { bg: string; text: string; badge: string } } = {
  conservador: {
    bg: "bg-blue-50",
    text: "text-blue-700",
    badge: "bg-blue-100",
  },
  moderado: {
    bg: "bg-green-50",
    text: "text-green-700",
    badge: "bg-green-100",
  },
  agresivo: {
    bg: "bg-orange-50",
    text: "text-orange-700",
    badge: "bg-orange-100",
  },
  muy_agresivo: {
    bg: "bg-red-50",
    text: "text-red-700",
    badge: "bg-red-100",
  },
};

const STATUS_COLORS: { [key: string]: { bg: string; text: string } } = {
  activo: { bg: "bg-green-100", text: "text-green-800" },
  prospecto: { bg: "bg-yellow-100", text: "text-yellow-800" },
  inactivo: { bg: "bg-gray-100", text: "text-gray-800" },
};

export default function ClientsManager() {
  const [clients, setClients] = useState<Client[]>([]);
  const [filteredClients, setFilteredClients] = useState<Client[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterPerfil, setFilterPerfil] = useState("all");

  useEffect(() => {
    fetchClients();
    fetchStats();
  }, []);

  useEffect(() => {
    filterClients();
  }, [clients, searchTerm, filterStatus, filterPerfil]);

  const fetchClients = async () => {
    try {
      const response = await fetch("/api/clients");
      const data = await response.json();
      if (data.success) {
        setClients(data.clients);
      }
    } catch (error) {
      console.error("Error fetching clients:", error);
    } finally {
      setLoading(false);
    }
  };

  const fetchStats = async () => {
    try {
      const response = await fetch("/api/clients/stats");
      const data = await response.json();
      if (data.success) {
        setStats(data.stats);
      }
    } catch (error) {
      console.error("Error fetching stats:", error);
    }
  };

  const filterClients = () => {
    let filtered = [...clients];

    // Filtro de búsqueda
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(
        (client) =>
          client.nombre.toLowerCase().includes(term) ||
          client.apellido.toLowerCase().includes(term) ||
          client.email.toLowerCase().includes(term)
      );
    }

    // Filtro de status
    if (filterStatus !== "all") {
      filtered = filtered.filter((client) => client.status === filterStatus);
    }

    // Filtro de perfil de riesgo
    if (filterPerfil !== "all") {
      filtered = filtered.filter((client) => client.perfil_riesgo === filterPerfil);
    }

    setFilteredClients(filtered);
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("es-CL", {
      style: "currency",
      currency: "CLP",
      minimumFractionDigits: 0,
    }).format(amount);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("es-CL", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  };

  const getDaysSinceLastContact = (lastContact: string) => {
    const now = new Date();
    const last = new Date(lastContact);
    const diffTime = Math.abs(now.getTime() - last.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 flex items-center justify-center">
        <Loader className="w-12 h-12 text-blue-600 animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Link
                href="/"
                className="flex items-center gap-2 text-slate-600 hover:text-slate-900 transition-colors"
              >
                <ArrowLeft className="w-5 h-5" />
                <span className="text-sm font-medium">Volver al Dashboard</span>
              </Link>
            </div>
            <div className="flex items-center gap-4">
              <div className="text-right">
                <p className="text-sm text-slate-600">Asesor</p>
                <p className="font-semibold text-slate-900">Pablo</p>
              </div>
            </div>
          </div>

          <div className="mt-6 flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-slate-900 flex items-center gap-3">
                <Users className="w-8 h-8 text-blue-600" />
                Gestión de Clientes
              </h1>
              <p className="text-slate-600 mt-1">
                {filteredClients.length} clientes
                {searchTerm || filterStatus !== "all" || filterPerfil !== "all"
                  ? ` (filtrados de ${clients.length} totales)`
                  : ""}
              </p>
            </div>
            <Link
              href="/clients/new"
              className="flex items-center gap-2 px-6 py-3 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 transition-colors shadow-lg"
            >
              <Plus className="w-5 h-5" />
              Nuevo Cliente
            </Link>
          </div>
        </div>
      </div>

      {/* Stats Cards */}
      {stats && (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <div className="bg-white rounded-xl shadow-md p-6 border-l-4 border-blue-500">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-slate-600 mb-1">Total Clientes</p>
                  <p className="text-3xl font-bold text-slate-900">
                    {stats.total_clientes}
                  </p>
                </div>
                <Users className="w-12 h-12 text-blue-500 opacity-20" />
              </div>
            </div>

            <div className="bg-white rounded-xl shadow-md p-6 border-l-4 border-green-500">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-slate-600 mb-1">Clientes Activos</p>
                  <p className="text-3xl font-bold text-slate-900">
                    {stats.clientes_activos}
                  </p>
                </div>
                <Shield className="w-12 h-12 text-green-500 opacity-20" />
              </div>
            </div>

            <div className="bg-white rounded-xl shadow-md p-6 border-l-4 border-yellow-500">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-slate-600 mb-1">Prospectos</p>
                  <p className="text-3xl font-bold text-slate-900">
                    {stats.prospectos}
                  </p>
                </div>
                <AlertCircle className="w-12 h-12 text-yellow-500 opacity-20" />
              </div>
            </div>

            <div className="bg-white rounded-xl shadow-md p-6 border-l-4 border-purple-500">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-slate-600 mb-1">Patrimonio Total</p>
                  <p className="text-2xl font-bold text-slate-900">
                    {formatCurrency(stats.patrimonio_total)}
                  </p>
                </div>
                <DollarSign className="w-12 h-12 text-purple-500 opacity-20" />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Search and Filters */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-6">
        <div className="bg-white rounded-xl shadow-md p-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-slate-400" />
              <input
                type="text"
                placeholder="Buscar por nombre o email..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            {/* Filter by Status */}
            <div className="relative">
              <Filter className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-slate-400" />
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                className="w-full pl-10 pr-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent appearance-none bg-white"
              >
                <option value="all">Todos los estados</option>
                <option value="activo">Activo</option>
                <option value="prospecto">Prospecto</option>
                <option value="inactivo">Inactivo</option>
              </select>
            </div>

            {/* Filter by Risk Profile */}
            <div className="relative">
              <Shield className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-slate-400" />
              <select
                value={filterPerfil}
                onChange={(e) => setFilterPerfil(e.target.value)}
                className="w-full pl-10 pr-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent appearance-none bg-white"
              >
                <option value="all">Todos los perfiles</option>
                <option value="conservador">Conservador</option>
                <option value="moderado">Moderado</option>
                <option value="agresivo">Agresivo</option>
                <option value="muy_agresivo">Muy Agresivo</option>
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* Clients List */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-12">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredClients.map((client) => {
            const perfilColors = PERFIL_COLORS[client.perfil_riesgo] || PERFIL_COLORS.moderado;
            const statusColors = STATUS_COLORS[client.status] || STATUS_COLORS.activo;
            const daysSinceContact = getDaysSinceLastContact(client.ultima_interaccion);
            const needsFollowup = daysSinceContact > 30;

            return (
              <div
                key={client.id}
                className="bg-white rounded-xl shadow-md hover:shadow-xl transition-shadow p-6 border-2 border-transparent hover:border-blue-500"
              >
                {/* Header */}
                <div className="flex items-start justify-between mb-4">
                  <div className="flex-1">
                    <h3 className="text-xl font-bold text-slate-900">
                      {client.nombre} {client.apellido}
                    </h3>
                    <p className="text-sm text-slate-600">{client.email}</p>
                  </div>
                  <span
                    className={`px-3 py-1 rounded-full text-xs font-semibold ${statusColors.bg} ${statusColors.text}`}
                  >
                    {client.status}
                  </span>
                </div>

                {/* Perfil de Riesgo */}
                {client.perfil_riesgo && (
                  <div
                    className={`${perfilColors.bg} rounded-lg p-3 mb-4`}
                  >
                    <div className="flex items-center justify-between">
                      <span className={`text-sm font-semibold ${perfilColors.text}`}>
                        {client.perfil_riesgo.charAt(0).toUpperCase() +
                          client.perfil_riesgo.slice(1).replace("_", " ")}
                      </span>
                      <span className={`text-xs font-bold ${perfilColors.text}`}>
                        {client.puntaje_riesgo}/100
                      </span>
                    </div>
                  </div>
                )}

                {/* Info */}
                <div className="space-y-2 mb-4">
                  {client.telefono && (
                    <div className="flex items-center gap-2 text-sm text-slate-600">
                      <Phone className="w-4 h-4" />
                      {client.telefono}
                    </div>
                  )}
                  {client.patrimonio_estimado && (
                    <div className="flex items-center gap-2 text-sm text-slate-600">
                      <DollarSign className="w-4 h-4" />
                      {formatCurrency(client.patrimonio_estimado)}
                    </div>
                  )}
                  <div className="flex items-center gap-2 text-sm text-slate-600">
                    <Calendar className="w-4 h-4" />
                    Cliente desde {formatDate(client.fecha_onboarding)}
                  </div>
                  <div className="flex items-center gap-2 text-sm text-slate-600">
                    <FileText className="w-4 h-4" />
                    {client.num_interacciones} interacciones
                  </div>
                </div>

                {/* Last Contact Warning */}
                {needsFollowup && (
                  <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 mb-4">
                    <div className="flex items-center gap-2">
                      <AlertCircle className="w-4 h-4 text-yellow-600" />
                      <span className="text-xs text-yellow-800 font-medium">
                        Hace {daysSinceContact} días sin contacto
                      </span>
                    </div>
                  </div>
                )}

                {/* Actions */}
                <div className="flex gap-2">
                  <Link
                    href={`/clients/${client.id}`}
                    className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 transition-colors"
                  >
                    <Eye className="w-4 h-4" />
                    Ver Detalle
                  </Link>
                </div>
              </div>
            );
          })}
        </div>

        {filteredClients.length === 0 && (
          <div className="text-center py-12">
            <Users className="w-16 h-16 text-slate-300 mx-auto mb-4" />
            <p className="text-slate-600 text-lg">No se encontraron clientes</p>
            <p className="text-slate-400 text-sm">
              Intenta ajustar los filtros o agregar un nuevo cliente
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
