"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import AdvisorHeader from "@/components/shared/AdvisorHeader";
import StatsCards from "@/components/dashboard/StatsCards";
import WeeklyCalendar from "@/components/dashboard/WeeklyCalendar";
import NewMeetingForm from "@/components/dashboard/NewMeetingForm";
import { useAdvisor } from "@/lib/hooks/useAdvisor";
import {
  TrendingUp,
  Plus,
  Calendar,
  Shield,
  BarChart3,
  Activity,
  Users,
  Calculator,
  GraduationCap,
  PieChart,
  Loader,
} from "lucide-react";

interface Stats {
  total_clientes: number;
  clientes_activos: number;
  prospectos: number;
  aum_total: number;
  reuniones_pendientes: number;
  reuniones_esta_semana: number;
}

export default function ImprovedAdvisorDashboard() {
  const { advisor, loading: authLoading } = useAdvisor();
  const [stats, setStats] = useState<Stats | null>(null);
  const [meetings, setMeetings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showNewMeeting, setShowNewMeeting] = useState(false);

  const logoUrl = "https://zysotxkelepvotzujhxe.supabase.co/storage/v1/object/public/assets/logo.png";

  useEffect(() => {
    if (advisor) fetchData();
  }, [advisor]);

  if (authLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 flex items-center justify-center">
        <Loader className="w-12 h-12 text-blue-600 animate-spin" />
      </div>
    );
  }

  if (!advisor) return null;

  const fetchData = async () => {
    try {
      // Obtener estadísticas
      const statsRes = await fetch(
        `/api/advisor/stats?email=${advisor.email}`
      );
      const statsData = await statsRes.json();
      if (statsData.success) {
        setStats(statsData.stats);
      }

      // Obtener reuniones de la semana
      const meetingsRes = await fetch(
        `/api/advisor/meetings?email=${advisor.email}&timeframe=week`
      );
      const meetingsData = await meetingsRes.json();
      if (meetingsData.success) {
        setMeetings(meetingsData.meetings);
      }
    } catch (error) {
      console.error("Error fetching data:", error);
    } finally {
      setLoading(false);
    }
  };
  const formatDate = () => {
    return new Date().toLocaleDateString("es-CL", {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
    });
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
      <AdvisorHeader
        advisorName={advisor.name}
        advisorEmail={advisor.email}
        advisorPhoto={advisor.photo}
        logoUrl={logoUrl}
      />

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Bienvenida */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-slate-900 mb-1">
            Bienvenido, {advisor.name.split(" ")[0]} 👋
          </h1>
          <p className="text-slate-600 capitalize">{formatDate()}</p>
        </div>

        {/* Stats Cards */}
        {stats && (
          <div className="mb-8">
            <StatsCards
              totalClientes={stats.total_clientes}
              clientesActivos={stats.clientes_activos}
              prospectos={stats.prospectos}
              aumTotal={stats.aum_total}
              reunionesPendientes={stats.reuniones_pendientes}
              reunionesEstaSemana={stats.reuniones_esta_semana}
            />
          </div>
        )}

        {/* Calendario Semanal */}
        <div className="mb-8">
          <div className="bg-white rounded-xl shadow-md p-6">
            {/* Header con botón */}
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
                <Calendar className="w-6 h-6 text-blue-600" />
                Calendario de esta Semana
              </h2>
              <button
                onClick={() => setShowNewMeeting(true)}
                className="px-4 py-2 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2"
              >
                <Plus className="w-4 h-4" />
                Nueva Reunión
              </button>
            </div>
            
            <WeeklyCalendar meetings={meetings} />
          </div>
        </div>

        {/* Modal */}
        {showNewMeeting && (
          <NewMeetingForm
            advisorEmail={advisor.email}
            onClose={() => setShowNewMeeting(false)}
            onSuccess={() => fetchData()}
          />
        )}

        {/* Accesos Rápidos */}
        <div className="mb-8">
          <h2 className="text-xl font-bold text-slate-900 mb-4">
            Accesos Rápidos
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Nuevo Cliente - AZUL OSCURO */}
            <Link
              href="/clients/new"
              style={{
                backgroundColor: '#1e40af',
                color: '#ffffff',
              }}
              className="rounded-xl shadow-lg hover:shadow-xl transition-all p-6"
            >
              <div className="flex items-center justify-between">
                <div>
                  <p style={{ color: '#ffffff', fontWeight: 'bold', fontSize: '0.875rem', marginBottom: '0.5rem' }}>
                    Nuevo Cliente
                  </p>
                  <p style={{ color: '#ffffff', fontWeight: 'bold', fontSize: '2.5rem' }}>
                    +
                  </p>
                </div>
                <Users style={{ width: '3rem', height: '3rem', color: '#ffffff' }} />
              </div>
            </Link>

            {/* Mis Clientes - VERDE OSCURO */}
            <Link
              href="/clients"
              style={{
                backgroundColor: '#15803d',
                color: '#ffffff',
              }}
              className="rounded-xl shadow-lg hover:shadow-xl transition-all p-6"
            >
              <div className="flex items-center justify-between">
                <div>
                  <p style={{ color: '#ffffff', fontWeight: 'bold', fontSize: '0.875rem', marginBottom: '0.5rem' }}>
                    Mis Clientes
                  </p>
                  <p style={{ color: '#ffffff', fontWeight: 'bold', fontSize: '2.5rem' }}>
                    {stats?.total_clientes || 0}
                  </p>
                </div>
                <Users style={{ width: '3rem', height: '3rem', color: '#ffffff' }} />
              </div>
            </Link>

            {/* Market Dashboard - MORADO OSCURO */}
            <Link
              href="/market-dashboard"
              style={{
                backgroundColor: '#7c3aed',
                color: '#ffffff',
              }}
              className="rounded-xl shadow-lg hover:shadow-xl transition-all p-6"
            >
              <div className="flex items-center justify-between">
                <div>
                  <p style={{ color: '#ffffff', fontWeight: 'bold', fontSize: '0.875rem', marginBottom: '0.5rem' }}>
                    Market Dashboard
                  </p>
                  <p style={{ color: '#ffffff', fontWeight: 'bold', fontSize: '2.5rem' }}>
                    →
                  </p>
                </div>
                <Activity style={{ width: '3rem', height: '3rem', color: '#ffffff' }} />
              </div>
            </Link>
          </div>
        </div>

        {/* Herramientas de Asesoría */}
        <div>
          <h2 className="text-xl font-bold text-slate-900 mb-4">
            Herramientas de Asesoría
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {/* Perfil de Riesgo y Cartola */}
            <Link
              href="/analisis-cartola"
              className="group bg-white rounded-xl shadow-md hover:shadow-xl transition-all duration-300 p-8 border-2 border-transparent hover:border-blue-500"
            >
              <div className="flex flex-col items-center text-center">
                <div className="w-16 h-16 bg-gradient-to-br from-blue-500 to-blue-600 rounded-full flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                  <Shield className="w-8 h-8 text-white" />
                </div>
                <h3 className="text-xl font-bold text-slate-900 mb-2">
                  Perfil de Riesgo
                </h3>
                <p className="text-slate-600 text-sm mb-4">
                  Sube la cartola del cliente y envía el cuestionario de riesgo
                </p>
                <span className="text-blue-600 font-semibold text-sm group-hover:underline">
                  Abrir herramienta →
                </span>
              </div>
            </Link>

            {/* Constructor de Modelo */}
            <Link
              href="/modelo-cartera"
              className="group bg-white rounded-xl shadow-md hover:shadow-xl transition-all duration-300 p-8 border-2 border-transparent hover:border-green-500"
            >
              <div className="flex flex-col items-center text-center">
                <div className="w-16 h-16 bg-gradient-to-br from-green-500 to-green-600 rounded-full flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                  <TrendingUp className="w-8 h-8 text-white" />
                </div>
                <h3 className="text-xl font-bold text-slate-900 mb-2">
                  Constructor de Modelo
                </h3>
                <p className="text-slate-600 text-sm mb-4">
                  Crea portafolios personalizados
                </p>
                <span className="text-green-600 font-semibold text-sm group-hover:underline">
                  Abrir herramienta →
                </span>
              </div>
            </Link>

            {/* Comparador de Costos */}
            <Link
              href="/portfolio-comparison"
              className="group bg-white rounded-xl shadow-md hover:shadow-xl transition-all duration-300 p-8 border-2 border-transparent hover:border-purple-500"
            >
              <div className="flex flex-col items-center text-center">
                <div className="w-16 h-16 bg-gradient-to-br from-purple-500 to-purple-600 rounded-full flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                  <BarChart3 className="w-8 h-8 text-white" />
                </div>
                <h3 className="text-xl font-bold text-slate-900 mb-2">
                  Comparador de Costos
                </h3>
                <p className="text-slate-600 text-sm mb-4">
                  Compara costos de diferentes portafolios
                </p>
                <span className="text-purple-600 font-semibold text-sm group-hover:underline">
                  Abrir herramienta →
                </span>
              </div>
            </Link>

            {/* Market Dashboard */}
            <Link
              href="/market-dashboard"
              className="group bg-white rounded-xl shadow-md hover:shadow-xl transition-all duration-300 p-8 border-2 border-transparent hover:border-orange-500"
            >
              <div className="flex flex-col items-center text-center">
                <div className="w-16 h-16 bg-gradient-to-br from-orange-500 to-orange-600 rounded-full flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                  <Activity className="w-8 h-8 text-white" />
                </div>
                <h3 className="text-xl font-bold text-slate-900 mb-2">
                  Market Dashboard
                </h3>
                <p className="text-slate-600 text-sm mb-4">
                  Panorama del mercado chileno de fondos mutuos
                </p>
                <span className="text-orange-600 font-semibold text-sm group-hover:underline">
                  Abrir herramienta →
                </span>
              </div>
            </Link>

            {/* Calculadora APV */}
            <Link
              href="/calculadora-apv"
              className="group bg-white rounded-xl shadow-md hover:shadow-xl transition-all duration-300 p-8 border-2 border-transparent hover:border-pink-500"
            >
              <div className="flex flex-col items-center text-center">
                <div className="w-16 h-16 bg-gradient-to-br from-pink-500 to-pink-600 rounded-full flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                  <Calculator className="w-8 h-8 text-white" />
                </div>
                <h3 className="text-xl font-bold text-slate-900 mb-2">
                  Calculadora APV
                </h3>
                <p className="text-slate-600 text-sm mb-4">
                  Calcula beneficios tributarios del APV
                </p>
                <span className="text-pink-600 font-semibold text-sm group-hover:underline">
                  Abrir herramienta →
                </span>
              </div>
            </Link>

            {/* Educación Financiera */}
            <Link
              href="/educacion-financiera"
              className="group bg-white rounded-xl shadow-md hover:shadow-xl transition-all duration-300 p-8 border-2 border-transparent hover:border-indigo-500"
            >
              <div className="flex flex-col items-center text-center">
                <div className="w-16 h-16 bg-gradient-to-br from-indigo-500 to-indigo-600 rounded-full flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                  <GraduationCap className="w-8 h-8 text-white" />
                </div>
                <h3 className="text-xl font-bold text-slate-900 mb-2">
                  Educación Financiera
                </h3>
                <p className="text-slate-600 text-sm mb-4">
                  Recursos educativos para clientes
                </p>
                <span className="text-indigo-600 font-semibold text-sm group-hover:underline">
                  Abrir herramienta →
                </span>
              </div>
            </Link>

            {/* Comparador ETFs */}
            <Link
              href="/comparador-etf"
              className="group bg-white rounded-xl shadow-md hover:shadow-xl transition-all duration-300 p-8 border-2 border-transparent hover:border-cyan-500"
            >
              <div className="flex flex-col items-center text-center">
                <div className="w-16 h-16 bg-gradient-to-br from-cyan-500 to-cyan-600 rounded-full flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                  <PieChart className="w-8 h-8 text-white" />
                </div>
                <h3 className="text-xl font-bold text-slate-900 mb-2">
                  Comparador ETFs
                </h3>
                <p className="text-slate-600 text-sm mb-4">
                  Compara ETFs y visualiza performance
                </p>
                <span className="text-cyan-600 font-semibold text-sm group-hover:underline">
                  Abrir herramienta →
                </span>
              </div>
            </Link>

            {/* Analizador de Fondos */}
            <Link
              href="/analisis-fondos"
              className="group bg-white rounded-xl shadow-md hover:shadow-xl transition-all duration-300 p-8 border-2 border-transparent hover:border-teal-500"
            >
              <div className="flex flex-col items-center text-center">
                <div className="w-16 h-16 bg-gradient-to-br from-teal-500 to-teal-600 rounded-full flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                  <BarChart3 className="w-8 h-8 text-white" />
                </div>
                <h3 className="text-xl font-bold text-slate-900 mb-2">
                  Análisis de Fondos
                </h3>
                <p className="text-slate-600 text-sm mb-4">
                  Analiza fondos mutuos con IA
                </p>
                <span className="text-teal-600 font-semibold text-sm group-hover:underline">
                  Abrir herramienta →
                </span>
              </div>
            </Link>

            {/* Gestión de Clientes */}
            <Link
              href="/clients"
              className="group bg-white rounded-xl shadow-md hover:shadow-xl transition-all duration-300 p-8 border-2 border-transparent hover:border-emerald-500"
            >
              <div className="flex flex-col items-center text-center">
                <div className="w-16 h-16 bg-gradient-to-br from-emerald-500 to-teal-500 rounded-full flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                  <Users className="w-8 h-8 text-white" />
                </div>
                <h3 className="text-xl font-bold text-slate-900 mb-2">
                  Gestión de Clientes
                </h3>
                <p className="text-slate-600 text-sm mb-4">
                  Administra clientes, historial de interacciones y seguimiento
                </p>
                <span className="text-emerald-600 font-semibold text-sm group-hover:underline">
                  Abrir herramienta →
                </span>
              </div>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
