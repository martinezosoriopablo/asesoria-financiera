"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import AdvisorHeader from "@/components/shared/AdvisorHeader";
import WeeklyCalendar from "@/components/dashboard/WeeklyCalendar";
import NewMeetingForm from "@/components/dashboard/NewMeetingForm";
import { useAdvisor } from "@/lib/hooks/useAdvisor";
import {
  Users,
  UserCheck,
  UserPlus,
  DollarSign,
  Calendar,
  Plus,
  Shield,
  Briefcase,
  BarChart3,
  ArrowRight,
  Loader,
  Clock,
} from "lucide-react";
import ComiteReportsPanel from "@/components/comite/ComiteReportsPanel";

interface Stats {
  total_clientes: number;
  clientes_activos: number;
  prospectos: number;
  aum_total: number;
  reuniones_pendientes: number;
  reuniones_esta_semana: number;
}

export default function AdvisorDashboard() {
  const { advisor, loading: authLoading } = useAdvisor();
  const [stats, setStats] = useState<Stats | null>(null);
  const [meetings, setMeetings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showNewMeeting, setShowNewMeeting] = useState(false);

  useEffect(() => {
    if (advisor) fetchData();
  }, [advisor]);

  if (authLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader className="w-8 h-8 text-gb-gray animate-spin" />
      </div>
    );
  }

  if (!advisor) return null;

  const fetchData = async () => {
    try {
      const [statsRes, meetingsRes] = await Promise.all([
        fetch("/api/advisor/stats"),
        fetch("/api/advisor/meetings?timeframe=week"),
      ]);
      const statsData = await statsRes.json();
      const meetingsData = await meetingsRes.json();
      if (statsData.success) setStats(statsData.stats);
      if (meetingsData.success) setMeetings(meetingsData.meetings);
    } catch {
      // Error silencioso - el usuario verá datos vacíos
    } finally {
      setLoading(false);
    }
  };

  const formatDate = () =>
    new Date().toLocaleDateString("es-CL", {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
    });

  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat("es-CL", {
      style: "currency",
      currency: "CLP",
      minimumFractionDigits: 0,
    }).format(amount);

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <AdvisorHeader advisorName={advisor.name} advisorEmail={advisor.email} advisorPhoto={advisor.photo} advisorLogo={advisor.logo} companyName={advisor.companyName} isAdmin={advisor.isAdmin} />
        <div className="flex items-center justify-center py-32">
          <Loader className="w-8 h-8 text-gb-gray animate-spin" />
        </div>
      </div>
    );
  }

  const FLOW_STEPS = [
    {
      href: "/clients",
      icon: Users,
      title: "Clientes",
      desc: "Gestiona tu cartera de clientes",
      count: stats?.total_clientes,
    },
    {
      href: "/analisis-cartola",
      icon: Shield,
      title: "Perfil de Riesgo & Cartola",
      desc: "Cuestionario de riesgo y análisis de cartola",
    },
    {
      href: "/portfolio-comparison",
      icon: BarChart3,
      title: "Comparación Ideal vs Actual",
      desc: "Compara benchmark con cartera actual",
    },
    {
      href: "/modelo-cartera",
      icon: Briefcase,
      title: "Modelo de Cartera",
      desc: "Construye propuestas de inversión",
    },
  ];

  return (
    <div className="min-h-screen bg-background">
      <AdvisorHeader advisorName={advisor.name} advisorEmail={advisor.email} advisorPhoto={advisor.photo} advisorLogo={advisor.logo} companyName={advisor.companyName} isAdmin={advisor.isAdmin} />

      <div className="max-w-6xl mx-auto px-5 py-8">
        {/* Welcome */}
        <div className="mb-8">
          <h1 className="text-2xl font-semibold text-gb-black">
            Bienvenido, {advisor.name.split(" ")[0]}
          </h1>
          <p className="text-sm text-gb-gray capitalize mt-0.5">{formatDate()}</p>
        </div>

        {/* Stats */}
        {stats && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
            {[
              { label: "Total Clientes", value: stats.total_clientes, icon: Users },
              { label: "Activos", value: stats.clientes_activos, icon: UserCheck },
              { label: "Prospectos", value: stats.prospectos, icon: UserPlus },
              { label: "AUM Total", value: formatCurrency(stats.aum_total), icon: DollarSign },
            ].map((s) => (
              <div key={s.label} className="bg-white rounded-lg border border-gb-border p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-medium text-gb-gray uppercase tracking-wide">{s.label}</span>
                  <s.icon className="w-4 h-4 text-gb-gray" />
                </div>
                <p className="text-2xl font-semibold text-gb-black">{s.value}</p>
              </div>
            ))}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left: Calendar */}
          <div className="lg:col-span-2">
            <div className="bg-white rounded-lg border border-gb-border p-5">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-base font-semibold text-gb-black flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-gb-gray" />
                  Agenda de la Semana
                </h2>
                <button
                  onClick={() => setShowNewMeeting(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium bg-gb-black text-white rounded-md hover:bg-gb-dark"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Nueva Reunión
                </button>
              </div>
              <WeeklyCalendar meetings={meetings} />
            </div>

            {showNewMeeting && (
              <NewMeetingForm
                onClose={() => setShowNewMeeting(false)}
                onSuccess={() => fetchData()}
              />
            )}

            {/* Advisor Workflow */}
            <div className="mt-6">
              <h2 className="text-base font-semibold text-gb-black mb-3">Flujo de Asesoría</h2>
              <div className="space-y-2">
                {FLOW_STEPS.map((step, i) => {
                  const Icon = step.icon;
                  return (
                    <Link
                      key={step.href}
                      href={step.href}
                      className="flex items-center gap-4 bg-white rounded-lg border border-gb-border p-4 hover:border-gb-accent transition-colors group"
                    >
                      <div className="flex items-center justify-center w-8 h-8 rounded-full bg-gb-light text-gb-accent text-sm font-semibold shrink-0">
                        {i + 1}
                      </div>
                      <Icon className="w-5 h-5 text-gb-gray shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gb-black">{step.title}</p>
                        <p className="text-xs text-gb-gray">{step.desc}</p>
                      </div>
                      {step.count !== undefined && (
                        <span className="text-sm font-semibold text-gb-accent">{step.count}</span>
                      )}
                      <ArrowRight className="w-4 h-4 text-gb-gray opacity-0 group-hover:opacity-100 transition-opacity" />
                    </Link>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Right: Quick Actions */}
          <div className="space-y-4">
            <div className="bg-white rounded-lg border border-gb-border p-5">
              <h2 className="text-base font-semibold text-gb-black mb-3">Acciones Rápidas</h2>
              <div className="space-y-2">
                <Link
                  href="/clients/new"
                  className="flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium text-gb-black hover:bg-gb-light transition-colors"
                >
                  <UserPlus className="w-4 h-4 text-gb-gray" />
                  Nuevo Cliente
                </Link>
                <Link
                  href="/analisis-cartola"
                  className="flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium text-gb-black hover:bg-gb-light transition-colors"
                >
                  <Shield className="w-4 h-4 text-gb-gray" />
                  Enviar Cuestionario de Riesgo
                </Link>
                <Link
                  href="/modelo-cartera"
                  className="flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium text-gb-black hover:bg-gb-light transition-colors"
                >
                  <Briefcase className="w-4 h-4 text-gb-gray" />
                  Crear Modelo de Cartera
                </Link>
                <Link
                  href="/market-dashboard"
                  className="flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium text-gb-black hover:bg-gb-light transition-colors"
                >
                  <BarChart3 className="w-4 h-4 text-gb-gray" />
                  Ver Market Dashboard
                </Link>
              </div>
            </div>

            {/* Comite Reports Panel */}
            <ComiteReportsPanel />

            {/* Pending meetings */}
            {stats && stats.reuniones_pendientes > 0 && (
              <div className="bg-white rounded-lg border border-gb-border p-5">
                <h2 className="text-base font-semibold text-gb-black mb-2 flex items-center gap-2">
                  <Clock className="w-4 h-4 text-gb-warning" />
                  Pendientes
                </h2>
                <p className="text-sm text-gb-gray">
                  Tienes <span className="font-semibold text-gb-black">{stats.reuniones_pendientes}</span> reunión(es) pendiente(s) esta semana.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
