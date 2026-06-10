"use client";

import { TrendingUp, Shield, FileText, Building2 } from "lucide-react";
import Eyebrow from "./Eyebrow";
import { useScrollReveal } from "./useScrollReveal";

const services = [
  {
    title: "Global Wealth",
    icon: TrendingUp,
    description:
      "Asesoria de inversiones independiente, local e internacional. Gestion de portafolios personalizada sin conflictos de interes ni productos propios.",
  },
  {
    title: "Global Planning",
    icon: FileText,
    description:
      "Planificacion patrimonial y tributaria integral. Optimizacion fiscal, sucesion y estructuracion de patrimonio.",
  },
  {
    title: "Global Properties",
    icon: Building2,
    description:
      "Soluciones de inversion inmobiliaria. Asesoria en compra, venta y gestion de activos inmobiliarios.",
  },
  {
    title: "Global Insurance",
    icon: Shield,
    description:
      "Seguros internacionales con companias de primer nivel. Coberturas de vida, salud y proteccion patrimonial.",
  },
];

export default function ServiceCards() {
  const { ref, visible } = useScrollReveal();

  return (
    <section id="servicios" className="relative py-28 px-4 bg-white overflow-hidden">
      {/* Subtle top azure bar */}
      <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-gl-azure/30 to-transparent" />

      <div className="max-w-7xl mx-auto">
        <div
          ref={ref}
          className={`text-center mb-16 transition-all duration-700 ease-out ${
            visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"
          }`}
        >
          <Eyebrow>Nuestros servicios</Eyebrow>
          <h2
            className="text-3xl md:text-4xl text-gl-ink mb-4"
            style={{ fontFamily: "var(--font-display)", fontWeight: 400 }}
          >
            Cuatro areas de <em className="italic text-gl-azure">especialidad</em>
          </h2>
          <p className="text-lg text-gl-muted" style={{ fontFamily: "var(--font-body)" }}>
            Cobertura integral para todo tu patrimonio
          </p>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {services.map((s) => {
            const Icon = s.icon;
            return (
              <div
                key={s.title}
                className="group relative bg-white border border-gl-line rounded-2xl p-6 hover:shadow-lg hover:shadow-gl-azure/5 hover:border-gl-azure/20 transition-all duration-300"
              >
                {/* Azure bar accent on hover */}
                <div className="absolute top-0 left-6 right-6 h-[2px] bg-gl-azure rounded-b-full scale-x-0 group-hover:scale-x-100 transition-transform duration-300" />
                <div className="w-12 h-12 bg-gl-mist rounded-xl flex items-center justify-center mb-5 group-hover:bg-gl-azure/10 transition-colors">
                  <Icon className="w-6 h-6 text-gl-azure" />
                </div>
                <h3
                  className="text-lg font-semibold text-gl-ink mb-2"
                  style={{ fontFamily: "var(--font-body)" }}
                >
                  {s.title}
                </h3>
                <p
                  className="text-sm text-gl-muted leading-relaxed"
                  style={{ fontFamily: "var(--font-body)" }}
                >
                  {s.description}
                </p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
