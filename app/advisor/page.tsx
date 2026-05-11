"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useAdvisor } from "@/lib/hooks/useAdvisor";
import WeeklyCalendar from "@/components/dashboard/WeeklyCalendar";
import NewMeetingForm from "@/components/dashboard/NewMeetingForm";
import GoogleCalendarConnect from "@/components/dashboard/GoogleCalendarConnect";
import ComiteReportsPanel from "@/components/comite/ComiteReportsPanel";
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
  Clock,
  ChevronDown,
  ChevronUp,
  AlertTriangle,
  Video,
  Phone,
  MapPin,
  User,
  Edit3,
  Trash2,
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

interface Meeting {
  id: string;
  titulo: string;
  fecha: string;
  duracion_minutos?: number;
  tipo: string;
  ubicacion?: string;
  descripcion?: string;
  client_id?: string;
  google_event_id?: string;
  clients?: { nombre: string; apellido: string };
  client?: { nombre: string; apellido: string };
}

const FLOW_STEPS = [
  { href: "/clients", icon: Users, title: "Clientes" },
  { href: "/analisis-cartola", icon: Shield, title: "Riesgo & Cartola" },
  { href: "/portfolio-designer?mode=comparison", icon: BarChart3, title: "Comparacion" },
  { href: "/portfolio-designer?mode=model", icon: Briefcase, title: "Modelo" },
];

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Buenos dias";
  if (hour < 20) return "Buenas tardes";
  return "Buenas noches";
}

function formatDate(): string {
  return new Date().toLocaleDateString("es-CL", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("es-CL", {
    style: "currency",
    currency: "CLP",
    minimumFractionDigits: 0,
  }).format(amount);
}

function getTypeIcon(tipo: string) {
  switch (tipo?.toLowerCase()) {
    case "virtual": return <Video className="w-3.5 h-3.5" />;
    case "llamada": return <Phone className="w-3.5 h-3.5" />;
    default: return <MapPin className="w-3.5 h-3.5" />;
  }
}

function getTypeBadgeClass(tipo: string): string {
  switch (tipo?.toLowerCase()) {
    case "virtual": return "bg-blue-100 text-blue-700";
    case "llamada": return "bg-emerald-100 text-emerald-700";
    default: return "bg-purple-100 text-purple-700";
  }
}

function getClientName(meeting: Meeting): string {
  const client = meeting.clients || meeting.client;
  if (!client) return "Cliente";
  return `${client.nombre || ""} ${client.apellido || ""}`.trim() || "Cliente";
}

function formatTime(dateString: string): string {
  try {
    return new Date(dateString).toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "--:--";
  }
}

function StatsSkeleton() {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="bg-white rounded-xl border border-gb-border p-5">
          <div className="skeleton h-3 w-20 mb-3" />
          <div className="skeleton h-7 w-16" />
        </div>
      ))}
    </div>
  );
}

function AgendaSkeleton() {
  return (
    <div className="space-y-3">
      {[0, 1, 2].map((i) => (
        <div key={i} className="flex gap-4 items-start">
          <div className="skeleton h-4 w-12" />
          <div className="flex-1 skeleton h-16 rounded-xl" />
        </div>
      ))}
    </div>
  );
}

