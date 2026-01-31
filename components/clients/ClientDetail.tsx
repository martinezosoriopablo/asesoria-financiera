"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Mail,
  Phone,
  Calendar,
  DollarSign,
  Shield,
  TrendingUp,
  Edit,
  Plus,
  Loader,
  FileText,
  Clock,
  User,
  Target,
  BarChart3,
} from "lucide-react";

interface Client {
  id: string;
  nombre: string;
  apellido: string;
  email: string;
  telefono: string;
  rut: string;
  patrimonio_estimado: number;
  ingreso_mensual: number;
  objetivo_inversion: string;
  horizonte_temporal: string;
  perfil_riesgo: string;
  puntaje_riesgo: number;
  tolerancia_perdida: number;
  tiene_portfolio: boolean;
  portfolio_data: any;
  status: string;
  notas: string;
  fecha_onboarding: string;
  ultima_interaccion: string;
  client_interactions: Interaction[];
}

interface Interaction {
  id: string;
  tipo: string;
  titulo: string;
  descripcion: string;
  resultado: string;
  duracion_minutos: number;
  fecha: string;
  created_by: string;
}

const TIPO_ICONS: { [key: string]: any } = {
  llamada: Phone,
  email: Mail,
  reunion: User,
  perfil_riesgo: Shield,
  modelo_cartera: TrendingUp,
  analisis_fondos: BarChart3,
  comparador_etf: TrendingUp,
  calculadora_apv: DollarSign,
  otro: FileText,
};

const TIPO_COLORS: { [key: string]: string } = {
  llamada: "bg-blue-100 text-blue-700",
  email: "bg-purple-100 text-purple-700",
  reunion: "bg-green-100 text-green-700",
  perfil_riesgo: "bg-orange-100 text-orange-700",
  modelo_cartera: "bg-pink-100 text-pink-700",
  analisis_fondos: "bg-indigo-100 text-indigo-700",
  comparador_etf: "bg-cyan-100 text-cyan-700",
  calculadora_apv: "bg-teal-100 text-teal-700",
  otro: "bg-gray-100 text-gray-700",
};

