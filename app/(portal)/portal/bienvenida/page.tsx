"use client";

import { useEffect, useState } from "react";
import PortalTopbar from "@/components/portal/PortalTopbar";
import { ProfileGauge } from "@/components/risk/ProfileGauge";
import {
  Loader,
  CheckCircle,
  Circle,
  ArrowRight,
  Shield,
  TrendingUp,
  MessageSquare,
  Upload,
  FileText,
} from "lucide-react";
import Link from "next/link";

interface RiskProfile {
  global_score: number;
  profile_label: string;
  capacity_score: number;
  tolerance_score: number;
  perception_score: number;
  composure_score: number;
}

interface AdvisorInfo {
  nombre: string;
  email: string;
  company: string | null;
  logo: string | null;
}

interface ClientInfo {
  id: string;
  nombre: string;
  apellido: string;
  email: string;
}

export default function BienvenidaPage() {
  const [loading, setLoading] = useState(true);
  const [clientInfo, setClientInfo] = useState<ClientInfo | null>(null);
  const [riskProfile, setRiskProfile] = useState<RiskProfile | null>(null);
  const [advisor, setAdvisor] = useState<AdvisorInfo | null>(null);
  const [hasSnapshots, setHasSnapshots] = useState(false);
  const [questionnaireLink, setQuestionnaireLink] = useState<string | null>(null);
  const [unreadReports, setUnreadReports] = useState(0);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const res = await fetch("/api/portal/me");
      if (!res.ok) return;
      const data = await res.json();
      setClientInfo(data.client);
      setRiskProfile(data.riskProfile);
      setAdvisor(data.advisor);
      setHasSnapshots(data.hasSnapshots || false);
      setQuestionnaireLink(data.questionnaireLink || null);
      setUnreadReports(data.unreadReports || 0);
    } catch (err) {
      console.error("Error fetching portal data:", err);
    } finally {
      setLoading(false);
    }
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

  const profileLabel = riskProfile?.profile_label || "Pendiente";
  const gaugeColor = getGaugeColor(profileLabel);
  const hasRiskProfile = !!riskProfile;

  const steps = [
    {
      label: "Perfil de riesgo completado",
      done: hasRiskProfile,
      icon: Shield,
    },
    {
      label: "Portafolio analizado",
      done: hasSnapshots,
      icon: TrendingUp,
    },
    {
      label: "Primera reunión con tu asesor",
      done: false,
      icon: MessageSquare,
    },
  ];

  return (
    <div className="min-h-screen bg-gb-light">
      <PortalTopbar
        clientName={`${clientInfo.nombre} ${clientInfo.apellido}`}
        clientEmail={clientInfo.email}
        unreadReports={unreadReports}
      />

      <main className="max-w-3xl mx-auto px-6 py-8">
        {/* Welcome header */}
        <div className="mb-8">
          <h1 className="text-2xl font-semibold text-gb-black">
            Hola, {clientInfo.nombre}
          </h1>
          <p className="text-sm text-gb-gray mt-1">
            Bienvenido a tu portal de inversiones
            {advisor ? ` con ${advisor.nombre}` : ""}.
          </p>
        </div>

        {/* Risk profile card */}
        {hasRiskProfile ? (
          <div className="bg-white rounded-lg border border-gb-border p-6 mb-6">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-sm font-semibold text-gb-black flex items-center gap-2">
                <Shield className="w-4 h-4 text-indigo-500" />
                Tu Perfil de Riesgo
              </h2>
              <span className={`text-sm font-semibold px-3 py-1 rounded-full ${getProfileBadge(profileLabel)}`}>
                {profileLabel}
              </span>
            </div>

            <div className="mb-5">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-gb-gray">Puntaje global</span>
                <span className="text-lg font-bold text-gb-black">
                  {riskProfile!.global_score.toFixed(0)}/100
                </span>
              </div>
              <div className="w-full bg-gray-100 rounded-full h-2.5">
                <div
                  className={`h-2.5 rounded-full ${gaugeColor}`}
                  style={{ width: `${riskProfile!.global_score}%` }}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <ProfileGauge label="Capacidad" value={riskProfile!.capacity_score} color="bg-blue-500" />
              <ProfileGauge label="Tolerancia" value={riskProfile!.tolerance_score} color="bg-emerald-500" />
              <ProfileGauge label="Percepción" value={riskProfile!.perception_score} color="bg-amber-500" />
              <ProfileGauge label="Compostura" value={riskProfile!.composure_score} color="bg-purple-500" />
            </div>

            <p className="text-xs text-gb-gray mt-4">
              Este perfil fue evaluado considerando tu situación financiera, experiencia
              inversora, tolerancia emocional al riesgo y objetivos de inversión.
            </p>
          </div>
        ) : (
          <div className="bg-white rounded-lg border border-gb-border p-6 mb-6">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-indigo-100 rounded-full flex items-center justify-center shrink-0">
                <Shield className="w-6 h-6 text-indigo-500" />
              </div>
              <div className="flex-1">
                <h2 className="text-sm font-semibold text-gb-black mb-1">
                  Completa tu perfil de riesgo
                </h2>
                <p className="text-xs text-gb-gray">
                  Responde un breve cuestionario para que tu asesor pueda diseñar la mejor estrategia para ti.
                </p>
              </div>
              {questionnaireLink && (
                <a
                  href={questionnaireLink}
                  className="shrink-0 flex items-center gap-2 px-4 py-2.5 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition-colors"
                >
                  Completar
                  <ArrowRight className="w-4 h-4" />
                </a>
              )}
            </div>
          </div>
        )}

        {/* Upload cartola CTA — only if risk profile done but no snapshots yet */}
        {hasRiskProfile && !hasSnapshots && (
          <Link
            href="/portal/subir-cartola"
            className="flex items-center gap-4 p-6 bg-white rounded-lg border border-gb-border mb-6 hover:border-blue-300 hover:bg-blue-50/30 transition-colors"
          >
            <div className="w-12 h-12 bg-amber-100 rounded-full flex items-center justify-center shrink-0">
              <Upload className="w-6 h-6 text-amber-600" />
            </div>
            <div className="flex-1">
              <h2 className="text-sm font-semibold text-gb-black mb-1">
                Sube tu cartola de inversiones
              </h2>
              <p className="text-xs text-gb-gray">
                Envía el estado de cuenta de tu broker o administradora actual para que tu asesor pueda analizarlo.
              </p>
            </div>
            <ArrowRight className="w-4 h-4 text-gb-gray shrink-0" />
          </Link>
        )}

        {/* Onboarding steps */}
        <div className="bg-white rounded-lg border border-gb-border p-6 mb-6">
          <h2 className="text-sm font-semibold text-gb-black mb-4">
            Tu proceso de asesoría
          </h2>
          <div className="space-y-3">
            {steps.map((step, i) => {
              const Icon = step.icon;
              return (
                <div
                  key={i}
                  className={`flex items-center gap-3 p-3 rounded-lg ${
                    step.done ? "bg-emerald-50" : "bg-gray-50"
                  }`}
                >
                  {step.done ? (
                    <CheckCircle className="w-5 h-5 text-emerald-600 shrink-0" />
                  ) : (
                    <Circle className="w-5 h-5 text-gray-300 shrink-0" />
                  )}
                  <Icon className={`w-4 h-4 shrink-0 ${step.done ? "text-emerald-600" : "text-gray-400"}`} />
                  <span className={`text-sm ${step.done ? "text-emerald-800 font-medium" : "text-gb-gray"}`}>
                    {step.label}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Quick actions */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Link
            href="/portal/dashboard"
            className="flex items-center justify-between p-4 bg-white rounded-lg border border-gb-border hover:border-blue-200 hover:bg-blue-50 transition-colors"
          >
            <div className="flex items-center gap-3">
              <TrendingUp className="w-5 h-5 text-blue-600" />
              <span className="text-sm font-medium text-gb-black">Ver mi portafolio</span>
            </div>
            <ArrowRight className="w-4 h-4 text-gb-gray" />
          </Link>

          <Link
            href="/portal/mensajes"
            className="flex items-center justify-between p-4 bg-white rounded-lg border border-gb-border hover:border-blue-200 hover:bg-blue-50 transition-colors"
          >
            <div className="flex items-center gap-3">
              <MessageSquare className="w-5 h-5 text-blue-600" />
              <span className="text-sm font-medium text-gb-black">Escribir a mi asesor</span>
            </div>
            <ArrowRight className="w-4 h-4 text-gb-gray" />
          </Link>

          <Link
            href="/portal/reportes"
            className="flex items-center justify-between p-4 bg-white rounded-lg border border-gb-border hover:border-blue-200 hover:bg-blue-50 transition-colors"
          >
            <div className="flex items-center gap-3">
              <FileText className="w-5 h-5 text-blue-600" />
              <span className="text-sm font-medium text-gb-black">Ver reportes</span>
            </div>
            <ArrowRight className="w-4 h-4 text-gb-gray" />
          </Link>

          {hasSnapshots && (
            <Link
              href="/portal/subir-cartola"
              className="flex items-center justify-between p-4 bg-white rounded-lg border border-gb-border hover:border-blue-200 hover:bg-blue-50 transition-colors"
            >
              <div className="flex items-center gap-3">
                <Upload className="w-5 h-5 text-blue-600" />
                <span className="text-sm font-medium text-gb-black">Subir cartola</span>
              </div>
              <ArrowRight className="w-4 h-4 text-gb-gray" />
            </Link>
          )}
        </div>

        {/* Advisor info */}
        {advisor && (
          <div className="mt-8 text-center">
            <p className="text-xs text-gb-gray">
              Tu asesor: <strong className="text-gb-black">{advisor.nombre}</strong>
              {advisor.company && ` — ${advisor.company}`}
            </p>
          </div>
        )}
      </main>
    </div>
  );
}

function getGaugeColor(label: string): string {
  switch (label.toLowerCase()) {
    case "conservador": return "bg-blue-500";
    case "moderado": return "bg-emerald-500";
    case "crecimiento": case "growth": return "bg-amber-500";
    case "agresivo": case "aggressive": return "bg-red-500";
    default: return "bg-gray-400";
  }
}

function getProfileBadge(label: string): string {
  switch (label.toLowerCase()) {
    case "conservador": return "bg-blue-50 text-blue-700";
    case "moderado": return "bg-emerald-50 text-emerald-700";
    case "crecimiento": case "growth": return "bg-amber-50 text-amber-700";
    case "agresivo": case "aggressive": return "bg-red-50 text-red-700";
    default: return "bg-gray-100 text-gray-600";
  }
}
