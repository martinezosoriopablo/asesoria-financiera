"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import AdvisorHeader from "@/components/shared/AdvisorHeader";
import { useAdvisor } from "@/lib/hooks/useAdvisor";
import {
  Users,
  Search,
  Plus,
  Filter,
  Phone,
  Calendar,
  DollarSign,
  Shield,
  Eye,
  Loader,
  AlertCircle,
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

const PERFIL_LABELS: Record<string, string> = {
  conservador: "Conservador",
  moderado: "Moderado",
  agresivo: "Agresivo",
  muy_agresivo: "Muy Agresivo",
  defensivo: "Defensivo",
  crecimiento: "Crecimiento",
};

const STATUS_STYLES: Record<string, string> = {
  activo: "bg-emerald-50 text-emerald-700",
  prospecto: "bg-amber-50 text-amber-700",
  inactivo: "bg-gray-100 text-gray-600",
};

export default function ClientsManager() {
  const { advisor, loading: authLoading } = useAdvisor();
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
    filterClientsFn();
  }, [clients, searchTerm, filterStatus, filterPerfil]);

  const fetchClients = async () => {
    try {
      const response = await fetch("/api/clients");
      const data = await response.json();
      if (data.success) setClients(data.clients);
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
      if (data.success) setStats(data.stats);
    } catch (error) {
      console.error("Error fetching stats:", error);
    }
  };

  const filterClientsFn = () => {
    let filtered = [...clients];
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(
        (c) =>
          c.nombre.toLowerCase().includes(term) ||
          c.apellido.toLowerCase().includes(term) ||
          c.email.toLowerCase().includes(term)
      );
    }
    if (filterStatus !== "all") filtered = filtered.filter((c) => c.status === filterStatus);
    if (filterPerfil !== "all") filtered = filtered.filter((c) => c.perfil_riesgo === filterPerfil);
    setFilteredClients(filtered);
  };

  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat("es-CL", { style: "currency", currency: "CLP", minimumFractionDigits: 0 }).format(amount);

  const getDaysSinceLastContact = (lastContact: string) => {
    const diffTime = Math.abs(new Date().getTime() - new Date(lastContact).getTime());
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  };

  if (authLoading || loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader className="w-8 h-8 text-gb-gray animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {advisor && (
        <AdvisorHeader advisorName={advisor.name} advisorEmail={advisor.email} advisorPhoto={advisor.photo} />
      )}

      <div className="max-w-6xl mx-auto px-5 py-8">
        {/* Page header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-semibold text-gb-black">Clientes</h1>
            <p className="text-sm text-gb-gray mt-0.5">
              {filteredClients.length} cliente{filteredClients.length !== 1 ? "s" : ""}
              {(searchTerm || filterStatus !== "all" || filterPerfil !== "all") && ` de ${clients.length}`}
            </p>
          </div>
          <Link
            href="/clients/new"
            className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium bg-gb-black text-white rounded-md hover:bg-gb-dark"
          >
            <Plus className="w-4 h-4" />
            Nuevo Cliente
          </Link>
        </div>

        {/* Stats */}
        {stats && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            {[
              { label: "Total", value: stats.total_clientes },
              { label: "Activos", value: stats.clientes_activos },
              { label: "Prospectos", value: stats.prospectos },
              { label: "Patrimonio Total", value: formatCurrency(stats.patrimonio_total) },
            ].map((s) => (
              <div key={s.label} className="bg-white rounded-lg border border-gb-border p-4">
                <p className="text-xs font-medium text-gb-gray uppercase tracking-wide">{s.label}</p>
                <p className="text-xl font-semibold text-gb-black mt-1">{s.value}</p>
              </div>
            ))}
          </div>
        )}

        {/* Filters */}
        <div className="bg-white rounded-lg border border-gb-border p-4 mb-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gb-gray" />
              <input
                type="text"
                placeholder="Buscar por nombre o email..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-3 py-2 border border-gb-border rounded-md text-sm focus:ring-2 focus:ring-gb-accent focus:border-transparent"
              />
            </div>
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="w-full px-3 py-2 border border-gb-border rounded-md text-sm bg-white focus:ring-2 focus:ring-gb-accent"
            >
              <option value="all">Todos los estados</option>
              <option value="activo">Activo</option>
              <option value="prospecto">Prospecto</option>
              <option value="inactivo">Inactivo</option>
            </select>
            <select
              value={filterPerfil}
              onChange={(e) => setFilterPerfil(e.target.value)}
              className="w-full px-3 py-2 border border-gb-border rounded-md text-sm bg-white focus:ring-2 focus:ring-gb-accent"
            >
              <option value="all">Todos los perfiles</option>
              <option value="defensivo">Defensivo</option>
              <option value="conservador">Conservador</option>
              <option value="moderado">Moderado</option>
              <option value="crecimiento">Crecimiento</option>
              <option value="agresivo">Agresivo</option>
              <option value="muy_agresivo">Muy Agresivo</option>
            </select>
          </div>
        </div>

        {/* Client table */}
        {filteredClients.length > 0 ? (
          <div className="bg-white rounded-lg border border-gb-border overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gb-border bg-gb-light">
                    <th className="text-left py-3 px-4 font-medium text-gb-gray">Nombre</th>
                    <th className="text-left py-3 px-4 font-medium text-gb-gray hidden md:table-cell">Contacto</th>
                    <th className="text-left py-3 px-4 font-medium text-gb-gray">Perfil</th>
                    <th className="text-right py-3 px-4 font-medium text-gb-gray hidden lg:table-cell">Patrimonio</th>
                    <th className="text-left py-3 px-4 font-medium text-gb-gray">Estado</th>
                    <th className="text-right py-3 px-4 font-medium text-gb-gray hidden lg:table-cell">Último contacto</th>
                    <th className="text-right py-3 px-4 font-medium text-gb-gray"></th>
                  </tr>
                </thead>
                <tbody>
                  {filteredClients.map((client) => {
                    const days = getDaysSinceLastContact(client.ultima_interaccion);
                    const needsFollowup = days > 30;
                    return (
                      <tr key={client.id} className="border-b border-gb-border last:border-0 hover:bg-gray-50">
                        <td className="py-3 px-4">
                          <div className="font-medium text-gb-black">
                            {client.nombre} {client.apellido}
                          </div>
                          <div className="text-xs text-gb-gray md:hidden">{client.email}</div>
                        </td>
                        <td className="py-3 px-4 text-gb-gray hidden md:table-cell">
                          <div>{client.email}</div>
                          {client.telefono && <div className="text-xs">{client.telefono}</div>}
                        </td>
                        <td className="py-3 px-4">
                          {client.perfil_riesgo ? (
                            <div>
                              <span className="text-sm text-gb-black">
                                {PERFIL_LABELS[client.perfil_riesgo] || client.perfil_riesgo}
                              </span>
                              <span className="text-xs text-gb-gray ml-1">({client.puntaje_riesgo})</span>
                            </div>
                          ) : (
                            <span className="text-xs text-gb-gray">Sin perfil</span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-right tabular-nums text-gb-black hidden lg:table-cell">
                          {client.patrimonio_estimado ? formatCurrency(client.patrimonio_estimado) : "—"}
                        </td>
                        <td className="py-3 px-4">
                          <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${STATUS_STYLES[client.status] || STATUS_STYLES.activo}`}>
                            {client.status}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-right hidden lg:table-cell">
                          <span className={`text-xs ${needsFollowup ? "text-amber-600 font-medium" : "text-gb-gray"}`}>
                            Hace {days}d
                          </span>
                        </td>
                        <td className="py-3 px-4 text-right">
                          <Link
                            href={`/clients/${client.id}`}
                            className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-gb-accent hover:text-gb-black border border-gb-border rounded-md hover:bg-gb-light"
                          >
                            <Eye className="w-3.5 h-3.5" />
                            Ver
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <div className="text-center py-16">
            <Users className="w-12 h-12 text-gb-border mx-auto mb-3" />
            <p className="text-gb-gray">No se encontraron clientes</p>
            <p className="text-xs text-gb-gray mt-1">Ajusta los filtros o agrega un nuevo cliente</p>
          </div>
        )}
      </div>
    </div>
  );
}
