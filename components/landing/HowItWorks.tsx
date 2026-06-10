"use client";

import Eyebrow from "./Eyebrow";
import { useScrollReveal } from "./useScrollReveal";

const steps = [
  {
    number: "1",
    title: "Agenda una reunion",
    description: "Conecta con tu asesor para entender tu situacion actual y objetivos.",
  },
  {
    number: "2",
    title: "Definimos tu estrategia",
    description: "Creamos un plan personalizado que integre todos los servicios que necesitas.",
  },
  {
    number: "3",
    title: "Gestion continua",
    description: "Seguimiento permanente con reportes, ajustes y acompanamiento profesional.",
  },
];

export default function HowItWorks() {
  const { ref, visible } = useScrollReveal();

  return (
    <section id="proceso" className="relative py-28 px-4 bg-white overflow-hidden">
      <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-gl-azure/30 to-transparent" />

      <div className="max-w-5xl mx-auto">
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
            Como funciona
          </h2>
        </div>
        <div className="grid md:grid-cols-3 gap-8 relative">
          {/* Connector line — azure bar as system element */}
          <div className="hidden md:block absolute top-7 left-[20%] right-[20%] h-[2px] bg-gradient-to-r from-gl-azure/20 via-gl-azure/40 to-gl-azure/20" />
          {steps.map((s) => (
            <div key={s.number} className="text-center relative">
              <div
                className="w-14 h-14 bg-gl-ink text-white rounded-full flex items-center justify-center mx-auto mb-5 relative z-10 shadow-lg shadow-gl-ink/20"
                style={{ fontFamily: "var(--font-data)", fontSize: "1.125rem", fontWeight: 500 }}
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
