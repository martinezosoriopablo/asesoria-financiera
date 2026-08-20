"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useAdvisor } from "@/lib/hooks/useAdvisor";
import WeeklyCalendar from "@/components/dashboard/WeeklyCalendar";
import NewMeetingForm from "@/components/dashboard/NewMeetingForm";
import GoogleCalendarConnect from "@/components/dashboard/GoogleCalendarConnect";
import PageContainer from "@/components/shared/PageContainer";
import PageHeader from "@/components/shared/PageHeader";
import Card from "@/components/shared/Card";
import Button from "@/components/shared/Button";
import {
  Users,
  UserCheck,
  UserPlus,
  DollarSign,
  Calendar,
  Plus,
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
  Bell,
} from "lucide-react";
import { computeJourneySteps, hasRealRecommendation } from "@/lib/journey/steps";

interface Stats {
  total_clientes: number;
  clientes_activos: number;
  prospectos: number;
  aum_total: number;
  clientes_sin_cartola: number;
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

interface ClientRow {
  id: string;
  nombre?: string | null;
  apellido?: string | null;
  perfil_riesgo?: string | null;
  tiene_portfolio?: boolean | null;
  cartera_recomendada?: unknown;
}

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
    case "recordatorio": return <Bell className="w-3.5 h-3.5" />;
    default: return <MapPin className="w-3.5 h-3.5" />;
  }
}