export default function ClientDetail({ clientId }: { clientId: string }) {
  const [client, setClient] = useState<Client | null>(null);
  const [loading, setLoading] = useState(true);
  const [showAddInteraction, setShowAddInteraction] = useState(false);
  const [newInteraction, setNewInteraction] = useState({
    tipo: "llamada",
    titulo: "",
    descripcion: "",
    resultado: "exitoso",
    duracion_minutos: "",
  });

  useEffect(() => {
    fetchClient();
  }, [clientId]);

  const fetchClient = async () => {
    try {
      const response = await fetch(`/api/clients/${clientId}`);
      const data = await response.json();
      if (data.success) {
        setClient(data.client);
      }
    } catch (error) {
      console.error("Error fetching client:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleAddInteraction = async () => {
    try {
      const response = await fetch(`/api/clients/${clientId}/interactions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...newInteraction,
          duracion_minutos: newInteraction.duracion_minutos
            ? parseInt(newInteraction.duracion_minutos)
            : null,
        }),
      });

      const data = await response.json();
      if (data.success) {
        setShowAddInteraction(false);
        setNewInteraction({
          tipo: "llamada",
          titulo: "",
          descripcion: "",
          resultado: "exitoso",
          duracion_minutos: "",
        });
        fetchClient(); // Refresh
      }
    } catch (error) {
      console.error("Error adding interaction:", error);
    }
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
      month: "long",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 flex items-center justify-center">
        <Loader className="w-12 h-12 text-blue-600 animate-spin" />
      </div>
    );
  }

  if (!client) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 flex items-center justify-center">
        <div className="text-center">
          <p className="text-slate-600 text-lg">Cliente no encontrado</p>
          <Link
            href="/clients"
            className="text-blue-600 hover:underline mt-4 inline-block"
          >
            Volver a la lista
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <Link
            href="/clients"
            className="flex items-center gap-2 text-slate-600 hover:text-slate-900 transition-colors mb-6"
          >
            <ArrowLeft className="w-5 h-5" />
            <span className="text-sm font-medium">Volver a Clientes</span>
          </Link>

          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-3xl font-bold text-slate-900">
                {client.nombre} {client.apellido}
              </h1>
              <p className="text-slate-600 mt-1">Cliente desde {formatDate(client.fecha_onboarding)}</p>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setShowAddInteraction(true)}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 transition-colors"
              >
                <Plus className="w-5 h-5" />
                Nueva Interacción
              </button>
              <Link
                href={`/clients/${client.id}/edit`}
                className="flex items-center gap-2 px-4 py-2 border-2 border-slate-300 text-slate-700 font-semibold rounded-lg hover:bg-slate-50 transition-colors"
              >
                <Edit className="w-5 h-5" />
                Editar
              </Link>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Column - Info */}
          <div className="lg:col-span-1 space-y-6">
            {/* Contact Info */}
            <div className="bg-white rounded-xl shadow-md p-6">
              <h2 className="text-lg font-bold text-slate-900 mb-4">
                Información de Contacto
              </h2>
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <Mail className="w-5 h-5 text-slate-400" />
                  <div>
                    <p className="text-xs text-slate-500">Email</p>
                    <p className="text-sm font-medium text-slate-900">{client.email}</p>
                  </div>
                </div>
                {client.telefono && (
                  <div className="flex items-center gap-3">
                    <Phone className="w-5 h-5 text-slate-400" />
                    <div>
                      <p className="text-xs text-slate-500">Teléfono</p>
                      <p className="text-sm font-medium text-slate-900">{client.telefono}</p>
                    </div>
                  </div>
                )}
                {client.rut && (
                  <div className="flex items-center gap-3">
                    <User className="w-5 h-5 text-slate-400" />
                    <div>
                      <p className="text-xs text-slate-500">RUT</p>
                      <p className="text-sm font-medium text-slate-900">{client.rut}</p>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Financial Info */}
            <div className="bg-white rounded-xl shadow-md p-6">
              <h2 className="text-lg font-bold text-slate-900 mb-4">
                Información Financiera
              </h2>
              <div className="space-y-4">
                {client.patrimonio_estimado && (
                  <div>
                    <p className="text-xs text-slate-500 mb-1">Patrimonio Estimado</p>
                    <p className="text-2xl font-bold text-blue-600">
                      {formatCurrency(client.patrimonio_estimado)}
                    </p>
                  </div>
                )}
                {client.ingreso_mensual && (
                  <div>
                    <p className="text-xs text-slate-500 mb-1">Ingreso Mensual</p>
                    <p className="text-xl font-bold text-green-600">
                      {formatCurrency(client.ingreso_mensual)}
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* Risk Profile */}
            {client.perfil_riesgo && (
              <div className="bg-white rounded-xl shadow-md p-6">
                <h2 className="text-lg font-bold text-slate-900 mb-4 flex items-center gap-2">
                  <Shield className="w-5 h-5" />
                  Perfil de Riesgo
                </h2>
                <div className="space-y-3">
                  <div>
                    <p className="text-xs text-slate-500 mb-1">Clasificación</p>
                    <p className="text-lg font-bold text-slate-900 capitalize">
                      {client.perfil_riesgo.replace("_", " ")}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500 mb-1">Puntaje</p>
                    <div className="flex items-center gap-2">
                      <div className="flex-1 bg-slate-200 rounded-full h-2">
                        <div
                          className="bg-blue-600 h-2 rounded-full"
                          style={{ width: `${client.puntaje_riesgo}%` }}
                        />
                      </div>
                      <span className="text-sm font-bold text-slate-900">
                        {client.puntaje_riesgo}/100
                      </span>
                    </div>
                  </div>
                  {client.tolerancia_perdida && (
                    <div>
                      <p className="text-xs text-slate-500 mb-1">Tolerancia a Pérdida</p>
                      <p className="text-lg font-bold text-orange-600">
                        {client.tolerancia_perdida}%
                      </p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Investment Goals */}
            {(client.objetivo_inversion || client.horizonte_temporal) && (
              <div className="bg-white rounded-xl shadow-md p-6">
                <h2 className="text-lg font-bold text-slate-900 mb-4 flex items-center gap-2">
                  <Target className="w-5 h-5" />
                  Objetivos de Inversión
                </h2>
                <div className="space-y-3">
                  {client.objetivo_inversion && (
                    <div>
                      <p className="text-xs text-slate-500 mb-1">Objetivo</p>
                      <p className="text-sm font-medium text-slate-900">
                        {client.objetivo_inversion}
                      </p>
                    </div>
                  )}
                  {client.horizonte_temporal && (
                    <div>
                      <p className="text-xs text-slate-500 mb-1">Horizonte Temporal</p>
                      <p className="text-sm font-medium text-slate-900 capitalize">
                        {client.horizonte_temporal.replace("_", " ")}
                      </p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Notes */}
            {client.notas && (
              <div className="bg-white rounded-xl shadow-md p-6">
                <h2 className="text-lg font-bold text-slate-900 mb-4">Notas</h2>
                <p className="text-sm text-slate-600 whitespace-pre-wrap">{client.notas}</p>
              </div>
            )}
          </div>

          {/* Right Column - Interactions */}
          <div className="lg:col-span-2">
            <div className="bg-white rounded-xl shadow-md p-6">
              <h2 className="text-lg font-bold text-slate-900 mb-6 flex items-center gap-2">
                <FileText className="w-5 h-5" />
                Historial de Interacciones ({client.client_interactions?.length || 0})
              </h2>

              {/* Add Interaction Form */}
              {showAddInteraction && (
                <div className="bg-blue-50 rounded-lg p-6 mb-6 border-2 border-blue-200">
                  <h3 className="font-bold text-slate-900 mb-4">Nueva Interacción</h3>
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-2">
                          Tipo
                        </label>
                        <select
                          value={newInteraction.tipo}
                          onChange={(e) =>
                            setNewInteraction({ ...newInteraction, tipo: e.target.value })
                          }
                          className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                        >
                          <option value="llamada">Llamada</option>
                          <option value="email">Email</option>
                          <option value="reunion">Reunión</option>
                          <option value="perfil_riesgo">Perfil de Riesgo</option>
                          <option value="modelo_cartera">Modelo de Cartera</option>
                          <option value="analisis_fondos">Análisis de Fondos</option>
                          <option value="comparador_etf">Comparador ETF</option>
                          <option value="calculadora_apv">Calculadora APV</option>
                          <option value="otro">Otro</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-2">
                          Duración (minutos)
                        </label>
                        <input
                          type="number"
                          value={newInteraction.duracion_minutos}
                          onChange={(e) =>
                            setNewInteraction({
                              ...newInteraction,
                              duracion_minutos: e.target.value,
                            })
                          }
                          className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                          placeholder="30"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-2">
                        Título *
                      </label>
                      <input
                        type="text"
                        value={newInteraction.titulo}
                        onChange={(e) =>
                          setNewInteraction({ ...newInteraction, titulo: e.target.value })
                        }
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                        placeholder="Ej: Revisión de portafolio trimestral"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-2">
                        Descripción
                      </label>
                      <textarea
                        value={newInteraction.descripcion}
                        onChange={(e) =>
                          setNewInteraction({ ...newInteraction, descripcion: e.target.value })
                        }
                        rows={3}
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                        placeholder="Detalles adicionales..."
                      />
                    </div>
                    <div className="flex gap-3">
                      <button
                        onClick={handleAddInteraction}
                        disabled={!newInteraction.titulo}
                        className="px-6 py-2 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed"
                      >
                        Guardar
                      </button>
                      <button
                        onClick={() => setShowAddInteraction(false)}
                        className="px-6 py-2 border-2 border-slate-300 text-slate-700 font-semibold rounded-lg hover:bg-slate-50 transition-colors"
                      >
                        Cancelar
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Interactions Timeline */}
              <div className="space-y-4">
                {client.client_interactions && client.client_interactions.length > 0 ? (
                  client.client_interactions.map((interaction) => {
                    const Icon = TIPO_ICONS[interaction.tipo] || FileText;
                    const colorClass = TIPO_COLORS[interaction.tipo] || TIPO_COLORS.otro;

                    return (
                      <div
                        key={interaction.id}
                        className="border border-slate-200 rounded-lg p-4 hover:shadow-md transition-shadow"
                      >
                        <div className="flex items-start gap-4">
                          <div className={`p-3 rounded-lg ${colorClass}`}>
                            <Icon className="w-5 h-5" />
                          </div>
                          <div className="flex-1">
                            <div className="flex items-start justify-between mb-2">
                              <div>
                                <h4 className="font-bold text-slate-900">
                                  {interaction.titulo}
                                </h4>
                                <p className="text-xs text-slate-500 mt-1">
                                  {formatDate(interaction.fecha)}
                                </p>
                              </div>
                              {interaction.duracion_minutos && (
                                <div className="flex items-center gap-1 text-xs text-slate-600">
                                  <Clock className="w-4 h-4" />
                                  {interaction.duracion_minutos} min
                                </div>
                              )}
                            </div>
                            {interaction.descripcion && (
                              <p className="text-sm text-slate-600 mb-2">
                                {interaction.descripcion}
                              </p>
                            )}
                            <div className="flex items-center gap-2">
                              <span className="text-xs px-2 py-1 bg-slate-100 text-slate-700 rounded capitalize">
                                {interaction.tipo.replace("_", " ")}
                              </span>
                              {interaction.resultado && (
                                <span
                                  className={`text-xs px-2 py-1 rounded capitalize ${
                                    interaction.resultado === "exitoso"
                                      ? "bg-green-100 text-green-800"
                                      : interaction.resultado === "pendiente"
                                      ? "bg-yellow-100 text-yellow-800"
                                      : "bg-blue-100 text-blue-800"
                                  }`}
                                >
                                  {interaction.resultado}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div className="text-center py-12">
                    <FileText className="w-12 h-12 text-slate-300 mx-auto mb-4" />
                    <p className="text-slate-600">No hay interacciones registradas</p>
                    <p className="text-slate-400 text-sm">
                      Agrega la primera interacción con este cliente
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* Quick Actions */}
            <div className="mt-6 bg-gradient-to-r from-blue-600 to-indigo-600 rounded-xl shadow-lg p-6 text-white">
              <h3 className="text-lg font-bold mb-4">Acciones Rápidas</h3>
              <div className="grid grid-cols-2 gap-3">
                <Link
                  href={`/risk-profile?client=${client.email}`}
                  className="flex items-center gap-2 px-4 py-3 bg-white bg-opacity-20 rounded-lg hover:bg-opacity-30 transition-colors"
                >
                  <Shield className="w-5 h-5" />
                  Perfil de Riesgo
                </Link>
                <Link
                  href={`/modelo-cartera?client=${client.email}`}
                  className="flex items-center gap-2 px-4 py-3 bg-white bg-opacity-20 rounded-lg hover:bg-opacity-30 transition-colors"
                >
                  <TrendingUp className="w-5 h-5" />
                  Construir Modelo
                </Link>
                <Link
                  href={`/portfolio-comparison?client=${client.email}`}
                  className="flex items-center gap-2 px-4 py-3 bg-white bg-opacity-20 rounded-lg hover:bg-opacity-30 transition-colors"
                >
                  <BarChart3 className="w-5 h-5" />
                  Comparar Costos
                </Link>
                <Link
                  href={`/analisis-fondos?client=${client.email}`}
                  className="flex items-center gap-2 px-4 py-3 bg-white bg-opacity-20 rounded-lg hover:bg-opacity-30 transition-colors"
                >
                  <FileText className="w-5 h-5" />
                  Analizar Fondos
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
