"use client";

import { useScrollReveal } from "./useScrollReveal";

const stats = [
  { number: "+20 anos", label: "de experiencia en mercados financieros" },
  { number: "+USD 60MM", label: "en patrimonio asesorado" },
  { number: "+200,000", label: "instrumentos disponibles" },
  { number: "+40 mercados", label: "acceso global sin restricciones" },
];

export default function StatsBar() {
  const { ref, visible } = useScrollReveal(0.2);

  return (
    <section className="relative bg-gl-ink py-14 px-4">
      <div
        ref={ref}
        className={`max-w-6xl mx-auto transition-all duration-700 ease-out ${
          visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"
        }`}
      >
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-8 lg:gap-0">
          {stats.map((s, i) => (
            <div
              key={s.number}
              className={`text-center ${
                i < stats.length - 1 ? "lg:border-r lg:border-gl-copper/20" : ""
              }`}
            >
              <p
                className="text-2xl md:text-3xl lg:text-4xl text-gl-copper mb-2"
                style={{ fontFamily: "var(--font-data)", fontWeight: 600 }}
              >
                {s.number}
              </p>
              <p
                className="text-sm text-white/50"
                style={{ fontFamily: "var(--font-body)" }}
              >
                {s.label}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