function getTypeBadgeClass(): string {
  return "bg-background text-gb-gray border border-gb-border";
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
  const [clients, setClients] = useState<ClientRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [showNewMeeting, setShowNewMeeting] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [editingMeeting, setEditingMeeting] = useState<any>(null);
  const [showWeekView, setShowWeekView] = useState(false);

  const fetchData = async () => {
    setLoading(true);
    setFetchError(null);
    try {
      const [statsRes, meetingsRes, clientsRes] = await Promise.all([
        fetch("/api/advisor/stats"),
        fetch("/api/advisor/meetings?timeframe=week"),
        fetch("/api/clients"),
      ]);
      const statsData = await statsRes.json();
      const meetingsData = await meetingsRes.json();
      if (statsData.success) setStats(statsData.stats);
      else throw new Error(statsData.error || "Error cargando estadísticas");
      if (meetingsData.success) setMeetings(meetingsData.meetings);
      else throw new Error(meetingsData.error || "Error cargando reuniones");
      // Lista de clientes con journey incompleto: secundaria, NO bloquea el dashboard
      // si falla (parseo aislado — una respuesta no-JSON o de red no rompe la vista).
      try {
        const clientsData = await clientsRes.json();
        if (clientsData.success) setClients(clientsData.clients || []);
      } catch {
        /* la lista de journey es opcional; el dashboard funciona sin ella */
      }
    } catch (err) {
      setFetchError(err instanceof Error ? err.message : "Error cargando datos del dashboard");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (advisor) fetchData();
  }, [advisor]); // eslint-disable-line react-hooks/exhaustive-deps

  if (authLoading) {
    return (
      <div className="flex items-center justify-center py-32">
        <Loader className="w-8 h-8 text-gb-primary animate-spin" />
      </div>
    );
  }

  if (!advisor) return null;

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

  const sinCartola = stats?.clientes_sin_cartola ?? 0;
  const STAT_CARDS = [
    { label: "Total Clientes", value: stats?.total_clientes ?? 0, icon: Users, highlight: false, subtitle: null as string | null },
    { label: "Activos", value: stats?.clientes_activos ?? 0, icon: UserCheck, highlight: false, subtitle: null as string | null },
    { label: "Prospectos", value: stats?.prospectos ?? 0, icon: UserPlus, highlight: false, subtitle: null as string | null },
    { label: "AUM Total", value: formatCurrency(stats?.aum_total ?? 0), icon: DollarSign, highlight: true, subtitle: sinCartola > 0 ? `+ ${sinCartola} sin cartola` : null },
  ];

  const dateLabel = formatDate();
  const dateLabelCap = dateLabel.charAt(0).toUpperCase() + dateLabel.slice(1);

  const incompleteJourneyClients = clients
    .filter((c) => {
      const steps = computeJourneySteps({
        perfil_riesgo: c.perfil_riesgo,
        tiene_portfolio: c.tiene_portfolio,
        tiene_cartera_recomendada: hasRealRecommendation(c.cartera_recomendada),
      });
      return steps.some((s) => !s.done);
    })
    .sort((a, b) =>
      `${a.nombre ?? ""} ${a.apellido ?? ""}`.localeCompare(`${b.nombre ?? ""} ${b.apellido ?? ""}`)
    );

  return (
    <PageContainer>
      {/* Greeting */}
      <PageHeader
        title={`${getGreeting()}, ${advisor.name.split(" ")[0]}`}
        subtitle={dateLabelCap}
      />

      {/* Error state */}
      {fetchError && !loading && (
        <div className="mb-8 flex items-center gap-3 px-5 py-4 bg-gb-danger/10 border border-gb-danger/30 rounded-xl">
          <AlertTriangle className="w-5 h-5 text-gb-danger shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-gb-danger">{fetchError}</p>
          </div>
          <button
            onClick={() => fetchData()}
            className="shrink-0 px-3 py-1.5 text-sm font-medium text-gb-danger bg-gb-danger/10 hover:bg-gb-danger/20 rounded-lg transition-colors"
          >
            Reintentar
          </button>
        </div>
      )}

      {/* Stats */}
      {loading ? (
        <StatsSkeleton />
      ) : stats ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          {STAT_CARDS.map((s, i) => {
            const Icon = s.icon;
            return (
              <div key={s.label} className="animate-fade-in-up" style={{ animationDelay: `${i * 60}ms` }}>
                <Card highlight={s.highlight} className="h-full transition-all hover:-translate-y-0.5 hover:shadow-md">
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
                  {s.subtitle && (
                    <p className={`text-[11px] mt-0.5 ${s.highlight ? "text-white/60" : "text-gb-gray"}`}>
                      {s.subtitle}
                    </p>
                  )}
                </Card>
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
              <div className="flex items-center gap-2">
                <Button
                  variant="secondary"
                  onClick={() => { setEditingMeeting({ prefillTipo: "recordatorio" }); setShowNewMeeting(true); }}
                >
                  <Bell className="w-3.5 h-3.5" />
                  Recordatorio
                </Button>
                <Button onClick={() => setShowNewMeeting(true)}>
                  <Plus className="w-3.5 h-3.5" />
                  Nueva Reunion
                </Button>
              </div>
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
                            <span className={`inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full ${getTypeBadgeClass()}`}>
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
                              className="p-1.5 rounded-md hover:bg-gb-danger/10 transition-colors"
                              title="Eliminar"
                            >
                              <Trash2 className="w-3.5 h-3.5 text-gb-danger" />
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
                  <div className="flex items-center gap-3 p-3 bg-gb-warning/10 border border-gb-warning/30 rounded-lg">
                    <Clock className="w-4 h-4 text-gb-warning shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gb-black">
                        {stats.reuniones_pendientes} reunion(es) pendiente(s)
                      </p>
                      <p className="text-xs text-gb-warning">Esta semana</p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Clientes con journey incompleto */}
          <div className="animate-fade-in-up" style={{ animationDelay: "250ms" }}>
            <Card
              title="Clientes con journey incompleto"
              action={
                !loading && incompleteJourneyClients.length > 0 ? (
                  <span className="text-xs text-gb-gray tabular-nums">{incompleteJourneyClients.length}</span>
                ) : undefined
              }
            >
              {loading ? (
                <div className="space-y-2">
                  {[0, 1, 2].map((i) => (
                    <div key={i} className="skeleton h-10 rounded-lg" />
                  ))}
                </div>
              ) : incompleteJourneyClients.length > 0 ? (
                <div className="space-y-2">
                  {incompleteJourneyClients.slice(0, 5).map((c) => (
                    <Link
                      key={c.id}
                      href={`/clients/${c.id}`}
                      className="flex items-center justify-between gap-3 rounded-lg border border-gb-border px-3 py-2 text-sm hover:border-gb-primary transition-colors"
                    >
                      <span className="text-gb-black font-medium truncate">
                        {`${c.nombre ?? ""} ${c.apellido ?? ""}`.trim() || "Cliente"}
                      </span>
                      <span className="text-xs text-gb-info shrink-0">Ver ficha</span>
                    </Link>
                  ))}
                  {incompleteJourneyClients.length > 5 && (
                    <Link
                      href="/clients"
                      className="block text-center text-xs font-medium text-gb-info hover:text-gb-primary pt-1"
                    >
                      Ver todos ({incompleteJourneyClients.length})
                    </Link>
                  )}
                </div>
              ) : (
                <p className="text-sm text-gb-gray text-center py-4">Todos tus clientes están al día</p>
              )}
            </Card>
          </div>

          {/* Repositorio de reportes */}
          <div className="animate-fade-in-up" style={{ animationDelay: "300ms" }}>
            <Link
              href="/advisor/reportes"
              className="block bg-white border border-gb-border rounded-lg p-5 hover:border-gb-primary transition-colors"
            >
              <div className="font-medium text-gb-black">Repositorio de reportes</div>
              <div className="text-sm text-gb-gray mt-1">
                Sube, versiona y define el uso de los reportes del comité (distribución, insumo de cartera, cierre).
              </div>
            </Link>
          </div>
        </div>
      </div>
    </PageContainer>
  );
}
