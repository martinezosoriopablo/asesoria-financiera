"use client";

import Eyebrow from "./Eyebrow";
import { useScrollReveal } from "./useScrollReveal";

const services = [
  {
    number: "01",
    title: "Global Wealth",
    description:
      "Asesoria de inversiones independiente, local e internacional. Portafolios personalizados segun tu perfil y objetivos.",
  },
  {
    number: "02",
    title: "Global Planning",
    description:
      "Planificacion tributaria y patrimonial. Sociedades de inversion, optimizacion fiscal, sucesion y estructuracion.",
  },
  {
    number: "03",
    title: "Global Properties",
    description:
      "Inversion inmobiliaria. Asesoria en compra, venta y gestion de activos inmobiliarios.",
  },
  {
    number: "04",
    title: "Global Insurance",
    description:
      "Seguros internacionales con companias de primer nivel. Vida, salud y proteccion patrimonial.",
  },
];

export default function ServiceCards() {
  const { ref, visible } = useScrollReveal();

  return (
    <section id="servicios" className="relative py-28 px-4 bg-white overflow-hidden">
      <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-gl-line to-transparent" />

      <div className="max-w-6xl mx-auto">
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
        </div>
        <div className="grid md:grid-cols-2 gap-x-12 gap-y-14">
          {services.map((s) => (
            <div key={s.number} className="group flex gap-6">
              <span
                className="text-5xl lg:text-6xl text-gl-copper/30 group-hover:text-gl-copper/60 transition-colors shrink-0 leading-none"
                style={{ fontFamily: "var(--font-data)", fontWeight: 700 }}
              >
                {s.number}
              </span>
              <div>
                <h3
                  className="text-xl font-semibold text-gl-ink mb-2"
                  style={{ fontFamily: "var(--font-body)" }}
                >
                  {s.title}
                </h3>
                <div className="w-8 h-[2px] bg-gl-copper/40 rounded-full mb-3" />
                <p
                  className="text-sm text-gl-muted leading-relaxed"
                  style={{ fontFamily: "var(--font-body)" }}
                >
                  {s.description}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
