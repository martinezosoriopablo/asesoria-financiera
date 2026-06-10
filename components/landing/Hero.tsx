"use client";

import { ArrowRight } from "lucide-react";
import GlobalLogo from "./GlobalLogo";
import { useScrollReveal } from "./useScrollReveal";

export default function Hero() {
  const { ref, visible } = useScrollReveal(0.1);

  return (
    <section className="relative min-h-[90vh] flex items-center overflow-hidden bg-gl-deep">
      {/* Mesh gradient background */}
      <div
        className="absolute inset-0 opacity-40"
        style={{
          background:
            "radial-gradient(ellipse 80% 60% at 70% 40%, #14467E 0%, transparent 70%), radial-gradient(ellipse 60% 50% at 20% 80%, #2E86E0 0%, transparent 60%)",
        }}
      />
      {/* Subtle grid pattern */}
      <div
        className="absolute inset-0 opacity-[0.04]"
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)",
          backgroundSize: "60px 60px",
        }}
      />
      {/* Azure bar accent — bottom */}
      <div className="absolute bottom-0 left-0 right-0 h-[3px] bg-gradient-to-r from-transparent via-gl-azure to-transparent" />

      <div className="relative max-w-7xl mx-auto px-6 sm:px-10 lg:px-16 py-32 w-full">
        <div
          ref={ref}
          className={`max-w-3xl transition-all duration-700 ease-out ${
            visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"
          }`}
        >
          <div className="flex items-center gap-3 mb-10">
            <GlobalLogo variant="light" size={44} />
            <div className="h-[2px] w-12 bg-gl-sky/40 rounded-full" />
          </div>
          <p
            className="text-xs tracking-[0.3em] text-gl-sky/60 uppercase mb-5"
            style={{ fontFamily: "var(--font-data)" }}
          >
            Asesoria de inversiones independiente
          </p>
          <h1
            className="text-5xl md:text-6xl lg:text-7xl text-white mb-8 leading-[1.08] tracking-tight"
            style={{ fontFamily: "var(--font-display)", fontWeight: 400 }}
          >
            Mas de 25 anos de{" "}
            <em className="italic text-gl-sky">experiencia</em> a tu servicio
          </h1>
          <p
            className="text-lg md:text-xl text-white/50 mb-12 leading-relaxed max-w-xl"
            style={{ fontFamily: "var(--font-body)" }}
          >
            Asesoria de inversiones internacionales y locales, independiente y sin conflictos de interes. Nuestro foco es construir relaciones duraderas y de largo plazo.
          </p>
          <div className="flex flex-col sm:flex-row gap-4">
            <a
              href="#servicios"
              className="px-8 py-3.5 bg-white text-gl-ink font-semibold rounded-full hover:bg-gl-mist transition-colors inline-flex items-center justify-center gap-2 shadow-lg shadow-white/10"
              style={{ fontFamily: "var(--font-body)" }}
            >
              Conoce nuestros servicios
              <ArrowRight className="w-5 h-5" />
            </a>
            <a
              href="#contacto"
              className="px-8 py-3.5 border border-white/20 text-white font-semibold rounded-full hover:bg-white/5 transition-colors inline-flex items-center justify-center"
              style={{ fontFamily: "var(--font-body)" }}
            >
              Agenda una reunion
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}
