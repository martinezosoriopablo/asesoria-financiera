"use client";

import { Globe, Users, BarChart3 } from "lucide-react";
import Eyebrow from "./Eyebrow";
import { useScrollReveal } from "./useScrollReveal";

const items = [
  {
    icon: Globe,
    title: "Sin conflictos de interes",
    description:
      "No tenemos productos propios ni trabajamos con un proveedor en particular. Asesorias personalizadas con independencia, confidencialidad y transparencia.",
  },
  {
    icon: Users,
    title: "Relaciones de largo plazo",
    description:
      "Profesionales con vasta trayectoria en banca e instituciones financieras. Nuestro foco es construir relaciones duraderas y acompanar al cliente en todo momento.",
  },
  {
    icon: BarChart3,
    title: "Tecnologia + experiencia",
    description:
      "Plataforma propia con datos en tiempo real para elaborar soluciones de inversion en la direccion adecuada. Regulados por la CMF.",
  },
];

export default function Differentiators() {
  const { ref, visible } = useScrollReveal();

  return (
    <section id="nosotros" className="relative py-28 px-4 bg-gl-mist overflow-hidden">
      {/* Decorative azure bar */}
      <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-gl-azure/20 to-transparent" />

      <div className="max-w-7xl mx-auto">
        <div
          ref={ref}
          className={`text-center mb-16 transition-all duration-700 ease-out ${
            visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"
          }`}
        >
          <Eyebrow>Por que elegirnos</Eyebrow>
          <h2
            className="text-3xl md:text-4xl text-gl-ink mb-4"
            style={{ fontFamily: "var(--font-display)", fontWeight: 400 }}
          >
            Por que <em className="italic text-gl-azure">Global</em>
          </h2>
        </div>
        <div className="grid md:grid-cols-3 gap-8">
          {items.map((d) => {
            const Icon = d.icon;
            return (
              <div
                key={d.title}
                className="group bg-white rounded-2xl p-8 border border-gl-line/60 hover:shadow-lg hover:shadow-gl-azure/5 transition-all duration-300"
              >
                <div className="w-14 h-14 bg-gl-mist border border-gl-line rounded-2xl flex items-center justify-center mb-6 group-hover:bg-gl-azure/10 group-hover:border-gl-azure/20 transition-colors">
                  <Icon className="w-7 h-7 text-gl-azure" />
                </div>
                {/* Azure underline */}
                <div className="flex items-center gap-2.5 mb-3">
                  <h3
                    className="text-lg font-semibold text-gl-ink"
                    style={{ fontFamily: "var(--font-body)" }}
                  >
                    {d.title}
                  </h3>
                </div>
                <div className="w-8 h-[2px] bg-gl-azure/40 rounded-full mb-3" />
                <p
                  className="text-sm text-gl-muted leading-relaxed"
                  style={{ fontFamily: "var(--font-body)" }}
                >
                  {d.description}
                </p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
