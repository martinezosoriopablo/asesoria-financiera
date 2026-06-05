"use client";

import React, { useEffect, useState } from "react";
import PortalTopbar from "@/components/portal/PortalTopbar";
import {
  Loader,
  TrendingUp,
  Shield,
  Calculator,
  Building2,
} from "lucide-react";

// ---------- Interfaces ----------

interface Servicios {
  seguros?: {
    activo: boolean;
    poliza?: string;
    cobertura?: string;
    beneficiarios?: string;
    notas?: string;
  };
  asesoria_tributaria?: {
    activo: boolean;
    descripcion?: string;
  };
  asesoria_inmobiliaria?: {
    activo: boolean;
    descripcion?: string;
  };
}

interface Advisor {
  id: string;
  nombre: string;
  apellido: string;
  empresa: string;
}

// ---------- ServiceCard (inline component) ----------

function ServiceCard({
  icon: Icon,
  title,
  active,
  details = [],
  description,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  active: boolean;
  details?: Array<{ label: string; value: string }>;
  description?: string;
}) {
  return (
    <div className={`bg-white rounded-lg border border-gb-border p-6 ${!active ? "opacity-60" : ""}`}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Icon className={`w-5 h-5 ${active ? "text-gb-primary" : "text-gb-gray"}`} />
          <h3 className="text-sm font-semibold text-gb-black">{title}</h3>
        </div>
        <span
          className={`text-xs px-2 py-0.5 rounded-full font-medium ${
            active ? "bg-green-50 text-green-700" : "bg-gray-100 text-gray-500"
          }`}
        >
          {active ? "Activo" : "No contratado"}
        </span>
      </div>

      {details.length > 0 && (
        <div className="space-y-1 mb-3">
          {details.map((d, i) => (
            <div key={i} className="flex items-center gap-2 text-sm">
              <span className="text-gb-gray">{d.label}:</span>
              <span className="text-gb-black font-medium">{d.value}</span>
            </div>
          ))}
        </div>
      )}

      {description && <p className="text-xs text-gb-gray">{description}</p>}
    </div>
  );
}

// ---------- Page ----------

export default function MisServiciosPage() {
  const [loading, setLoading] = useState(true);
  const [servicios, setServicios] = useState<Servicios | null>(null);
  const [advisor, setAdvisor] = useState<Advisor | null>(null);
  const [clientInfo, setClientInfo] = useState<{ nombre: string; email: string } | null>(null);

  useEffect(() => {
    Promise.all([
      fetch("/api/portal/servicios").then((r) => r.json()),
      fetch("/api/portal/me").then((r) => r.json()),
    ])
      .then(([servData, meData]) => {
        if (servData.success) {
          setServicios(servData.servicios);
          setAdvisor(servData.advisor);
        }
        if (meData.client) {
          setClientInfo({
            nombre: `${meData.client.nombre} ${meData.client.apellido}`,
            email: meData.client.email,
          });
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-gb-light">
        {clientInfo && <PortalTopbar clientName={clientInfo.nombre} clientEmail={clientInfo.email} />}
        <div className="flex items-center justify-center py-20">
          <Loader className="w-6 h-6 text-gb-gray animate-spin" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gb-light">
      {clientInfo && <PortalTopbar clientName={clientInfo.nombre} clientEmail={clientInfo.email} />}

      <main className="max-w-3xl mx-auto px-6 py-8">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold text-gb-black">Mis Servicios</h1>
          <p className="text-sm text-gb-gray mt-1">Productos y servicios contratados</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Asesoria de Inversiones -- always active */}
          <ServiceCard
            icon={TrendingUp}
            title="Asesoria de Inversiones"
            active
            details={
              advisor
                ? [
                    { label: "Asesor", value: `${advisor.nombre} ${advisor.apellido}` },
                    { label: "Empresa", value: advisor.empresa },
                  ]
                : []
            }
            description="Gestion y seguimiento de tu portafolio de inversiones"
          />

          {/* Seguros */}
          <ServiceCard
            icon={Shield}
            title="Seguros"
            active={servicios?.seguros?.activo ?? false}
            details={
              servicios?.seguros?.activo
                ? [
                    ...(servicios.seguros.poliza ? [{ label: "Poliza", value: servicios.seguros.poliza }] : []),
                    ...(servicios.seguros.cobertura ? [{ label: "Cobertura", value: servicios.seguros.cobertura }] : []),
                    ...(servicios.seguros.beneficiarios ? [{ label: "Beneficiarios", value: servicios.seguros.beneficiarios }] : []),
                  ]
                : []
            }
            description={
              servicios?.seguros?.activo
                ? servicios.seguros.notas
                : "Consulta con tu asesor para mas informacion"
            }
          />

          {/* Asesoria Tributaria */}
          <ServiceCard
            icon={Calculator}
            title="Asesoria Tributaria"
            active={servicios?.asesoria_tributaria?.activo ?? false}
            description={
              servicios?.asesoria_tributaria?.activo
                ? servicios.asesoria_tributaria.descripcion
                : "Consulta con tu asesor para mas informacion"
            }
          />

          {/* Asesoria Inmobiliaria */}
          <ServiceCard
            icon={Building2}
            title="Asesoria Inmobiliaria"
            active={servicios?.asesoria_inmobiliaria?.activo ?? false}
            description={
              servicios?.asesoria_inmobiliaria?.activo
                ? servicios.asesoria_inmobiliaria.descripcion
                : "Consulta con tu asesor para mas informacion"
            }
          />
        </div>
      </main>
    </div>
  );
}
