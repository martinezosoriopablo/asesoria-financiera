"use client";

import Eyebrow from "./Eyebrow";
import { useScrollReveal } from "./useScrollReveal";

const items = [
  {
    title: "Siempre alineados a tus intereses",
    description:
      "No representamos a ninguna gestora ni institucion. Nuestras recomendaciones responden solo a tus objetivos.",
  },
  {
    title: "Asesoria 360",
    description:
      "Desde tu portafolio hasta la estructura societaria. Inversiones, planificacion tributaria, seguros y propiedades en un solo lugar.",
  },
  {
    title: "Acceso global",
    description:
      "Mas de 200,000 instrumentos en +40 mercados. Infraestructura institucional para darte acceso al mundo.",
  },
];

export default function Differentiators() {
  const { ref, visible } = useScrollReveal();

  return (
    <section id="nosotros" className="relative py-28 px-4 bg-gl-deep overflow-hidden">
      {/* Subtle mesh gradient */}
      <div
        className="absolute inset-0 opacity-20"
        style={{
          background:
            "radial-gradient(ellipse 60% 50% at 80% 30%, #14467E 0%, transparent 60%)",
        }}
      />
      <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-gl-copper/30 to-transparent" />

      <div className="relative max-w-6xl mx-auto">
        <div
          ref={ref}
          className={`text-center mb-16 transition-all duration-700 ease-out ${
            visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"
          }`}
        >
          <Eyebrow variant="dark">Por que Global</Eyebrow>
          <h2
            className="text-3xl md:text-4xl text-white mb-4"
            style={{ fontFamily: "var(--font-display)", fontWeight: 400 }}
          >
            Lo que nos <em className="italic text-gl-sky">diferencia</em>
          </h2>
        </div>
        <div className="grid md:grid-cols-3 gap-10">
          {items.map((d) => (
            <div key={d.title} className="text-center md:text-left">
              <div className="w-8 h-[2px] bg-gl-copper/60 rounded-full mb-5 mx-auto md:mx-0" />
              <h3
                className="text-lg font-semibold text-white mb-3"
                style={{ fontFamily: "var(--font-body)" }}
              >
                {d.title}
              </h3>
              <p
                className="text-sm text-white/50 leading-relaxed"
                style={{ fontFamily: "var(--font-body)" }}
              >
                {d.description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
