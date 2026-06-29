"use client";

import Eyebrow from "./Eyebrow";
import { useScrollReveal } from "./useScrollReveal";

const steps = [
  {
    number: "01",
    title: "Diagnostico",
    description: "Entendemos tu situacion financiera, perfil de riesgo y objetivos.",
  },
  {
    number: "02",
    title: "Estrategia",
    description: "Disenamos un plan personalizado que integra inversiones, planificacion y proteccion.",
  },
  {
    number: "03",
    title: "Ejecucion",
    description: "Tu ejecutas en tu custodia. Nosotros te guiamos en cada paso.",
  },
  {
    number: "04",
    title: "Monitoreo",
    description: "Seguimiento continuo con reportes, rebalanceo y ajustes.",
  },
];

export default function HowItWorks() {
  const { ref, visible } = useScrollReveal();

  return (
    <section id="proceso" className="relative py-28 px-4 bg-gl-mist overflow-hidden">
      <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-gl-line to-transparent" />

      <div className="max-w-6xl mx-auto">
        <div
          ref={ref}
          className={`text-center mb-16 transition-all duration-700 ease-out ${
            visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"
          }`}
        >
          <Eyebrow>Proceso</Eyebrow>
          <h2
            className="text-3xl md:text-4xl text-gl-ink mb-4"
            style={{ fontFamily: "var(--font-display)", fontWeight: 400 }}
          >
            Como trabajamos
          </h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8 relative">
          {/* Connector line — copper */}
          <div className="hidden md:block absolute top-7 left-[15%] right-[15%] h-[2px] bg-gradient-to-r from-gl-copper/10 via-gl-copper/30 to-gl-copper/10" />

          {steps.map((s) => (
            <div key={s.number} className="text-center relative">
              <div
                className="w-14 h-14 border-2 border-gl-copper/40 text-gl-copper rounded-full flex items-center justify-center mx-auto mb-5 relative z-10 bg-gl-mist"
                style={{ fontFamily: "var(--font-data)", fontSize: "1rem", fontWeight: 600 }}
              >
                {s.number}
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
          ))}
        </div>
      </div>
    </section>
  );
}