export default function AdvisorDashboard() {
  const { advisor, loading: authLoading } = useAdvisor();
  const [stats, setStats] = useState<Stats | null>(null);
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNewMeeting, setShowNewMeeting] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [editingMeeting, setEditingMeeting] = useState<any>(null);
  const [showWeekView, setShowWeekView] = useState(false);

  useEffect(() => {
    if (advisor) fetchData();
  }, [advisor]);

  if (authLoading) {
    return (
      <div className="flex items-center justify-center py-32">
        <Loader className="w-8 h-8 text-gb-primary animate-spin" />
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
      // Error silencioso
    } finally {
      setLoading(false);
    }
  };

  const todayMeetings = meetings.filter((m) => {
    const d = new Date(m.fecha);
    const today = new Date();
    return d.getDate() === today.getDate() && d.getMonth() === today.getMonth() && d.getFullYear() === today.getFullYear();
  });

  const handleDeleteMeeting = async (meeting: Meeting) => {
    if (!confirm(`Cancelar reunion "${meeting.titulo}"?`)) return;
    try {
      const res = await fetch(`/api/advisor/meetings?id=${meeting.id}`, { method: "DELETE" });
      const data = await res.json();
      if (data.success) fetchData();
    } catch { /* silencioso */ }
  };

  const STAT_CARDS = [
    { label: "Total Clientes", value: stats?.total_clientes ?? 0, icon: Users, highlight: false },
    { label: "Activos", value: stats?.clientes_activos ?? 0, icon: UserCheck, highlight: false },
    { label: "Prospectos", value: stats?.prospectos ?? 0, icon: UserPlus, highlight: false },
    { label: "AUM Total", value: formatCurrency(stats?.aum_total ?? 0), icon: DollarSign, highlight: true },
  ];

  return (
    <div className="max-w-6xl mx-auto px-5 py-8">
      {/* Greeting */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gb-black">
          {getGreeting()}, {advisor.name.split(" ")[0]}
        </h1>
        <p className="text-sm text-gb-gray capitalize mt-0.5">{formatDate()}</p>
      </div>

      {/* Stats */}
      {loading ? (
        <StatsSkeleton />
      ) : stats ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          {STAT_CARDS.map((s, i) => {
            const Icon = s.icon;
            return (
              <div
                key={s.label}
                className={`rounded-xl border p-5 transition-all hover:-translate-y-0.5 hover:shadow-md animate-fade-in-up ${
                  s.highlight
                    ? "bg-gb-primary text-white border-gb-primary-dark"
                    : "bg-white border-gb-border"
                }`}
                style={{ animationDelay: `${i * 60}ms` }}
              >
                <div className="flex items-center justify-between mb-3">
                  <span className={`text-xs font-semibold uppercase tracking-wide ${s.highlight ? "text-white/70" : "text-gb-gray"}`}>
                    {s.label}
                  </span>
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${s.highlight ? "bg-white/20" : "bg-gb-primary-light"}`}>
                    <Icon className={`w-4 h-4 ${s.highlight ? "text-white" : "text-gb-primary"}`} />
                  </div>
                </div>
                <p className={`text-2xl font-bold ${s.highlight ? "text-white" : "text-gb-black"}`}>
                  {s.value}
                </p>
              </div>
            );
          })}
        </div>
      ) : null}

      {/* Main grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Agenda */}
        <div className="lg:col-span-2 space-y-4">
          {/* Today's agenda */}
          <div className="bg-white rounded-xl border border-gb-border p-5">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-base font-semibold text-gb-black flex items-center gap-2">
                <Calendar className="w-4 h-4 text-gb-primary" />
                Agenda de Hoy
                {!loading && (
                  <span className="text-xs font-normal text-gb-gray ml-1">
                    ({todayMeetings.length} reunion{todayMeetings.length !== 1 ? "es" : ""})
                  </span>
                )}
              </h2>
              <button
                onClick={() => setShowNewMeeting(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium bg-gb-primary text-white rounded-lg hover:bg-gb-primary-dark transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                Nueva Reunion
              </button>
            </div>

            {loading ? (
              <AgendaSkeleton />
            ) : todayMeetings.length > 0 ? (
              <div className="space-y-3">
                {todayMeetings
                  .sort((a, b) => new Date(a.fecha).getTime() - new Date(b.fecha).getTime())
                  .map((meeting) => (
                    <div
                      key={meeting.id}
                      className="flex gap-4 items-start group"
                    >
                      {/* Time */}
                      <div className="text-sm font-semibold text-gb-gray w-12 pt-3 text-right shrink-0">
                        {formatTime(meeting.fecha)}
                      </div>
                      {/* Timeline dot + line */}
                      <div className="flex flex-col items-center pt-3 shrink-0">
                        <div className="w-2.5 h-2.5 rounded-full bg-gb-primary ring-4 ring-gb-primary-light" />
                        <div className="w-0.5 flex-1 bg-gb-border mt-1" />
                      </div>
                      {/* Card */}
                      <div className="flex-1 bg-gb-light/50 border border-gb-border rounded-xl p-4 hover:border-gb-primary/30 transition-colors relative">
                        <div className="flex items-start justify-between">
                          <div>
                            <div className="flex items-center gap-2 mb-1">
                              <User className="w-3.5 h-3.5 text-gb-gray" />
                              <span className="text-sm font-semibold text-gb-black">
                                {getClientName(meeting)}
                              </span>
                            </div>
                            <p className="text-xs text-gb-gray mb-2">{meeting.titulo || "Reunion"}</p>
                            <span className={`inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full ${getTypeBadgeClass(meeting.tipo)}`}>
                              {getTypeIcon(meeting.tipo)}
                              {meeting.tipo || "Presencial"}
                            </span>
                          </div>
                          {/* Actions */}
                          <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button
                              onClick={() => { setEditingMeeting(meeting); setShowNewMeeting(true); }}
                              className="p-1.5 rounded-md hover:bg-white transition-colors"
                              title="Editar"
                            >
                              <Edit3 className="w-3.5 h-3.5 text-gb-gray" />
                            </button>
                            <button
                              onClick={() => handleDeleteMeeting(meeting)}
                              className="p-1.5 rounded-md hover:bg-red-50 transition-colors"
                              title="Eliminar"
                            >
                              <Trash2 className="w-3.5 h-3.5 text-red-500" />
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
              </div>
            ) : (
              <div className="text-center py-8">
                <Calendar className="w-8 h-8 text-gb-border mx-auto mb-2" />
                <p className="text-sm text-gb-gray">Sin reuniones hoy</p>
              </div>
            )}

            {/* Week view toggle */}
            <button
              onClick={() => setShowWeekView(!showWeekView)}
              className="flex items-center gap-1.5 mt-4 pt-4 border-t border-gb-border text-sm font-medium text-gb-primary hover:text-gb-primary-dark transition-colors w-full justify-center"
            >
              {showWeekView ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              {showWeekView ? "Ocultar semana" : "Ver semana completa"}
            </button>

            {showWeekView && (
              <div className="mt-4 pt-4 border-t border-gb-border">
                <WeeklyCalendar
                  meetings={meetings}
                  onEdit={(meeting) => { setEditingMeeting(meeting); setShowNewMeeting(true); }}
                  onDelete={handleDeleteMeeting}
                />
              </div>
            )}
          </div>

          {showNewMeeting && (
            <NewMeetingForm
              onClose={() => { setShowNewMeeting(false); setEditingMeeting(null); }}
              onSuccess={() => fetchData()}
              editMeeting={editingMeeting}
            />
          )}

          <GoogleCalendarConnect />
        </div>

        {/* Right: Alerts + Flow + Comite */}
        <div className="space-y-4">
          {/* Alerts & Pendientes */}
          {stats && (stats.reuniones_pendientes > 0) && (
            <div className="bg-white rounded-xl border border-gb-border p-5 animate-fade-in-up" style={{ animationDelay: "200ms" }}>
              <h2 className="text-base font-semibold text-gb-black mb-3 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-gb-warning" />
                Pendientes
              </h2>
              <div className="space-y-2">
                {stats.reuniones_pendientes > 0 && (
                  <div className="flex items-center gap-3 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                    <Clock className="w-4 h-4 text-amber-600 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-amber-800">
                        {stats.reuniones_pendientes} reunion(es) pendiente(s)
                      </p>
                      <p className="text-xs text-amber-600">Esta semana</p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Flujo de Asesoria */}
          <div className="bg-white rounded-xl border border-gb-border p-5 animate-fade-in-up" style={{ animationDelay: "250ms" }}>
            <h2 className="text-sm font-semibold text-gb-black mb-4">Flujo de Asesoria</h2>
            <div className="flex items-center justify-between relative">
              {/* Connecting line */}
              <div className="absolute top-4 left-6 right-6 h-0.5 bg-gb-border" />

              {FLOW_STEPS.map((step, i) => {
                return (
                  <Link
                    key={step.href}
                    href={step.href}
                    className="relative flex flex-col items-center gap-1.5 group z-10"
                  >
                    <div className="w-8 h-8 rounded-full bg-gb-primary text-white flex items-center justify-center text-xs font-bold shadow-sm group-hover:scale-110 transition-transform">
                      {i + 1}
                    </div>
                    <span className="text-[10px] font-medium text-gb-gray group-hover:text-gb-primary text-center leading-tight max-w-[60px] transition-colors">
                      {step.title}
                    </span>
                  </Link>
                );
              })}
            </div>
          </div>

          {/* Comite Reports */}
          <div className="animate-fade-in-up" style={{ animationDelay: "300ms" }}>
            <ComiteReportsPanel />
          </div>
        </div>
      </div>
    </div>
  );
}
